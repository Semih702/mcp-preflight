import type { Finding, McpToolInfo, TestSuite } from "../core/types.js";
import { asObject, stringifyEvidence } from "../utils/json.js";
import { flattenJsonSchema, hasConstraint, isOpenObjectSchema, schemaRequired } from "../utils/schema.js";
import { secretPatterns } from "../utils/text.js";

const riskyActionPatterns = [
  /\b(exec|execute|shell|command|spawn|process)\b/i,
  /\b(delete|remove|write|overwrite|update|mutate|drop|truncate)\b/i,
  /\b(fetch|http|request|download|upload|webhook|post)\b/i,
  /\b(file|path|directory|filesystem|readFile|writeFile)\b/i,
  /\b(sql|query|database|db|redis|mongo|postgres)\b/i
];

const sensitiveFieldPattern = /\b(token|secret|password|credential|api[_-]?key|private[_-]?key|auth|cookie|session)\b/i;
const broadStringFieldPattern = /\b(command|cmd|path|url|uri|query|selector|regex|expression|script|code|body|headers?)\b/i;

export const manifestSuite: TestSuite = {
  name: "manifest",
  async run(context) {
    const findings: Finding[] = [];

    for (const [index, tool] of context.snapshot.tools.entries()) {
      findings.push(...inspectTool(tool, index));
    }

    if (context.snapshot.tools.length === 0) {
      findings.push({
        id: "manifest.no-tools",
        suite: "manifest",
        severity: "info",
        title: "No tools were discovered",
        description: "The target did not expose MCP tools in its manifest snapshot.",
        recommendation: "If this server is expected to expose tools, verify capability negotiation and listTools support."
      });
    }

    return findings;
  }
};

function inspectTool(tool: McpToolInfo, index: number): Finding[] {
  const findings: Finding[] = [];
  const toolText = `${tool.name}\n${tool.description ?? ""}`;
  const inputSchema = asObject(tool.inputSchema);

  if (!tool.description || tool.description.trim().length < 12) {
    findings.push({
      id: `manifest.${tool.name}.weak-description`,
      suite: "manifest",
      severity: "low",
      title: `Tool '${tool.name}' has a weak description`,
      description: "Tool descriptions are part of the model-facing contract. Sparse descriptions make it harder for clients to choose tools safely.",
      recommendation: "Describe what the tool does, what it must not be used for, and any data-safety constraints.",
      locations: [{ pointer: `/tools/${index}/description` }],
      tags: ["metadata", "usability"]
    });
  }

  for (const pattern of secretPatterns) {
    if (pattern.pattern.test(toolText)) {
      findings.push({
        id: `manifest.${tool.name}.secret-language.${pattern.id}`,
        suite: "manifest",
        severity: "medium",
        title: `Tool '${tool.name}' references sensitive data`,
        description: "The tool metadata references secrets or credentials. That may be legitimate, but it needs explicit handling guidance.",
        evidence: [{ label: pattern.label, value: stringifyEvidence(toolText, 220) }],
        recommendation: "Make credential handling explicit: never echo secrets, scope access narrowly, and prefer secure elicitation or environment binding.",
        locations: [{ pointer: `/tools/${index}` }],
        tags: ["confidentiality", "metadata"]
      });
      break;
    }
  }

  if (riskyActionPatterns.some((pattern) => pattern.test(toolText))) {
    const annotations = asObject(tool.annotations);
    const hasSafetyAnnotation = ["readOnlyHint", "destructiveHint", "idempotentHint", "openWorldHint"]
      .some((key) => annotations[key] !== undefined);

    if (!hasSafetyAnnotation) {
      findings.push({
        id: `manifest.${tool.name}.missing-safety-annotations`,
        suite: "manifest",
        severity: "medium",
        title: `Risky tool '${tool.name}' lacks safety annotations`,
        description: "The tool appears to perform filesystem, network, process, database, or mutating operations without model-facing safety annotations.",
        recommendation: "Add MCP tool annotations that describe read-only, destructive, idempotent, and external-world behavior.",
        locations: [{ pointer: `/tools/${index}/annotations` }],
        tags: ["tool-selection", "least-privilege"]
      });
    }
  }

  if (Object.keys(inputSchema).length === 0 || isOpenObjectSchema(inputSchema)) {
    findings.push({
      id: `manifest.${tool.name}.open-input-schema`,
      suite: "manifest",
      severity: "high",
      title: `Tool '${tool.name}' has an overly open input schema`,
      description: "An absent or open object schema lets clients send arbitrary arguments, which weakens validation and increases injection surface.",
      recommendation: "Declare explicit properties, required fields, and additionalProperties:false where possible.",
      locations: [{ pointer: `/tools/${index}/inputSchema` }],
      tags: ["validation", "input-schema"]
    });
  }

  const required = schemaRequired(inputSchema);
  const fields = flattenJsonSchema(inputSchema, "$", required);

  for (const field of fields) {
    if (field.type === "string" && broadStringFieldPattern.test(field.name) && !hasConstraint(field.schema)) {
      findings.push({
        id: `manifest.${tool.name}.${field.name}.unbounded-string`,
        suite: "manifest",
        severity: "medium",
        title: `Tool '${tool.name}' accepts unconstrained '${field.name}' input`,
        description: "Broad string fields such as command, path, URL, query, or code need schema constraints because they often cross trust boundaries.",
        recommendation: "Add enum, format, pattern, maxLength, or a stricter nested schema. Validate again server-side.",
        locations: [{ pointer: `/tools/${index}/inputSchema/${field.path.replace(/^\$\./, "")}` }],
        tags: ["validation", "injection"]
      });
    }

    if (sensitiveFieldPattern.test(field.name) && field.required) {
      findings.push({
        id: `manifest.${tool.name}.${field.name}.required-secret`,
        suite: "manifest",
        severity: "medium",
        title: `Tool '${tool.name}' requires sensitive input '${field.name}'`,
        description: "Required credential-like fields increase the chance that clients or model transcripts contain secrets.",
        recommendation: "Prefer out-of-band credential binding, secure elicitation, or environment-scoped credentials instead of tool arguments.",
        locations: [{ pointer: `/tools/${index}/inputSchema/${field.path.replace(/^\$\./, "")}` }],
        tags: ["confidentiality", "credentials"]
      });
    }
  }

  return findings;
}
