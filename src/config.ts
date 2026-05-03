import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { severities, suiteNames, type AppConfig, type Severity } from "./core/types.js";

const SeveritySchema = z.enum(severities);
const SuiteNameSchema = z.enum(suiteNames);
const serverSuiteDefaults = ["manifest", "prompt-injection", "tool-combinations", "implementation"] satisfies AppConfig["suites"];
const clientHarnessSuiteDefaults = ["prompt-injection", "client-harness"] satisfies AppConfig["suites"];

const ToolProbeSchema = z.object({
  toolName: z.string().min(1),
  arguments: z.record(z.string(), z.unknown()).default({}),
  expectError: z.boolean().optional()
});

const ConfigSchema = z.object({
  target: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("manifest"),
      path: z.string().min(1)
    }),
    z.object({
      type: z.literal("client-harness"),
      path: z.string().min(1)
    }),
    z.object({
      type: z.literal("stdio"),
      command: z.string().min(1),
      args: z.array(z.string()).default([]),
      cwd: z.string().optional(),
      env: z.record(z.string(), z.string()).default({})
    })
  ]),
  suites: z.array(SuiteNameSchema).default([...serverSuiteDefaults]),
  runtime: z.object({
    requestTimeoutMs: z.number().int().positive().default(10_000),
    toolProbes: z.array(ToolProbeSchema).default([])
  }).default({
    requestTimeoutMs: 10_000,
    toolProbes: []
  }),
  implementation: z.object({
    paths: z.array(z.string()).default([]),
    exclude: z.array(z.string()).default(["node_modules", "dist", ".git", "coverage"])
  }).default({
    paths: [],
    exclude: ["node_modules", "dist", ".git", "coverage"]
  }),
  output: z.object({
    json: z.string().optional(),
    markdown: z.string().optional()
  }).default({}),
  ci: z.object({
    failOn: z.union([SeveritySchema, z.literal("none")]).default("high")
  }).default({
    failOn: "high"
  })
});

export async function loadConfig(configPath: string): Promise<AppConfig> {
  const absolutePath = path.resolve(configPath);
  const configDir = path.dirname(absolutePath);
  const raw = await readFile(absolutePath, "utf8");
  const rawConfig = JSON.parse(raw) as unknown;
  const parsed = applyTargetSuiteDefaults(ConfigSchema.parse(rawConfig) as AppConfig, rawConfig);
  return resolveConfigPaths(parsed, configDir);
}

export function defaultConfig(): AppConfig {
  return ConfigSchema.parse({
    target: {
      type: "manifest",
      path: "fixtures/example-manifest.json"
    }
  }) as AppConfig;
}

function applyTargetSuiteDefaults(config: AppConfig, rawConfig: unknown): AppConfig {
  const root = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig)
    ? rawConfig as Record<string, unknown>
    : {};

  if (Array.isArray(root.suites)) {
    return config;
  }

  if (config.target.type === "client-harness") {
    return {
      ...config,
      suites: [...clientHarnessSuiteDefaults]
    };
  }

  return config;
}

function resolveConfigPaths(config: AppConfig, configDir: string): AppConfig {
  const target = { ...config.target };

  if (target.type === "manifest" || target.type === "client-harness") {
    target.path = resolveIfRelative(target.path, configDir);
  } else if (target.cwd) {
    target.cwd = resolveIfRelative(target.cwd, configDir);
  }

  return {
    ...config,
    target,
    implementation: {
      ...config.implementation,
      paths: config.implementation.paths.map((entry) => resolveIfRelative(entry, configDir))
    },
    output: {
      json: config.output.json ? resolveIfRelative(config.output.json, configDir) : undefined,
      markdown: config.output.markdown ? resolveIfRelative(config.output.markdown, configDir) : undefined
    }
  };
}

function resolveIfRelative(input: string, baseDir: string): string {
  return path.isAbsolute(input) ? input : path.resolve(baseDir, input);
}

export function compareSeverity(left: Severity, right: Severity): number {
  return severities.indexOf(left) - severities.indexOf(right);
}
