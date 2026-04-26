import { readFile } from "node:fs/promises";
import type {
  ManifestTargetConfig,
  McpPromptInfo,
  McpResourceInfo,
  McpToolInfo,
  TargetAdapter,
  TargetSnapshot
} from "../core/types.js";
import { asArray, asObject } from "../utils/json.js";

export class ManifestTarget implements TargetAdapter {
  readonly kind = "manifest" as const;

  constructor(private readonly config: ManifestTargetConfig) {}

  async loadSnapshot(): Promise<TargetSnapshot> {
    const rawText = await readFile(this.config.path, "utf8");
    const raw = JSON.parse(rawText) as unknown;
    const root = asObject(raw);

    return {
      server: normalizeServer(root),
      tools: normalizeTools(root),
      resources: normalizeResources(root, "resources"),
      resourceTemplates: normalizeResources(root, "resourceTemplates"),
      prompts: normalizePrompts(root),
      raw
    };
  }
}

function normalizeServer(root: Record<string, unknown>) {
  const server = asObject(root.server);
  return {
    name: stringFrom(server.name) ?? stringFrom(root.name),
    version: stringFrom(server.version) ?? stringFrom(root.version),
    instructions: stringFrom(server.instructions) ?? stringFrom(root.instructions),
    capabilities: asObject(server.capabilities ?? root.capabilities)
  };
}

function normalizeTools(root: Record<string, unknown>): McpToolInfo[] {
  const direct = asArray(root.tools);
  const listResult = asArray(asObject(root.listTools).tools);
  return [...direct, ...listResult]
    .map((entry) => asObject(entry))
    .filter((entry) => typeof entry.name === "string")
    .map((entry) => ({
      ...entry,
      name: entry.name as string,
      description: stringFrom(entry.description),
      inputSchema: asObject(entry.inputSchema),
      outputSchema: asObject(entry.outputSchema),
      annotations: asObject(entry.annotations)
    }));
}

function normalizeResources(root: Record<string, unknown>, key: "resources" | "resourceTemplates"): McpResourceInfo[] {
  const direct = asArray(root[key]);
  const legacyKey = key === "resourceTemplates" ? "listResourceTemplates" : "listResources";
  const listResult = asArray(asObject(root[legacyKey])[key]);

  return [...direct, ...listResult].map((entry) => {
    const object = asObject(entry);
    return {
      ...object,
      uri: stringFrom(object.uri ?? object.uriTemplate),
      name: stringFrom(object.name),
      title: stringFrom(object.title),
      description: stringFrom(object.description),
      mimeType: stringFrom(object.mimeType)
    };
  });
}

function normalizePrompts(root: Record<string, unknown>): McpPromptInfo[] {
  const direct = asArray(root.prompts);
  const listResult = asArray(asObject(root.listPrompts).prompts);

  return [...direct, ...listResult]
    .map((entry) => asObject(entry))
    .filter((entry) => typeof entry.name === "string")
    .map((entry) => ({
      ...entry,
      name: entry.name as string,
      title: stringFrom(entry.title),
      description: stringFrom(entry.description),
      arguments: Array.isArray(entry.arguments)
        ? entry.arguments.map((argument) => {
            const object = asObject(argument);
            return {
              ...object,
              name: stringFrom(object.name) ?? "argument",
              description: stringFrom(object.description),
              required: typeof object.required === "boolean" ? object.required : undefined
            };
          })
        : []
    }));
}

function stringFrom(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
