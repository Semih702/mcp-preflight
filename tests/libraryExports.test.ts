import path from "node:path";
import { describe, expect, it } from "vitest";
import { runHarness, type AppConfig } from "../src/index.js";

describe("library exports", () => {
  it("runs the harness through the package entrypoint", async () => {
    const config: AppConfig = {
      target: {
        type: "manifest",
        path: path.resolve("fixtures/example-manifest.json")
      },
      suites: ["manifest", "prompt-injection", "tool-combinations"],
      runtime: {
        requestTimeoutMs: 10_000,
        toolProbes: []
      },
      implementation: {
        paths: [],
        exclude: []
      },
      output: {},
      ci: {
        failOn: "none"
      }
    };

    const report = await runHarness(config);

    expect(report.target.name).toBe("example-unsafe-server");
    expect(report.summary.total).toBeGreaterThan(0);
  });
});
