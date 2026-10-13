import type { Selectable } from "kysely";

import { listEmployees } from "@/features/people/services/employees";
import { requireSection } from "@/lib/access/session";
import { linkUpload, listUploads } from "@/lib/attachments";
import { newId } from "@/lib/db/rows";
import type { DB } from "@/lib/db/schema";
import { logChange, logCollect, logDisclose, logErase } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { minutes, qty, type LocalDate, type LocalTime } from "@/lib/units";
import { FILES_PATH } from "@/navigation/file-parts";

import type { Division } from "../validators/option-lists";
import {
  CONDITION_FACTORS,
  FIRST_VISIT_RECOMMENDATIONS,
  FIRST_VISIT_RESULTS,
  firstVisitSchema,
  type FirstVisitInput,
  type SpaceInput,
} from "../validators/first-visit";

import { clientSubjectOf, partHeaderOf, requireFileRecord, requireOpenFile, type FilePartHeader } from "./file-part";
import { sheetValuesOf, type FileRecord } from "./file-records";
import { moveFileStage } from "./files";

/**
 * «الزيارة الأولية» (plan feature 3): the inspection before the price. An
 * office form: planned here, printed for the supervisor who goes, typed in
 * when he is back. Its done day is the form's «تاريخ الزيارة», and its
 * estimate is what the cost study and Money's profitability start from.
 */

type FirstVisitRow = Selectable<DB["FirstVisit"]>;

export interface FirstVisitPhoto {
  url: string;
  caption: string | null;
}

export interface FirstVisitView {
  id: string;
  visit: FirstVisitInput;
  sheetScanUrl: string | null;
  photos: FirstVisitPhoto[];
}

export interface FirstVisitsView {
  file: FilePartHeader;
  /** The newest first. */
  visits: FirstVisitView[];
  /** The centre's employees who may go and look. */
  inspectors: { id: string; name: string }[];
  /** Whether the client agreed to photos at this site (article 8 of the worker form). */
  photoConsent: boolean;
  /** The form's «تاريخ الزيارة», which a new visit starts from. */
  formVisitDate: string | null;
}

const codes = <T extends string>(text: string | null, allowed: readonly T[]): T[] =>
  text ? (JSON.parse(text) as string[]).filter((code): code is T => (allowed as readonly string[]).includes(code)) : [];

function inputOf(row: FirstVisitRow): FirstVisitInput {
  return {
    plannedDate: row.plannedDate,
    plannedTime: row.plannedTime,
    doneDate: row.doneDate,
    startTime: row.startTime,
    endTime: row.endTime,
    inspectorEmployeeId: row.inspectorEmployeeId,
    clientRepresentative: row.clientRepresentative,
    firstResult: codes(row.firstResult, FIRST_VISIT_RESULTS),
    conditionFactors: codes(row.conditionFactors, CONDITION_FACTORS),
    spaces: row.spaces ? (JSON.parse(row.spaces) as SpaceInput[]) : [],
    estimatedWorkers: row.estimatedWorkers,
    perVisitMin: row.perVisitMin,
    daysNeeded: row.daysNeeded,
    weeklyMin: row.weeklyMin,
    monthlyMin: row.monthlyMin,
    distanceKm: row.distanceKm,
    travelMin: row.travelMin,
    transportMeans: row.transportMeans as FirstVisitInput["transportMeans"],
    accessDifficulty: row.accessDifficulty,
    materialsAndEquipmentNeeds: row.materialsAndEquipmentNeeds,
    excludedServices: row.excludedServices,
    recommendation: codes(row.recommendation, FIRST_VISIT_RECOMMENDATIONS),
    recommendationReason: row.recommendationReason,
    note: row.note,
    needsSecondVisit: row.needsSecondVisit === 1,
  };
}

const staffName = (row: { lastName: string; firstName: string }) => `${row.lastName} ${row.firstName}`.trim();

async function requireFirstVisit(ex: Executor, id: string): Promise<{ row: FirstVisitRow; record: FileRecord }> {
  const row = await ex.selectFrom("FirstVisit").selectAll().where("id", "=", id).executeTakeFirst();
  if (!row || row.deletedAt !== null) throw new ServiceError("This first visit does not exist.");
  return { row, record: await requireFileRecord(ex, row.fileId) };
}

/** The first visits of a file, with whom to send and whether photos may be taken there. */
export async function getFirstVisits(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<FirstVisitsView> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireFileRecord(ex, input.fileId);
  const rows = await ex
    .selectFrom("FirstVisit")
    .selectAll()
    .where("fileId", "=", record.file.id)
    .where("deletedAt", "is", null)
    .orderBy("createdAt", "desc")
    .execute();
  const visits: FirstVisitView[] = [];
  for (const row of rows) {
    const photos = await listUploads(ex, { entity: "FirstVisit", ownerId: row.id, field: "photos" });
    visits.push({
      id: row.id,
      visit: inputOf(row),
      sheetScanUrl: row.sheetScanUrl,
      photos: photos.map((photo) => ({ url: photo.url, caption: photo.caption })),
    });
  }
  const employees = await listEmployees(ex, ctx, { activeOnly: true });
  return {
    file: partHeaderOf(record),
    visits,
    inspectors: employees.map((employee) => ({ id: employee.id, name: staffName(employee) })),
    photoConsent: record.site.photoConsent === 1,
    formVisitDate: record.file.firstVisitDate,
  };
}

function columnsOf(visit: FirstVisitInput) {
  const json = (list: readonly unknown[]) => JSON.stringify(list);
  const mins = (value: number | null) => (value === null ? null : minutes(value));
  return {
    plannedDate: visit.plannedDate as LocalDate | null,
    plannedTime: visit.plannedTime as LocalTime | null,
    doneDate: visit.doneDate as LocalDate | null,
    startTime: visit.startTime as LocalTime | null,
    endTime: visit.endTime as LocalTime | null,
    inspectorEmployeeId: visit.inspectorEmployeeId,
    clientRepresentative: visit.clientRepresentative,
    firstResult: json(visit.firstResult),
    conditionFactors: json(visit.conditionFactors),
    spaces: json(visit.spaces),
    estimatedWorkers: visit.estimatedWorkers,
    perVisitMin: mins(visit.perVisitMin),
    daysNeeded: visit.daysNeeded === null ? null : qty(visit.daysNeeded),
    weeklyMin: mins(visit.weeklyMin),
    monthlyMin: mins(visit.monthlyMin),
    distanceKm: visit.distanceKm === null ? null : qty(visit.distanceKm),
    travelMin: mins(visit.travelMin),
    transportMeans: visit.transportMeans,
    accessDifficulty: visit.accessDifficulty,
    materialsAndEquipmentNeeds: visit.materialsAndEquipmentNeeds,
    excludedServices: visit.excludedServices,
    recommendation: json(visit.recommendation),
    recommendationReason: visit.recommendationReason,
    note: visit.note,
    needsSecondVisit: visit.needsSecondVisit ? 1 : 0,
  };
}

/**
 * Plans a first visit, or saves what was typed from the sheet the supervisor
 * brought back. The first one moves a new file to «الزيارة»; a done day is
 * written on the form as «تاريخ الزيارة» while the file is not signed.
 */
export async function saveFirstVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; firstVisitId?: string | null; visit: FirstVisitInput },
): Promise<{ firstVisitId: string; changed: boolean }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const parsed = firstVisitSchema.safeParse(input.visit);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  const visit = parsed.data;
  if (!visit.plannedDate && !visit.doneDate) {
    throw new ServiceError("Give the day the visit is planned for, or the day it took place.");
  }
  if (visit.doneDate && visit.doneDate > ctx.today)
    throw new ServiceError("A visit cannot have taken place after today.");
  if (visit.startTime && visit.endTime && visit.endTime <= visit.startTime) {
    throw new ServiceError("The visit must end after it starts.");
  }
  if (visit.inspectorEmployeeId) {
    const inspector = await ex
      .selectFrom("StaffMember")
      .select("id")
      .where("id", "=", visit.inspectorEmployeeId)
      .where("kind", "=", "EMPLOYEE")
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!inspector) throw new ServiceError("Choose an employee of the centre.");
  }

  const existing = input.firstVisitId ? await requireFirstVisit(ex, input.firstVisitId) : null;
  if (existing && existing.row.fileId !== input.fileId) throw new Error("clients: a first visit of another file");
  const record = existing?.record ?? (await requireFileRecord(ex, input.fileId));
  requireOpenFile(record);
  const log = {
    owner: "CLIENTS",
    entity: "FirstVisit",
    entityLabel: record.file.number,
    subject: clientSubjectOf(record),
  } as const;

  const columns = columnsOf(visit);
  let firstVisitId: string;
  let changed = true;
  if (existing) {
    firstVisitId = existing.row.id;
    const { set, changes } = changedColumns(existing.row, columns);
    if (changes) {
      await ex
        .updateTable("FirstVisit")
        .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", firstVisitId)
        .execute();
      await logChange(ex, ctx, { ...log, action: "UPDATE", entityId: firstVisitId, changes });
    } else {
      changed = false;
    }
  } else {
    firstVisitId = newId();
    await ex
      .insertInto("FirstVisit")
      .values({
        id: firstVisitId,
        fileId: record.file.id,
        ...columns,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    await logCollect(ex, ctx, { ...log, action: "CREATE", entityId: firstVisitId });
    if (record.file.stage === "NEW") await moveFileStage(ex, ctx, { fileId: record.file.id, to: "VISIT" });
  }

  // «تاريخ الزيارة» on his form is the day the visit took place, while the sheet can still change.
  if (visit.doneDate && record.file.lockedAt === null && record.file.firstVisitDate !== visit.doneDate) {
    await ex
      .updateTable("File")
      .set({ firstVisitDate: visit.doneDate as LocalDate, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", record.file.id)
      .execute();
    await logChange(ex, ctx, {
      owner: "CLIENTS",
      action: "UPDATE",
      entity: "File",
      entityId: record.file.id,
      entityLabel: record.file.number,
      subject: clientSubjectOf(record),
      changes: { firstVisitDate: [record.file.firstVisitDate, visit.doneDate] },
      context: { firstVisitId },
    });
  }
  return { firstVisitId, changed };
}

/** A planned visit that will not take place, or one typed in by mistake, is taken off with its reason. */
export async function removeFirstVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: { firstVisitId: string; reason: string },
): Promise<{ fileId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const { row, record } = await requireFirstVisit(ex, input.firstVisitId);
  requireOpenFile(record);
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  await ex
    .updateTable("FirstVisit")
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", row.id)
    .execute();
  await logErase(ex, ctx, {
    owner: "CLIENTS",
    action: "SOFT_DELETE",
    reason,
    entity: "FirstVisit",
    entityId: row.id,
    entityLabel: record.file.number,
    subject: clientSubjectOf(record),
  });
  return { fileId: record.file.id };
}

/**
 * A photo the supervisor took at the site, saved by the screen beforehand
 * (`saveManagedUpload` with the site and the inspector, which refuses without
 * the client's agreement), tied here to its visit.
 */
export async function addFirstVisitPhoto(
  ex: Executor,
  ctx: ServiceContext,
  input: { firstVisitId: string; url: string },
): Promise<{ firstVisitId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const { row, record } = await requireFirstVisit(ex, input.firstVisitId);
  requireOpenFile(record);
  if (record.site.photoConsent !== 1) throw new ServiceError("The client has not agreed to photos at this site.");
  await linkUpload(ex, ctx, input.url, row.id);
  await logCollect(ex, ctx, {
    owner: "CLIENTS",
    action: "CREATE",
    entity: "FirstVisit",
    entityId: row.id,
    entityLabel: record.file.number,
    subject: clientSubjectOf(record),
    context: { photo: input.url },
  });
  return { firstVisitId: row.id };
}

export interface InspectionSheetData {
  fileNumber: string;
  division: Division;
  clientName: string;
  phone: string | null;
  address: string | null;
  commune: string | null;
  siteName: string | null;
  inspectorName: string | null;
  visit: FirstVisitInput;
}

/** What the inspection sheet prints: the visit as typed so far, and blank lines for the rest. */
export async function getInspectionSheet(
  ex: Executor,
  ctx: ServiceContext,
  input: { firstVisitId: string },
): Promise<InspectionSheetData> {
  requireSection(ctx, "REQUESTS", "READ");
  const { row, record } = await requireFirstVisit(ex, input.firstVisitId);
  const values = sheetValuesOf(record);
  const textOf = (value: unknown) => (typeof value === "string" && value.trim() !== "" ? value.trim() : null);
  const inspector = row.inspectorEmployeeId
    ? await ex
        .selectFrom("StaffMember")
        .select(["lastName", "firstName"])
        .where("id", "=", row.inspectorEmployeeId)
        .executeTakeFirst()
    : undefined;
  return {
    fileNumber: record.file.number,
    division: record.file.division as Division,
    clientName: textOf(values.clientName) ?? record.client.name,
    phone: textOf(values.phone),
    address: record.site.address,
    commune: record.commune?.nameAr ?? null,
    siteName: record.site.commonName,
    inspectorName: inspector ? staffName(inspector) : null,
    visit: inputOf(row),
  };
}

/** The inspection sheet going to paper names the client: a disclosure. */
export async function recordInspectionPrint(
  ex: Executor,
  ctx: ServiceContext,
  input: { firstVisitId: string },
): Promise<void> {
  requireSection(ctx, "REQUESTS", "READ");
  const { row, record } = await requireFirstVisit(ex, input.firstVisitId);
  await logDisclose(ex, ctx, {
    owner: "CLIENTS",
    action: "PRINT",
    disclosure: "PRINT",
    entity: "FirstVisit",
    entityId: row.id,
    entityLabel: record.file.number,
    subject: clientSubjectOf(record),
    context: { sheet: "INSPECTION" },
  });
}

const REFRESH = { revalidate: [FILES_PATH, "/dashboard/home"] };

export const getFirstVisitsQuery = query(getFirstVisits);
export const getInspectionSheetQuery = query(getInspectionSheet);
export const saveFirstVisitAction = action(saveFirstVisit, REFRESH);
export const removeFirstVisitAction = action(removeFirstVisit, REFRESH);
export const addFirstVisitPhotoAction = action(addFirstVisitPhoto, REFRESH);
export const recordInspectionPrintAction = action(recordInspectionPrint);
