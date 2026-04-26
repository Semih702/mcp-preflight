export const severities = ["info", "low", "medium", "high", "critical"] as const;
export type Severity = (typeof severities)[number];

export const severityRank: Record<Severity, number> = {
  info: 0,
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};

export const suiteNames = [
  "manifest",
  "prompt-injection",
  "tool-combinations",
  "implementation"
] as const;

export type SuiteName = (typeof suiteNames)[number];

export type JsonObject = Record<string, unknown>;

export interface Evidence {
  label: string;
  value: string;
}

export interface FindingLocation {
  path?: string;
  line?: number;
  pointer?: string;
}

export interface Finding {
  id: string;
  suite: SuiteName;
  severity: Severity;
  title: string;
  description: string;
  evidence?: Evidence[];
  recommendation: string;
  locations?: FindingLocation[];
  tags?: string[];
}

export interface McpServerInfo {
  name?: string;
  version?: string;
  instructions?: string;
  capabilities?: JsonObject;
}

export interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: JsonObject;
  outputSchema?: JsonObject;
  annotations?: JsonObject;
  [key: string]: unknown;
}

export interface McpResourceInfo {
  uri?: string;
  name?: string;
  title?: string;
  description?: string;
  mimeType?: string;
  [key: string]: unknown;
}

export interface McpPromptInfo {
  name: string;
  title?: string;
  description?: string;
  arguments?: Array<{
    name: string;
    description?: string;
    required?: boolean;
    [key: string]: unknown;
  }>;
  [key: string]: unknown;
}

export interface TargetSnapshot {
  server?: McpServerInfo;
  tools: McpToolInfo[];
  resources: McpResourceInfo[];
  resourceTemplates: McpResourceInfo[];
  prompts: McpPromptInfo[];
  raw?: unknown;
}

export interface ToolProbe {
  toolName: string;
  arguments: JsonObject;
  expectError?: boolean;
}

export interface RuntimeConfig {
  requestTimeoutMs: number;
  toolProbes: ToolProbe[];
}

export interface ImplementationConfig {
  paths: string[];
  exclude: string[];
}

export interface OutputConfig {
  json?: string;
  markdown?: string;
}

export interface CiConfig {
  failOn: Severity | "none";
}

export interface ManifestTargetConfig {
  type: "manifest";
  path: string;
}

export interface StdioTargetConfig {
  type: "stdio";
  command: string;
  args: string[];
  cwd?: string;
  env: Record<string, string>;
}

export type TargetConfig = ManifestTargetConfig | StdioTargetConfig;

export interface AppConfig {
  target: TargetConfig;
  suites: SuiteName[];
  runtime: RuntimeConfig;
  implementation: ImplementationConfig;
  output: OutputConfig;
  ci: CiConfig;
}

export interface ToolCallObservation {
  toolName: string;
  arguments: JsonObject;
  ok: boolean;
  resultText: string;
  raw?: unknown;
  error?: string;
}

export interface TargetAdapter {
  kind: TargetConfig["type"];
  loadSnapshot(): Promise<TargetSnapshot>;
  callTool?(probe: ToolProbe, timeoutMs: number): Promise<ToolCallObservation>;
  close?(): Promise<void>;
}

export interface TestContext {
  config: AppConfig;
  snapshot: TargetSnapshot;
  target: TargetAdapter;
}

export interface TestSuite {
  name: SuiteName;
  run(context: TestContext): Promise<Finding[]>;
}

export interface ReportSummary {
  total: number;
  bySeverity: Record<Severity, number>;
  riskScore: number;
  failed: boolean;
  failOn: Severity | "none";
}

export interface Report {
  schemaVersion: "0.1";
  generatedAt: string;
  target: {
    type: TargetConfig["type"];
    name?: string;
    version?: string;
  };
  suites: SuiteName[];
  summary: ReportSummary;
  findings: Finding[];
}
