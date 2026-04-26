import type { AppConfig, TargetAdapter } from "../core/types.js";
import { ManifestTarget } from "./manifestTarget.js";
import { StdioMcpTarget } from "./stdioMcpTarget.js";

export function createTarget(config: AppConfig): TargetAdapter {
  if (config.target.type === "manifest") {
    return new ManifestTarget(config.target);
  }

  return new StdioMcpTarget(config.target);
}
