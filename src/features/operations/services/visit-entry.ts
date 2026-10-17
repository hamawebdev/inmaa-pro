import { requireCapability, requireSection } from "@/lib/access/session";
import type {
  CommuneRow,
  FileRow,
  SiteRow,
  StaffMemberRow,
  VisitReportRow,
  VisitRow,
  VisitWorkerRow,
  ZoneRow,
} from "@/lib/db/models";
import { hydrate, newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange, logCollect, logErase } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, localTime, minutes } from "@/lib/units";

import {
  addDays,
  datesBetween,
  minutesFromTo,
  minutesNear,
  minutesOf,
  placedStart,
  weekStartOf,
  type IsoDate,
} from "../rules/calendar";
import { endTimeOf } from "../rules/visit-dates";
import type { Seat } from "../rules/working-time";
import type { EntryState, ProblemKind, VisitStatus } from "../validators/option-codes";
import {
  missingForComplete,
  presenceProofOf,
  RETURNED_WORKER_TIMES,
  returnedOrderSchema,
  weakestPresenceProof,
  type ReturnedOrderValues,
} from "../validators/returned-order";
import type {
  VisitEntryChecklistItem,
  VisitEntryData,
  VisitEntryReport,
  VisitEntryWorker,
} from "../components/visit-entry/visit-entry-data";
import { refuseOverlappingAbsence } from "./absences";
import { OPEN_STATUSES, VISITS_PATH } from "./programme";
import { checklistOf, freezeChecklist, lineForKey } from "./tasks";

/**
 * The returned order (#12–#15): the office types the paper the team brought
 * back, in one pass and one Save — the times and the contact's initials per
 * worker, the tick lines, the worker's notes and problem, completion, the
 * client's sign-off and rating.
 *
 * A complete entry decides the visit: «منفذة», or «مشكلة» when the work was
 * not done, and tells Money (`visit.signedOff`). A partial entry keeps what was
 * typed; an arrival typed makes the visit «جارية».
 */

const blankToNull = (text: string) => (text.trim() === "" ? null : text.trim());
const bool = (value: boolean | null) => (value === null ? null : value ? 1 : 0);

async function visitOf(ex: Executor, visitId: string) {
  const visit = await ex.selectFrom("Visit").selectAll().where("id", "=", visitId).executeTakeFirst();
  if (!visit) throw new ServiceError("This visit does not exist.");
  return visit;
}

// ── Reading ─────────────────────────────────────────────────────────────────

/** A worker's other seats in the week of the visit, as worked or as planned, for the working-time notes. */
async function weekSeats(ex: Executor, workerId: string, visitId: string, visitDate: IsoDate): Promise<Seat[]> {
  const from = weekStartOf(visitDate);
  const rows = await ex
    .selectFrom("VisitWorker")
    .innerJoin("Visit", "Visit.id", "VisitWorker.visitId")
    .innerJoin("File", "File.id", "Visit.fileId")
    .select([
      "Visit.id",
      "Visit.visitDate",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "File.siteId",
      "VisitWorker.workStartTime",
      "VisitWorker.arrivedTime",
      "VisitWorker.workedMin",
    ])
    .where("VisitWorker.workerId", "=", workerId)
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .where("Visit.id", "!=", visitId)
    .where("Visit.status", "not in", ["CANCELLED", "POSTPONED"])
    // The day before and the day after the week too: two visits across the week's edge (audit LAB-X1).
    .where("Visit.visitDate", ">=", localDate(addDays(from, -1)))
    .where("Visit.visitDate", "<=", localDate(addDays(from, 7)))
    .execute();
  return rows.map((row) => {
    // A typed time sits on the day nearest the planned start (audit LAB-11).
    const placed = placedStart(row.visitDate, row.plannedStartTime, row.workStartTime ?? row.arrivedTime);
    return {
      visitId: row.id,
      siteId: row.siteId,
      date: placed.date,
      startTime: placed.startTime,
      durationMin: row.workedMin ?? row.plannedDurationMin,
    };
  });
}

/** The days of the week of the visit that an absence or a leave in force covers. */
async function absentDatesOf(ex: Executor, workerId: string, visitDate: IsoDate): Promise<string[]> {
  const from = weekStartOf(visitDate);
  const to = addDays(from, 6);
  const rows = await ex
    .selectFrom("WorkerAbsence")
    .select(["startDate", "endDate", "type"])
    .where("workerId", "=", workerId)
    .where("status", "in", ["RECORDED", "APPROVED"])
    .where("type", "=", "FULL_DAY")
    .where("startDate", "<=", localDate(to))
    .where("endDate", ">=", localDate(from))
    .execute();
  const dates = new Set<string>();
  for (const row of rows) {
    for (const date of datesBetween(row.startDate > from ? row.startDate : from, row.endDate < to ? row.endDate : to)) {
      dates.add(date);
    }
  }
  return [...dates].sort();
}

/** Everything the visit page shows, and what was typed before. */
export async function getVisitEntry(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<VisitEntryData> {
  requireSection(ctx, "REQUESTS", "READ");
  const row = await visitOf(ex, input.visitId);
  const visit = hydrate<VisitRow>("Visit", row) as VisitRow;
  const head = await ex
    .selectFrom("File")
    .innerJoin("Site", "Site.id", "File.siteId")
    .innerJoin("Commune", "Commune.id", "Site.communeId")
    .select([
      "File.id as fileId",
      "File.number as fileNumber",
      "File.division",
      "File.serviceType",
      "Site.id as siteId",
      "Site.commonName",
      "Site.address",
      "Commune.nameAr",
    ])
    .where("File.id", "=", row.fileId)
    .executeTakeFirstOrThrow();
  const zone = row.zoneId
    ? await ex.selectFrom("Zone").select("name").where("id", "=", row.zoneId).executeTakeFirst()
    : undefined;
  const supervisor = row.supervisorEmployeeId
    ? await ex
        .selectFrom("StaffMember")
        .select(["firstName", "lastName"])
        .where("id", "=", row.supervisorEmployeeId)
        .executeTakeFirst()
    : undefined;

  const seats = await ex
    .selectFrom("VisitWorker")
    .innerJoin("StaffMember", "StaffMember.id", "VisitWorker.workerId")
    .select([
      "VisitWorker.id",
      "VisitWorker.workerId",
      "VisitWorker.role",
      "VisitWorker.seatStatus",
      "VisitWorker.arrivedTime",
      "VisitWorker.workStartTime",
      "VisitWorker.workEndTime",
      "VisitWorker.leftTime",
      "VisitWorker.presenceProof",
      "VisitWorker.lateReason",
      "VisitWorker.createdAt",
      "StaffMember.number",
      "StaffMember.firstName",
      "StaffMember.lastName",
      "StaffMember.sex",
      "StaffMember.weeklyCapacityMin",
      "StaffMember.availableDays",
    ])
    .where("VisitWorker.visitId", "=", row.id)
    .where("VisitWorker.seatStatus", "in", ["ASSIGNED", "ABSENT", "RESTING"])
    .orderBy("VisitWorker.createdAt")
    .execute();
  // A member resting that day in turn (audit LAB-4) is not on the order: the team card shows her, to replace.
  const replacedSeats = new Set(
    (
      await ex
        .selectFrom("VisitWorker")
        .select("replacesVisitWorkerId")
        .where("visitId", "=", row.id)
        .where("replacesVisitWorkerId", "is not", null)
        .where("seatStatus", "in", ["ASSIGNED", "ABSENT"])
        .execute()
    ).map((each) => each.replacesVisitWorkerId),
  );
  const workers: VisitEntryWorker[] = [];
  const resting: Array<VisitEntryWorker & { replaced: boolean }> = [];
  for (const seat of seats) {
    const entry: VisitEntryWorker = {
      seat: {
        id: seat.id,
        workerId: seat.workerId,
        role: seat.role,
        seatStatus: seat.seatStatus,
        arrivedTime: seat.arrivedTime,
        workStartTime: seat.workStartTime,
        workEndTime: seat.workEndTime,
        leftTime: seat.leftTime,
        presenceProof: seat.presenceProof,
        lateReason: seat.lateReason,
      } satisfies Pick<VisitWorkerRow, keyof VisitEntryWorker["seat"]>,
      worker: {
        id: seat.workerId,
        number: seat.number,
        firstName: seat.firstName,
        lastName: seat.lastName,
        sex: seat.sex,
        weeklyCapacityMin: seat.weeklyCapacityMin,
        availableDays: seat.availableDays,
      } satisfies Pick<StaffMemberRow, keyof VisitEntryWorker["worker"]>,
      otherSeats: await weekSeats(ex, seat.workerId, row.id, row.visitDate),
      absentDates: await absentDatesOf(ex, seat.workerId, row.visitDate),
    };
    const replaced = replacedSeats.has(seat.id);
    if (seat.seatStatus === "RESTING") resting.push({ ...entry, replaced });
    else workers.push({ ...entry, replaced });
  }

  const lines = await checklistOf(ex, row);
  const checklist: VisitEntryChecklistItem[] = lines.map((line) => ({
    id: line.key,
    kind: line.kind,
    groupLabel: line.groupLabel,
    label: line.label,
    frequency: line.frequency,
    priority: line.priority,
    carriedFromItemId: line.carriedFromItemId,
    sortOrder: line.sortOrder,
    done: line.done,
    note: line.note,
  }));

  const reportRow = await ex.selectFrom("VisitReport").selectAll().where("visitId", "=", row.id).executeTakeFirst();
  const report = reportRow ? (hydrate<VisitReportRow>("VisitReport", reportRow) as VisitEntryReport) : null;
  // The ticks on the sheet: a report whose tick was taken off is soft-deleted (LOG-14).
  const problems = await ex
    .selectFrom("ProblemReport")
    .select(["kind"])
    .where("visitId", "=", row.id)
    .where("reportedVia", "=", "ORDER")
    .where("deletedAt", "is", null)
    .execute();

  return {
    visit,
    file: {
      id: head.fileId,
      number: head.fileNumber,
      division: head.division,
      serviceType: head.serviceType,
    } satisfies Pick<FileRow, "id" | "number" | "division" | "serviceType">,
    site: { id: head.siteId, commonName: head.commonName, address: head.address } satisfies Pick<
      SiteRow,
      "id" | "commonName" | "address"
    >,
    commune: { nameAr: head.nameAr } satisfies Pick<CommuneRow, "nameAr">,
    zone: zone ? ({ name: zone.name } satisfies Pick<ZoneRow, "name">) : null,
    supervisor: supervisor ?? null,
    workers,
    resting,
    checklist,
    report,
    problemKinds: problems.map((problem) => problem.kind as ProblemKind),
  };
}

// ── Saving ──────────────────────────────────────────────────────────────────

export interface SaveReturnedOrderInput {
  visitId: string;
  values: ReturnedOrderValues;
  /** Required when a time already typed is changed (F1 article 14). */
  correctionReason?: string | null;
}

export interface SaveReturnedOrderResult {
  entryState: EntryState;
  status: VisitStatus;
}

/** Minutes from the planned start to the arrival, never below zero; the arrival is read on the nearest day. */
export function lateMinutes(arrivedTime: string | null, plannedStartTime: string): number | null {
  if (!arrivedTime) return null;
  return Math.max(0, minutesNear(arrivedTime, plannedStartTime) - minutesOf(plannedStartTime));
}

/** End minus start of work, else departure minus arrival, else nothing (RULINGS-NEEDED 14). */
export function workedMinutes(times: {
  arrivedTime: string | null;
  workStartTime: string | null;
  workEndTime: string | null;
  leftTime: string | null;
}): number | null {
  // An end equal to its start is no time worked (a site found shut); only an end before the start is the next day.
  const span = (start: string, end: string) => (start === end ? 0 : minutesFromTo(start, end));
  if (times.workStartTime && times.workEndTime) return span(times.workStartTime, times.workEndTime);
  if (times.arrivedTime && times.leftTime) return span(times.arrivedTime, times.leftTime);
  return null;
}

export async function saveReturnedOrder(
  ex: Executor,
  ctx: ServiceContext,
  input: SaveReturnedOrderInput,
): Promise<SaveReturnedOrderResult> {
  requireSection(ctx, "REQUESTS", "WRITE");
  requireCapability(ctx, "visit.enterOrder");
  const parsed = returnedOrderSchema.safeParse(input.values);
  if (!parsed.success) {
    throw new ServiceError(parsed.error.issues[0]?.message ?? "This returned order cannot be saved as it is typed.");
  }
  const values = parsed.data;
  const visit = await visitOf(ex, input.visitId);
  if (visit.status === "CANCELLED" || visit.status === "POSTPONED") {
    throw new ServiceError("A cancelled or postponed visit takes no returned order.");
  }
  const reason = input.correctionReason?.trim() || null;
  const changes: Record<string, readonly [unknown, unknown]> = {};

  // ── 1. The tick lines, frozen now if the order was never printed ──────────
  const lines = await freezeChecklist(ex, ctx, visit);
  for (const tick of values.checklist) {
    const line = lineForKey(lines, tick.id);
    if (!line?.itemId || line.done === tick.done) continue;
    await ex
      .updateTable("VisitChecklistItem")
      .set({ done: tick.done ? 1 : 0, updatedAt: ctx.now })
      .where("id", "=", line.itemId)
      .execute();
  }

  // ── 2. The team: times, initials, no-shows ────────────────────────────────
  const seats = await ex.selectFrom("VisitWorker").selectAll().where("visitId", "=", visit.id).execute();
  const plannedEnd = endTimeOf({ startTime: visit.plannedStartTime, durationMin: visit.plannedDurationMin });
  for (const worker of values.workers) {
    const seat = seats.find((candidate) => candidate.id === worker.seatId);
    if (!seat || (seat.seatStatus !== "ASSIGNED" && seat.seatStatus !== "ABSENT")) {
      throw new ServiceError("This worker is not on the visit.");
    }
    const label = (
      await ex.selectFrom("StaffMember").select("number").where("id", "=", seat.workerId).executeTakeFirst()
    )?.number;

    if (!worker.attended) {
      if (seat.seatStatus === "ABSENT") continue;
      // Times already typed for her are erased: a correction, with its right and its reason (audit LOG-Y1).
      const erased = RETURNED_WORKER_TIMES.filter((name) => seat[name] !== null);
      if (erased.length > 0) {
        requireCapability(ctx, "visit.correctTimes");
        if (!reason) throw new ServiceError("Say why a time already typed is changed.");
        for (const name of erased) changes[`${label}.${name}`] = [seat[name], null];
        if (seat.workedMin !== null) changes[`${label}.workedMin`] = [seat.workedMin, null];
      }
      // She did not come: an absence for the visit's hours, for People to treat; never a second one that day (OPS-03).
      await refuseOverlappingAbsence(ex, {
        workerId: seat.workerId,
        startDate: visit.visitDate,
        endDate: visit.visitDate,
      });
      const absenceId = newId();
      await ex
        .insertInto("WorkerAbsence")
        .values({
          id: absenceId,
          workerId: seat.workerId,
          startDate: visit.visitDate,
          endDate: visit.visitDate,
          type: "HOURS",
          startTime: visit.plannedStartTime,
          endTime: localTime(plannedEnd),
          absenceMin: minutes(visit.plannedDurationMin),
          category: "OTHER",
          reportedVia: "NO_SHOW",
          reason: `أمر المهمة ${visit.number}`,
          status: "RECORDED",
          createdAt: ctx.now,
          updatedAt: ctx.now,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        })
        .execute();
      await logCollect(ex, ctx, {
        owner: "OPERATIONS",
        action: "CREATE",
        entity: "WorkerAbsence",
        entityId: absenceId,
        entityLabel: visit.number,
        subject: { kind: "WORKER", id: seat.workerId, label },
        context: { visit: visit.number, source: "ORDER" },
      });
      await ex
        .updateTable("VisitWorker")
        .set({
          seatStatus: "ABSENT",
          absenceId,
          arrivedTime: null,
          workStartTime: null,
          workEndTime: null,
          leftTime: null,
          presenceProof: null,
          lateMin: null,
          workedMin: null,
          attendanceSource: "ORDER",
          enteredAt: ctx.now,
          enteredByUserId: ctx.userId,
          updatedAt: ctx.now,
          updatedByUserId: ctx.userId,
        })
        .where("id", "=", seat.id)
        .execute();
      changes[`${label}.seatStatus`] = [seat.seatStatus, "ABSENT"];
      continue;
    }

    if (seat.seatStatus === "ABSENT") {
      // Marked absent by mistake on an earlier entry of this order: the no-show goes, the seat comes back.
      const absence = seat.absenceId
        ? await ex.selectFrom("WorkerAbsence").selectAll().where("id", "=", seat.absenceId).executeTakeFirst()
        : undefined;
      if (!absence || absence.reportedVia !== "NO_SHOW" || absence.startDate !== visit.visitDate) {
        throw new ServiceError("This worker is recorded absent that day. Cancel the absence first.");
      }
      // Undoing a no-show cancels her absence: it needs the reason typed, and is logged on the absence (audit LOG-14).
      if (!reason) throw new ServiceError("Say why a worker marked absent on this order came after all.");
      await ex
        .updateTable("WorkerAbsence")
        .set({ status: "CANCELLED", updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", absence.id)
        .execute();
      await logChange(ex, ctx, {
        owner: "OPERATIONS",
        action: "CANCEL",
        reason,
        entity: "WorkerAbsence",
        entityId: absence.id,
        entityLabel: visit.number,
        subject: { kind: "WORKER", id: seat.workerId, label },
        changes: { status: [absence.status, "CANCELLED"] },
        context: { visit: visit.number, source: "ORDER" },
      });
      await ex
        .updateTable("VisitWorker")
        .set({ seatStatus: "ASSIGNED", absenceId: null, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", seat.id)
        .execute();
      changes[`${label}.seatStatus`] = ["ABSENT", "ASSIGNED"];
    }

    const times = {
      arrivedTime: worker.arrivedTime ? localTime(worker.arrivedTime) : null,
      workStartTime: worker.workStartTime ? localTime(worker.workStartTime) : null,
      workEndTime: worker.workEndTime ? localTime(worker.workEndTime) : null,
      leftTime: worker.leftTime ? localTime(worker.leftTime) : null,
    };
    const corrected = (Object.keys(times) as (keyof typeof times)[]).filter(
      (name) => seat[name] !== null && seat[name] !== times[name],
    );
    if (corrected.length > 0) {
      requireCapability(ctx, "visit.correctTimes");
      if (!reason) throw new ServiceError("Say why a time already typed is changed.");
    }
    const late = lateMinutes(times.arrivedTime, visit.plannedStartTime);
    const worked = workedMinutes(times);
    const { set, changes: seatChanges } = changedColumns(seat, {
      ...times,
      presenceProof: presenceProofOf(worker),
      lateMin: late === null ? null : minutes(late),
      lateReason: blankToNull(worker.lateReason),
      workedMin: worked === null ? null : minutes(worked),
      attendanceSource: "ORDER",
    });
    if (seatChanges) {
      await ex
        .updateTable("VisitWorker")
        .set({
          ...set,
          enteredAt: ctx.now,
          enteredByUserId: ctx.userId,
          updatedAt: ctx.now,
          updatedByUserId: ctx.userId,
        })
        .where("id", "=", seat.id)
        .execute();
      for (const [field, pair] of Object.entries(seatChanges)) changes[`${label}.${field}`] = pair;
    }
  }

  // ── 3. The report ─────────────────────────────────────────────────────────
  const missing = missingForComplete(values);
  const entryState: EntryState = missing.length === 0 ? "COMPLETE" : "PARTIAL";
  const reportValues = {
    entryState,
    returnedDate: values.returnedDate ? localDate(values.returnedDate) : null,
    presenceProof: weakestPresenceProof(values.workers),
    completion: values.completion,
    completionPercent: values.completionPercent,
    incompleteReason: blankToNull(values.incompleteReason),
    needsExtraVisit: bool(values.needsExtraVisit),
    needsSupervisor: bool(values.needsSupervisor),
    workerNotes: blankToNull(values.problemDetails),
    problemOnSite: bool(values.problemOnSite),
    signoffStatus: values.signoffStatus,
    signoffAbsentReason: blankToNull(values.signoffAbsentReason),
    signoffName: blankToNull(values.signoffName),
    signoffRole: blankToNull(values.signoffRole),
    signoffDate: values.signoffDate ? localDate(values.signoffDate) : null,
    signoffNotes: blankToNull(values.signoffNotes),
    signedOnPaper: values.signedOnPaper ? 1 : 0,
    workerSigned: values.workerSigned ? 1 : 0,
    wantsOtherService: bool(values.wantsOtherService),
    otherServiceText: blankToNull(values.otherServiceText),
    ratingQuality: values.ratings.quality,
    ratingPunctuality: values.ratings.punctuality,
    ratingBehaviour: values.ratings.behaviour,
    ratingMaterials: values.ratings.materials,
    ratingOverall: values.ratings.overall,
    wouldRecommend: bool(values.wouldRecommend),
  };
  const before = await ex.selectFrom("VisitReport").selectAll().where("visitId", "=", visit.id).executeTakeFirst();
  if (!before) {
    await ex
      .insertInto("VisitReport")
      .values({
        id: newId(),
        visitId: visit.id,
        ...reportValues,
        enteredAt: ctx.now,
        enteredByUserId: ctx.userId,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    for (const [field, value] of Object.entries(reportValues)) if (value !== null) changes[field] = [null, value];
  } else {
    const { set, changes: reportChanges } = changedColumns(before, reportValues);
    if (reportChanges) {
      await ex
        .updateTable("VisitReport")
        .set({
          ...set,
          enteredAt: ctx.now,
          enteredByUserId: ctx.userId,
          updatedAt: ctx.now,
          updatedByUserId: ctx.userId,
        })
        .where("id", "=", before.id)
        .execute();
      Object.assign(changes, reportChanges);
    }
  }

  // ── 4. The problems ticked on the sheet: one report per kind ──────────────
  const wanted = new Set<ProblemKind>(values.problemOnSite === true ? values.problemKinds : []);
  const current = await ex
    .selectFrom("ProblemReport")
    .selectAll()
    .where("visitId", "=", visit.id)
    .where("reportedVia", "=", "ORDER")
    .where("deletedAt", "is", null)
    .execute();
  const details = blankToNull(values.problemDetails);
  for (const kind of wanted) {
    const found = current.find((problem) => problem.kind === kind);
    if (!found) changes[`problems.${kind}`] = [false, true];
    if (found) {
      if (found.details !== details && found.status === "OPEN") {
        await ex
          .updateTable("ProblemReport")
          .set({ details, updatedAt: ctx.now, updatedByUserId: ctx.userId })
          .where("id", "=", found.id)
          .execute();
      }
      continue;
    }
    await ex
      .insertInto("ProblemReport")
      .values({
        id: newId(),
        fileId: visit.fileId,
        visitId: visit.id,
        reportedVia: "ORDER",
        occurredDate: visit.visitDate,
        loggedAt: ctx.now,
        loggedByUserId: ctx.userId,
        kind,
        details,
        status: "OPEN",
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
  }
  for (const problem of current) {
    if (wanted.has(problem.kind as ProblemKind)) continue;
    // A tick typed by mistake: a report nobody has acted on is soft-deleted with the reason typed, and the
    // erasure logged (LOG-14); one somebody acted on stays.
    if (problem.status === "OPEN" && !problem.handedTo && !problem.complaintId && !problem.correctiveTaskId) {
      if (!reason) throw new ServiceError("Say why a problem ticked on this order is taken off.");
      await ex
        .updateTable("ProblemReport")
        .set({ deletedAt: ctx.now, deletedByUserId: ctx.userId, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", problem.id)
        .execute();
      await logErase(ex, ctx, {
        owner: "OPERATIONS",
        action: "SOFT_DELETE",
        reason,
        entity: "ProblemReport",
        entityId: problem.id,
        entityLabel: visit.number,
        changes: { deletedAt: [null, ctx.now] },
        context: { visit: visit.number, kind: problem.kind, source: "ORDER" },
      });
      changes[`problems.${problem.kind}`] = [true, false];
    }
  }

  // ── 5. The visit's status ─────────────────────────────────────────────────
  const arrivalTyped = values.workers.some((worker) => worker.attended && worker.arrivedTime !== "");
  let status = visit.status as VisitStatus;
  let statusReason = visit.statusReason;
  let statusNote = visit.statusNote;
  if (entryState === "COMPLETE") {
    if (values.completion === "NOT_DONE") {
      status = "PROBLEM";
      statusReason = "OTHER";
      statusNote = blankToNull(values.incompleteReason);
    } else {
      status = "DONE";
      statusReason = null;
      statusNote = null;
    }
  } else if (OPEN_STATUSES.includes(status) && arrivalTyped) {
    status = "IN_PROGRESS";
  }
  const billable = status === "DONE" && visit.origin !== "REDO" && visit.origin !== "INITIAL" ? 1 : 0;
  const { set: visitSet, changes: visitChanges } = changedColumns(visit, {
    status,
    statusReason,
    statusNote,
    billable,
  });
  if (visitChanges) {
    const statusMoved = visitSet.status !== undefined;
    await ex
      .updateTable("Visit")
      .set({
        ...visitSet,
        ...(statusMoved ? { statusChangedAt: ctx.now, statusChangedByUserId: ctx.userId } : {}),
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", visit.id)
      .execute();
    Object.assign(changes, visitChanges);
  }

  if (Object.keys(changes).length > 0) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: before ? "UPDATE" : "CREATE",
      reason: reason ?? undefined,
      entity: "Visit",
      entityId: visit.id,
      entityLabel: visit.number,
      changes,
      context: { entryState },
    });
  }

  // ── 6. A complete order signs the visit off ───────────────────────────────
  if (entryState === "COMPLETE") await emit(ex, ctx, "visit.signedOff", { visitId: visit.id });
  return { entryState, status };
}

/** The office logged the team's arrival from a phone call (#27): the visit is «جارية» and the flag clears. */
export async function reportArrival(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string; via: "PHONE_WORKER" | "PHONE_SUPERVISOR" | "PHONE_CLIENT" },
): Promise<{ status: VisitStatus }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const visit = await visitOf(ex, input.visitId);
  if (!OPEN_STATUSES.includes(visit.status as VisitStatus) && visit.status !== "IN_PROGRESS") {
    throw new ServiceError("This visit is not waiting for its team.");
  }
  await ex
    .updateTable("Visit")
    .set({
      arrivalReportedAt: ctx.now,
      arrivalReportedVia: input.via,
      arrivalReportedByUserId: ctx.userId,
      ...(visit.status !== "IN_PROGRESS"
        ? { status: "IN_PROGRESS", statusChangedAt: ctx.now, statusChangedByUserId: ctx.userId }
        : {}),
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", visit.id)
    .execute();
  if (visit.status !== "IN_PROGRESS") {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "STATUS_CHANGE",
      entity: "Visit",
      entityId: visit.id,
      entityLabel: visit.number,
      changes: { status: [visit.status, "IN_PROGRESS"] },
      context: { arrivalReportedVia: input.via },
    });
  }
  return { status: "IN_PROGRESS" };
}

export const getVisitEntryQuery = query(getVisitEntry);
export const saveReturnedOrderAction = action(saveReturnedOrder, {
  revalidate: (_data, input) => [VISITS_PATH, `${VISITS_PATH}/${input.visitId}`],
});
export const reportArrivalAction = action(reportArrival, { revalidate: [VISITS_PATH] });
