import type { RegisterSeed } from "@/lib/seeds";

import { ensureInspectionCriteria } from "./services/inspections";

/**
 * Operations' rows a real installation starts with (BUILD-NOTES "Owner seeds"):
 * the 30 points of a supervisor's inspection, seven for homes and
 * organisations, eight for buildings and complexes, in his words. Fixed ids;
 * only what is missing is inserted, and a point the manager edited or switched
 * off is left as he left it.
 */
export function registerSeeds(seed: RegisterSeed) {
  seed("the 30 inspection criteria", async (ex, ctx) => {
    await ensureInspectionCriteria(ex, ctx);
  });
}
