import type { Report } from "../core/types.js";
import { severities } from "../core/types.js";

export function printConsoleSummary(report: Report): void {
  const counts = severities
    .slice()
    .reverse()
    .map((severity) => `${severity}:${report.summary.bySeverity[severity]}`)
    .join(" ");

  console.log(`MCP preflight ${report.summary.failed ? "FAILED" : "PASSED"}`);
  console.log(`Target: ${report.target.name ?? "unknown"} (${report.target.type})`);
  console.log(`Findings: ${report.summary.total} | Risk score: ${report.summary.riskScore} | ${counts}`);

  const topFindings = report.findings.slice(0, 5);
  if (topFindings.length > 0) {
    console.log("");
    console.log("Top findings:");
    for (const finding of topFindings) {
      console.log(`- [${finding.severity}] ${finding.title} (${finding.id})`);
    }
  }
}
