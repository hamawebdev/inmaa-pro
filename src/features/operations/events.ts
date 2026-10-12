import type { OnEvent } from "@/lib/events";

import { cancelFutureVisits, generateFileVisits } from "./services/programme";

/**
 * What Operations does when another owner's record changes
 * (docs/data-model/CONTRACTS.md section 4). Each handler runs inside the
 * emitter's transaction and never throws for something the user cannot fix
 * there: a file with no dates gets no visits and a warning, not a refusal.
 */
export function registerEvents(on: OnEvent) {
  // «متعاقد»: the programme row, the weekly slots from «أيام التنفيذ», then
  // every visit between the two dates (or the days of the accepted job).
  on("file.contracted", async (ex, ctx, { fileId }) => {
    await generateFileVisits(ex, ctx, fileId);
  });

  // The contract or the job ended: what was still to come is cancelled, and the
  // file's inspections stop.
  on("file.ended", async (ex, ctx, { fileId, endedDate }) => {
    await cancelFutureVisits(ex, ctx, { fileId, afterDate: endedDate, reason: "CONTRACT_ENDED" });
    await ex
      .updateTable("FileProgramme")
      .set({ inspectionIsActive: 0, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("fileId", "=", fileId)
      .where("inspectionIsActive", "=", 1)
      .execute();
  });
}
