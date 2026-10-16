import { syncDues } from "@/features/money/services/dues";
import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localTime, minutes, type LocalDate, type LocalTime, type Minutes } from "@/lib/units";

import { FRIDAY, addDays, weekdaysOfCodes } from "../rules/calendar";
import {
  contractVisits,
  onDemandVisits,
  slotsFromForm,
  visitKey,
  type FormTimes,
  type PlannedVisit,
  type Programme,
  type ProgrammeSettings,
  type WeeklySlot,
} from "../rules/visit-dates";
import {
  WEEKDAYS,
  type DayPeriod,
  type DurationUnit,
  type ProgrammeWarning,
  type VisitStatus,
} from "../validators/option-codes";
import { judgeSeat, readVisitForSeat, settleVisitTeam, workerForSeat } from "./assignment";
import { OPEN_STATUSES, VISITS_PATH, ensureProgramme, generateFileVisits, programmeSettings } from "./programme";
import { readFileForScheduling, type FileForScheduling } from "./upstream";

/**
 * When a contracted file's programme changes after its visits were made (#7).
 *
 *  - `file.termsChanged` (Clients saved new days, times, dates, workers or
 *    service ticks): the programme is only marked (`formChangedAt`). The office
 *    then runs «تحديث الزيارات القادمة» itself, after its preview.
 *  - `updateFutureVisits`: the weekly slots follow the form again, then every
 *    future visit nobody has touched follows its slot — it moves to the new
 *    hours or headcount, or is cancelled with reason PROGRAMME_CHANGED when the
 *    programme no longer calls for it — and the visits now missing are made.
 *    A visit printed, edited by hand, or in another status is left as it is and
 *    counted, for the office to see to.
 *  - `file.renewed`: the renewing file starts with the old file's set-up
 *    (`copyFileSetup`); its own `file.contracted` then makes its visits from it.
 *
 * The derivation of slots and of the programme is programme.ts's, repeated
 * here where programme.ts keeps it private.
 */

// ── The mark ────────────────────────────────────────────────────────────────

/**
 * The handler of `file.termsChanged`: the programme is marked as no longer
 * matching the form. Only that column; nothing is regenerated. A contracted
 * file without a programme row (made before Operations reacted) is given one.
 */
export async function markFormChanged(ex: Executor, ctx: ServiceContext, input: { fileId: string }): Promise<void> {
  const marked = await ex
    .updateTable("FileProgramme")
    .set({ formChangedAt: ctx.now })
    .where("fileId", "=", input.fileId)
    .executeTakeFirst();
  if (Number(marked.numUpdatedRows) > 0) return;
  const file = await readFileForScheduling(ex, input.fileId);
  if (!file) return;
  await ensureProgramme(ex, ctx, file);
  await ex.updateTable("FileProgramme").set({ formChangedAt: ctx.now }).where("fileId", "=", file.id).execute();
}

// ── Slots and programme, as programme.ts derives them ───────────────────────

function formTimesOf(file: FileForScheduling): FormTimes {
  return {
    period: (file.period as DayPeriod | null) ?? null,
    windowFrom: file.periodFrom,
    windowTo: file.periodTo,
    arrivalTime: file.arrivalTime,
    departureTime: file.departureTime,
  };
}

/** One slot per ticked day of «أيام التنفيذ», at the form's hours and headcount. */
function formSlots(file: FileForScheduling, settings: ProgrammeSettings): WeeklySlot[] {
  return slotsFromForm(
    { ...formTimesOf(file), executionWeekdays: weekdaysOfCodes(file.executionDays), workersCount: file.workersCount },
    settings,
  );
}

/** The visits the file calls for with these slots, before any range is applied. */
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

/** The keys of the programme visits that exist, as the generation reads them. */
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

/** A type, not an interface: `changedColumns` takes it as a plain record. */
type StoredSlot = {
  id: string;
  dayOfWeek: number;
  startTime: LocalTime;
  durationMin: Minutes;
  workersNeeded: number;
  validFrom: LocalDate | null;
  validTo: LocalDate | null;
  isActive: number;
  createdAt: string;
};

interface SlotPlan {
  /** A day still ticked whose slot takes the form's hours or headcount. */
  updates: Array<{ slot: StoredSlot; to: WeeklySlot }>;
  /** A day newly ticked; its id is a stand-in until it is written. */
  adds: WeeklySlot[];
  /** A day no longer ticked (Friday is never on his forms: a Friday slot is the office's own and stays). */
  deactivations: StoredSlot[];
  /** The active slots once the plan is applied. */
  active: WeeklySlot[];
}

const NO_SLOT_PLAN: SlotPlan = { updates: [], adds: [], deactivations: [], active: [] };

/** Of a day's active slots, the one the form speaks for: the open-ended one, then the oldest. */
function formSlotFirst(a: StoredSlot, b: StoredSlot): number {
  return (
    Number(a.validTo !== null) - Number(b.validTo !== null) ||
    Number(a.validFrom !== null) - Number(b.validFrom !== null) ||
    a.createdAt.localeCompare(b.createdAt) ||
    a.id.localeCompare(b.id)
  );
}

/** What re-deriving the slots from the form changes. Slots are never deleted. */
function planSlots(stored: readonly StoredSlot[], derived: readonly WeeklySlot[]): SlotPlan {
  const active = stored.filter((slot) => slot.isActive === 1);
  const ticked = new Set(derived.map((slot) => slot.weekday));
  const updates: SlotPlan["updates"] = [];
  const adds: WeeklySlot[] = [];
  const formValues = new Map<string, WeeklySlot>();
  for (const slot of derived) {
    const [kept] = active.filter((candidate) => candidate.dayOfWeek === slot.weekday).sort(formSlotFirst);
    if (!kept) {
      adds.push({ ...slot, id: `new:${slot.weekday}` });
      continue;
    }
    formValues.set(kept.id, slot);
    if (
      kept.startTime !== slot.startTime ||
      kept.durationMin !== slot.durationMin ||
      kept.workersNeeded !== slot.workersNeeded
    ) {
      updates.push({ slot: kept, to: slot });
    }
  }
  const deactivations = active.filter((slot) => slot.dayOfWeek !== FRIDAY && !ticked.has(slot.dayOfWeek));
  const off = new Set(deactivations.map((slot) => slot.id));
  const after = active
    .filter((slot) => !off.has(slot.id))
    .map((slot): WeeklySlot => {
      const to = formValues.get(slot.id);
      return {
        id: slot.id,
        weekday: slot.dayOfWeek,
        startTime: to?.startTime ?? slot.startTime,
        durationMin: to?.durationMin ?? slot.durationMin,
        workersNeeded: to?.workersNeeded ?? slot.workersNeeded,
        validFrom: slot.validFrom,
        validTo: slot.validTo,
      };
    });
  return { updates, adds, deactivations, active: [...after, ...adds] };
}

// ── The future visits ───────────────────────────────────────────────────────

/** Why a future visit the change concerns was left as it is. */
export type LeftReason = "PRINTED" | "EDITED" | "STATUS";

/** What updating the future visits did, or would do. */
export interface FutureVisitsUpdate {
  /** The file is contracted and open, and its form gives days and dates the programme can be made from. */
  canUpdate: boolean;
  /** Visits that took the new hours, length or number of workers. */
  moved: number;
  /** Visits made from tomorrow on (in a preview: that would be made). */
  added: number;
  /** Visits cancelled with reason PROGRAMME_CHANGED. */
  cancelled: number;
  /** Future visits the change concerns, left as they were: printed, edited by hand, or in another status. */
  left: { printed: number; edited: number; otherStatus: number };
  leftVisits: Array<{ id: string; number: string; visitDate: LocalDate; reason: LeftReason }>;
  /**
   * Workers who cannot follow their visit to its new hours without breaking a working-time rule (audit LAB-3):
   * their seat is removed and the visit waits for confirmation; the office fills it, with the manager if he allows.
   */
  seatsDropped: Array<{
    visitId: string;
    visitNumber: string;
    visitDate: LocalDate;
    workerNumber: string;
    why: string;
  }>;
  /** The weekly slots: given new hours or headcount, added, switched off. */
  slots: { updated: number; added: number; deactivated: number };
  warnings: ProgrammeWarning[];
}

/** With these, the programme would cancel every future visit: the form is wrong, not the programme. */
const BLOCKING_WARNINGS: readonly ProgrammeWarning[] = [
  "MISSING_DATES",
  "END_BEFORE_START",
  "NO_EXECUTION_DAY",
  "NO_WORKING_DAY_IN_RANGE",
];

type FutureVisit = {
  id: string;
  number: string;
  fileSlotId: string | null;
  slotDate: LocalDate | null;
  visitDate: LocalDate;
  plannedStartTime: LocalTime;
  plannedDurationMin: Minutes;
  workersNeeded: number;
  status: string;
  orderPrintedAt: string | null;
  isManuallyEdited: number;
};

interface FuturePlan {
  file: FileForScheduling;
  slots: SlotPlan;
  warnings: ProgrammeWarning[];
  blocked: boolean;
  cancel: FutureVisit[];
  move: Array<{ visit: FutureVisit; to: PlannedVisit }>;
  left: Array<{ visit: FutureVisit; reason: LeftReason }>;
  /** Planned visits from tomorrow on that do not exist. */
  missing: number;
}

function leftReason(visit: FutureVisit): LeftReason | null {
  if (!OPEN_STATUSES.includes(visit.status as VisitStatus)) return "STATUS";
  if (visit.orderPrintedAt) return "PRINTED";
  if (visit.isManuallyEdited) return "EDITED";
  return null;
}

/** Everything the update would do, worked out without writing. */
async function planFutureVisits(ex: Executor, ctx: ServiceContext, file: FileForScheduling): Promise<FuturePlan> {
  const settings = await programmeSettings(ex);
  let slots = NO_SLOT_PLAN;
  if (file.serviceType === "CONTRACT") {
    const stored = await ex
      .selectFrom("FileSlot")
      .select([
        "id",
        "dayOfWeek",
        "startTime",
        "durationMin",
        "workersNeeded",
        "validFrom",
        "validTo",
        "isActive",
        "createdAt",
      ])
      .where("fileId", "=", file.id)
      .where("deletedAt", "is", null)
      .execute();
    slots = planSlots(stored, formSlots(file, settings));
  }
  const programme = plannedProgramme(file, slots.active, settings);
  const warnings = [...new Set(programme.warnings)];
  const plan: FuturePlan = {
    file,
    slots,
    warnings,
    blocked: warnings.some((warning) => BLOCKING_WARNINGS.includes(warning)),
    cancel: [],
    move: [],
    left: [],
    missing: 0,
  };
  if (plan.blocked) return plan;

  // A contract that ended early is cut at its ending, as the generation cuts it.
  const planned = programme.visits.filter((visit) => !file.endedDate || visit.date <= file.endedDate);
  const byKey = new Map(planned.map((visit) => [visitKey(visit), visit]));

  const future: FutureVisit[] = await ex
    .selectFrom("Visit")
    .select([
      "id",
      "number",
      "fileSlotId",
      "slotDate",
      "visitDate",
      "plannedStartTime",
      "plannedDurationMin",
      "workersNeeded",
      "status",
      "orderPrintedAt",
      "isManuallyEdited",
    ])
    .where("fileId", "=", file.id)
    .where("origin", "in", ["CONTRACT", "ON_DEMAND"])
    .where("visitDate", ">", ctx.today)
    .where("status", "!=", "CANCELLED")
    .orderBy("visitDate")
    .orderBy("plannedStartTime")
    .execute();
  for (const visit of future) {
    if (!visit.slotDate) continue;
    // An on-demand visit has no slot: its programme date alone says which planned day it is.
    const to = byKey.get(visitKey({ slotId: visit.fileSlotId, date: visit.slotDate }));
    const same =
      to !== undefined &&
      to.startTime === visit.plannedStartTime &&
      to.durationMin === visit.plannedDurationMin &&
      to.workersNeeded === visit.workersNeeded;
    if (same) continue;
    const reason = leftReason(visit);
    if (reason) plan.left.push({ visit, reason });
    else if (to) plan.move.push({ visit, to });
    else plan.cancel.push(visit);
  }

  const tomorrow = addDays(ctx.today, 1);
  const existing = await existingKeys(ex, file.id);
  plan.missing = planned.filter((visit) => visit.date >= tomorrow && !existing.has(visitKey(visit))).length;
  return plan;
}

/**
 * The seated workers of a visit who could not stay on it at the new hours and
 * length: each judged as a new seat would be (two visits at once, 48 hours, the
 * day span, night work by a woman, a rest day, a sanction), with no override.
 * Writes nothing.
 */
async function seatsThatCannotFollow(
  ex: Executor,
  ctx: ServiceContext,
  visit: { id: string; number: string; visitDate: LocalDate },
  to: { startTime: string; durationMin: number },
): Promise<Array<{ seatId: string; workerNumber: string; why: string }>> {
  const seats = await ex
    .selectFrom("VisitWorker")
    .select(["id", "workerId"])
    .where("visitId", "=", visit.id)
    .where("seatStatus", "=", "ASSIGNED")
    .execute();
  if (seats.length === 0) return [];
  const moved = {
    ...(await readVisitForSeat(ex, visit.id)),
    plannedStartTime: localTime(to.startTime),
    plannedDurationMin: to.durationMin,
  };
  const dropped: Array<{ seatId: string; workerNumber: string; why: string }> = [];
  for (const seat of seats) {
    let number = "";
    try {
      const worker = await workerForSeat(ex, ctx, seat.workerId);
      number = worker.number;
      await judgeSeat(ex, ctx, worker, moved, null);
    } catch (error) {
      if (!(error instanceof ServiceError)) throw error;
      dropped.push({ seatId: seat.id, workerNumber: number, why: error.message });
    }
  }
  return dropped;
}

async function droppedSeatsOf(ex: Executor, ctx: ServiceContext, plan: FuturePlan) {
  const all: FutureVisitsUpdate["seatsDropped"] = [];
  const bySeat: Array<{ seatId: string; visitId: string }> = [];
  for (const { visit, to } of plan.move) {
    if (to.startTime === visit.plannedStartTime && to.durationMin === visit.plannedDurationMin) continue;
    for (const seat of await seatsThatCannotFollow(ex, ctx, visit, to)) {
      all.push({
        visitId: visit.id,
        visitNumber: visit.number,
        visitDate: visit.visitDate,
        workerNumber: seat.workerNumber,
        why: seat.why,
      });
      bySeat.push({ seatId: seat.seatId, visitId: visit.id });
    }
  }
  return { all, bySeat };
}

function summaryOf(
  plan: FuturePlan,
  outcome: { added: number; canUpdate: boolean; seatsDropped?: FutureVisitsUpdate["seatsDropped"] },
): FutureVisitsUpdate {
  const count = (reason: LeftReason) => plan.left.filter((entry) => entry.reason === reason).length;
  return {
    canUpdate: outcome.canUpdate,
    moved: plan.move.length,
    added: outcome.added,
    cancelled: plan.cancel.length,
    left: { printed: count("PRINTED"), edited: count("EDITED"), otherStatus: count("STATUS") },
    leftVisits: plan.left.map(({ visit, reason }) => ({
      id: visit.id,
      number: visit.number,
      visitDate: visit.visitDate,
      reason,
    })),
    slots: {
      updated: plan.slots.updates.length,
      added: plan.slots.adds.length,
      deactivated: plan.slots.deactivations.length,
    },
    warnings: plan.warnings,
    seatsDropped: outcome.seatsDropped ?? [],
  };
}

const isLive = (file: FileForScheduling) => file.stage === "CONTRACTED" && !file.closedAt;

/** Writes what the plan says, in one go, with one log entry of its own. */
async function applyPlan(ex: Executor, ctx: ServiceContext, plan: FuturePlan): Promise<FutureVisitsUpdate> {
  const { file } = plan;
  const changes: Record<string, readonly [unknown, unknown]> = {};
  const stamp = { updatedAt: ctx.now, updatedByUserId: ctx.userId };

  // 1. The slots follow the form.
  for (const { slot, to } of plan.slots.updates) {
    const { set, changes: slotChanges } = changedColumns(slot, {
      startTime: localTime(to.startTime),
      durationMin: minutes(to.durationMin),
      workersNeeded: to.workersNeeded,
    });
    if (!slotChanges) continue;
    await ex
      .updateTable("FileSlot")
      .set({ ...set, ...stamp })
      .where("id", "=", slot.id)
      .execute();
    for (const [field, pair] of Object.entries(slotChanges))
      changes[`slot.${WEEKDAYS[slot.dayOfWeek]}.${field}`] = pair;
  }
  for (const slot of plan.slots.deactivations) {
    await ex
      .updateTable("FileSlot")
      .set({ isActive: 0, ...stamp })
      .where("id", "=", slot.id)
      .execute();
    changes[`slot.${WEEKDAYS[slot.dayOfWeek]}.isActive`] = [1, 0];
  }
  for (const slot of plan.slots.adds) {
    await ex
      .insertInto("FileSlot")
      .values({
        id: newId(),
        fileId: file.id,
        dayOfWeek: slot.weekday,
        startTime: localTime(slot.startTime),
        durationMin: minutes(slot.durationMin),
        workersNeeded: slot.workersNeeded,
        createdAt: ctx.now,
        createdByUserId: ctx.userId,
        ...stamp,
      })
      .execute();
    changes[`slot.${WEEKDAYS[slot.weekday]}`] = [null, `${slot.startTime} ${slot.durationMin} ${slot.workersNeeded}`];
  }

  // 2. Visits the programme no longer calls for: cancelled, so they count nowhere and free their slot.
  if (plan.cancel.length > 0) {
    await ex
      .updateTable("Visit")
      .set({
        status: "CANCELLED",
        statusReason: "PROGRAMME_CHANGED",
        statusChangedAt: ctx.now,
        statusChangedByUserId: ctx.userId,
        ...stamp,
      })
      .where(
        "id",
        "in",
        plan.cancel.map((visit) => visit.id),
      )
      .execute();
    for (const visit of plan.cancel) changes[`${visit.number}.status`] = [visit.status, "CANCELLED"];
  }

  // 3. Visits that take their slot's new hours, length or headcount; a new headcount settles the team. A worker
  // who cannot follow her visit to its new hours under the working-time rules leaves it (audit LAB-3): judged
  // before anything moves, so that each is judged on the week as it stands.
  const dropped = await droppedSeatsOf(ex, ctx, plan);
  for (const { visit, to } of plan.move) {
    const { set, changes: visitChanges } = changedColumns(visit, {
      plannedStartTime: localTime(to.startTime),
      plannedDurationMin: minutes(to.durationMin),
      workersNeeded: to.workersNeeded,
    });
    if (!visitChanges) continue;
    await ex
      .updateTable("Visit")
      .set({ ...set, ...stamp })
      .where("id", "=", visit.id)
      .execute();
    for (const [field, pair] of Object.entries(visitChanges)) changes[`${visit.number}.${field}`] = pair;
    const leaving = dropped.bySeat.filter((seat) => seat.visitId === visit.id);
    for (const seat of leaving) {
      await ex
        .updateTable("VisitWorker")
        .set({ seatStatus: "REMOVED", ...stamp })
        .where("id", "=", seat.seatId)
        .execute();
    }
    for (const seat of dropped.all.filter((each) => each.visitId === visit.id)) {
      changes[`${visit.number}.${seat.workerNumber}.seatStatus`] = ["ASSIGNED", "REMOVED"];
    }
    if (set.workersNeeded !== undefined || leaving.length > 0) await settleVisitTeam(ex, ctx, visit.id);
  }

  // 4. The visits now missing, from tomorrow on (and the tasks of service ticks added since).
  const generation = await generateFileVisits(ex, ctx, file.id, { from: addDays(ctx.today, 1) });

  // 5. The programme matches the form again.
  const mark = await ex
    .selectFrom("FileProgramme")
    .select(["id", "formChangedAt"])
    .where("fileId", "=", file.id)
    .executeTakeFirst();
  if (mark?.formChangedAt) {
    await ex
      .updateTable("FileProgramme")
      .set({ formChangedAt: null, ...stamp })
      .where("id", "=", mark.id)
      .execute();
    changes.formChangedAt = [mark.formChangedAt, null];
  }

  const summary = summaryOf(plan, { added: generation.created, canUpdate: true, seatsDropped: dropped.all });
  if (Object.keys(changes).length > 0 || generation.created > 0) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "UPDATE",
      entity: "File",
      entityId: file.id,
      entityLabel: file.number,
      changes,
      context: {
        cause: "PROGRAMME_UPDATED",
        moved: summary.moved,
        added: summary.added,
        cancelled: summary.cancelled,
        left: summary.leftVisits.map((visit) => ({ visit: visit.number, reason: visit.reason })),
        seatsDropped: summary.seatsDropped.map((seat) => ({ visit: seat.visitNumber, worker: seat.workerNumber })),
      },
    });
  }

  // 6. A cancelled visit is a status change Money follows (dues per visit).
  for (const visit of plan.cancel) await emit(ex, ctx, "visit.statusChanged", { visitId: visit.id });
  return summary;
}

/**
 * The engine of `updateFutureVisits`, without the permission check: the slots
 * follow the form, the untouched future visits follow the programme, the
 * missing ones are made, and `formChangedAt` is cleared. Refuses a form whose
 * days or dates would leave no programme at all.
 */
export async function updateFileFutureVisits(
  ex: Executor,
  ctx: ServiceContext,
  fileId: string,
): Promise<FutureVisitsUpdate> {
  const file = await readFileForScheduling(ex, fileId);
  if (!file) throw new Error(`operations: file ${fileId} was not found`);
  const plan = await planFutureVisits(ex, ctx, file);
  if (plan.blocked) {
    throw new ServiceError(
      "The days or dates on this file's form are missing or out of order. Correct the form first.",
    );
  }
  const summary = await applyPlan(ex, ctx, plan);
  // Money's dues follow the new programme in the same transaction (CONTRACTS.md section 3).
  await syncDues(ex, ctx, { fileId });
  return summary;
}

/** «تحديث الزيارات القادمة» on File › الزيارات, after the terms or the slots changed. */
export async function updateFutureVisits(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<FutureVisitsUpdate> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const file = await readFileForScheduling(ex, input.fileId);
  if (!file) throw new ServiceError("This client file does not exist.");
  if (!isLive(file)) throw new ServiceError("Visits are made for a contracted file only.");
  return updateFileFutureVisits(ex, ctx, file.id);
}

/** Writes nothing: what «تحديث الزيارات القادمة» would do now. */
export async function previewFutureVisitsUpdate(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string },
): Promise<FutureVisitsUpdate> {
  requireSection(ctx, "REQUESTS", "READ");
  const file = await readFileForScheduling(ex, input.fileId);
  if (!file) throw new ServiceError("This client file does not exist.");
  const plan = await planFutureVisits(ex, ctx, file);
  const dropped = await droppedSeatsOf(ex, ctx, plan);
  return summaryOf(plan, {
    added: plan.missing,
    canUpdate: isLive(file) && !plan.blocked,
    seatsDropped: dropped.all,
  });
}

// ── Renewal ─────────────────────────────────────────────────────────────────

/** What a renewal copied. */
export interface FileSetupCopy {
  areas: number;
  tasks: number;
  slots: number;
  assignments: number;
  programme: boolean;
}

/**
 * The handler of `file.renewed`: the renewing file starts with the old one's
 * set-up, so its `file.contracted` makes its visits from the programme as it
 * was really run.
 *
 *  - the areas (each under its copied parent) and the tasks (in their copied
 *    area); a special task dated before the new file starts is over and stays;
 *  - the active slots still in force at the old file's end, without their
 *    validity dates;
 *  - the standing team in force at the old file's end, from the new file's
 *    start (an assignment to a slot that was not copied is not copied);
 *  - the programme row: the two switches and the inspection plan, the
 *    inspections active again from the new file's start, the mark cleared.
 *
 * Each part is copied only while the new file has none of it, so a second run
 * copies nothing.
 */
export async function copyFileSetup(
  ex: Executor,
  ctx: ServiceContext,
  input: { fromFileId: string; toFileId: string },
): Promise<FileSetupCopy> {
  const files = await ex
    .selectFrom("File")
    .select(["id", "number", "startDate", "endDate", "endedDate"])
    .where("id", "in", [input.fromFileId, input.toFileId])
    .execute();
  const from = files.find((file) => file.id === input.fromFileId);
  const to = files.find((file) => file.id === input.toFileId);
  if (!from || !to)
    throw new Error(`operations: renewal of ${input.fromFileId} into ${input.toFileId}: a file is missing`);

  const oldEnd = from.endedDate ?? from.endDate ?? ctx.today;
  const newStart = to.startDate ?? ctx.today;
  const copied: FileSetupCopy = { areas: 0, tasks: 0, slots: 0, assignments: 0, programme: false };
  const audit = { createdAt: ctx.now, updatedAt: ctx.now, createdByUserId: ctx.userId, updatedByUserId: ctx.userId };
  const hasRows = async (table: "FileArea" | "FileTask" | "FileSlot" | "FileAssignment") =>
    (await ex
      .selectFrom(table)
      .select("id")
      .where("fileId", "=", to.id)
      .where("deletedAt", "is", null)
      .executeTakeFirst()) !== undefined;

  // Areas, parents before their children.
  const areaIds = new Map<string, string>();
  if (!(await hasRows("FileArea"))) {
    const areas = await ex
      .selectFrom("FileArea")
      .selectAll()
      .where("fileId", "=", from.id)
      .where("deletedAt", "is", null)
      .orderBy("sortOrder")
      .execute();
    const known = new Set(areas.map((area) => area.id));
    let waiting = areas;
    while (waiting.length > 0) {
      const ready = waiting.filter(
        (area) => !area.parentAreaId || !known.has(area.parentAreaId) || areaIds.has(area.parentAreaId),
      );
      if (ready.length === 0) throw new Error(`operations: the areas of file ${from.id} point at each other`);
      for (const area of ready) {
        const id = newId();
        await ex
          .insertInto("FileArea")
          .values({
            id,
            fileId: to.id,
            kind: area.kind,
            parentAreaId: area.parentAreaId ? (areaIds.get(area.parentAreaId) ?? null) : null,
            label: area.label,
            catalogCode: area.catalogCode,
            sortOrder: area.sortOrder,
            isActive: area.isActive,
            ...audit,
          })
          .execute();
        areaIds.set(area.id, id);
      }
      waiting = waiting.filter((area) => !areaIds.has(area.id));
    }
    copied.areas = areaIds.size;
  }

  // Tasks, in their copied areas.
  if (!(await hasRows("FileTask"))) {
    const tasks = await ex
      .selectFrom("FileTask")
      .selectAll()
      .where("fileId", "=", from.id)
      .where("deletedAt", "is", null)
      .orderBy("sortOrder")
      .execute();
    for (const task of tasks) {
      if (task.frequency === "SPECIAL" && task.specialDate && task.specialDate < newStart) continue;
      await ex
        .insertInto("FileTask")
        .values({
          id: newId(),
          fileId: to.id,
          areaId: task.areaId ? (areaIds.get(task.areaId) ?? null) : null,
          frequency: task.frequency,
          catalogCode: task.catalogCode,
          serviceCode: task.serviceCode,
          label: task.label,
          dayOfWeek: task.dayOfWeek,
          dayOfMonth: task.dayOfMonth,
          specialDate: task.specialDate,
          priority: task.priority,
          sortOrder: task.sortOrder,
          isActive: task.isActive,
          note: task.note,
          ...audit,
        })
        .execute();
      copied.tasks += 1;
    }
  }

  // Slots still in force at the old file's end, without their dates.
  const slotIds = new Map<string, string>();
  if (!(await hasRows("FileSlot"))) {
    const slots = await ex
      .selectFrom("FileSlot")
      .selectAll()
      .where("fileId", "=", from.id)
      .where("isActive", "=", 1)
      .where("deletedAt", "is", null)
      .where((eb) => eb.or([eb("validTo", "is", null), eb("validTo", ">=", oldEnd)]))
      .orderBy("dayOfWeek")
      .orderBy("startTime")
      .execute();
    for (const slot of slots) {
      const id = newId();
      await ex
        .insertInto("FileSlot")
        .values({
          id,
          fileId: to.id,
          dayOfWeek: slot.dayOfWeek,
          startTime: slot.startTime,
          durationMin: slot.durationMin,
          workersNeeded: slot.workersNeeded,
          validFrom: null,
          validTo: null,
          note: slot.note,
          ...audit,
        })
        .execute();
      slotIds.set(slot.id, id);
    }
    copied.slots = slotIds.size;
  }

  // The standing team in force at the old file's end, from the new file's start.
  if (!(await hasRows("FileAssignment"))) {
    const team = await ex
      .selectFrom("FileAssignment")
      .selectAll()
      .where("fileId", "=", from.id)
      .where("deletedAt", "is", null)
      .where("validFrom", "<=", oldEnd)
      .where((eb) => eb.or([eb("validTo", "is", null), eb("validTo", ">=", oldEnd)]))
      .orderBy("sortOrder")
      .execute();
    for (const seat of team) {
      const slotId = seat.fileSlotId ? slotIds.get(seat.fileSlotId) : null;
      if (slotId === undefined) continue;
      await ex
        .insertInto("FileAssignment")
        .values({
          id: newId(),
          fileId: to.id,
          fileSlotId: slotId,
          workerId: seat.workerId,
          teamId: seat.teamId,
          role: seat.role,
          validFrom: newStart,
          validTo: seat.validTo && seat.validTo >= newStart ? seat.validTo : null,
          sortOrder: seat.sortOrder,
          ...audit,
        })
        .execute();
      copied.assignments += 1;
    }
  }

  // The programme row: the two switches and the inspection plan.
  const programme = await ex.selectFrom("FileProgramme").selectAll().where("fileId", "=", from.id).executeTakeFirst();
  const already = await ex.selectFrom("FileProgramme").select("id").where("fileId", "=", to.id).executeTakeFirst();
  if (programme && !already) {
    await ex
      .insertInto("FileProgramme")
      .values({
        id: newId(),
        fileId: to.id,
        rotateRestDay: programme.rotateRestDay,
        reminderMode: programme.reminderMode,
        formChangedAt: null,
        inspectionFrequency: programme.inspectionFrequency,
        inspectionDayOfWeek: programme.inspectionDayOfWeek,
        inspectionSupervisorEmployeeId: programme.inspectionSupervisorEmployeeId,
        inspectionStartDate: programme.inspectionFrequency === "NONE" ? null : newStart,
        inspectionIsActive: 1,
        ...audit,
      })
      .execute();
    copied.programme = true;
  }

  if (copied.areas + copied.tasks + copied.slots + copied.assignments > 0 || copied.programme) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "CREATE",
      entity: "File",
      entityId: to.id,
      entityLabel: to.number,
      context: { cause: "RENEWAL", copiedFrom: from.number, copiedFromFileId: from.id, ...copied },
    });
  }
  return copied;
}

export const previewFutureVisitsUpdateQuery = query(previewFutureVisitsUpdate);
export const updateFutureVisitsAction = action(updateFutureVisits, {
  revalidate: (_data, input) => [VISITS_PATH, `/dashboard/files/${input.fileId}`],
});
