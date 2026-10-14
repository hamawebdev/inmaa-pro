import { getSanctionStates } from "@/features/people/services/sanctions";
import { can, requireCapability, requireSection } from "@/lib/access/session";
import { logConsult, logDisclose } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { normaliseName } from "@/lib/text/normalise";
import { FILES_PATH } from "@/navigation/file-parts";

import { FORM_DEFINITIONS } from "../forms/definitions";
import { residentLinesOf, type FileRow, type ResidentRow } from "../forms/stored-values";
import type { FormValues, ResidentLine } from "../forms/values";
import { nextStages, openMoves, stageMove, type MissingField, type StageRefusal } from "../rules/stage-moves";
import { missingIdentifiersOf, type MissingIdentifier } from "../rules/client-identifiers";
import { statusTicks } from "../rules/status-ticks";
import type { FileOfficeInput, SiteOfficeInput } from "../validators/file-values";
import { SITE_OFFICE_FLAGS, SITE_OFFICE_SETS } from "../validators/file-values";
import {
  type ClientSanction,
  type Division,
  type FileStatusTick,
  type FileStage,
  type FormKind,
  type ServiceType,
} from "../validators/option-lists";

import { stageFactsOf } from "./files";
import { asFormKind, loadFileRecord, sheetValuesOf, type FileRecord } from "./file-records";

/**
 * Reading files: the list, the hub, the form, the printed sheet.
 *
 * A list is not logged. Opening a file's pages is a consultation of a client's
 * data: logged once per user, file and day (`recordFileOpened`). The residents
 * of a building are third-party data: every reading is logged and needs
 * `residents.read`; every print of a sheet is a disclosure (DESIGN.md
 * section 9).
 */

// ── The list ─────────────────────────────────────────────────────────────────

export interface FileListFilter {
  division?: Division;
  serviceType?: ServiceType;
  /** A file closed without a stage of its own (a refused quote) is "CLOSED". */
  stage?: FileStage | "CLOSED";
  search?: string;
  /** Exactly these files, whatever the other filters say (Money's contract-ending tile). */
  ids?: readonly string[];
}

export interface FileListRow {
  id: string;
  number: string;
  kind: FormKind;
  division: Division;
  serviceType: ServiceType;
  stage: FileStage;
  closed: boolean;
  closeReason: string | null;
  isReturning: boolean;
  registrationDate: string;
  clientId: string;
  clientNumber: string;
  clientName: string;
  phone: string;
  siteName: string;
  communeName: string | null;
  startDate: string | null;
  endDate: string | null;
  totalAmount: number | null;
}

/** The files, newest first. Search finds a name, a common name, a number or a phone. */
export async function listFiles(
  ex: Executor,
  ctx: ServiceContext,
  filter: FileListFilter = {},
): Promise<FileListRow[]> {
  requireSection(ctx, "REQUESTS", "READ");
  let rows = ex
    .selectFrom("File as f")
    .innerJoin("Client as c", "c.id", "f.clientId")
    .innerJoin("Site as s", "s.id", "f.siteId")
    .leftJoin("Commune as m", "m.id", "s.communeId")
    .select([
      "f.id",
      "f.number",
      "f.formKind",
      "f.division",
      "f.serviceType",
      "f.stage",
      "f.closedAt",
      "f.closeReason",
      "f.isReturning",
      "f.registrationDate",
      "f.startDate",
      "f.endDate",
      "f.totalAmount",
      "c.id as clientId",
      "c.number as clientNumber",
      "c.name as clientName",
      "c.phone1 as phone",
      "s.commonName",
      "s.address",
      "m.nameAr as communeName",
    ])
    .where("f.deletedAt", "is", null);

  if (filter.ids) {
    if (filter.ids.length === 0) return [];
    rows = rows.where("f.id", "in", [...filter.ids]);
  } else {
    if (filter.division) rows = rows.where("f.division", "=", filter.division);
    if (filter.serviceType) rows = rows.where("f.serviceType", "=", filter.serviceType);
    if (filter.stage === "CLOSED") rows = rows.where("f.closedAt", "is not", null);
    else if (filter.stage) rows = rows.where("f.stage", "=", filter.stage).where("f.closedAt", "is", null);
  }

  const search = filter.search?.trim() ?? "";
  if (search) {
    const key = normaliseName(search).replace(/[%_]/g, "");
    const digits = search.replace(/\D/g, "");
    rows = rows.where((eb) => {
      const any = [
        eb("c.nameKey", "like", `%${key}%`),
        eb("c.managerNameKey", "like", `%${key}%`),
        eb("s.commonNameKey", "like", `%${key}%`),
        eb("f.number", "like", `${search.replace(/[%_]/g, "")}%`),
        eb("c.number", "=", search),
      ];
      if (digits.length >= 4) any.push(eb("c.phoneKeys", "like", `%${digits}%`));
      return eb.or(any);
    });
  }

  const found = await rows.orderBy("f.registrationDate", "desc").orderBy("f.createdAt", "desc").execute();
  return found.map((row) => ({
    id: row.id,
    number: row.number,
    kind: asFormKind(row.formKind),
    division: row.division as Division,
    serviceType: row.serviceType as ServiceType,
    stage: row.stage as FileStage,
    closed: row.closedAt !== null,
    closeReason: row.closeReason,
    isReturning: row.isReturning === 1,
    registrationDate: row.registrationDate,
    clientId: row.clientId,
    clientNumber: row.clientNumber,
    clientName: row.clientName,
    phone: row.phone,
    siteName: row.commonName ?? row.address,
    communeName: row.communeName ?? null,
    startDate: row.startDate,
    endDate: row.endDate,
    totalAmount: row.totalAmount,
  }));
}

// ── Opening a file ───────────────────────────────────────────────────────────

async function requireRecord(ex: Executor, fileId: string): Promise<FileRecord> {
  const record = await loadFileRecord(ex, fileId);
  if (!record) throw new ServiceError("This file does not exist.");
  return record;
}

/**
 * Logs that the user opened a client's file, once per user, file and day
 * (DESIGN.md section 9). The hub and the file's pages call it when they open.
 */
export async function recordFileOpened(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<{ logged: boolean }> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireRecord(ex, input.fileId);
  let already = ex
    .selectFrom("AuditLog")
    .select("id")
    .where("operation", "=", "CONSULT")
    .where("entity", "=", "File")
    .where("entityId", "=", record.file.id)
    .where("localDate", "=", ctx.today);
  already = ctx.userId === null ? already.where("userId", "is", null) : already.where("userId", "=", ctx.userId);
  if (await already.executeTakeFirst()) return { logged: false };
  await logConsult(ex, ctx, {
    owner: "CLIENTS",
    action: "VIEW",
    entity: "File",
    entityId: record.file.id,
    entityLabel: record.file.number,
    subject: { kind: "CLIENT", id: record.client.id, label: record.client.name },
  });
  return { logged: true };
}

export interface StageHistoryLine {
  fromStage: FileStage | null;
  toStage: FileStage;
  changedAt: string;
  /** The centre's day and time of the change. */
  localDate: string;
  localTime: string;
  byName: string | null;
  note: string | null;
}

export interface StageOption {
  to: FileStage;
  allowed: boolean;
  refusal: StageRefusal | null;
  missing: MissingField[];
}

export interface FileHub {
  id: string;
  number: string;
  kind: FormKind;
  division: Division;
  serviceType: ServiceType;
  stage: FileStage;
  stageChangedAt: string;
  /** The centre's day the stage was reached. */
  stageChangedOn: string;
  closed: boolean;
  closeReason: string | null;
  isReturning: boolean;
  missingIdentifiers: MissingIdentifier[];
  locked: boolean;
  registrationDate: string;
  contractedAt: string | null;
  endedDate: string | null;
  endKind: string | null;
  client: {
    id: string;
    number: string;
    name: string;
    managerName: string | null;
    capacity: string | null;
    phone: string;
  };
  site: {
    id: string;
    siteNumber: string | null;
    name: string | null;
    address: string;
    communeName: string | null;
    wilayaCode: string | null;
    zoneName: string | null;
  };
  terms: {
    contractKind: string | null;
    contractDuration: string | null;
    requestKinds: string[];
    visitsPerWeek: number | null;
    executionDays: string[];
    startDate: string | null;
    endDate: string | null;
    arrivalTime: string | null;
    departureTime: string | null;
    workersCount: number | null;
    totalAmount: number | null;
    amountBasis: string | null;
    paymentFrequency: string | null;
    firstDueDate: string | null;
  };
  office: { source: string | null; priority: string | null };
  /** Forward stages the office would take next, each with whether it is open now and why not. */
  nextStages: StageOption[];
  /** Earlier stages the user may take the file back to (the manager, before «متعاقد»). */
  backStages: FileStage[];
  history: StageHistoryLine[];
}

const parseCodes = (text: string | null): string[] => (text ? (JSON.parse(text) as string[]) : []);

/** What the file's hub shows: who, where, the terms, the stage with what it can do next, and its history. */
export async function getFileHub(ex: Executor, ctx: ServiceContext, input: { fileId: string }): Promise<FileHub> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireRecord(ex, input.fileId);
  const { file, client, site, commune } = record;
  const values = sheetValuesOf(record);

  const [zone, events, facts] = await Promise.all([
    site.zoneId
      ? ex.selectFrom("Zone").select("name").where("id", "=", site.zoneId).executeTakeFirst()
      : Promise.resolve(undefined),
    ex
      .selectFrom("FileStageEvent as e")
      .leftJoin("User as u", "u.id", "e.changedByUserId")
      .select(["e.fromStage", "e.toStage", "e.changedAt", "e.note", "u.displayName"])
      .where("e.fileId", "=", file.id)
      .orderBy("e.changedAt", "desc")
      .orderBy("e.createdAt", "desc")
      .execute(),
    stageFactsOf(ex, ctx, record),
  ]);

  const options = nextStages(facts.stage).map((to): StageOption => {
    const move = stageMove(facts, to);
    return move.allowed
      ? { to, allowed: true, refusal: null, missing: [] }
      : { to, allowed: false, refusal: move.refusal, missing: move.missing };
  });
  const open = openMoves(facts);

  return {
    id: file.id,
    number: file.number,
    kind: record.kind,
    division: file.division as Division,
    serviceType: file.serviceType as ServiceType,
    stage: file.stage as FileStage,
    stageChangedAt: file.stageChangedAt,
    stageChangedOn: ctx.toLocal(file.stageChangedAt).date,
    closed: file.closedAt !== null,
    closeReason: file.closeReason,
    isReturning: file.isReturning === 1,
    /** What an organisation's first invoice still lacks on the client's card (Money refuses without the RC). */
    missingIdentifiers: missingIdentifiersOf(client),
    locked: file.lockedAt !== null,
    registrationDate: file.registrationDate,
    contractedAt: file.contractedAt,
    endedDate: file.endedDate,
    endKind: file.endKind,
    client: {
      id: client.id,
      number: values.dossierNumber ?? client.number,
      name: values.clientName ?? client.name,
      managerName: values.managerName ?? null,
      capacity: values.capacity ?? null,
      phone: values.phone ?? client.phone1,
    },
    site: {
      id: site.id,
      siteNumber: values.siteNumber ?? null,
      name: values.commonName ?? null,
      address: values.address ?? site.address,
      communeName: values.commune ?? commune?.nameAr ?? null,
      wilayaCode: values.wilaya ?? commune?.wilayaCode ?? null,
      zoneName: zone?.name ?? null,
    },
    terms: {
      contractKind: file.contractKind,
      contractDuration: file.contractDuration,
      requestKinds: parseCodes(file.requestKinds),
      visitsPerWeek: file.visitsPerWeek,
      executionDays: parseCodes(file.executionDays),
      startDate: file.startDate,
      endDate: file.endDate,
      arrivalTime: file.arrivalTime,
      departureTime: file.departureTime,
      workersCount: file.workersCount,
      totalAmount: file.totalAmount,
      amountBasis: file.amountBasis,
      paymentFrequency: file.paymentFrequency,
      firstDueDate: file.firstDueDate,
    },
    office: { source: file.source, priority: file.priority },
    nextStages: options,
    backStages: open.filter((to) => !options.some((option) => option.to === to)),
    history: events.map((event) => {
      const local = ctx.toLocal(event.changedAt);
      return {
        fromStage: (event.fromStage as FileStage | null) ?? null,
        toStage: event.toStage as FileStage,
        changedAt: event.changedAt,
        localDate: local.date,
        localTime: local.time,
        byName: event.displayName ?? null,
        note: event.note,
      };
    }),
  };
}

// ── The form ─────────────────────────────────────────────────────────────────

export interface FileForm {
  id: string;
  number: string;
  kind: FormKind;
  stage: FileStage;
  locked: boolean;
  closed: boolean;
  /** The sheet as it is: what was signed, once the file is «متعاقد». */
  values: FormValues;
  office: Required<FileOfficeInput>;
  siteOffice: SiteOfficeInput;
  /** Whether the form shows «قائمة القاطنين بالعمارة», and whether this user may read it. */
  residents: "NONE" | "ALLOWED" | "RESTRICTED";
  /** Whether this user may change the sheet of a signed file. */
  canEditLocked: boolean;
  /** «حالة الملف» as the program ticks it today. */
  statusTicks: FileStatusTick[];
}

/** The office block of a site as the form shows it: sets as lists, rules as yes or no. */
export function siteOfficeOf(site: FileRecord["site"]): SiteOfficeInput {
  const office: Record<string, unknown> = {};
  const columns = [
    "district",
    "landmark",
    "directions",
    "mapLink",
    "floorAndDoor",
    "buildingsCount",
    "keyCount",
    "keyReceivedDate",
    "keyHolderName",
    "allowedFrom",
    "allowedTo",
    "forbiddenAreas",
    "doNotTouch",
    "valuables",
    "specialInstructions",
    "securityInstructionsText",
    "meetingPoint",
    "receiverName",
    "receiverRole",
    "receiverPhone",
    "note",
  ] as const;
  for (const column of columns) office[column] = site[column];
  for (const column of SITE_OFFICE_SETS) office[column] = parseCodes(site[column]);
  for (const column of SITE_OFFICE_FLAGS) office[column] = site[column] === 1;
  return office as SiteOfficeInput;
}

function fileOfficeOf(file: FileRow): Required<FileOfficeInput> {
  return {
    source: file.source as Required<FileOfficeInput>["source"],
    priority: file.priority as Required<FileOfficeInput>["priority"],
    officeNotes: file.officeNotes,
    amountBasis: file.amountBasis as Required<FileOfficeInput>["amountBasis"],
    expensesIncluded: file.expensesIncluded === 1,
  };
}

/** The file's form as the screen shows it: his sheet's answers, then the office-only blocks. */
export async function getFileForm(ex: Executor, ctx: ServiceContext, input: { fileId: string }): Promise<FileForm> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireRecord(ex, input.fileId);
  const building = FORM_DEFINITIONS[record.kind].family === "BUILDING";
  return {
    id: record.file.id,
    number: record.file.number,
    kind: record.kind,
    stage: record.file.stage as FileStage,
    locked: record.file.lockedAt !== null,
    closed: record.file.closedAt !== null,
    values: sheetValuesOf(record),
    office: fileOfficeOf(record.file),
    siteOffice: siteOfficeOf(record.site),
    residents: !building ? "NONE" : can(ctx, "residents.read") ? "ALLOWED" : "RESTRICTED",
    canEditLocked: can(ctx, "file.editLocked"),
    statusTicks: await statusTicksOf(ex, ctx, record),
  };
}

/** What a new file's form starts with: today, and the centre's wilaya and commune. */
export async function getNewFileDefaults(ex: Executor, ctx: ServiceContext) {
  requireSection(ctx, "REQUESTS", "READ");
  const settings = await getSettings(ex, ["centre.wilayaCode", "centre.city"]);
  return { today: ctx.today, wilayaCode: settings["centre.wilayaCode"], communeName: settings["centre.city"] };
}

// ── The residents (F2, page 3) ───────────────────────────────────────────────

export interface ResidentListLine extends ResidentLine {
  id: string;
  number: number;
}

async function readResidents(ex: Executor, ctx: ServiceContext, record: FileRecord): Promise<ResidentRow[]> {
  requireCapability(ctx, "residents.read");
  const rows = await ex
    .selectFrom("Resident")
    .selectAll()
    .where("siteId", "=", record.site.id)
    .where("deletedAt", "is", null)
    .orderBy("number")
    .execute();
  await logConsult(ex, ctx, {
    owner: "CLIENTS",
    action: "VIEW_RESTRICTED",
    entity: "Site",
    entityId: record.site.id,
    entityLabel: record.site.commonName ?? record.site.address,
    subject: { kind: "CLIENT", id: record.client.id, label: record.client.name },
    context: { list: "Resident", count: rows.length, fileId: record.file.id },
  });
  return rows;
}

/**
 * «قائمة القاطنين بالعمارة» of a building's file, for its form: every line kept,
 * with its id. Needs `residents.read`; logged at every reading.
 */
export async function openResidentList(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<ResidentListLine[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireRecord(ex, input.fileId);
  if (FORM_DEFINITIONS[record.kind].family !== "BUILDING") return [];
  const rows = await readResidents(ex, ctx, record);
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    name: row.name,
    ...(row.phone ? { phone: row.phone } : {}),
    ...(row.registeredDate ? { registeredDate: row.registeredDate } : {}),
  }));
}

// ── The printed sheet ────────────────────────────────────────────────────────

export interface FileSheet {
  id: string;
  number: string;
  kind: FormKind;
  /** What the sheet prints, «حالة الملف» included. */
  values: FormValues;
  /** Page 3 of a building form; null when the form has none, or this user may not read it. */
  residents: ResidentLine[] | null;
  residentsRestricted: boolean;
}

/** «متوقف» or «معاقب» on the client today, read the one way it is read: People's `getSanctionStates`. */
async function clientSanctionOf(ex: Executor, ctx: ServiceContext, clientId: string): Promise<ClientSanction> {
  const states = await getSanctionStates(ex, ctx, { kind: "CLIENT", ids: [clientId] });
  return states[clientId]?.state ?? "NONE";
}

/** The eight boxes of «حالة الملف» as the program ticks them today. */
async function statusTicksOf(ex: Executor, ctx: ServiceContext, record: FileRecord): Promise<FileStatusTick[]> {
  return statusTicks({
    stage: record.file.stage as FileStage,
    isReturning: record.file.isReturning === 1,
    clientSanction: await clientSanctionOf(ex, ctx, record.client.id),
  });
}

/** The sheet of a stored file, ready to print, «حالة الملف» ticked as of today. */
export async function openFileSheet(ex: Executor, ctx: ServiceContext, input: { fileId: string }): Promise<FileSheet> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireRecord(ex, input.fileId);
  const values: FormValues = { ...sheetValuesOf(record), statusTicks: await statusTicksOf(ex, ctx, record) };
  const building = FORM_DEFINITIONS[record.kind].family === "BUILDING";
  const allowed = building && can(ctx, "residents.read");
  const residents = allowed ? residentLinesOf(await readResidents(ex, ctx, record), ctx.today) : null;
  return {
    id: record.file.id,
    number: record.file.number,
    kind: record.kind,
    values,
    residents,
    residentsRestricted: building && !allowed,
  };
}

/** A sheet of a file went to the printer: a disclosure of the client's data, and of the residents' when printed. */
export async function recordFilePrint(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; sheet: "FORM" | "RESIDENTS" },
): Promise<void> {
  requireSection(ctx, "REQUESTS", "READ");
  const record = await requireRecord(ex, input.fileId);
  const withResidents = FORM_DEFINITIONS[record.kind].family === "BUILDING" && can(ctx, "residents.read");
  if (input.sheet === "RESIDENTS" && !withResidents) throw new ServiceError("You do not have permission to do this.");
  await logDisclose(ex, ctx, {
    owner: "CLIENTS",
    action: "PRINT",
    disclosure: "PRINT",
    entity: "File",
    entityId: record.file.id,
    entityLabel: record.file.number,
    subject: { kind: "CLIENT", id: record.client.id, label: record.client.name },
    context: { sheet: input.sheet, formKind: record.kind, residents: withResidents },
  });
}

// ── What the screens call ────────────────────────────────────────────────────

export const listFilesQuery = query(listFiles);
export const getFileHubQuery = query(getFileHub);
export const getFileFormQuery = query(getFileForm);
export const getNewFileDefaultsQuery = query((ex: Executor, ctx: ServiceContext) => getNewFileDefaults(ex, ctx));
export const recordFileOpenedAction = action(recordFileOpened);
export const openResidentListAction = action(openResidentList);
export const openFileSheetAction = action(openFileSheet);
export const recordFilePrintAction = action(recordFilePrint);

/** Where the screens of one file keep their queries: refreshed with the list by every save. */
export const fileQueryPath = (fileId: string) => `${FILES_PATH}/${fileId}`;
