import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type { Finding, TestSuite } from "../core/types.js";

interface SourceHit {
  path: string;
  line: number;
  text: string;
  rule: (typeof rules)[number];
}

const sourceExtensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".py", ".go", ".rs"]);

const rules: Array<{
  id: string;
  severity: Finding["severity"];
  title: string;
  pattern: RegExp;
  recommendation: string;
  tags: string[];
}> = [
  {
    id: "process-env-return",
    severity: "high",
    title: "Potential environment variable exposure",
    pattern: /\b(return|JSON\.stringify|send|text|content)\b.{0,80}\bprocess\.env\b/i,
    recommendation: "Do not return full environment objects through MCP tools. Read only named variables and redact before logging or returning.",
    tags: ["confidentiality", "secrets"]
  },
  {
    id: "secret-logging",
    severity: "medium",
    title: "Potential secret logging",
    pattern: /\b(console\.log|logger\.(info|debug|warn|error)|print)\b.{0,100}\b(token|secret|password|api[_-]?key|credential)\b/i,
    recommendation: "Redact sensitive fields before logging and keep debug logs out of model-visible tool output.",
    tags: ["confidentiality", "logging"]
  },
  {
    id: "shell-exec",
    severity: "high",
    title: "Shell execution surface",
    pattern: /\b(child_process|execSync|execFileSync|spawnSync|exec\(|spawn\(|subprocess\.|os\.system)\b/i,
    recommendation: "Avoid shell interpolation. Prefer argv arrays, allowlisted commands, fixed working directories, and explicit approval gates.",
    tags: ["command-execution", "integrity"]
  },
  {
    id: "filesystem-path",
    severity: "medium",
    title: "Filesystem path handling surface",
    pattern: /\b(readFile|writeFile|appendFile|rm|unlink|rename|createReadStream|open\(|fs\.|Path\(|os\.Remove)\b/i,
    recommendation: "Normalize paths, enforce a workspace root, reject traversal, and avoid returning sensitive file contents by default.",
    tags: ["filesystem", "confidentiality"]
  },
  {
    id: "ssrf-url",
    severity: "medium",
    title: "Outbound URL handling surface",
    pattern: /\b(fetch|axios|got|request|http\.get|https\.get|requests\.get|requests\.post)\b/i,
    recommendation: "Use destination allowlists, block link-local/private networks where appropriate, and log outbound destinations.",
    tags: ["ssrf", "network"]
  }
];

export const implementationSuite: TestSuite = {
  name: "implementation",
  async run(context) {
    if (context.config.implementation.paths.length === 0) {
      return [{
        id: "implementation.no-paths",
        suite: "implementation",
        severity: "info",
        title: "No implementation paths configured",
        description: "Implementation scanning is disabled because no source paths were provided.",
        recommendation: "Add implementation.paths in the config when CI has access to the MCP server source tree.",
        tags: ["configuration"]
      }];
    }

    const files = await collectFiles(context.config.implementation.paths, context.config.implementation.exclude);
    const findings: Finding[] = [];

    for (const file of files) {
      const hits = await scanFile(file);
      for (const hit of hits) {
        findings.push(toFinding(hit));
      }
    }

    return findings;
  }
};

async function collectFiles(entries: string[], excludes: string[]): Promise<string[]> {
  const files: string[] = [];

  for (const entry of entries) {
    await walk(entry, excludes, files);
  }

  return files;
}

async function walk(entry: string, excludes: string[], files: string[]): Promise<void> {
  const info = await stat(entry);
  const name = path.basename(entry);

  if (excludes.includes(name)) {
    return;
  }

  if (info.isDirectory()) {
    const children = await readdir(entry);
    await Promise.all(children.map((child) => walk(path.join(entry, child), excludes, files)));
    return;
  }

  if (info.isFile() && sourceExtensions.has(path.extname(entry))) {
    files.push(entry);
  }
}

async function scanFile(filePath: string): Promise<SourceHit[]> {
  const source = await readFile(filePath, "utf8");
  const hits: SourceHit[] = [];
  const lines = source.split(/\r?\n/);

  for (const [index, line] of lines.entries()) {
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        hits.push({
          path: filePath,
          line: index + 1,
          text: line.trim(),
          rule
        });
      }
    }
  }

  return hits;
}

function toFinding(hit: SourceHit): Finding {
  const rule = hit.rule;

  return {
    id: `implementation.${rule.id}.${hash(`${hit.path}:${hit.line}`)}`,
    suite: "implementation",
    severity: rule.severity,
    title: rule.title,
    description: "A source-code heuristic matched a confidentiality, integrity, or availability-sensitive implementation surface.",
    evidence: [{ label: "source", value: hit.text }],
    recommendation: rule.recommendation,
    locations: [{ path: hit.path, line: hit.line }],
    tags: rule.tags
  };
}

function hash(input: string): string {
  let value = 0;
  for (let index = 0; index < input.length; index += 1) {
    value = ((value << 5) - value + input.charCodeAt(index)) | 0;
  }
  return Math.abs(value).toString(36);
}
