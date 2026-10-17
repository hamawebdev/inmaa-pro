import { requireSection } from "@/lib/access/session";
import { phoneText } from "@/lib/text/phone";
import { logDisclose } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, type LocalDate } from "@/lib/units";
import { staffName } from "@/lib/text/names";

import { addDays, weekdayOf, weekdaysOfCodes } from "../rules/calendar";
import { endTimeOf } from "../rules/visit-dates";
import { PROBLEM_KIND_WORD } from "../sheets/print-labels";
import type { CallListData, CallListRow, DaySheetVisit, SupervisorDaySheetData } from "../sheets/sheet-data";
import type { ProblemKind } from "../validators/option-codes";
import { readSiteForOrder } from "./upstream";

/**
 * The two sheets the office prints for a day besides the orders: a
 * supervisor's day (#36) and the client call list (#16).
 */

const fullName = staffName;

/** The visits of a day that still exist for anyone: not cancelled, not dropped by a programme change. */
function dayVisits(ex: Executor, date: LocalDate) {
  return ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.fileId",
      "Visit.origin",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "Visit.workersNeeded",
      "Visit.zoneId",
      "Visit.supervisorEmployeeId",
      "Visit.vehicleId",
      "Visit.planChangedAt",
      "Visit.isManuallyEdited",
      "File.siteId",
      "File.serviceType",
      "File.securityInstructions",
      "File.clientId",
      "Client.name as clientName",
      "Client.phone1 as clientPhone",
    ])
    .where("Visit.visitDate", "=", date)
    .where("Visit.status", "not in", ["CANCELLED", "POSTPONED"])
    .orderBy("Visit.plannedStartTime")
    .orderBy("Visit.number");
}

async function seatsOf(ex: Executor, visitIds: readonly string[]) {
  if (visitIds.length === 0) return [];
  return ex
    .selectFrom("VisitWorker")
    .innerJoin("StaffMember", "StaffMember.id", "VisitWorker.workerId")
    .select([
      "VisitWorker.id",
      "VisitWorker.visitId",
      "VisitWorker.seatStatus",
      "VisitWorker.replacesVisitWorkerId",
      "VisitWorker.createdAt",
      "VisitWorker.workerId",
      "StaffMember.number",
      "StaffMember.firstName",
      "StaffMember.lastName",
      "StaffMember.phone",
    ])
    .where("VisitWorker.visitId", "in", [...visitIds])
    .orderBy("VisitWorker.createdAt")
    .execute();
}

// ── A supervisor's day ──────────────────────────────────────────────────────

export async function getSupervisorDaySheet(
  ex: Executor,
  ctx: ServiceContext,
  input: { supervisorId: string; date: LocalDate },
): Promise<SupervisorDaySheetData> {
  requireSection(ctx, "REQUESTS", "READ");
  const supervisor = await ex
    .selectFrom("StaffMember")
    .select(["firstName", "lastName"])
    .where("id", "=", input.supervisorId)
    .executeTakeFirst();
  if (!supervisor) throw new ServiceError("This supervisor does not exist.");

  const visits = await dayVisits(ex, input.date).where("Visit.supervisorEmployeeId", "=", input.supervisorId).execute();
  const seats = await seatsOf(
    ex,
    visits.map((visit) => visit.id),
  );
  const zoneIds = await ex
    .selectFrom("SupervisorAssignment")
    .select("zoneId")
    .where("supervisorEmployeeId", "=", input.supervisorId)
    .where("zoneId", "is not", null)
    .where("fromDate", "<=", input.date)
    .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">=", input.date)]))
    .execute();
  const zoneNames = await ex
    .selectFrom("Zone")
    .select(["id", "name"])
    .where("id", "in", [
      "",
      ...new Set([
        ...zoneIds.map((row) => row.zoneId as string),
        ...visits.map((visit) => visit.zoneId).filter((id): id is string => Boolean(id)),
      ]),
    ])
    .orderBy("name")
    .execute();
  const vehicles = await ex
    .selectFrom("Vehicle")
    .select(["id", "label", "plateNumber"])
    .where("id", "in", ["", ...visits.map((visit) => visit.vehicleId).filter((id): id is string => Boolean(id))])
    .execute();

  const sheetVisits: DaySheetVisit[] = [];
  const siteLabels = new Map<string, string>();
  for (const visit of visits) {
    const site = await readSiteForOrder(ex, { siteId: visit.siteId, securityTicked: visit.securityInstructions === 1 });
    const label = site?.commonName ?? site?.address ?? visit.clientName;
    siteLabels.set(visit.id, label);
    const vehicle = vehicles.find((candidate) => candidate.id === visit.vehicleId);
    sheetVisits.push({
      startTime: visit.plannedStartTime,
      endTime: endTimeOf({ startTime: visit.plannedStartTime, durationMin: visit.plannedDurationMin }),
      orderNumber: visit.number,
      site: label,
      address: site ? [site.address, site.communeName].filter(Boolean).join("، ") : null,
      contactName: site?.personOnSite?.name ?? null,
      contactPhone: site?.personOnSite?.phone ? phoneText(site.personOnSite.phone) : null,
      team: seats
        .filter((seat) => seat.visitId === visit.id && seat.seatStatus === "ASSIGNED")
        .map((seat) => fullName(seat)),
      vehicle: vehicle ? `${vehicle.label} ${vehicle.plateNumber}` : null,
    });
  }

  const absences = seats
    .filter((seat) => seat.seatStatus === "ABSENT")
    .map((seat) => {
      const visit = visits.find((candidate) => candidate.id === seat.visitId);
      const replacement = seats.find(
        (other) => other.replacesVisitWorkerId === seat.id && other.seatStatus === "ASSIGNED",
      );
      return {
        worker: fullName(seat),
        replacement: replacement ? fullName(replacement) : null,
        site: siteLabels.get(seat.visitId) ?? "",
        startTime: visit?.plannedStartTime ?? null,
      };
    });

  const problems = await ex
    .selectFrom("ProblemReport")
    .select(["fileId", "kind", "details"])
    .where("fileId", "in", ["", ...new Set(visits.map((visit) => visit.fileId))])
    .where("status", "!=", "CLOSED")
    .where("deletedAt", "is", null)
    .orderBy("occurredDate")
    .execute();
  const openIssues = problems.map((problem) => {
    const visit = visits.find((candidate) => candidate.fileId === problem.fileId);
    const word = PROBLEM_KIND_WORD[problem.kind as ProblemKind] ?? problem.kind;
    return {
      site: (visit && siteLabels.get(visit.id)) ?? "",
      text: problem.details ? `${word}: ${problem.details}` : word,
    };
  });

  const phones = new Map<string, { name: string; phone: string }>();
  for (const seat of seats.filter((candidate) => candidate.seatStatus === "ASSIGNED")) {
    phones.set(fullName(seat), { name: fullName(seat), phone: phoneText(seat.phone) });
  }

  return {
    supervisorName: fullName(supervisor),
    date: input.date,
    zones: zoneNames.map((zone) => zone.name),
    visits: sheetVisits,
    absences,
    // Inspections and corrective tasks join this sheet with the quality round.
    inspections: [],
    correctiveTasks: [],
    openIssues,
    workerPhones: [...phones.values()],
  };
}

// ── The client call list ────────────────────────────────────────────────────

/** The next day the centre works after a date (on الخميس, السبت). */
export async function nextWorkingDay(ex: Executor, date: LocalDate): Promise<LocalDate> {
  const settings = await getSettings(ex, ["work.days"]);
  const working = new Set(weekdaysOfCodes(settings["work.days"]));
  let next = addDays(date, 1);
  for (let step = 0; step < 7 && working.size > 0 && !working.has(weekdayOf(next)); step += 1) next = addDays(next, 1);
  return localDate(next);
}

/**
 * The calls to make about the visits of a day. With the mode «الأولى
 * والمتغيرة» (the default): every on-demand visit, the first visit of each
 * contract, and any visit whose time or team changed after it was planned.
 */
export async function getCallList(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitsDate: LocalDate },
): Promise<CallListData> {
  requireSection(ctx, "REQUESTS", "READ");
  const settings = await getSettings(ex, ["reminder.mode", "centre.phone"]);
  const visits = await callListVisits(ex, input.visitsDate);
  const supervisors = await ex
    .selectFrom("StaffMember")
    .select(["id", "firstName", "lastName"])
    .where("id", "in", [
      "",
      ...visits.map((visit) => visit.supervisorEmployeeId).filter((id): id is string => Boolean(id)),
    ])
    .execute();

  const rows: CallListRow[] = [];
  for (const { changed, ...visit } of visits) {
    const site = await readSiteForOrder(ex, { siteId: visit.siteId, securityTicked: false });
    const supervisor = supervisors.find((row) => row.id === visit.supervisorEmployeeId);
    const phones = [site?.personOnSite?.phone, visit.clientPhone].filter(
      (phone, index, all): phone is string => Boolean(phone) && all.indexOf(phone) === index,
    );
    rows.push({
      client: site?.commonName ? `${visit.clientName} – ${site.commonName}` : visit.clientName,
      contactName: site?.personOnSite?.name ?? null,
      phones: phones.map(phoneText),
      startTime: visit.plannedStartTime,
      workersCount: visit.workersNeeded,
      supervisorName: supervisor ? fullName(supervisor) : null,
      purpose: changed ? "REPLACEMENT_NOTICE" : "REMINDER",
    });
  }
  return {
    visitsDate: input.visitsDate,
    callDate: ctx.today,
    centrePhone: phoneText(settings["centre.phone"].replace(/\D/g, "")) || settings["centre.phone"],
    rows,
  };
}

/**
 * The visits of a day whose client is called the day before: every visit of a
 * file whose reminder mode is not NONE; with FIRST_AND_CHANGED, a contract's
 * visit only on its first day or when its plan changed.
 */
export async function callListVisits(ex: Executor, visitsDate: LocalDate) {
  const settings = await getSettings(ex, ["reminder.mode"]);
  const visits = await dayVisits(ex, visitsDate).execute();
  const programmes = await ex
    .selectFrom("FileProgramme")
    .select(["fileId", "reminderMode"])
    .where("fileId", "in", ["", ...new Set(visits.map((visit) => visit.fileId))])
    .execute();
  const firstVisits = await ex
    .selectFrom("Visit")
    .select(["fileId", (eb) => eb.fn.min("visitDate").as("firstDate")])
    .where("fileId", "in", ["", ...new Set(visits.map((visit) => visit.fileId))])
    .where("status", "!=", "CANCELLED")
    .groupBy("fileId")
    .execute();
  const kept: Array<(typeof visits)[number] & { changed: boolean }> = [];
  for (const visit of visits) {
    const mode = programmes.find((row) => row.fileId === visit.fileId)?.reminderMode ?? settings["reminder.mode"];
    if (mode === "NONE") continue;
    const first = firstVisits.find((row) => row.fileId === visit.fileId)?.firstDate === visitsDate;
    const changed = visit.planChangedAt !== null || visit.isManuallyEdited === 1;
    if (mode === "FIRST_AND_CHANGED" && visit.serviceType === "CONTRACT" && !first && !changed) continue;
    kept.push({ ...visit, changed });
  }
  return kept;
}

// ── Printing ────────────────────────────────────────────────────────────────

/** A day sheet or a call list went to the printer: both name people (their phones too), so it is logged. */
export async function recordDaySheetPrinted(
  ex: Executor,
  ctx: ServiceContext,
  input: { sheet: "SUPERVISOR_DAY" | "CALL_LIST"; date: LocalDate; supervisorId?: string | null },
): Promise<void> {
  requireSection(ctx, "REQUESTS", "READ");
  // One disclosure per person the sheet names, so that a person's disclosures are found by the subject index.
  const disclose = (entry: { entity: string; entityId?: string; entityLabel: string; subject?: DisclosedSubject }) =>
    logDisclose(ex, ctx, {
      owner: "OPERATIONS",
      action: "PRINT",
      disclosure: "PRINT",
      ...entry,
      context: { sheet: input.sheet, date: input.date },
    });

  if (input.sheet === "CALL_LIST") {
    const visits = await callListVisits(ex, input.date);
    if (visits.length === 0) await disclose({ entity: "Visit", entityLabel: input.date });
    for (const visit of visits) {
      await disclose({
        entity: "Visit",
        entityId: visit.id,
        entityLabel: visit.number,
        subject: { kind: "CLIENT", id: visit.clientId, label: visit.clientName },
      });
    }
    return;
  }

  const supervisorId = input.supervisorId ?? null;
  const supervisor = supervisorId
    ? await ex.selectFrom("StaffMember").select(["id", "number"]).where("id", "=", supervisorId).executeTakeFirst()
    : undefined;
  await disclose({
    entity: "StaffMember",
    entityId: supervisor?.id,
    entityLabel: input.date,
    subject: supervisor ? { kind: "EMPLOYEE", id: supervisor.id, label: supervisor.number } : undefined,
  });
  if (!supervisor) return;
  const visits = await dayVisits(ex, input.date).where("Visit.supervisorEmployeeId", "=", supervisor.id).execute();
  const seats = await seatsOf(
    ex,
    visits.map((visit) => visit.id),
  );
  const clients = new Map(visits.map((visit) => [visit.clientId, visit]));
  for (const [clientId, visit] of clients) {
    await disclose({
      entity: "Visit",
      entityId: visit.id,
      entityLabel: visit.number,
      subject: { kind: "CLIENT", id: clientId, label: visit.clientName },
    });
  }
  const workers = new Map(
    seats.filter((seat) => seat.seatStatus === "ASSIGNED").map((seat) => [seat.workerId, seat] as const),
  );
  for (const [workerId, seat] of workers) {
    await disclose({
      entity: "Visit",
      entityId: seat.visitId,
      entityLabel: input.date,
      subject: { kind: "WORKER", id: workerId, label: seat.number },
    });
  }
}

type DisclosedSubject = { kind: "CLIENT" | "WORKER" | "EMPLOYEE"; id: string; label?: string };

export const getSupervisorDaySheetQuery = query(getSupervisorDaySheet);
export const getCallListQuery = query(getCallList);
export const recordDaySheetPrintedAction = action(recordDaySheetPrinted);
