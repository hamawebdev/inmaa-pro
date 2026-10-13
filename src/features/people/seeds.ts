import type { Executor, ServiceContext } from "@/lib/service/context";

import { TRAINING_MODULES } from "./validators/staff-codes";

/**
 * People's owner seeds (BUILD-NOTES, "Owner seeds"): his eight training days
 * (D1) as rows of `TrainingModule`. Fixed ids, only what is missing is
 * written, and a row the office edited is never overwritten.
 *
 * Not registered yet: the coordinator's ruling waits for Foundation's seed
 * registry (`src/lib/seeds`), which first run and the day-start job will call.
 * Until then the demo data and the tests call `seedTrainingModules` themselves;
 * no read and no screen writes these rows.
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

/** The shape Foundation's registry is expected to call: `seed(name, step)`. */
export function registerSeeds(
  seed: (name: string, step: (ex: Executor, ctx: ServiceContext) => Promise<unknown>) => void,
) {
  seed("his eight training days", seedTrainingModules);
}
