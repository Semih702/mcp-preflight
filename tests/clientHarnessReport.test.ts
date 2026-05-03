import path from "node:path";
import { describe, expect, it } from "vitest";
import { runHarness } from "../src/core/runner.js";
import type { AppConfig } from "../src/core/types.js";

describe("client harness report metadata", () => {
  it("uses the client under test as the report target", async () => {
    const config: AppConfig = {
      target: {
        type: "client-harness",
        path: path.resolve("fixtures/client-harness-scenario.json")
      },
      suites: ["client-harness"],
      runtime: { requestTimeoutMs: 10000, toolProbes: [] },
      implementation: { paths: [], exclude: [] },
      output: {},
      ci: { failOn: "none" }
    };

    const report = await runHarness(config);

    expect(report.target.name).toBe("example-agent-client");
    expect(report.target.version).toBe("0.1.0");
  });
});
