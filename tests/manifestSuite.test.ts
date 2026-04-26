import { describe, expect, it } from "vitest";
import { manifestSuite } from "../src/suites/manifestSuite.js";
import type { TestContext } from "../src/core/types.js";

describe("manifest suite", () => {
  it("flags open schemas and unconstrained path fields", async () => {
    const findings = await manifestSuite.run(contextWithTool({
      name: "read_file",
      description: "Read a file from disk.",
      inputSchema: {
        type: "object",
        properties: {
          path: { type: "string" }
        },
        required: ["path"]
      }
    }));

    expect(findings.some((finding) => finding.id.includes("unbounded-string"))).toBe(true);
  });
});

function contextWithTool(tool: TestContext["snapshot"]["tools"][number]): TestContext {
  return {
    config: {
      target: { type: "manifest", path: "unused" },
      suites: ["manifest"],
      runtime: { requestTimeoutMs: 10000, toolProbes: [] },
      implementation: { paths: [], exclude: [] },
      output: {},
      ci: { failOn: "high" }
    },
    snapshot: {
      tools: [tool],
      resources: [],
      resourceTemplates: [],
      prompts: []
    },
    target: {
      kind: "manifest",
      async loadSnapshot() {
        throw new Error("unused");
      }
    }
  };
}
