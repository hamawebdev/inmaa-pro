import type { Insertable, Updateable } from "kysely";
import type { z } from "zod";

import { ensureCommune, ensureZoneForCommune } from "@/features/core/services/places";
import { checkSanction, consumeDecision } from "@/features/people/services/sanctions";
import { can, requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import type { DB } from "@/lib/db/schema";
import { emit } from "@/lib/events";
import { logChange, logCollect, logConsult, logErase } from "@/lib/log";
import { claimNumber, fileSequenceKey, nextNumber } from "@/lib/numbering";
import { action } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import { normaliseName, phoneKeys } from "@/lib/text/normalise";
import type { LocalDate } from "@/lib/units";
import { FILES_PATH } from "@/navigation/file-parts";

import { FORM_DEFINITIONS } from "../forms/definitions";
import {
  partySnapshotOf,
  printedKeys,
  storedAnswersOf,
  textOrNull,
  type ClientRow,
  type PartySnapshot,
  type ServiceDraft,
  type ServiceRow,
  type SiteRow,
} from "../forms/stored-values";
import type { FormValues } from "../forms/values";
import { isBackward, stageMove, type StageFacts, type StageRefusal } from "../rules/stage-moves";
import {
  fileOfficeSchema,
  formKindSchema,
  isDate,
  reasonSchema,
  residentsSchema,
  sheetSchema,
  SITE_OFFICE_FLAGS,
  SITE_OFFICE_SETS,
  siteOfficeSchema,
  type FileOfficeInput,
  type ResidentInput,
  type SiteOfficeInput,
} from "../validators/file-values";
import {
  CLIENT_TYPE_OF,
  CLOSE_REASONS,
  END_KINDS,
  FILE_STAGES,
  FORM_KIND_OF,
  type CloseReason,
  type EndKind,
  type FileStage,
  type FormKind,
} from "../validators/option-lists";

import { isLive, liveSheetValuesOf, loadFileRecord, type FileRecord } from "./file-records";

/**
 * A file from his sheet to «متعاقد» (plan features 1, 2, 6; scope A5, A6).
 *
 *  - `registerFile`: the client, the site and the file from one of his six
 *    forms, with its registration number;
 *  - `saveFileForm`: the same form again, sending only what changed;
 *  - `moveFileStage`: the stage, with its checks and its history. Reaching
 *    «متعاقد» freezes the sheet and tells Operations and Money
 *    (`file.contracted`, CONTRACTS.md section 4).
 *
 * The «قديم» control and People's sanction check come in the next round:
 * every file registered here has a new client.
 */

const FILES_PATHS = [FILES_PATH, "/dashboard/clients"] as const;

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) throw new ServiceError(result.error.issues[0]?.message ?? "Invalid form submission.");
  return result.data;
}

/** What a client and a site cannot be saved without: a name, a phone, an address and a commune. */
function requireParty(values: FormValues): void {
  if (!textOrNull(values.clientName)) throw new ServiceError("The client's name is required.");
  if (!textOrNull(values.phone)) throw new ServiceError("The phone number is required.");
  if (!textOrNull(values.address)) throw new ServiceError("The address is required.");
  if (!textOrNull(values.commune)) throw new ServiceError("The commune is required.");
  if (!textOrNull(values.wilaya)) throw new ServiceError("Choose a wilaya from the list.");
}

/** The columns of the site's office block, as stored: sets as JSON arrays, rules as 0 or 1, blanks as null. */
function siteOfficeColumns(input: SiteOfficeInput): Updateable<DB["Site"]> {
  const columns: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (value === undefined) continue;
    if ((SITE_OFFICE_SETS as readonly string[]).includes(key)) {
      columns[key] = Array.isArray(value) && value.length > 0 ? JSON.stringify(value) : null;
    } else if ((SITE_OFFICE_FLAGS as readonly string[]).includes(key)) {
      columns[key] = value ? 1 : 0;
    } else if (typeof value === "string") {
      columns[key] = textOrNull(value);
    } else {
      columns[key] = value;
    }
  }
  return columns as Updateable<DB["Site"]>;
}

function fileOfficeColumns(input: FileOfficeInput): Updateable<DB["File"]> {
  const columns: Record<string, unknown> = {};
  if (input.source !== undefined) columns.source = input.source;
  if (input.priority !== undefined) columns.priority = input.priority;
  if (input.officeNotes !== undefined) columns.officeNotes = textOrNull(input.officeNotes);
  if (input.amountBasis !== undefined) columns.amountBasis = input.amountBasis;
  if (input.expensesIncluded !== undefined) columns.expensesIncluded = input.expensesIncluded ? 1 : 0;
  return columns as Updateable<DB["File"]>;
}

/** The commune typed on the sheet, found or added, and its zone (A9). */
async function placeOf(ex: Executor, ctx: ServiceContext, values: FormValues) {
  const { id: communeId } = await ensureCommune(ex, ctx, {
    wilayaCode: textOrNull(values.wilaya) ?? "",
    nameAr: textOrNull(values.commune) ?? "",
  });
  const { zoneId } = await ensureZoneForCommune(ex, ctx, { communeId });
  return { communeId, zoneId };
}

const clientSubject = (client: { id: string; name: string }) =>
  ({ kind: "CLIENT", id: client.id, label: client.name }) as const;

function serviceRowValues(fileId: string, draft: ServiceDraft, ctx: ServiceContext): Insertable<DB["FileService"]> {
  return {
    id: newId(),
    fileId,
    list: draft.list,
    code: draft.code,
    customLabel: draft.customLabel,
    blankSlot: draft.blankSlot,
    sortOrder: draft.sortOrder,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
}

/** The services of a list as the log shows them: codes, and the blank lines' text. */
const serviceWords = (rows: readonly Pick<ServiceDraft, "code" | "customLabel">[]) =>
  rows.map((row) => row.code ?? row.customLabel).join(", ");

/** The row of «الوصف الفني للموقع» of a file: one per file, of its form's family. */
async function insertDescription(
  ex: Executor,
  ctx: ServiceContext,
  fileId: string,
  kind: FormKind,
  answers: Record<string, unknown> = {},
) {
  const row = {
    ...answers,
    id: newId(),
    fileId,
    family: FORM_DEFINITIONS[kind].family,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  } as Insertable<DB["FileDescription"]>;
  await ex.insertInto("FileDescription").values(row).execute();
  return ex.selectFrom("FileDescription").selectAll().where("id", "=", row.id).executeTakeFirstOrThrow();
}

// ── Residents (F2, page 3) ───────────────────────────────────────────────────

async function insertResident(
  ex: Executor,
  ctx: ServiceContext,
  siteId: string,
  line: ResidentInput,
  context: Record<string, unknown>,
): Promise<string> {
  const id = newId();
  const name = line.name.trim();
  await ex
    .insertInto("Resident")
    .values({
      id,
      siteId,
      number: line.number,
      name,
      phone: textOrNull(line.phone),
      registeredDate: (line.registeredDate || null) as LocalDate | null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logCollect(ex, ctx, {
    owner: "CLIENTS",
    action: "CREATE",
    entity: "Resident",
    entityId: id,
    entityLabel: String(line.number),
    subject: { kind: "RESIDENT", id, label: name },
    context,
  });
  return id;
}

/**
 * Brings the residents of a site in line with the list typed: new lines are
 * added, changed lines updated, lines left out removed (a soft delete, with the
 * reason the user typed).
 *
 * The list is third-party data, read and changed only with `residents.read`.
 * The one exception is the first registration of a file (the coordinator's
 * ruling): the clerk is copying the paper in front of her, so the list comes
 * in with the right to write the requests alone, each line logged as a COLLECT.
 */
async function saveResidents(
  ex: Executor,
  ctx: ServiceContext,
  site: Pick<SiteRow, "id">,
  lines: readonly ResidentInput[],
  reason: string | undefined,
  context: Record<string, unknown>,
  firstRegistration = false,
): Promise<boolean> {
  if (!firstRegistration) requireCapability(ctx, "residents.read");
  const before = await ex
    .selectFrom("Resident")
    .selectAll()
    .where("siteId", "=", site.id)
    .where("deletedAt", "is", null)
    .execute();
  const kept = new Map(before.map((resident) => [resident.id, resident]));
  const typedIds = new Set(lines.flatMap((line) => (line.id ? [line.id] : [])));
  const removed = before.filter((resident) => !typedIds.has(resident.id));
  if (removed.length > 0 && !reason) throw new ServiceError("A reason is required.");
  let changed = false;

  for (const resident of removed) {
    await ex
      .updateTable("Resident")
      .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", resident.id)
      .execute();
    await logErase(ex, ctx, {
      owner: "CLIENTS",
      action: "SOFT_DELETE",
      reason,
      entity: "Resident",
      entityId: resident.id,
      entityLabel: String(resident.number),
      subject: { kind: "RESIDENT", id: resident.id, label: resident.name },
      context,
    });
    changed = true;
  }

  for (const line of lines) {
    const resident = line.id ? kept.get(line.id) : undefined;
    if (line.id && !resident) throw new ServiceError("This resident is not on this site's list.");
    if (!resident) {
      await insertResident(ex, ctx, site.id, line, context);
      changed = true;
      continue;
    }
    const { set, changes } = changedColumns(resident, {
      number: line.number,
      name: line.name.trim(),
      phone: textOrNull(line.phone),
      registeredDate: (line.registeredDate || null) as LocalDate | null,
    });
    if (!changes) continue;
    await ex
      .updateTable("Resident")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", resident.id)
      .execute();
    await logChange(ex, ctx, {
      owner: "CLIENTS",
      action: "UPDATE",
      entity: "Resident",
      entityId: resident.id,
      entityLabel: String(line.number),
      subject: { kind: "RESIDENT", id: resident.id, label: line.name.trim() },
      changes,
      context,
    });
    changed = true;
  }
  return changed;
}

// ── Who the client is, where the site is: changed from a form ────────────────

/** The search keys are derived from the name and the phones: the log names what was typed, not them. */
function withoutKeys(changes: Record<string, readonly [unknown, unknown]>) {
  const derived = new Set(["nameKey", "managerNameKey", "phoneKeys", "commonNameKey"]);
  return Object.fromEntries(Object.entries(changes).filter(([column]) => !derived.has(column)));
}

/** Brings a client's record in line with what a form says about him: only what that form prints, only what changed. */
async function updateClientFromSheet(
  ex: Executor,
  ctx: ServiceContext,
  client: ClientRow,
  kind: FormKind,
  values: FormValues,
  answers: Updateable<DB["Client"]>,
  context: Record<string, unknown>,
): Promise<boolean> {
  const name = textOrNull(values.clientName)!;
  const managerName = textOrNull(values.managerName);
  const patch = changedColumns(client, {
    ...answers,
    nameKey: normaliseName(name),
    ...(printedKeys(kind).has("managerName")
      ? { managerNameKey: managerName ? normaliseName(managerName) : null }
      : {}),
    phoneKeys: phoneKeys([textOrNull(values.phone), client.phone2]),
  } as Partial<ClientRow>);
  if (!patch.changes) return false;
  await ex
    .updateTable("Client")
    .set({ ...patch.set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", client.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "CLIENTS",
    action: "UPDATE",
    entity: "Client",
    entityId: client.id,
    entityLabel: client.number,
    subject: clientSubject({ id: client.id, name }),
    changes: withoutKeys(patch.changes),
    context,
  });
  return true;
}

/**
 * Brings a site's record in line with a patch (his answers, the office block),
 * its commune and its zone with the address typed when `values` is given.
 */
async function updateSiteFromSheet(
  ex: Executor,
  ctx: ServiceContext,
  site: SiteRow,
  client: { id: string; name: string },
  values: FormValues | null,
  columns: Updateable<DB["Site"]>,
  context: Record<string, unknown>,
): Promise<{ changed: boolean; zoneChanged: boolean; profileChanged: boolean }> {
  const wanted: Record<string, unknown> = { ...columns };
  if (values) {
    const { communeId, zoneId } = await placeOf(ex, ctx, values);
    const commonName = textOrNull(values.commonName);
    Object.assign(wanted, { communeId, zoneId, commonNameKey: commonName ? normaliseName(commonName) : null });
  }
  const patch = changedColumns(site, wanted as Partial<SiteRow>);
  if (!patch.changes) return { changed: false, zoneChanged: false, profileChanged: false };
  await ex
    .updateTable("Site")
    .set({ ...patch.set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", site.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "CLIENTS",
    action: "UPDATE",
    entity: "Site",
    entityId: site.id,
    entityLabel: site.commonName ?? site.address,
    subject: clientSubject(client),
    changes: withoutKeys(patch.changes),
    context,
  });
  return {
    changed: true,
    zoneChanged: "zoneId" in patch.changes,
    profileChanged: Object.keys(patch.changes).some((column) => column !== "zoneId"),
  };
}

// ── Registering a file ───────────────────────────────────────────────────────

export interface RegisterFileInput {
  kind: FormKind;
  /** His sheet's answers, in the data model's units. `registrationDate` may be the paper's; it defaults to today. */
  values: FormValues;
  office?: FileOfficeInput;
  siteOffice?: SiteOfficeInput;
  /** «قائمة القاطنين بالعمارة», buildings and complexes only. */
  residents?: ResidentInput[];
  /**
   * «قديم»: the client already has a record, and perhaps this site. The file is
   * registered under that client (who keeps his number) and on that site, or
   * on a new site of his; `copiedFromFileId` is the file the form was filled from.
   */
  returning?: { clientId: string; siteId?: string | null; copiedFromFileId?: string | null };
  /** What the suspended-or-penalised gate handed back (People's `useSanctionGate`). */
  notTheSamePerson?: boolean;
  decisionId?: string | null;
  /** The sales rep's visit this request came from (plan feature 40). */
  sourceRepVisitId?: string | null;
  /**
   * Numbers already written on a paper form filled before the program: the
   * client's «رقم الملف» and the file's «رقم التسجيل». Needs `file.setNumber`
   * and the reason typed (`claimNumber`, logged).
   */
  paperNumbers?: { client?: number | null; file?: number | null; reason: string } | null;
}

export interface RegisteredFile {
  fileId: string;
  clientId: string;
  siteId: string;
  number: string;
}

/**
 * Registers a file from one of his six forms, numbered from the form's own
 * counter («31/BLC»), at «جديد»: for a new client and his site, or with
 * `returning` («قديم») for a client the centre already knows.
 *
 * The client is checked against the suspended and the penalised first
 * (People's `checkSanction`, plan feature 40): a match stops the registration
 * until the manager has said yes to it, and his yes is spent by this file.
 */
export async function registerFile(
  ex: Executor,
  ctx: ServiceContext,
  input: RegisterFileInput,
): Promise<RegisteredFile> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const kind = parse(formKindSchema, input.kind);
  const values = parse(sheetSchema(kind), input.values) as FormValues;
  const office = parse(fileOfficeSchema, input.office ?? {});
  const siteOffice = parse(siteOfficeSchema, input.siteOffice ?? {});
  const residents = parse(residentsSchema, input.residents ?? []);
  requireParty(values);

  const { division, serviceType } = FORM_KIND_OF[kind];
  const definition = FORM_DEFINITIONS[kind];
  const registrationDate = (values.registrationDate ?? ctx.today) as LocalDate;
  if (registrationDate > ctx.today) throw new ServiceError("A registration date cannot be after today.");
  if (residents.length > 0 && definition.family !== "BUILDING") {
    throw new ServiceError("Only buildings and residential complexes have a list of residents.");
  }
  const answers = storedAnswersOf(kind, values);
  const audit = { formKind: kind };
  const paper = input.paperNumbers ?? null;
  const sourceRepVisitId = input.sourceRepVisitId ?? null;
  if (sourceRepVisitId) {
    const repVisit = await ex
      .selectFrom("RepVisit")
      .select("id")
      .where("id", "=", sourceRepVisitId)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!repVisit) throw new ServiceError("This visit of the sales rep does not exist.");
  }

  // ── Suspended or penalised? ──
  const returning = input.returning ?? null;
  const known = returning
    ? await ex
        .selectFrom("Client")
        .selectAll()
        .where("id", "=", returning.clientId)
        .where("deletedAt", "is", null)
        .executeTakeFirst()
    : undefined;
  if (returning && !known) throw new ServiceError("This client does not exist.");
  const decisionId = input.decisionId ?? null;
  const check = await checkSanction(ex, ctx, {
    context: "CLIENT_FILE",
    subjectKind: "CLIENT",
    subjectId: known?.id ?? null,
    identity: {
      name: textOrNull(values.clientName),
      phones: [textOrNull(values.phone), known?.phone2],
      taxNumbers: [known?.rcNumber, known?.nis, known?.nif],
    },
    decisionId,
  });
  if (check.outcome === "BLOCKED") {
    throw new ServiceError("This person is suspended or penalised. The manager must allow the registration first.");
  }
  if (check.outcome === "REFUSED") throw new ServiceError("The manager did not allow this person to be registered.");
  if (check.outcome === "POSSIBLE" && input.notTheSamePerson !== true) {
    throw new ServiceError(
      "Someone with this name is suspended or penalised. Confirm that this is another person before saving.",
    );
  }

  // ── The client ──
  const name = textOrNull(values.clientName)!;
  let clientId: string;
  if (known) {
    clientId = known.id;
    await updateClientFromSheet(ex, ctx, known, kind, values, answers.client, audit);
  } else {
    const claimed = paper?.client ?? null;
    const dossier = claimed
      ? await claimNumber(ex, ctx, "CLIENT_DOSSIER", {
          value: claimed,
          date: registrationDate,
          reason: paper?.reason ?? "",
          isFree: async () =>
            !(await ex.selectFrom("Client").select("id").where("number", "=", String(claimed)).executeTakeFirst()),
        })
      : await nextNumber(ex, ctx, "CLIENT_DOSSIER", { date: registrationDate });
    clientId = newId();
    const phone1 = textOrNull(values.phone)!;
    const managerName = textOrNull(values.managerName);
    await ex
      .insertInto("Client")
      .values({
        ...answers.client,
        id: clientId,
        numberSeq: dossier.seq,
        number: dossier.display,
        clientType: CLIENT_TYPE_OF[division],
        name,
        nameKey: normaliseName(name),
        managerNameKey: managerName ? normaliseName(managerName) : null,
        phone1,
        phoneKeys: phoneKeys([phone1]),
        branchId: ctx.branchId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    await logCollect(ex, ctx, {
      owner: "CLIENTS",
      action: "CREATE",
      entity: "Client",
      entityId: clientId,
      entityLabel: dossier.display,
      subject: clientSubject({ id: clientId, name }),
      context: audit,
    });
  }

  // ── The site: one he has, or a new one ──
  const knownSite = returning?.siteId
    ? await ex
        .selectFrom("Site")
        .selectAll()
        .where("id", "=", returning.siteId)
        .where("deletedAt", "is", null)
        .executeTakeFirst()
    : undefined;
  if (returning?.siteId && (!knownSite || knownSite.clientId !== clientId || knownSite.division !== division)) {
    throw new ServiceError("This site is not one of this client's sites in this division.");
  }
  let siteId: string;
  if (knownSite) {
    siteId = knownSite.id;
    const moved = await updateSiteFromSheet(
      ex,
      ctx,
      knownSite,
      { id: clientId, name },
      values,
      {
        ...siteOfficeColumns(siteOffice),
        ...answers.site,
      },
      audit,
    );
    if (moved.zoneChanged || moved.profileChanged) {
      await emit(ex, ctx, "site.changed", {
        siteId,
        zoneChanged: moved.zoneChanged,
        profileChanged: moved.profileChanged,
      });
    }
  } else {
    const { communeId, zoneId } = await placeOf(ex, ctx, values);
    siteId = newId();
    const commonName = textOrNull(values.commonName);
    await ex
      .insertInto("Site")
      .values({
        ...siteOfficeColumns(siteOffice),
        ...answers.site,
        id: siteId,
        clientId,
        division,
        address: textOrNull(values.address)!,
        communeId,
        zoneId,
        commonNameKey: commonName ? normaliseName(commonName) : null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      } as Insertable<DB["Site"]>)
      .execute();
    await logCollect(ex, ctx, {
      owner: "CLIENTS",
      action: "CREATE",
      entity: "Site",
      entityId: siteId,
      entityLabel: commonName ?? textOrNull(values.address) ?? undefined,
      subject: clientSubject({ id: clientId, name }),
      context: audit,
    });
  }

  // ── The file ──
  const claimedFile = paper?.file ?? null;
  const number = claimedFile
    ? await claimNumber(ex, ctx, fileSequenceKey(kind), {
        value: claimedFile,
        date: registrationDate,
        reason: paper?.reason ?? "",
        isFree: async () =>
          !(await ex
            .selectFrom("File")
            .select("id")
            .where("formKind", "=", kind)
            .where("numberSeq", "=", claimedFile)
            .executeTakeFirst()),
      })
    : await nextNumber(ex, ctx, fileSequenceKey(kind), { date: registrationDate });
  const suffixes = await getSetting(ex, "numbering.fileSuffix");
  const fileId = newId();
  await ex
    .insertInto("File")
    .values({
      ...answers.file,
      ...fileOfficeColumns(office),
      id: fileId,
      sourceRepVisitId,
      formKind: kind,
      numberSeq: number.seq,
      numberSuffix: (suffixes[kind] ?? "").trim(),
      number: number.display,
      registrationDate,
      division,
      serviceType,
      clientId,
      siteId,
      branchId: ctx.branchId,
      isReturning: returning ? 1 : 0,
      copiedFromFileId: returning?.copiedFromFileId ?? null,
      sanctionDecisionId: check.outcome === "ALLOWED" ? decisionId : null,
      stage: "NEW",
      stageChangedAt: ctx.now,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    } as Insertable<DB["File"]>)
    .execute();
  await insertDescription(ex, ctx, fileId, kind, answers.description);
  for (const draft of answers.services) {
    await ex
      .insertInto("FileService")
      .values(serviceRowValues(fileId, draft, ctx))
      .execute();
  }
  await ex
    .insertInto("FileStageEvent")
    .values({
      id: newId(),
      fileId,
      fromStage: null,
      toStage: "NEW",
      changedAt: ctx.now,
      changedByUserId: ctx.userId,
      note: null,
      createdAt: ctx.now,
    })
    .execute();
  await logCollect(ex, ctx, {
    owner: "CLIENTS",
    action: "CREATE",
    entity: "File",
    entityId: fileId,
    entityLabel: number.display,
    subject: clientSubject({ id: clientId, name }),
    context: audit,
  });

  // ── The manager's yes is spent by this file; the clerk's "another person" is kept ──
  if (check.outcome === "ALLOWED" && decisionId) {
    await consumeDecision(ex, ctx, { decisionId, entityKind: "FILE", entityId: fileId });
  }
  if (check.outcome === "POSSIBLE") {
    for (const match of check.matches) {
      await logConsult(ex, ctx, {
        owner: "CLIENTS",
        action: "SANCTION_CHECK",
        entity: "Sanction",
        entityId: match.sanctionId,
        entityLabel: match.displayName,
        subject: { kind: match.subjectKind, id: match.subjectId, label: match.displayName },
        context: { context: "CLIENT_FILE", foundBy: match.foundBy, answer: "NOT_THE_SAME_PERSON", fileId },
      });
    }
  }

  // ── Page 3 of a building form ──
  // On a site he already has, the residents are the site's: the list is left as it is unless one is typed.
  if (residents.length > 0 && !knownSite) {
    await saveResidents(ex, ctx, { id: siteId }, residents, undefined, { fileId, formKind: kind }, true);
  }

  // The rep's visit now names the client it became.
  if (sourceRepVisitId) {
    const repVisit = await ex
      .selectFrom("RepVisit")
      .select(["id", "clientId", "prospectName"])
      .where("id", "=", sourceRepVisitId)
      .executeTakeFirstOrThrow();
    if (repVisit.clientId === null) {
      await ex
        .updateTable("RepVisit")
        .set({ clientId, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", repVisit.id)
        .execute();
      await logChange(ex, ctx, {
        owner: "CLIENTS",
        action: "UPDATE",
        entity: "RepVisit",
        entityId: repVisit.id,
        entityLabel: repVisit.prospectName,
        changes: { clientId: [null, clientId] },
        context: { fileId },
      });
    }
  }
  return { fileId, clientId, siteId, number: number.display };
}

// ── Saving the form again ────────────────────────────────────────────────────

/** What a contracted file's visits and dues are built from: a change tells Operations and Money. */
const TERMS_COLUMNS = new Set<string>([
  "contractKind",
  "contractDuration",
  "visitsPerWeek",
  "paymentFrequency",
  "requestKinds",
  "executionDurationValue",
  "executionDurationUnit",
  "executionDays",
  "period",
  "periodFrom",
  "periodTo",
  "startDate",
  "endDate",
  "arrivalTime",
  "departureTime",
  "workersCount",
  "payerName",
  "payerPhone",
  "materialsBearer",
  "materialsAmount",
  "transportBearer",
  "transportAmount",
  "paymentMethods",
  "totalAmount",
  "firstDueDate",
  "paymentPlace",
  "amountBasis",
  "expensesIncluded",
]);

/** The office-only answers of a file that are not terms: free to change on a signed file. */
const FREE_OFFICE_COLUMNS = new Set<string>(["source", "priority", "officeNotes"]);

export interface SaveFileFormInput {
  fileId: string;
  values: FormValues;
  office?: FileOfficeInput;
  siteOffice?: SiteOfficeInput;
  /** The whole list, when the screen shows it; left out, the residents are not touched. */
  residents?: ResidentInput[];
  /** Typed by the user: required to change a signed file's sheet, and to remove a resident. */
  reason?: string;
}

interface ServiceDiff {
  inserts: ServiceDraft[];
  updates: Array<{ row: ServiceRow; draft: ServiceDraft }>;
  deletes: ServiceRow[];
}

function diffServices(before: readonly ServiceRow[], drafts: readonly ServiceDraft[], lists: readonly string[]) {
  const diff: ServiceDiff = { inserts: [], updates: [], deletes: [] };
  const mine = before.filter((row) => lists.includes(row.list));
  const keyOf = (row: { list: string; code: string | null; blankSlot: number | null }) =>
    row.code !== null ? `${row.list}:code:${row.code}` : `${row.list}:slot:${row.blankSlot}`;
  const byKey = new Map(mine.map((row) => [keyOf(row), row]));
  const wanted = new Set<string>();
  for (const draft of drafts) {
    const key = keyOf(draft);
    wanted.add(key);
    const row = byKey.get(key);
    if (!row) diff.inserts.push(draft);
    else if (row.customLabel !== draft.customLabel || row.sortOrder !== draft.sortOrder)
      diff.updates.push({ row, draft });
  }
  diff.deletes = mine.filter((row) => !wanted.has(keyOf(row)));
  return diff;
}

const hasDiff = (diff: ServiceDiff) => diff.inserts.length + diff.updates.length + diff.deletes.length > 0;

/**
 * Saves his sheet again, and the office-only answers. Only the columns that
 * changed are sent, and the log says what changed.
 *
 * Once the file is signed («متعاقد», `lockedAt`), the sheet is what was signed:
 * changing it needs the capability `file.editLocked` and a reason, and who the
 * client is and where the site is are changed on the file's snapshot, not on
 * the client's record. The office-only answers stay free.
 */
export async function saveFileForm(
  ex: Executor,
  ctx: ServiceContext,
  input: SaveFileFormInput,
): Promise<{ fileId: string; changed: boolean }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const record = await loadFileRecord(ex, input.fileId);
  if (!record) throw new ServiceError("This file does not exist.");
  const { kind, file, client, site } = record;
  if (file.closedAt !== null) throw new ServiceError("This file is closed and can no longer be changed.");

  const values = parse(sheetSchema(kind), input.values) as FormValues;
  const office = parse(fileOfficeSchema, input.office ?? {});
  const siteOffice = parse(siteOfficeSchema, input.siteOffice ?? {});
  const residents = input.residents === undefined ? undefined : parse(residentsSchema, input.residents);
  const reason = parse(reasonSchema, input.reason)?.trim() || undefined;
  requireParty(values);
  if (residents && residents.length > 0 && FORM_DEFINITIONS[kind].family !== "BUILDING") {
    throw new ServiceError("Only buildings and residential complexes have a list of residents.");
  }
  if (values.registrationDate !== undefined && values.registrationDate !== file.registrationDate) {
    throw new ServiceError("The registration date of a file cannot be changed.");
  }

  const locked = file.lockedAt !== null;
  const answers = storedAnswersOf(kind, values);
  const context = { formKind: kind, fileNumber: file.number };

  // ── What would change ──
  const officeColumns = fileOfficeColumns(office);
  const filePatch = changedColumns(file, { ...answers.file, ...officeColumns } as Partial<typeof file>);
  const sheetFileChanges = Object.keys(filePatch.changes ?? {}).filter((column) => !FREE_OFFICE_COLUMNS.has(column));
  // Every file registered here has its description row; one written by hand may not.
  const description = record.description ?? (await insertDescription(ex, ctx, file.id, kind));
  const descriptionPatch = changedColumns(description, answers.description as Partial<typeof description>);
  const services = diffServices(record.services, answers.services, answers.serviceLists);

  let snapshot: {
    before: PartySnapshot;
    after: PartySnapshot;
    changes: Record<string, readonly [unknown, unknown]>;
  } | null = null;
  if (locked) {
    const before = (file.partySnapshot ? JSON.parse(file.partySnapshot) : {}) as PartySnapshot;
    const after = partySnapshotOf({ ...values, dossierNumber: before.dossierNumber ?? client.number });
    const printed = printedKeys(kind);
    const changes: Record<string, readonly [unknown, unknown]> = {};
    for (const key of Object.keys({ ...before, ...after }) as (keyof PartySnapshot)[]) {
      if (key !== "dossierNumber" && !printed.has(key)) continue;
      if (before[key] !== after[key]) changes[key] = [before[key] ?? null, after[key] ?? null];
    }
    snapshot = Object.keys(changes).length ? { before, after, changes } : null;
  }

  const sheetChanged =
    sheetFileChanges.length > 0 || descriptionPatch.changes !== null || hasDiff(services) || snapshot !== null;
  if (locked && sheetChanged) {
    requireCapability(ctx, "file.editLocked");
    if (!reason) throw new ServiceError("A reason is required.");
  }

  let changed = false;

  // ── Who the client is, where the site is ──
  if (!locked && (await updateClientFromSheet(ex, ctx, client, kind, values, answers.client, context))) changed = true;
  const moved = await updateSiteFromSheet(
    ex,
    ctx,
    site,
    client,
    locked ? null : values,
    { ...siteOfficeColumns(siteOffice), ...(locked ? {} : answers.site) },
    context,
  );
  if (moved.changed) changed = true;
  const { zoneChanged, profileChanged } = moved;

  // ── The file's own answers ──
  if (filePatch.changes || snapshot) {
    const set: Updateable<DB["File"]> = { ...(filePatch.set as Updateable<DB["File"]>) };
    if (snapshot) set.partySnapshot = JSON.stringify(snapshot.after);
    await ex
      .updateTable("File")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", file.id)
      .execute();
    changed = true;
  }
  if (descriptionPatch.changes) {
    await ex
      .updateTable("FileDescription")
      .set({ ...descriptionPatch.set, updatedAt: ctx.now })
      .where("id", "=", description.id)
      .execute();
    changed = true;
  }
  for (const row of services.deletes) {
    await ex.deleteFrom("FileService").where("id", "=", row.id).execute();
  }
  for (const { row, draft } of services.updates) {
    await ex
      .updateTable("FileService")
      .set({ customLabel: draft.customLabel, sortOrder: draft.sortOrder, updatedAt: ctx.now })
      .where("id", "=", row.id)
      .execute();
  }
  for (const draft of services.inserts) {
    await ex
      .insertInto("FileService")
      .values(serviceRowValues(file.id, draft, ctx))
      .execute();
  }
  if (hasDiff(services)) changed = true;

  const fileChanges: Record<string, readonly [unknown, unknown]> = {
    ...(filePatch.changes ?? {}),
    ...(descriptionPatch.changes ?? {}),
    ...(snapshot?.changes ?? {}),
  };
  if (hasDiff(services)) {
    for (const list of answers.serviceLists) {
      const before = record.services.filter((row) => row.list === list);
      const after = answers.services.filter((draft) => draft.list === list);
      if (serviceWords(before) !== serviceWords(after)) {
        fileChanges[`services.${list}`] = [serviceWords(before), serviceWords(after)];
      }
    }
  }
  if (Object.keys(fileChanges).length > 0) {
    await logChange(ex, ctx, {
      owner: "CLIENTS",
      action: "UPDATE",
      reason: locked && sheetChanged ? reason : undefined,
      entity: "File",
      entityId: file.id,
      entityLabel: file.number,
      subject: clientSubject(client),
      changes: fileChanges,
      context,
    });
  }

  // ── Page 3 of a building form ──
  if (residents !== undefined && FORM_DEFINITIONS[kind].family === "BUILDING") {
    if (await saveResidents(ex, ctx, site, residents, reason, { fileId: file.id, formKind: kind })) changed = true;
  }

  // ── Who must follow ──
  if (zoneChanged || profileChanged) {
    await emit(ex, ctx, "site.changed", { siteId: site.id, zoneChanged, profileChanged });
  }
  const termsChanged =
    Object.keys(filePatch.changes ?? {}).some((column) => TERMS_COLUMNS.has(column)) || hasDiff(services);
  if (isLive(file) && termsChanged) await emit(ex, ctx, "file.termsChanged", { fileId: file.id });

  return { fileId: file.id, changed };
}

// ── The stages ───────────────────────────────────────────────────────────────

/** What the stage rules need to know about a stored file. */
export async function stageFactsOf(ex: Executor, ctx: ServiceContext, record: FileRecord): Promise<StageFacts> {
  const [firstVisit, issued, accepted] = await Promise.all([
    ex
      .selectFrom("FirstVisit")
      .select("id")
      .where("fileId", "=", record.file.id)
      .where("deletedAt", "is", null)
      .executeTakeFirst(),
    ex
      .selectFrom("Quote")
      .select("id")
      .where("fileId", "=", record.file.id)
      .where("deletedAt", "is", null)
      .where("status", "in", ["ISSUED", "SUPERSEDED"])
      .executeTakeFirst(),
    ex
      .selectFrom("Quote")
      .select("id")
      .where("fileId", "=", record.file.id)
      .where("deletedAt", "is", null)
      .where("result", "=", "ACCEPTED")
      .executeTakeFirst(),
  ]);
  return {
    kind: record.kind,
    stage: record.file.stage as FileStage,
    closed: record.file.closedAt !== null,
    values: liveSheetValuesOf(record),
    office: { amountBasis: record.file.amountBasis },
    firstVisitPlanned: firstVisit !== undefined,
    quoteIssued: issued !== undefined,
    quoteAccepted: accepted !== undefined,
    endKind: (record.file.endKind as EndKind | null) ?? null,
    today: ctx.today,
    byManager: can(ctx, "file.stageBack"),
  };
}

/** Each refusal of the stage rules, as the sentence the office reads (the hub shows it beside the step). */
export const STAGE_REFUSALS: Readonly<Record<StageRefusal, string>> = {
  CLOSED: "This file is closed and can no longer be changed.",
  SAME_STAGE: "The file is already at this stage.",
  NOT_THE_NEXT_STAGE: "The file cannot jump to this stage.",
  NEEDS_MANAGER: "Only the manager can move a file back to an earlier stage.",
  SIGNED: "A signed file does not go back to an earlier stage.",
  NO_FIRST_VISIT: "Plan the first visit, or write its date on the form, first.",
  NO_QUOTE: "Issue a quote, or write the total amount on the form, first.",
  QUOTE_NOT_ACCEPTED: "An on-demand file becomes contracted once its quote is accepted.",
  MISSING_ANSWERS: "The form is not complete enough for a contract.",
  NO_END_REASON: "Say why the contract ends, or wait for its end date.",
};

export interface MoveFileStageInput {
  fileId: string;
  to: FileStage;
  /** A note kept with the stage history. */
  note?: string;
  /** Typed by the user: required to move back. */
  reason?: string;
  /** Why the contract ends, when it ends before its end date. */
  endKind?: EndKind;
  /** The day it really ended; defaults to «تاريخ النهاية» once passed, else today. */
  endedDate?: string;
}

/**
 * Moves a file to another stage (scope A5), writes the stage history and the
 * log. Reaching «متعاقد» locks the sheet, freezes who signed it
 * (`partySnapshot`) and whether its prices include VAT (`amountIncludesVat`),
 * then emits `file.contracted`: Operations generates the visits, Money the dues.
 */
export async function moveFileStage(
  ex: Executor,
  ctx: ServiceContext,
  input: MoveFileStageInput,
): Promise<{ fileId: string; stage: FileStage }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!(FILE_STAGES as readonly string[]).includes(input.to)) throw new Error(`clients: unknown stage ${input.to}`);
  const record = await loadFileRecord(ex, input.fileId);
  if (!record) throw new ServiceError("This file does not exist.");
  const { file } = record;
  const from = file.stage as FileStage;
  const to = input.to;
  const reason = parse(reasonSchema, input.reason)?.trim() || undefined;
  const note = textOrNull(input.note);

  const facts = await stageFactsOf(ex, ctx, record);
  if (to === "CONTRACT_ENDED" && input.endKind !== undefined) {
    if (!(END_KINDS as readonly string[]).includes(input.endKind))
      throw new Error(`clients: unknown end ${input.endKind}`);
    facts.endKind = input.endKind;
  }
  const move = stageMove(facts, to);
  if (!move.allowed) throw new ServiceError(STAGE_REFUSALS[move.refusal]);
  const back = isBackward(from, to);
  if (back && !reason) throw new ServiceError("A reason is required.");

  const set: Updateable<DB["File"]> = {
    stage: to,
    stageChangedAt: ctx.now,
    updatedAt: ctx.now,
    updatedByUserId: ctx.userId,
  };
  let ended: { endKind: EndKind; endedDate: LocalDate } | null = null;
  if (to === "CONTRACTED") {
    set.lockedAt = ctx.now;
    set.contractedAt = ctx.now;
    set.partySnapshot = JSON.stringify(partySnapshotOf(liveSheetValuesOf(record)));
    set.amountIncludesVat = (await getSetting(ex, "tax.pricesIncludeVat")) ? 1 : 0;
  }
  if (to === "CONTRACT_ENDED") {
    const endedDate = (input.endedDate ?? (facts.endKind === null ? file.endDate : ctx.today)) as LocalDate | null;
    if (!endedDate || !isDate(endedDate)) throw new ServiceError("Enter a valid date.");
    ended = { endKind: facts.endKind ?? "EXPIRED", endedDate };
    set.endedDate = ended.endedDate;
    set.endKind = ended.endKind;
    set.endNote = note;
  }

  await ex.updateTable("File").set(set).where("id", "=", file.id).execute();
  await ex
    .insertInto("FileStageEvent")
    .values({
      id: newId(),
      fileId: file.id,
      fromStage: from,
      toStage: to,
      changedAt: ctx.now,
      changedByUserId: ctx.userId,
      note: back ? (note ?? reason ?? null) : note,
      createdAt: ctx.now,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "CLIENTS",
    action: "STATUS_CHANGE",
    reason,
    entity: "File",
    entityId: file.id,
    entityLabel: file.number,
    subject: clientSubject(record.client),
    changes: { stage: [from, to] },
    context: { formKind: record.kind, ...(note ? { note } : {}) },
  });

  if (to === "CONTRACTED") await emit(ex, ctx, "file.contracted", { fileId: file.id });
  if (ended) await emit(ex, ctx, "file.ended", { fileId: file.id, ...ended });
  return { fileId: file.id, stage: to };
}

// ── Closing a file ───────────────────────────────────────────────────────────

export interface CloseFileInput {
  fileId: string;
  /** Why (CLOSE_REASON): a refused quote, a finished job, no answer, … */
  reason: CloseReason;
  note?: string;
  /** The day a finished job really ended; defaults to today. */
  endedDate?: string;
}

/**
 * Closes a file without a stage of its own (scope A5; CONTRACTS.md:
 * `closeFile(fileId, { reason, note, endedDate })`).
 *
 *  - A file not yet signed (a refused quote, a request that went unanswered)
 *    keeps the stage it stopped at, and nobody is told.
 *  - A signed on-demand job whose last visit is done: Operations calls this
 *    with JOB_DONE. The file reaches «انتهاء التعاقد» with its ending day and
 *    the kind JOB_DONE, and `file.ended` tells Operations and Money. A second
 *    call changes nothing, so a returned order typed in twice cannot fail.
 *  - A signed contract that ends for another reason is ended from its stage
 *    (`moveFileStage` to «انتهاء التعاقد» with the kind of ending), not closed here.
 *
 * Closing a finished job is the consequence of a returned order, and is done
 * as whoever typed the order in; any other closing is the office's own act
 * and needs the right to write the requests.
 */
export async function closeFile(
  ex: Executor,
  ctx: ServiceContext,
  input: CloseFileInput,
): Promise<{ fileId: string; closed: boolean }> {
  if (!(CLOSE_REASONS as readonly string[]).includes(input.reason)) {
    throw new Error(`clients: unknown close reason ${input.reason}`);
  }
  // Every reason needs the right to write the requests: Operations' sign-off, which closes a finished job, holds it.
  requireSection(ctx, "REQUESTS", "WRITE");
  const jobDone = input.reason === "JOB_DONE";
  const record = await loadFileRecord(ex, input.fileId);
  if (!record) throw new ServiceError("This file does not exist.");
  const { file } = record;
  if (jobDone && file.serviceType !== "ON_DEMAND") {
    throw new ServiceError("Only a job on demand ends when its last visit is done.");
  }
  if (file.closedAt !== null) {
    if (jobDone) return { fileId: file.id, closed: false };
    throw new ServiceError("This file is closed and can no longer be changed.");
  }

  const note = textOrNull(input.note);
  const from = file.stage as FileStage;
  const set: Updateable<DB["File"]> = {
    closedAt: ctx.now,
    closeReason: input.reason,
    closeNote: note,
    updatedAt: ctx.now,
    updatedByUserId: ctx.userId,
  };
  const changes: Record<string, readonly [unknown, unknown]> = {
    closedAt: [null, ctx.now],
    closeReason: [null, input.reason],
  };

  let ended: { endKind: EndKind; endedDate: LocalDate } | null = null;
  if (from === "CONTRACTED") {
    if (!jobDone) throw new ServiceError("A signed file is ended from its stage, with the kind of ending.");
    const endedDate = (input.endedDate ?? ctx.today) as LocalDate;
    if (!isDate(endedDate)) throw new ServiceError("Enter a valid date.");
    ended = { endKind: "JOB_DONE", endedDate };
    Object.assign(set, {
      stage: "CONTRACT_ENDED",
      stageChangedAt: ctx.now,
      endedDate,
      endKind: "JOB_DONE",
      endNote: note,
    } satisfies Updateable<DB["File"]>);
    changes.stage = [from, "CONTRACT_ENDED"];
  }

  await ex.updateTable("File").set(set).where("id", "=", file.id).execute();
  if (ended) {
    await ex
      .insertInto("FileStageEvent")
      .values({
        id: newId(),
        fileId: file.id,
        fromStage: from,
        toStage: "CONTRACT_ENDED",
        changedAt: ctx.now,
        changedByUserId: ctx.userId,
        note,
        createdAt: ctx.now,
      })
      .execute();
  }
  await logChange(ex, ctx, {
    owner: "CLIENTS",
    action: "STATUS_CHANGE",
    entity: "File",
    entityId: file.id,
    entityLabel: file.number,
    subject: clientSubject(record.client),
    changes,
    context: { formKind: record.kind, closeReason: input.reason, ...(note ? { note } : {}) },
  });

  // A renewal closed before it was signed gives the contract it renewed its decision back (INT-9).
  if (!ended && file.renewalOfFileId) {
    const renewed = await ex.selectFrom("File").selectAll().where("id", "=", file.renewalOfFileId).executeTakeFirst();
    if (renewed && renewed.renewalDecision === "WILL_RENEW") {
      await ex
        .updateTable("File")
        .set({ renewalDecision: null, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", renewed.id)
        .execute();
      await logChange(ex, ctx, {
        owner: "CLIENTS",
        action: "UPDATE",
        entity: "File",
        entityId: renewed.id,
        entityLabel: renewed.number,
        subject: clientSubject(record.client),
        changes: { renewalDecision: ["WILL_RENEW", null] },
        context: { renewalClosed: file.number },
      });
    }
  }

  if (ended) await emit(ex, ctx, "file.ended", { fileId: file.id, ...ended });
  return { fileId: file.id, closed: true };
}

// ── Contracts past their end date ────────────────────────────────────────────

/**
 * The day after «تاريخ النهاية», a live contract is at «انتهاء التعاقد»
 * (DESIGN.md section 17, the first of the four endings): `endedDate` is its end
 * date, `endKind` RENEWED when the contract that renews it is already
 * «متعاقد», else EXPIRED, and `closedAt` stays empty for Money's list of
 * contracts to renew. Run by the day-start job as the program; it catches up
 * on every contract that ended while the program was closed, and a second run
 * changes nothing.
 */
export async function endExpiredContracts(
  ex: Executor,
  ctx: ServiceContext,
  input: { upTo: LocalDate },
): Promise<{ ended: string[] }> {
  const expired = await ex
    .selectFrom("File")
    .select(["id", "number", "endDate", "clientId", "formKind"])
    .where("stage", "=", "CONTRACTED")
    .where("closedAt", "is", null)
    .where("deletedAt", "is", null)
    .where("serviceType", "=", "CONTRACT")
    .where("endDate", "is not", null)
    .where("endDate", "<", input.upTo)
    .orderBy("endDate")
    .orderBy("id")
    .execute();
  const ended: string[] = [];
  for (const file of expired) {
    const endedDate = file.endDate as LocalDate;
    const successor = await ex
      .selectFrom("File")
      .select("id")
      .where("renewalOfFileId", "=", file.id)
      .where("deletedAt", "is", null)
      .where("stage", "in", ["CONTRACTED", "CONTRACT_ENDED"])
      .executeTakeFirst();
    const endKind: EndKind = successor ? "RENEWED" : "EXPIRED";
    await ex
      .updateTable("File")
      .set({
        stage: "CONTRACT_ENDED",
        stageChangedAt: ctx.now,
        endedDate,
        endKind,
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", file.id)
      .where("stage", "=", "CONTRACTED")
      .execute();
    await ex
      .insertInto("FileStageEvent")
      .values({
        id: newId(),
        fileId: file.id,
        fromStage: "CONTRACTED",
        toStage: "CONTRACT_ENDED",
        changedAt: ctx.now,
        changedByUserId: ctx.userId,
        note: null,
        createdAt: ctx.now,
      })
      .execute();
    await logChange(ex, ctx, {
      owner: "CLIENTS",
      action: "STATUS_CHANGE",
      entity: "File",
      entityId: file.id,
      entityLabel: file.number,
      subject: { kind: "CLIENT", id: file.clientId },
      changes: { stage: ["CONTRACTED", "CONTRACT_ENDED"], endKind: [null, endKind], endedDate: [null, endedDate] },
      context: { formKind: file.formKind, cause: "day-start" },
    });
    await emit(ex, ctx, "file.ended", { fileId: file.id, endKind, endedDate });
    ended.push(file.id);
  }
  return { ended };
}

// ── What the screens call ────────────────────────────────────────────────────

export const registerFileAction = action(registerFile, { revalidate: [...FILES_PATHS] });
export const saveFileFormAction = action(saveFileForm, { revalidate: [...FILES_PATHS] });
export const moveFileStageAction = action(moveFileStage, { revalidate: [...FILES_PATHS] });
export const closeFileAction = action(closeFile, { revalidate: [...FILES_PATHS] });
