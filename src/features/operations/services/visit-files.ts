import { requireCapability, requireSection } from "@/lib/access/session";
import { linkUpload, listUploads, removeUpload } from "@/lib/attachments";
import { logChange, logCollect } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { staffName } from "@/lib/text/names";

import { VISITS_PATH } from "./paths";

/**
 * What is attached to a visit: the photos the supervisor took at the site
 * (#13; only with the client's agreement to photos there, article 8 of his
 * worker form), and the scans of the returned order and of the sign-off slip
 * when it is scanned apart (#15). The files are saved by the screen first
 * (`saveManagedUpload`), then tied here to their row.
 */

export const VISIT_SCAN_FIELDS = ["orderScanUrl", "signoffScanUrl"] as const;
export type VisitScanField = (typeof VISIT_SCAN_FIELDS)[number];

export interface VisitFiles {
  siteId: string;
  /** The client agreed to photos at this site. */
  photoConsent: boolean;
  /** The centre employee whose photos these are: the visit's supervisor. */
  supervisor: { id: string; name: string } | null;
  photos: Array<{ url: string; caption: string | null }>;
  /** The returned order is typed in (its scans hang on its report). */
  reportId: string | null;
  orderScanUrl: string | null;
  signoffScanUrl: string | null;
}

async function visitOf(ex: Executor, visitId: string) {
  const visit = await ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .leftJoin("StaffMember as Supervisor", "Supervisor.id", "Visit.supervisorEmployeeId")
    .leftJoin("VisitReport", "VisitReport.visitId", "Visit.id")
    .select([
      "Visit.id",
      "Visit.number",
      "Site.id as siteId",
      "Site.photoConsent",
      "Client.id as clientId",
      "Client.name as clientName",
      "Supervisor.id as supervisorId",
      "Supervisor.firstName as supervisorFirstName",
      "Supervisor.lastName as supervisorLastName",
      "VisitReport.id as reportId",
      "VisitReport.orderScanUrl",
      "VisitReport.signoffScanUrl",
    ])
    .where("Visit.id", "=", visitId)
    .executeTakeFirst();
  if (!visit) throw new ServiceError("This visit does not exist.");
  return visit;
}

export async function getVisitFiles(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<VisitFiles> {
  requireSection(ctx, "REQUESTS", "READ");
  const visit = await visitOf(ex, input.visitId);
  const photos = await listUploads(ex, { entity: "Visit", ownerId: visit.id, field: "photos" });
  return {
    siteId: visit.siteId,
    photoConsent: visit.photoConsent === 1,
    supervisor: visit.supervisorId
      ? {
          id: visit.supervisorId,
          name: staffName({ firstName: visit.supervisorFirstName ?? "", lastName: visit.supervisorLastName ?? "" }),
        }
      : null,
    photos: photos.map((photo) => ({ url: photo.url, caption: photo.caption })),
    reportId: visit.reportId,
    orderScanUrl: visit.orderScanUrl,
    signoffScanUrl: visit.signoffScanUrl,
  };
}

/**
 * A photo of the visit, taken by its supervisor (a centre employee, never a
 * worker) and saved by the screen with the site and the supervisor, is tied to
 * the visit. Refused without the client's agreement to photos at the site.
 */
export async function addVisitPhoto(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string; url: string },
): Promise<{ visitId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const visit = await visitOf(ex, input.visitId);
  if (visit.photoConsent !== 1) throw new ServiceError("The client has not agreed to photos at this site.");
  if (!visit.supervisorId) throw new ServiceError("This visit has no supervisor to take its photos.");
  const taken = await ex
    .selectFrom("Upload")
    .select("takenByEmployeeId")
    .where("url", "=", input.url)
    .executeTakeFirst();
  if (taken && taken.takenByEmployeeId !== visit.supervisorId) {
    throw new ServiceError("A photo of a visit is taken by its supervisor.");
  }
  await linkUpload(ex, ctx, input.url, visit.id);
  await logCollect(ex, ctx, {
    owner: "OPERATIONS",
    action: "CREATE",
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    subject: { kind: "CLIENT", id: visit.clientId, label: visit.clientName },
    context: { photo: input.url },
  });
  return { visitId: visit.id };
}

/** The scan of the returned order, or of the sign-off slip, attached to the typed order (or taken off it). */
export async function setVisitScan(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string; field: VisitScanField; url: string | null },
): Promise<{ visitId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  requireCapability(ctx, "visit.enterOrder");
  if (!(VISIT_SCAN_FIELDS as readonly string[]).includes(input.field)) {
    throw new Error(`operations: ${input.field} is not a scan of a visit`);
  }
  const visit = await visitOf(ex, input.visitId);
  if (!visit.reportId) throw new ServiceError("Type the returned order in before attaching its scan.");
  const before = visit[input.field];
  if (before === input.url) return { visitId: visit.id };
  if (before) {
    await removeUpload(ex, ctx, {
      url: before,
      owner: "OPERATIONS",
      subject: { kind: "CLIENT", id: visit.clientId, label: visit.clientName },
    });
  }
  if (input.url) await linkUpload(ex, ctx, input.url, visit.reportId);
  await ex
    .updateTable("VisitReport")
    .set({ [input.field]: input.url, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", visit.reportId)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "UPDATE",
    entity: "VisitReport",
    entityId: visit.reportId,
    entityLabel: visit.number,
    subject: { kind: "CLIENT", id: visit.clientId, label: visit.clientName },
    changes: { [input.field]: [before, input.url] },
  });
  return { visitId: visit.id };
}

export const getVisitFilesQuery = query(getVisitFiles);
export const addVisitPhotoAction = action(addVisitPhoto, { revalidate: [VISITS_PATH] });
export const setVisitScanAction = action(setVisitScan, { revalidate: [VISITS_PATH] });
