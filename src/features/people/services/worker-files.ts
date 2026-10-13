import { can, requireCapability, requireSection } from "@/lib/access/session";
import { linkUpload, listUploads, removeUpload } from "@/lib/attachments";
import { logChange, WITHHELD } from "@/lib/log";
import { action } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";

import { WORKERS_PATH } from "./workers";
import { staffName } from "@/lib/text/names";

/**
 * The files on a worker's record (CLAUDE.md, "A file the user attaches"): her
 * photo, an ordinary image on `StaffMember.photoUrl`, and the scan of her signed
 * pages 1 and 2, restricted, on `StaffConfidential.signedFormScanUrl`. The screen
 * stores the file first (`saveManagedUpload`); these tie it to the row, and a
 * replaced or removed file is taken off with its line in the log.
 */

async function workerOf(ex: Executor, id: string) {
  const worker = await ex
    .selectFrom("StaffMember")
    .select(["id", "number", "lastName", "firstName", "photoUrl"])
    .where("id", "=", id)
    .where("kind", "=", "WORKER")
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!worker) throw new ServiceError("This worker does not exist.");
  return {
    ...worker,
    subject: { kind: "WORKER" as const, id: worker.id, label: staffName(worker) },
  };
}

/** Puts a photo on the worker's record, replaces it, or (with `url` null) takes it off. */
export async function setWorkerPhoto(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; url: string | null },
): Promise<void> {
  requireSection(ctx, "WORKERS", "WRITE");
  requireCapability(ctx, "staff.write");
  const worker = await workerOf(ex, input.id);
  if (worker.photoUrl === input.url) return;
  if (worker.photoUrl) {
    await removeUpload(ex, ctx, { url: worker.photoUrl, owner: "PEOPLE", subject: worker.subject });
  }
  if (input.url) await linkUpload(ex, ctx, input.url, worker.id);
  await ex
    .updateTable("StaffMember")
    .set({ photoUrl: input.url, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", worker.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    entity: "StaffMember",
    entityId: worker.id,
    entityLabel: `${worker.number} ${worker.subject.label}`,
    subject: worker.subject,
    changes: { photoUrl: [worker.photoUrl, input.url] },
  });
}

/**
 * Puts the scan of her signed pages 1 and 2 on her record (feature 25), or takes
 * it off. It shows her health answers and her score, so it is stored restricted
 * whatever the screen says, and only a holder of either capability files it.
 */
export async function setWorkerSignedScan(
  ex: Executor,
  ctx: ServiceContext,
  input: { id: string; url: string | null },
): Promise<void> {
  requireSection(ctx, "WORKERS", "WRITE");
  if (!can(ctx, "staff.health.read") && !can(ctx, "staff.hiringScore.read")) {
    throw new ServiceError("You do not have permission to do this.");
  }
  const worker = await workerOf(ex, input.id);
  // Which scan is on the record, from the files' own register: the restricted table is not read for that.
  const [current] = await listUploads(ex, {
    entity: "StaffConfidential",
    ownerId: worker.id,
    field: "signedFormScanUrl",
  });
  if ((current?.url ?? null) === input.url) return;
  if (current) await removeUpload(ex, ctx, { url: current.url, owner: "PEOPLE", subject: worker.subject });
  if (input.url) await linkUpload(ex, ctx, input.url, worker.id);
  await ex
    .updateTable("StaffConfidential")
    .set({ signedFormScanUrl: input.url, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("staffId", "=", worker.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "UPDATE",
    entity: "StaffConfidential",
    entityId: worker.id,
    entityLabel: `${worker.number} ${worker.subject.label}`,
    subject: worker.subject,
    changes: { signedFormScanUrl: [WITHHELD, WITHHELD] },
  });
}

// What the screens import.
export const setWorkerPhotoAction = action(setWorkerPhoto, {
  revalidate: (_data, input) => [WORKERS_PATH, `${WORKERS_PATH}/${input.id}`],
});
export const setWorkerSignedScanAction = action(setWorkerSignedScan, {
  revalidate: (_data, input) => [`${WORKERS_PATH}/${input.id}`],
});
