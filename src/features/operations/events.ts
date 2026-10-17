import type { OnEvent } from "@/lib/events";

import { openComplaintFromSignoff } from "./services/complaints";
import { closeJobIfFinished } from "./services/extra-visits";
import { cancelInspectionsAfter } from "./services/inspections";
import { cancelFutureVisits, generateFileVisits } from "./services/programme";
import { copyFileSetup, markFormChanged } from "./services/programme-changes";
import { applySiteChange, applyStaffUnavailable } from "./services/staff-changes";

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
  on("file.ended", async (ex, ctx, { fileId, endedDate, endKind }) => {
    await cancelFutureVisits(ex, ctx, { fileId, afterDate: endedDate, reason: "CONTRACT_ENDED" });
    await ex
      .updateTable("FileProgramme")
      .set({ inspectionIsActive: 0, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("fileId", "=", fileId)
      .where("inspectionIsActive", "=", 1)
      .execute();
    // Inspections already planned after the end are cancelled too: a site the centre no longer serves is not
    // inspected, nor counted as missed (INT-7, OPS-09).
    await cancelInspectionsAfter(ex, ctx, { fileId, afterDate: endedDate, endKind });
  });

  // The days, times, dates, workers or service ticks of a contracted file were
  // saved: the programme is only marked. The office runs «تحديث الزيارات
  // القادمة» itself (updateFutureVisits), after its preview.
  on("file.termsChanged", async (ex, ctx, { fileId }) => {
    await markFormChanged(ex, ctx, { fileId });
  });

  // A renewal starts with the old file's areas, tasks, slots, team and
  // inspection plan; its own «متعاقد» then makes its visits from them.
  on("file.renewed", async (ex, ctx, { fromFileId, toFileId }) => {
    await copyFileSetup(ex, ctx, { fromFileId, toFileId });
  });

  // A site's zone or office block changed: its visits still to come follow,
  // and an order already printed is marked «تغيّر بعد الطباعة».
  on("site.changed", async (ex, ctx, payload) => {
    await applySiteChange(ex, ctx, payload);
  });

  // A worker left or was sanctioned: her seats in that range are taken back and
  // the visits wait for the office again; one who left also leaves her teams.
  on("staff.unavailable", async (ex, ctx, payload) => {
    await applyStaffUnavailable(ex, ctx, payload);
  });

  // A returned order was typed in complete (Money has followed it first).
  on("visit.signedOff", async (ex, ctx, { visitId }) => {
    // «غير راضٍ» / «تحتاج إلى تصحيح»: the client complained on the order itself.
    await openComplaintFromSignoff(ex, ctx, { visitId });
    // «هل تحتاج إلى زيارة إضافية؟ نعم» writes nothing: listExtraVisitProposals
    // lists the visit until an extra visit names it.
    const visit = await ex
      .selectFrom("Visit")
      .select(["fileId", "status", "visitDate"])
      .where("id", "=", visitId)
      .executeTakeFirst();
    // The last visit of an on-demand job is done and nothing is left open (no visit, complaint or extra visit
    // asked for): the job ends here, in this transaction (RULINGS-NEEDED 15).
    if (visit?.status === "DONE") await closeJobIfFinished(ex, ctx, visit.fileId);
  });
}
