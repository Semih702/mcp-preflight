import type { AppConfig, Finding, Report, Severity, TargetAdapter, TargetSnapshot, TestSuite } from "./types.js";
import { severities, severityRank } from "./types.js";
import { createTarget } from "../adapters/index.js";
import { allSuites } from "../suites/index.js";

export async function runHarness(config: AppConfig): Promise<Report> {
  const target = createTarget(config);

  try {
    const snapshot = await target.loadSnapshot();
    const selectedSuites = allSuites.filter((suite) => config.suites.includes(suite.name));
    const findings: Finding[] = [];

    for (const suite of selectedSuites) {
      findings.push(...await runSuite(suite, config, snapshot, target));
    }

    findings.sort((left, right) => {
      const severityDelta = severityRank[right.severity] - severityRank[left.severity];
      return severityDelta === 0 ? left.id.localeCompare(right.id) : severityDelta;
    });

    return {
      schemaVersion: "0.1",
      generatedAt: new Date().toISOString(),
      target: {
        type: config.target.type,
        name: targetName(config, snapshot),
        version: targetVersion(config, snapshot)
      },
      suites: selectedSuites.map((suite) => suite.name),
      summary: summarize(findings, config.ci.failOn),
      findings
    };
  } finally {
    await target.close?.();
  }
}

function targetName(config: AppConfig, snapshot: TargetSnapshot): string | undefined {
  return config.target.type === "client-harness"
    ? snapshot.clientHarness?.client?.name
    : snapshot.server?.name;
}

function targetVersion(config: AppConfig, snapshot: TargetSnapshot): string | undefined {
  return config.target.type === "client-harness"
    ? snapshot.clientHarness?.client?.version
    : snapshot.server?.version;
}

async function runSuite(
  suite: TestSuite,
  config: AppConfig,
  snapshot: TargetSnapshot,
  target: TargetAdapter
): Promise<Finding[]> {
  return suite.run({ config, snapshot, target });
}

function summarize(findings: Finding[], failOn: Severity | "none") {
  const bySeverity = Object.fromEntries(severities.map((severity) => [severity, 0])) as Record<Severity, number>;

  for (const finding of findings) {
    bySeverity[finding.severity] += 1;
  }

  const riskScore = findings.reduce((score, finding) => score + severityWeight(finding.severity), 0);
  const failed = failOn === "none"
    ? false
    : findings.some((finding) => severityRank[finding.severity] >= severityRank[failOn]);

  return {
    total: findings.length,
    bySeverity,
    riskScore,
    failed,
    failOn
  };
}

function severityWeight(severity: Severity): number {
  return [0, 1, 3, 8, 13][severityRank[severity]] ?? 0;
}
