import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Report } from "../core/types.js";

export async function writeJsonReport(report: Report, outputPath: string): Promise<void> {
  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
