import type { RegisterSeed } from "@/lib/seeds";
import type { Executor, ServiceContext } from "@/lib/service/context";

import { TRAINING_MODULES } from "./validators/staff-codes";

/**
 * People's owner seeds (BUILD-NOTES, "Owner seeds"): his eight training days
 * (D1) as rows of `TrainingModule`. Fixed ids, only what is missing is
 * written, and a row the office edited is never overwritten.
 *
 * Foundation's registry (`src/lib/seeds`) runs it in first run and again at
 * each day start, so an older database catches up; the test database has them.
 */
export async function seedTrainingModules(ex: Executor, ctx: ServiceContext): Promise<number> {
  const present = new Set((await ex.selectFrom("TrainingModule").select("code").execute()).map((row) => row.code));
  let added = 0;
  for (const [index, module] of TRAINING_MODULES.entries()) {
    if (present.has(module.code)) continue;
    await ex
      .insertInto("TrainingModule")
      .values({
        id: `training-module-${module.code.toLowerCase().replace(/_/g, "-")}`,
        code: module.code,
        sortOrder: index + 1,
        titleAr: module.titleAr,
        isRequired: 1,
        isActive: 1,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .execute();
    added += 1;
  }
  return added;
}

export function registerSeeds(seed: RegisterSeed) {
  seed("the eight training modules", async (ex, ctx) => {
    await seedTrainingModules(ex, ctx);
  });
}
