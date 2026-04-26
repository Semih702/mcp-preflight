import type { Finding, McpToolInfo, TestSuite } from "../core/types.js";
import { flattenJsonSchema, hasConstraint, schemaRequired } from "../utils/schema.js";

type Capability = "read" | "write" | "network" | "execute" | "database" | "credential" | "longRunning";

const capabilityPatterns: Record<Capability, RegExp[]> = {
  read: [/\b(read|get|list|search|export|download|open)\b/i, /\bfile|filesystem|bucket|object|record\b/i],
  write: [/\b(write|create|update|delete|remove|upload|send|post|publish|commit|drop)\b/i],
  network: [/\b(fetch|http|url|webhook|request|socket|api|crawl)\b/i],
  execute: [/\b(exec|execute|shell|command|spawn|script|terminal|run)\b/i],
  database: [/\b(sql|query|database|postgres|mysql|mongo|redis|table|collection)\b/i],
  credential: [/\b(token|secret|password|credential|api[_-]?key|cookie|session)\b/i],
  longRunning: [/\b(watch|stream|crawl|sync|batch|bulk|index|scan|subscribe)\b/i]
};

export const toolCombinationSuite: TestSuite = {
  name: "tool-combinations",
  async run(context) {
    const findings: Finding[] = [];
    const classified = context.snapshot.tools.map((tool) => ({
      tool,
      capabilities: classifyTool(tool)
    }));

    findings.push(...findExfiltrationPaths(classified));
    findings.push(...findHostControlPaths(classified));
    findings.push(...findLongRunningRisks(classified));

    return findings;
  }
};

function classifyTool(tool: McpToolInfo): Set<Capability> {
  const text = [
    tool.name,
    tool.description,
    JSON.stringify(tool.inputSchema ?? {})
  ].filter(Boolean).join("\n");

  const capabilities = new Set<Capability>();
  for (const [capability, patterns] of Object.entries(capabilityPatterns) as Array<[Capability, RegExp[]]>) {
    if (patterns.some((pattern) => pattern.test(text))) {
      capabilities.add(capability);
    }
  }
  return capabilities;
}

function findExfiltrationPaths(classified: Array<{ tool: McpToolInfo; capabilities: Set<Capability> }>): Finding[] {
  const readTools = classified.filter((entry) => entry.capabilities.has("read") || entry.capabilities.has("database"));
  const outboundTools = classified.filter((entry) => entry.capabilities.has("network") || entry.capabilities.has("write"));
  const credentialTools = classified.filter((entry) => entry.capabilities.has("credential"));

  if (readTools.length > 0 && outboundTools.length > 0) {
    return [{
      id: "tool-combinations.read-to-outbound",
      suite: "tool-combinations",
      severity: credentialTools.length > 0 ? "critical" : "high",
      title: "Tool set enables read-to-outbound data flow",
      description: "One or more tools can read data while another can send or write data elsewhere. Agents can chain these tools into unintended exfiltration flows.",
      evidence: [
        { label: "read-capable tools", value: readTools.map((entry) => entry.tool.name).join(", ") },
        { label: "outbound-capable tools", value: outboundTools.map((entry) => entry.tool.name).join(", ") }
      ],
      recommendation: "Add policy checks at the MCP client or gateway layer: require user confirmation, per-tool allowlists, destination allowlists, and audit logs for cross-tool data movement.",
      tags: ["confidentiality", "cross-tool", "exfiltration"]
    }];
  }

  return [];
}

function findHostControlPaths(classified: Array<{ tool: McpToolInfo; capabilities: Set<Capability> }>): Finding[] {
  const fileTools = classified.filter((entry) => entry.capabilities.has("read") || entry.capabilities.has("write"));
  const executeTools = classified.filter((entry) => entry.capabilities.has("execute"));

  if (fileTools.length > 0 && executeTools.length > 0) {
    return [{
      id: "tool-combinations.file-plus-execute",
      suite: "tool-combinations",
      severity: "critical",
      title: "Tool set combines filesystem access with command execution",
      description: "Filesystem and process execution tools are high-risk when available to the same agent session, especially if path or command inputs are broad.",
      evidence: [
        { label: "file-capable tools", value: fileTools.map((entry) => entry.tool.name).join(", ") },
        { label: "execute-capable tools", value: executeTools.map((entry) => entry.tool.name).join(", ") }
      ],
      recommendation: "Separate these capabilities across profiles, enforce workspace roots, disable shell interpolation, and require explicit approval for execution.",
      tags: ["integrity", "host-control", "cross-tool"]
    }];
  }

  return [];
}

function findLongRunningRisks(classified: Array<{ tool: McpToolInfo; capabilities: Set<Capability> }>): Finding[] {
  const findings: Finding[] = [];

  for (const { tool, capabilities } of classified) {
    if (!capabilities.has("longRunning")) {
      continue;
    }

    const fields = flattenJsonSchema(tool.inputSchema, "$", schemaRequired(tool.inputSchema));
    const hasBound = fields.some((field) => /limit|page|cursor|timeout|max|count|size/i.test(field.name) && hasConstraint(field.schema));

    if (!hasBound) {
      findings.push({
        id: `tool-combinations.${tool.name}.long-running-unbounded`,
        suite: "tool-combinations",
        severity: "medium",
        title: `Long-running tool '${tool.name}' lacks visible bounds`,
        description: "Bulk, stream, watch, scan, and crawl tools should expose timeout, limit, pagination, or cancellation controls.",
        recommendation: "Add bounded parameters and enforce server-side defaults. In CI, add dynamic probes for cancellation and timeout behavior.",
        tags: ["availability", "long-running"]
      });
    }
  }

  return findings;
}
