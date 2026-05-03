import { readFile } from "node:fs/promises";
import type {
  ClientHarnessObservation,
  ClientHarnessTargetConfig,
  McpPromptInfo,
  McpResourceInfo,
  McpServerInfo,
  McpToolInfo,
  TargetAdapter,
  TargetSnapshot
} from "../core/types.js";
import { asArray, asObject, getString } from "../utils/json.js";

export class ClientHarnessTarget implements TargetAdapter {
  readonly kind = "client-harness" as const;

  constructor(private readonly config: ClientHarnessTargetConfig) {}

  async loadSnapshot(): Promise<TargetSnapshot> {
    const rawText = await readFile(this.config.path, "utf8");
    const raw = JSON.parse(rawText) as unknown;
    const root = asObject(raw);
    const maliciousServer = asObject(root.maliciousServer);
    const client = asObject(root.client);

    return {
      server: normalizeServer(maliciousServer),
      tools: normalizeTools(maliciousServer),
      resources: normalizeResources(maliciousServer, "resources"),
      resourceTemplates: normalizeResources(maliciousServer, "resourceTemplates"),
      prompts: normalizePrompts(maliciousServer),
      clientHarness: {
        client: {
          name: getString(client.name),
          version: getString(client.version)
        },
        observations: normalizeObservations(root.observations)
      },
      raw
    };
  }
}

function normalizeServer(root: Record<string, unknown>): McpServerInfo {
  const server = asObject(root.server);
  return {
    name: getString(server.name) ?? getString(root.name),
    version: getString(server.version) ?? getString(root.version),
    instructions: getString(server.instructions) ?? getString(root.instructions),
    capabilities: asObject(server.capabilities ?? root.capabilities)
  };
}

function normalizeTools(root: Record<string, unknown>): McpToolInfo[] {
  return asArray(root.tools)
    .map((entry) => asObject(entry))
    .filter((entry) => typeof entry.name === "string")
    .map((entry) => ({
      ...entry,
      name: entry.name as string,
      description: getString(entry.description),
      inputSchema: asObject(entry.inputSchema),
      outputSchema: asObject(entry.outputSchema),
      annotations: asObject(entry.annotations)
    }));
}

function normalizeResources(root: Record<string, unknown>, key: "resources" | "resourceTemplates"): McpResourceInfo[] {
  return asArray(root[key]).map((entry) => {
    const object = asObject(entry);
    return {
      ...object,
      uri: getString(object.uri ?? object.uriTemplate),
      name: getString(object.name),
      title: getString(object.title),
      description: getString(object.description),
      mimeType: getString(object.mimeType)
    };
  });
}

function normalizePrompts(root: Record<string, unknown>): McpPromptInfo[] {
  return asArray(root.prompts)
    .map((entry) => asObject(entry))
    .filter((entry) => typeof entry.name === "string")
    .map((entry) => ({
      ...entry,
      name: entry.name as string,
      title: getString(entry.title),
      description: getString(entry.description),
      arguments: Array.isArray(entry.arguments)
        ? entry.arguments.map((argument) => {
            const object = asObject(argument);
            return {
              ...object,
              name: getString(object.name) ?? "argument",
              description: getString(object.description),
              required: typeof object.required === "boolean" ? object.required : undefined
            };
          })
        : []
    }));
}

function normalizeObservations(value: unknown): ClientHarnessObservation[] {
  return asArray(value)
    .map((entry) => asObject(entry))
    .filter((entry) => isObservationType(entry.type))
    .map((entry) => ({
      type: entry.type as ClientHarnessObservation["type"],
      toolName: getString(entry.toolName),
      action: getString(entry.action),
      reason: getString(entry.reason),
      arguments: asObject(entry.arguments),
      approved: typeof entry.approved === "boolean" ? entry.approved : undefined,
      approvalRequired: typeof entry.approvalRequired === "boolean" ? entry.approvalRequired : undefined,
      blocked: typeof entry.blocked === "boolean" ? entry.blocked : undefined,
      unnecessary: typeof entry.unnecessary === "boolean" ? entry.unnecessary : undefined,
      exfiltrates: typeof entry.exfiltrates === "boolean" ? entry.exfiltrates : undefined,
      dataBoundaryCrossed: typeof entry.dataBoundaryCrossed === "boolean" ? entry.dataBoundaryCrossed : undefined,
      destination: getString(entry.destination),
      path: getString(entry.path),
      boundary: getString(entry.boundary),
      dataClasses: asArray(entry.dataClasses).filter((item): item is string => typeof item === "string"),
      evidence: getString(entry.evidence)
    }));
}

function isObservationType(value: unknown): boolean {
  return value === "tool_call" || value === "approval" || value === "sandbox" || value === "data_boundary";
}
