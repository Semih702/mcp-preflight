import type { TestSuite } from "../core/types.js";
import { clientHarnessSuite } from "./clientHarnessSuite.js";
import { implementationSuite } from "./implementationSuite.js";
import { manifestSuite } from "./manifestSuite.js";
import { promptInjectionSuite } from "./promptInjectionSuite.js";
import { toolCombinationSuite } from "./toolCombinationSuite.js";

export const allSuites: TestSuite[] = [
  manifestSuite,
  promptInjectionSuite,
  toolCombinationSuite,
  implementationSuite,
  clientHarnessSuite
];
