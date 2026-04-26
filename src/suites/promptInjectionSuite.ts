import type { Finding, TestSuite, ToolCallObservation } from "../core/types.js";
import { collectTextSurfaces, injectionPatterns } from "../utils/text.js";
import { stringifyEvidence } from "../utils/json.js";

export const promptInjectionSuite: TestSuite = {
  name: "prompt-injection",
  async run(context) {
    const findings: Finding[] = [];
    const surfaces = collectTextSurfaces(context.snapshot);

    for (const surface of surfaces) {
      for (const pattern of injectionPatterns) {
        if (pattern.pattern.test(surface.text)) {
          findings.push({
            id: `prompt-injection.surface.${pattern.id}.${sanitizeId(surface.source)}`,
            suite: "prompt-injection",
            severity: surface.source.includes("inputSchema") ? "medium" : "high",
            title: `Prompt-injection language in ${surface.source}`,
            description: "MCP metadata and server-provided text can be forwarded into an LLM context. Instruction-shaped content here can steer the client or agent.",
            evidence: [
              { label: pattern.label, value: stringifyEvidence(surface.text, 260) }
            ],
            recommendation: "Remove instruction-like text from metadata, or clearly mark untrusted content as data. Clients should delimit tool/resource output before model use.",
            locations: [{ pointer: surface.pointer }],
            tags: ["prompt-injection", "metadata"]
          });
          break;
        }
      }
    }

    if (context.config.runtime.toolProbes.length > 0) {
      findings.push(...await runToolProbes(context));
    }

    return findings;
  }
};

async function runToolProbes(context: Parameters<TestSuite["run"]>[0]): Promise<Finding[]> {
  const findings: Finding[] = [];

  if (!context.target.callTool) {
    findings.push({
      id: "prompt-injection.tool-probes.unsupported-target",
      suite: "prompt-injection",
      severity: "info",
      title: "Tool probes were configured but target cannot execute tools",
      description: "Manifest targets support static analysis only. Dynamic tool probes require an MCP transport target.",
      recommendation: "Use a stdio target for dynamic probing, or keep this config as a static manifest audit."
    });
    return findings;
  }

  for (const probe of context.config.runtime.toolProbes) {
    const observation = await context.target.callTool(probe, context.config.runtime.requestTimeoutMs);
    findings.push(...inspectObservation(observation, Boolean(probe.expectError)));
  }

  return findings;
}

function inspectObservation(observation: ToolCallObservation, expectError: boolean): Finding[] {
  const findings: Finding[] = [];

  if (!observation.ok && !expectError) {
    findings.push({
      id: `prompt-injection.probe.${observation.toolName}.error`,
      suite: "prompt-injection",
      severity: "low",
      title: `Tool probe '${observation.toolName}' returned an error`,
      description: "The configured dynamic probe failed. This may be expected for authorization or validation failures.",
      evidence: [{ label: "error", value: observation.error ?? "Unknown error" }],
      recommendation: "If this is expected, set expectError:true for the probe. Otherwise inspect validation and auth behavior.",
      tags: ["dynamic-probe"]
    });
  }

  if (observation.ok) {
    for (const pattern of injectionPatterns) {
      if (pattern.pattern.test(observation.resultText)) {
        findings.push({
          id: `prompt-injection.probe.${observation.toolName}.${pattern.id}`,
          suite: "prompt-injection",
          severity: "high",
          title: `Tool '${observation.toolName}' returned instruction-shaped content`,
          description: "Tool output may be placed into model context by an MCP client. Returning imperative instructions without strong data boundaries is a prompt-injection surface.",
          evidence: [
            { label: pattern.label, value: stringifyEvidence(observation.resultText, 320) }
          ],
          recommendation: "Treat external or user-controlled text as data, wrap it in explicit delimiters, and avoid returning hidden instructions or model-directed commands.",
          tags: ["prompt-injection", "tool-output", "dynamic-probe"]
        });
        break;
      }
    }
  }

  return findings;
}

function sanitizeId(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
