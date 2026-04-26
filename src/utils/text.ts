import type { TargetSnapshot } from "../core/types.js";
import { stringifyEvidence } from "./json.js";

export interface TextSurface {
  source: string;
  pointer: string;
  text: string;
}

export const injectionPatterns: Array<{ id: string; pattern: RegExp; label: string }> = [
  {
    id: "ignore-instructions",
    pattern: /\b(ignore|disregard|forget|override)\b.{0,80}\b(previous|prior|above|system|developer|tool)\b/i,
    label: "Instruction override language"
  },
  {
    id: "secret-exfiltration",
    pattern: /\b(reveal|print|dump|exfiltrate|send|leak)\b.{0,80}\b(secret|token|api[_ -]?key|credential|password|system prompt)\b/i,
    label: "Secret exfiltration language"
  },
  {
    id: "role-claim",
    pattern: /\b(system|developer|admin)\s*:\s*|\byou are now\b|\bnew instructions\b/i,
    label: "Role or instruction framing"
  },
  {
    id: "hidden-instruction",
    pattern: /\b(do not (tell|mention|explain)|hidden instruction|invisible instruction|private instruction)\b/i,
    label: "Hidden instruction language"
  },
  {
    id: "tool-abuse",
    pattern: /\b(call|use|invoke)\b.{0,60}\btool\b.{0,80}\b(without asking|silently|automatically)\b/i,
    label: "Tool-use coercion language"
  }
];

export const secretPatterns: Array<{ id: string; pattern: RegExp; label: string }> = [
  {
    id: "generic-secret",
    pattern: /\b(api[_ -]?key|secret|credential|password|bearer token|access token|refresh token)\b/i,
    label: "Credential wording"
  },
  {
    id: "aws-key",
    pattern: /\bAKIA[0-9A-Z]{16}\b/,
    label: "AWS access key shape"
  },
  {
    id: "private-key",
    pattern: /-----BEGIN (RSA |EC |OPENSSH |)?PRIVATE KEY-----/,
    label: "Private key block"
  }
];

export function collectTextSurfaces(snapshot: TargetSnapshot): TextSurface[] {
  const surfaces: TextSurface[] = [];

  if (snapshot.server?.instructions) {
    surfaces.push({
      source: "server.instructions",
      pointer: "/server/instructions",
      text: snapshot.server.instructions
    });
  }

  snapshot.tools.forEach((tool, index) => {
    if (tool.description) {
      surfaces.push({
        source: `tool:${tool.name}.description`,
        pointer: `/tools/${index}/description`,
        text: tool.description
      });
    }
    if (tool.inputSchema) {
      surfaces.push({
        source: `tool:${tool.name}.inputSchema`,
        pointer: `/tools/${index}/inputSchema`,
        text: stringifyEvidence(tool.inputSchema, 1_500)
      });
    }
  });

  snapshot.resources.forEach((resource, index) => {
    for (const key of ["name", "title", "description", "uri", "mimeType"] as const) {
      const value = resource[key];
      if (typeof value === "string") {
        surfaces.push({
          source: `resource:${resource.name ?? resource.uri ?? index}.${key}`,
          pointer: `/resources/${index}/${key}`,
          text: value
        });
      }
    }
  });

  snapshot.resourceTemplates.forEach((resource, index) => {
    for (const key of ["name", "title", "description", "uri", "mimeType"] as const) {
      const value = resource[key];
      if (typeof value === "string") {
        surfaces.push({
          source: `resourceTemplate:${resource.name ?? resource.uri ?? index}.${key}`,
          pointer: `/resourceTemplates/${index}/${key}`,
          text: value
        });
      }
    }
  });

  snapshot.prompts.forEach((prompt, index) => {
    if (prompt.description) {
      surfaces.push({
        source: `prompt:${prompt.name}.description`,
        pointer: `/prompts/${index}/description`,
        text: prompt.description
      });
    }
    prompt.arguments?.forEach((argument, argumentIndex) => {
      if (argument.description) {
        surfaces.push({
          source: `prompt:${prompt.name}.argument:${argument.name}`,
          pointer: `/prompts/${index}/arguments/${argumentIndex}/description`,
          text: argument.description
        });
      }
    });
  });

  return surfaces;
}

export function extractTextFromMcpContent(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }

  if (!value || typeof value !== "object") {
    return "";
  }

  const object = value as Record<string, unknown>;
  const chunks: string[] = [];

  if (typeof object.text === "string") {
    chunks.push(object.text);
  }

  if (Array.isArray(object.content)) {
    for (const item of object.content) {
      chunks.push(extractTextFromMcpContent(item));
    }
  }

  if (Array.isArray(object.contents)) {
    for (const item of object.contents) {
      chunks.push(extractTextFromMcpContent(item));
    }
  }

  return chunks.filter(Boolean).join("\n");
}
