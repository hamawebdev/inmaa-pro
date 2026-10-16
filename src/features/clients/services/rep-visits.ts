import type { Selectable } from "kysely";

import { listEmployees } from "@/features/people/services/employees";
import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import type { DB } from "@/lib/db/schema";
import { logChange, logCollect } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import type { LocalDate } from "@/lib/units";

import type { Division } from "../validators/option-lists";
import { repVisitSchema, type Interest, type RepVisitInput, type RepVisitValues } from "../validators/rep-visit";

/**
 * «زيارات المندوب التجاري» (plan feature 40): the prospects the sales rep
 * visited, typed in at the office from his notes: who, what came of it, when
 * to call back. A visit that leads to a request becomes a file with its
 * details carried over (`getRepVisitFill`, then `registerFile` with
 * `sourceRepVisitId`), and the visit then names the client it became.
 */

export const REP_VISITS_PATH = "/dashboard/rep-visits";

type RepVisitRow = Selectable<DB["RepVisit"]>;

export interface RepVisitListRow {
  id: string;
  date: string;
  repName: string;
  prospectName: string;
  prospectKind: Division;
  contactName: string | null;
  phone: string | null;
  communeName: string | null;
  interest: Interest | null;
  callBackDate: string | null;
  /** A call-back date reached with no call noted since. */
  callBackDue: boolean;
  clientId: string | null;
}

export interface RepVisitView {
  id: string | null;
  visit: RepVisitValues;
  wilayaCode: string | null;
  clientId: string | null;
  /** The files registered from this visit. */
  files: { id: string; number: string }[];
  reps: { id: string; name: string }[];
}

const staffName = (row: { lastName: string; firstName: string }) => `${row.lastName} ${row.firstName}`.trim();

function valuesOf(row: RepVisitRow): RepVisitValues {
  return {
    date: row.date,
    repEmployeeId: row.repEmployeeId,
    prospectName: row.prospectName,
    prospectKind: row.prospectKind as Division,
    activity: row.activity,
    contactName: row.contactName,
    contactRole: row.contactRole,
    phone: row.phone,
    address: row.address,
    communeId: row.communeId,
    leftProfile: row.leftProfile === 1,
    interest: row.interest as Interest | null,
    outcome: row.outcome,
    callBackDate: row.callBackDate,
    note: row.note,
  };
}

/** The visits, the newest first; `due` keeps those whose call-back day has come. */
export async function listRepVisits(
  ex: Executor,
  ctx: ServiceContext,
  input: { search?: string; due?: boolean } = {},
): Promise<RepVisitListRow[]> {
  requireSection(ctx, "EMPLOYEES", "READ");
  const rows = await ex
    .selectFrom("RepVisit as v")
    .innerJoin("StaffMember as s", "s.id", "v.repEmployeeId")
    .leftJoin("Commune as m", "m.id", "v.communeId")
    .select([
      "v.id",
      "v.date",
      "v.prospectName",
      "v.prospectKind",
      "v.contactName",
      "v.phone",
      "v.interest",
      "v.callBackDate",
      "v.callBackDoneAt",
      "v.clientId",
      "s.lastName",
      "s.firstName",
      "m.nameAr as communeName",
    ])
    .where("v.deletedAt", "is", null)
    .orderBy("v.date", "desc")
    .orderBy("v.createdAt", "desc")
    .execute();
  const typed = (input.search ?? "").trim().toLowerCase();
  return rows
    .map((row) => ({
      id: row.id,
      date: row.date,
      repName: staffName(row),
      prospectName: row.prospectName,
      prospectKind: row.prospectKind as Division,
      contactName: row.contactName,
      phone: row.phone,
      communeName: row.communeName ?? null,
      interest: row.interest as Interest | null,
      callBackDate: row.callBackDate,
      callBackDue:
        row.callBackDate !== null &&
        row.callBackDate <= ctx.today &&
        row.callBackDoneAt === null &&
        row.clientId === null,
      clientId: row.clientId,
    }))
    .filter((row) => !input.due || row.callBackDue)
    .filter(
      (row) =>
        typed === "" ||
        [row.prospectName, row.contactName, row.phone, row.repName].some((text) => text?.toLowerCase().includes(typed)),
    );
}

/** One visit with the reps to choose from; a new one when `repVisitId` is left out. */
export async function getRepVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: { repVisitId?: string | null },
): Promise<RepVisitView> {
  requireSection(ctx, "EMPLOYEES", "READ");
  const employees = await listEmployees(ex, ctx, { activeOnly: true });
  const reps = employees.map((employee) => ({ id: employee.id, name: staffName(employee) }));
  if (!input.repVisitId) {
    return {
      id: null,
      visit: {
        date: ctx.today,
        repEmployeeId: "",
        prospectName: "",
        prospectKind: "ORGANISATION",
        activity: null,
        contactName: null,
        contactRole: null,
        phone: null,
        address: null,
        communeId: null,
        leftProfile: false,
        interest: null,
        outcome: null,
        callBackDate: null,
        note: null,
      },
      wilayaCode: "04",
      clientId: null,
      files: [],
      reps,
    };
  }
  const row = await ex.selectFrom("RepVisit").selectAll().where("id", "=", input.repVisitId).executeTakeFirst();
  if (!row || row.deletedAt !== null) throw new ServiceError("This visit of the sales rep does not exist.");
  const [commune, files] = await Promise.all([
    row.communeId
      ? ex.selectFrom("Commune").select("wilayaCode").where("id", "=", row.communeId).executeTakeFirst()
      : undefined,
    ex
      .selectFrom("File")
      .select(["id", "number"])
      .where("sourceRepVisitId", "=", row.id)
      .where("deletedAt", "is", null)
      .execute(),
  ]);
  return {
    id: row.id,
    visit: valuesOf(row),
    wilayaCode: commune?.wilayaCode ?? "04",
    clientId: row.clientId,
    files,
    reps,
  };
}

/** Saves a visit of the sales rep: a new one, or the one named. Only what changed is written and logged. */
export async function saveRepVisit(
  ex: Executor,
  ctx: ServiceContext,
  input: { repVisitId?: string | null; visit: RepVisitInput },
): Promise<{ repVisitId: string; changed: boolean }> {
  requireSection(ctx, "EMPLOYEES", "WRITE");
  const parsed = repVisitSchema.safeParse(input.visit);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  const visit = parsed.data;
  if (visit.date > ctx.today) throw new ServiceError("A visit cannot be dated after today.");
  const rep = await ex
    .selectFrom("StaffMember")
    .select("id")
    .where("id", "=", visit.repEmployeeId)
    .where("kind", "=", "EMPLOYEE")
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!rep) throw new ServiceError("Choose an employee of the centre.");

  const columns = {
    ...visit,
    date: visit.date as LocalDate,
    callBackDate: visit.callBackDate as LocalDate | null,
    leftProfile: visit.leftProfile ? 1 : 0,
  };
  const log = { owner: "CLIENTS", entity: "RepVisit", entityLabel: visit.prospectName } as const;
  if (input.repVisitId) {
    const before = await ex.selectFrom("RepVisit").selectAll().where("id", "=", input.repVisitId).executeTakeFirst();
    if (!before || before.deletedAt !== null) throw new ServiceError("This visit of the sales rep does not exist.");
    const { set, changes } = changedColumns(before, columns);
    if (!changes) return { repVisitId: before.id, changed: false };
    // A new call-back day is a new call to make.
    const callBackDoneAt = "callBackDate" in set ? null : before.callBackDoneAt;
    await ex
      .updateTable("RepVisit")
      .set({ ...set, callBackDoneAt, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", before.id)
      .execute();
    await logChange(ex, ctx, { ...log, action: "UPDATE", entityId: before.id, changes });
    return { repVisitId: before.id, changed: true };
  }
  const id = newId();
  await ex
    .insertInto("RepVisit")
    .values({
      id,
      ...columns,
      branchId: ctx.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logCollect(ex, ctx, { ...log, action: "CREATE", entityId: id });
  return { repVisitId: id, changed: true };
}

/** The call-back was made: the visit leaves the list of calls to make. */
export async function markRepCallBackDone(
  ex: Executor,
  ctx: ServiceContext,
  input: { repVisitId: string },
): Promise<{ repVisitId: string }> {
  requireSection(ctx, "EMPLOYEES", "WRITE");
  const row = await ex.selectFrom("RepVisit").selectAll().where("id", "=", input.repVisitId).executeTakeFirst();
  if (!row || row.deletedAt !== null) throw new ServiceError("This visit of the sales rep does not exist.");
  if (row.callBackDoneAt !== null) return { repVisitId: row.id };
  await ex
    .updateTable("RepVisit")
    .set({ callBackDoneAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", row.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "CLIENTS",
    action: "UPDATE",
    entity: "RepVisit",
    entityId: row.id,
    entityLabel: row.prospectName,
    changes: { callBackDoneAt: [null, ctx.now] },
  });
  return { repVisitId: row.id };
}

export interface RepVisitFill {
  repVisitId: string;
  division: Division;
  /** Answers of his forms, as `FormValues` keys. */
  values: {
    clientName: string;
    phone?: string;
    address?: string;
    commune?: string;
    wilaya?: string;
    managerName?: string;
  };
}

/** What a new file starts with when it comes from a rep visit (`/dashboard/files/new?repVisit=<id>`). */
export async function getRepVisitFill(
  ex: Executor,
  ctx: ServiceContext,
  input: { repVisitId: string },
): Promise<RepVisitFill> {
  requireSection(ctx, "REQUESTS", "READ");
  const row = await ex.selectFrom("RepVisit").selectAll().where("id", "=", input.repVisitId).executeTakeFirst();
  if (!row || row.deletedAt !== null) throw new ServiceError("This visit of the sales rep does not exist.");
  const commune = row.communeId
    ? await ex.selectFrom("Commune").select(["nameAr", "wilayaCode"]).where("id", "=", row.communeId).executeTakeFirst()
    : undefined;
  const values: RepVisitFill["values"] = { clientName: row.prospectName };
  if (row.phone) values.phone = row.phone;
  if (row.address) values.address = row.address;
  if (commune) {
    values.commune = commune.nameAr;
    values.wilaya = commune.wilayaCode;
  }
  if (row.contactName && row.prospectKind === "ORGANISATION") values.managerName = row.contactName;
  return { repVisitId: row.id, division: row.prospectKind as Division, values };
}

export const listRepVisitsQuery = query(listRepVisits);
export const getRepVisitQuery = query(getRepVisit);
export const getRepVisitFillQuery = query(getRepVisitFill);
export const saveRepVisitAction = action(saveRepVisit, { revalidate: [REP_VISITS_PATH] });
export const markRepCallBackDoneAction = action(markRepCallBackDone, { revalidate: [REP_VISITS_PATH] });
