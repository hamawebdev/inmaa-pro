import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { nextNumbers } from "@/lib/numbering";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, localTime, minutes, type LocalDate } from "@/lib/units";

import { weekdayOf, weekdaysOfCodes, type IsoDate } from "../rules/calendar";
import {
  contractVisits,
  onDemandVisits,
  slotsFromForm,
  visitKey,
  visitsToCreate,
  type FormTimes,
  type PlannedVisit,
  type Programme,
  type ProgrammeSettings,
  type WeeklySlot,
} from "../rules/visit-dates";
import type { DayPeriod, DurationUnit, ProgrammeWarning, VisitStatus } from "../validators/option-codes";
import { readFileForScheduling, readSiteForOrder, type FileForScheduling } from "./upstream";
import { seedTasksFromServices } from "./tasks";

/**
 * A file's programme and its visits (#7).
 *
 * When a file becomes «متعاقد», Clients emits `file.contracted` and this
 * folder makes the file's programme row, its weekly slots from «أيام
 * التنفيذ», then every visit between «تاريخ البداية» and «تاريخ النهاية»
 * (events.ts). The same functions serve the preview shown before, and the
 * button on File › الزيارات.
 *
 * Running the generation again never makes a visit twice: a visit is keyed by
 * its slot and its programme date (`slotDate`), which never moves, and the
 * database refuses a second one. Visits that exist are never touched here.
 */

export const VISITS_PATH = "/dashboard/visits";

/** Statuses of a visit that is still to happen. */
export const OPEN_STATUSES: readonly VisitStatus[] = ["CONFIRMED", "AWAITING_CONFIRMATION"];

/** What a generation did, or would do. */
export interface GenerationSummary {
  /** Visits the programme calls for in the range. */
  planned: number;
  /** Of those, the visits written now (always 0 in a preview). */
  created: number;
  /** Of those, the visits that do not exist yet. */
  missing: number;
  /** The file is «متعاقد» and open: its visits may be made. */
  canGenerate: boolean;
  firstDate: IsoDate | null;
  lastDate: IsoDate | null;
  /** Visits per weekday, Saturday first. */
  perWeekday: number[];
  warnings: ProgrammeWarning[];
}

// ── Settings ────────────────────────────────────────────────────────────────

export async function programmeSettings(ex: Executor): Promise<ProgrammeSettings> {
  const settings = await getSettings(ex, ["work.days", "work.restDay", "work.period.morning", "work.period.evening"]);
  const [restWeekday] = weekdaysOfCodes([settings["work.restDay"]]);
  return {
    workingWeekdays: weekdaysOfCodes(settings["work.days"]),
    restWeekday: restWeekday ?? 6,
    morning: settings["work.period.morning"],
    evening: settings["work.period.evening"],
  };
}

function formTimesOf(file: FileForScheduling): FormTimes {
  return {
    period: (file.period as DayPeriod | null) ?? null,
    windowFrom: file.periodFrom,
    windowTo: file.periodTo,
    arrivalTime: file.arrivalTime,
    departureTime: file.departureTime,
  };
}

// ── The programme row ───────────────────────────────────────────────────────

/** The file's own row (the two scheduling switches and the inspection plan), created with the defaults. */
export async function ensureProgramme(
  ex: Executor,
  ctx: ServiceContext,
  file: Pick<FileForScheduling, "id" | "serviceType" | "startDate">,
): Promise<{ id: string }> {
  const found = await ex.selectFrom("FileProgramme").select("id").where("fileId", "=", file.id).executeTakeFirst();
  if (found) return found;
  const settings = await getSettings(ex, [
    "inspection.defaultFrequency.contract",
    "inspection.defaultFrequency.onDemand",
  ]);
  const frequency =
    file.serviceType === "CONTRACT"
      ? settings["inspection.defaultFrequency.contract"]
      : settings["inspection.defaultFrequency.onDemand"];
  const id = newId();
  await ex
    .insertInto("FileProgramme")
    .values({
      id,
      fileId: file.id,
      inspectionFrequency: frequency,
      inspectionStartDate: frequency === "NONE" ? null : (file.startDate ?? ctx.today),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  return { id };
}

// ── Slots ───────────────────────────────────────────────────────────────────

async function activeSlots(ex: Executor, fileId: string): Promise<WeeklySlot[]> {
  const rows = await ex
    .selectFrom("FileSlot")
    .select(["id", "dayOfWeek", "startTime", "durationMin", "workersNeeded", "validFrom", "validTo"])
    .where("fileId", "=", fileId)
    .where("isActive", "=", 1)
    .where("deletedAt", "is", null)
    .orderBy("dayOfWeek")
    .orderBy("startTime")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    weekday: row.dayOfWeek,
    startTime: row.startTime,
    durationMin: row.durationMin,
    workersNeeded: row.workersNeeded,
    validFrom: row.validFrom,
    validTo: row.validTo,
  }));
}

function formSlots(file: FileForScheduling, settings: ProgrammeSettings): WeeklySlot[] {
  return slotsFromForm(
    { ...formTimesOf(file), executionWeekdays: weekdaysOfCodes(file.executionDays), workersCount: file.workersCount },
    settings,
  );
}

/** The slots of a contract: the stored ones, or one per ticked day of «أيام التنفيذ», written now. */
async function ensureSlots(
  ex: Executor,
  ctx: ServiceContext,
  file: FileForScheduling,
  settings: ProgrammeSettings,
): Promise<WeeklySlot[]> {
  const stored = await activeSlots(ex, file.id);
  if (stored.length > 0) return stored;
  const fromForm = formSlots(file, settings);
  const written: WeeklySlot[] = [];
  for (const slot of fromForm) {
    const id = newId();
    await ex
      .insertInto("FileSlot")
      .values({
        id,
        fileId: file.id,
        dayOfWeek: slot.weekday,
        startTime: localTime(slot.startTime),
        durationMin: minutes(slot.durationMin),
        workersNeeded: slot.workersNeeded,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    written.push({ ...slot, id });
  }
  return written;
}

// ── The programme of a file ─────────────────────────────────────────────────

/** The visits the file's form calls for, before any range is applied. */
function plannedProgramme(
  file: FileForScheduling,
  slots: readonly WeeklySlot[],
  settings: ProgrammeSettings,
): Programme {
  if (file.serviceType === "CONTRACT") {
    if (!file.startDate || !file.endDate) return { visits: [], warnings: ["MISSING_DATES"] };
    return contractVisits(
      {
        startDate: file.startDate,
        endDate: file.endDate,
        slots,
        visitsPerWeek: file.visitsPerWeek,
        windowFrom: file.periodFrom,
        windowTo: file.periodTo,
      },
      settings,
    );
  }
  if (!file.startDate) return { visits: [], warnings: ["MISSING_DATES"] };
  return onDemandVisits(
    {
      ...formTimesOf(file),
      startDate: file.startDate,
      endDate: file.endDate,
      executionWeekdays: weekdaysOfCodes(file.executionDays),
      durationValue: file.executionDuration,
      durationUnit: (file.executionDurationUnit as DurationUnit | null) ?? null,
      workersCount: file.workersCount,
    },
    settings,
  );
}

/** Days and hours the site allows (its office block), against the programme. */
function siteWarnings(
  visits: readonly PlannedVisit[],
  site: { allowedDays: string[]; allowedFrom: string | null; allowedTo: string | null } | null,
): ProgrammeWarning[] {
  if (!site) return [];
  const warnings: ProgrammeWarning[] = [];
  const allowed = new Set(weekdaysOfCodes(site.allowedDays));
  if (allowed.size > 0 && visits.some((visit) => !allowed.has(weekdayOf(visit.date)))) {
    warnings.push("OUTSIDE_SITE_DAYS");
  }
  if (site.allowedFrom && site.allowedTo) {
    const from = site.allowedFrom;
    const to = site.allowedTo;
    const outside = visits.some((visit) => {
      const end = minutesFromStart(visit.startTime, visit.durationMin);
      return visit.startTime < from || end > to;
    });
    if (outside) warnings.push("OUTSIDE_SITE_HOURS");
  }
  return warnings;
}

function minutesFromStart(start: string, durationMin: number): string {
  const [hours, mins] = start.split(":").map(Number);
  const total = hours * 60 + mins + durationMin;
  // A visit running past midnight ends "after" any allowed hour of the same day.
  if (total >= 1440) return "24:00";
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function inRange(visits: readonly PlannedVisit[], file: FileForScheduling, range: { from?: IsoDate; to?: IsoDate }) {
  const last = [range.to, file.endedDate].filter((date): date is string => Boolean(date)).sort()[0];
  return visits.filter((visit) => (!range.from || visit.date >= range.from) && (!last || visit.date <= last));
}

function summarise(
  visits: readonly PlannedVisit[],
  outcome: { created: number; missing: number; canGenerate: boolean },
  warnings: ProgrammeWarning[],
): GenerationSummary {
  const perWeekday = [0, 0, 0, 0, 0, 0, 0];
  for (const visit of visits) perWeekday[weekdayOf(visit.date)] += 1;
  const dates = visits.map((visit) => visit.date).sort();
  return {
    planned: visits.length,
    ...outcome,
    firstDate: dates[0] ?? null,
    lastDate: dates[dates.length - 1] ?? null,
    perWeekday,
    warnings: [...new Set(warnings)],
  };
}

async function existingKeys(ex: Executor, fileId: string): Promise<Set<string>> {
  const rows = await ex
    .selectFrom("Visit")
    .select(["fileSlotId", "slotDate"])
    .where("fileId", "=", fileId)
    .where("origin", "in", ["CONTRACT", "ON_DEMAND"])
    .where((eb) => eb.or([eb("statusReason", "is", null), eb("statusReason", "!=", "PROGRAMME_CHANGED")]))
    .where("slotDate", "is not", null)
    .execute();
  return new Set(rows.map((row) => visitKey({ slotId: row.fileSlotId, date: row.slotDate as string })));
}

// ── Who a new visit is given to ─────────────────────────────────────────────

interface StandingSeat {
  workerId: string;
  role: string;
  fileSlotId: string | null;
  validFrom: string;
  validTo: string | null;
  sortOrder: number;
}

/** The file's standing team: LEADER and MEMBER rows naming a worker (an ALTERNATE only replaces). */
async function standingTeam(ex: Executor, fileId: string): Promise<StandingSeat[]> {
  const rows = await ex
    .selectFrom("FileAssignment")
    .innerJoin("StaffMember", "StaffMember.id", "FileAssignment.workerId")
    .select([
      "FileAssignment.workerId",
      "FileAssignment.fileSlotId",
      "FileAssignment.validFrom",
      "FileAssignment.validTo",
      "FileAssignment.sortOrder",
      "StaffMember.role",
    ])
    .where("FileAssignment.fileId", "=", fileId)
    .where("FileAssignment.deletedAt", "is", null)
    .where("FileAssignment.role", "in", ["LEADER", "MEMBER"])
    .where("FileAssignment.workerId", "is not", null)
    .orderBy("FileAssignment.sortOrder")
    .execute();
  return rows.map((row) => ({
    workerId: row.workerId as string,
    role: row.role ?? "CLEANER",
    fileSlotId: row.fileSlotId,
    validFrom: row.validFrom,
    validTo: row.validTo,
    sortOrder: row.sortOrder,
  }));
}

/** Absences that block a seat (RECORDED or APPROVED) of these workers between two dates. */
async function blockingAbsences(ex: Executor, workerIds: readonly string[], from: IsoDate, to: IsoDate) {
  if (workerIds.length === 0) return [];
  return ex
    .selectFrom("WorkerAbsence")
    .select(["workerId", "startDate", "endDate"])
    .where("workerId", "in", [...new Set(workerIds)])
    .where("status", "in", ["RECORDED", "APPROVED"])
    .where("startDate", "<=", localDate(to))
    .where("endDate", ">=", localDate(from))
    .execute();
}

/** The zone's supervisor on a date (#36): the latest assignment that covers the date. */
async function zoneSupervisors(ex: Executor, zoneId: string | null) {
  if (!zoneId) return [];
  return ex
    .selectFrom("SupervisorAssignment")
    .select(["supervisorEmployeeId", "fromDate", "toDate"])
    .where("zoneId", "=", zoneId)
    .orderBy("fromDate", "desc")
    .execute();
}

function supervisorOn(rows: Awaited<ReturnType<typeof zoneSupervisors>>, date: IsoDate): string | null {
  return rows.find((row) => row.fromDate <= date && (!row.toDate || row.toDate >= date))?.supervisorEmployeeId ?? null;
}

// ── Generation ──────────────────────────────────────────────────────────────

/**
 * Creates the slots if there are none, then every missing visit of the file in
 * the range. The engine of `generateVisits` and of the `file.contracted`
 * handler; it checks no permission (the handler runs in Clients' action).
 */
export async function generateFileVisits(
  ex: Executor,
  ctx: ServiceContext,
  fileId: string,
  range: { from?: IsoDate; to?: IsoDate } = {},
): Promise<GenerationSummary> {
  const file = await readFileForScheduling(ex, fileId);
  if (!file) throw new Error(`operations: file ${fileId} was not found`);
  const settings = await programmeSettings(ex);
  await ensureProgramme(ex, ctx, file);
  await seedTasksFromServices(ex, ctx, file.id);

  const slots = file.serviceType === "CONTRACT" ? await ensureSlots(ex, ctx, file, settings) : [];
  const programme = plannedProgramme(file, slots, settings);
  const planned = inRange(programme.visits, file, range);
  const site = await readSiteForOrder(ex, { siteId: file.siteId, securityTicked: false });
  const warnings = [...programme.warnings, ...siteWarnings(planned, site)];

  const toCreate = visitsToCreate(planned, await existingKeys(ex, file.id));
  if (toCreate.length === 0) return summarise(planned, { created: 0, missing: 0, canGenerate: true }, warnings);

  const dates = toCreate.map((visit) => visit.date).sort();
  const team = await standingTeam(ex, file.id);
  const absences = await blockingAbsences(
    ex,
    team.map((seat) => seat.workerId),
    dates[0],
    dates[dates.length - 1],
  );
  const supervisors = await zoneSupervisors(ex, site?.zoneId ?? null);
  const origin = file.serviceType === "CONTRACT" ? "CONTRACT" : "ON_DEMAND";

  // One block of numbers per calendar year: the visit number's year is its date's (A6).
  const byYear = new Map<string, PlannedVisit[]>();
  for (const visit of [...toCreate].sort((a, b) =>
    a.date === b.date ? a.startTime.localeCompare(b.startTime) : a.date < b.date ? -1 : 1,
  )) {
    const year = visit.date.slice(0, 4);
    byYear.set(year, [...(byYear.get(year) ?? []), visit]);
  }

  for (const visits of byYear.values()) {
    const numbers = await nextNumbers(ex, ctx, "VISIT", { date: localDate(visits[0].date), count: visits.length });
    for (const [index, visit] of visits.entries()) {
      const seats = team
        .filter(
          (seat) =>
            (seat.fileSlotId === null || seat.fileSlotId === visit.slotId) &&
            seat.validFrom <= visit.date &&
            (!seat.validTo || seat.validTo >= visit.date) &&
            !absences.some(
              (absence) =>
                absence.workerId === seat.workerId && absence.startDate <= visit.date && absence.endDate >= visit.date,
            ),
        )
        .filter((seat, position, all) => all.findIndex((other) => other.workerId === seat.workerId) === position)
        .slice(0, visit.workersNeeded);
      const status: VisitStatus =
        origin === "CONTRACT" && seats.length >= visit.workersNeeded ? "CONFIRMED" : "AWAITING_CONFIRMATION";
      const id = newId();
      await ex
        .insertInto("Visit")
        .values({
          id,
          numberSeq: numbers[index].seq,
          numberYear: numbers[index].year,
          number: numbers[index].display,
          fileId: file.id,
          fileSlotId: visit.slotId,
          origin,
          slotDate: localDate(visit.date),
          visitDate: localDate(visit.date),
          plannedStartTime: localTime(visit.startTime),
          plannedDurationMin: minutes(visit.durationMin),
          workersNeeded: visit.workersNeeded,
          zoneId: site?.zoneId ?? null,
          supervisorEmployeeId: supervisorOn(supervisors, visit.date),
          status,
          statusChangedAt: ctx.now,
          statusChangedByUserId: ctx.userId,
          createdAt: ctx.now,
          updatedAt: ctx.now,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        })
        .execute();
      for (const seat of seats) {
        await ex
          .insertInto("VisitWorker")
          .values({
            id: newId(),
            visitId: id,
            workerId: seat.workerId,
            role: seat.role,
            seatStatus: "ASSIGNED",
            createdAt: ctx.now,
            updatedAt: ctx.now,
            createdByUserId: ctx.userId,
            updatedByUserId: ctx.userId,
          })
          .execute();
      }
    }
  }

  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CREATE",
    entity: "File",
    entityId: file.id,
    entityLabel: file.number,
    context: { visitsCreated: toCreate.length, firstDate: dates[0], lastDate: dates[dates.length - 1] },
  });
  return summarise(planned, { created: toCreate.length, missing: 0, canGenerate: true }, warnings);
}

/** Writes nothing: what generating the file's visits would give, and what is wrong with it. */
export async function previewVisitGeneration(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<GenerationSummary> {
  requireSection(ctx, "REQUESTS", "READ");
  const file = await readFileForScheduling(ex, input.fileId);
  if (!file) throw new ServiceError("This client file does not exist.");
  const settings = await programmeSettings(ex);
  const stored = file.serviceType === "CONTRACT" ? await activeSlots(ex, file.id) : [];
  const slots = file.serviceType === "CONTRACT" && stored.length === 0 ? formSlots(file, settings) : stored;
  const programme = plannedProgramme(file, slots, settings);
  const planned = inRange(programme.visits, file, {});
  const site = await readSiteForOrder(ex, { siteId: file.siteId, securityTicked: false });
  const missing = visitsToCreate(planned, await existingKeys(ex, file.id));
  const stage = await ex.selectFrom("File").select(["stage", "closedAt"]).where("id", "=", file.id).executeTakeFirst();
  return summarise(
    planned,
    { created: 0, missing: missing.length, canGenerate: stage?.stage === "CONTRACTED" && !stage.closedAt },
    [...programme.warnings, ...siteWarnings(planned, site)],
  );
}

/** The button on File › الزيارات: every missing visit of a contracted file. */
export async function generateVisits(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; from?: IsoDate; to?: IsoDate },
): Promise<GenerationSummary> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const file = await ex
    .selectFrom("File")
    .select(["stage", "closedAt"])
    .where("id", "=", input.fileId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!file) throw new ServiceError("This client file does not exist.");
  if (file.stage !== "CONTRACTED" || file.closedAt) {
    throw new ServiceError("Visits are made for a contracted file only.");
  }
  return generateFileVisits(ex, ctx, input.fileId, { from: input.from, to: input.to });
}

// ── Ending ──────────────────────────────────────────────────────────────────

/**
 * Cancels the file's programme visits still to happen after a date (the
 * contract ended). A make-up or redo visit already placed is left, and so is
 * anything printed in progress, done, postponed or cancelled.
 */
export async function cancelFutureVisits(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; afterDate: LocalDate; reason: string; note?: string | null },
): Promise<{ cancelled: number }> {
  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "number", "status"])
    .where("fileId", "=", input.fileId)
    .where("origin", "in", ["CONTRACT", "ON_DEMAND"])
    .where("status", "in", [...OPEN_STATUSES])
    .where("visitDate", ">", input.afterDate)
    .orderBy("visitDate")
    .execute();
  if (visits.length === 0) return { cancelled: 0 };
  await ex
    .updateTable("Visit")
    .set({
      status: "CANCELLED",
      statusReason: input.reason,
      statusNote: input.note ?? null,
      statusChangedAt: ctx.now,
      statusChangedByUserId: ctx.userId,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where(
      "id",
      "in",
      visits.map((visit) => visit.id),
    )
    .execute();
  const file = await ex.selectFrom("File").select("number").where("id", "=", input.fileId).executeTakeFirst();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    entity: "File",
    entityId: input.fileId,
    entityLabel: file?.number,
    changes: { visitStatus: ["CONFIRMED / AWAITING_CONFIRMATION", "CANCELLED"] },
    context: { statusReason: input.reason, visits: visits.map((visit) => visit.number) },
  });
  return { cancelled: visits.length };
}

export const previewVisitGenerationQuery = query(previewVisitGeneration);
export const generateVisitsAction = action(generateVisits, { revalidate: [VISITS_PATH, "/dashboard/files"] });
