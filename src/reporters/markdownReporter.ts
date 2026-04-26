import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Finding, Report, Severity } from "../core/types.js";
import { severities } from "../core/types.js";

export async function writeMarkdownReport(report: Report, outputPath: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderMarkdownReport(report), "utf8");
}

export function renderMarkdownReport(report: Report): string {
  const lines: string[] = [];
  lines.push("# MCP Preflight Report");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Target: ${report.target.name ?? "unknown"} (${report.target.type})`);
  if (report.target.version) {
    lines.push(`Version: ${report.target.version}`);
  }
  lines.push(`Suites: ${report.suites.join(", ")}`);
  lines.push(`Status: ${report.summary.failed ? "failed" : "passed"} (failOn: ${report.summary.failOn})`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`Total findings: ${report.summary.total}`);
  lines.push(`Risk score: ${report.summary.riskScore}`);
  lines.push("");
  lines.push("| Severity | Count |");
  lines.push("| --- | ---: |");
  for (const severity of severities.slice().reverse() as Severity[]) {
    lines.push(`| ${severity} | ${report.summary.bySeverity[severity]} |`);
  }

  if (report.findings.length === 0) {
    lines.push("");
    lines.push("No findings.");
    lines.push("");
    return lines.join("\n");
  }

  lines.push("");
  lines.push("## Findings");
  lines.push("");

  for (const finding of report.findings) {
    lines.push(`### ${finding.severity.toUpperCase()}: ${finding.title}`);
    lines.push("");
    lines.push(`ID: \`${finding.id}\``);
    lines.push("");
    lines.push(finding.description);
    lines.push("");

    if (finding.evidence?.length) {
      lines.push("Evidence:");
      for (const evidence of finding.evidence) {
        lines.push(`- ${evidence.label}: ${inlineCode(evidence.value)}`);
      }
      lines.push("");
    }

    if (finding.locations?.length) {
      lines.push("Locations:");
      for (const location of finding.locations) {
        const pieces = [
          location.path,
          location.line ? `line ${location.line}` : undefined,
          location.pointer
        ].filter(Boolean);
        lines.push(`- ${pieces.join(" ")}`);
      }
      lines.push("");
    }

    lines.push(`Recommendation: ${finding.recommendation}`);
    lines.push("");
  }

  return lines.join("\n");
}

function inlineCode(value: string): string {
  const compact = value.replace(/\s+/g, " ").trim();
  return `\`${compact.replace(/`/g, "'")}\``;
}
