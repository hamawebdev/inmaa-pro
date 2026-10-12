import { DEMO_FILES } from "@/features/clients/demo";
import { recordFileOpened } from "@/features/clients/services/file-reads";
import type { RegisterFileInput } from "@/features/clients/services/files";
import type { FormKind } from "@/features/clients/validators/option-lists";
import { entryValuesOf } from "@/features/operations/components/visit-entry/visit-entry-data";
import { assignVisitWorker, listSeatCandidates } from "@/features/operations/services/assignment";
import { recordOrderPrinted } from "@/features/operations/services/mission-order";
import { getVisitEntry, saveReturnedOrder } from "@/features/operations/services/visit-entry";
import type { ReturnedOrderValues } from "@/features/operations/validators/returned-order";
import type { Session } from "@/lib/service/context";

import type { TestDatabase } from "../../database";

/**
 * What the acceptance scenarios share (the Checker's; docs/checker/acceptance.md).
 *
 * Nothing here writes a row: every step goes through an owner's exported
 * service. The form answers are Clients' own demo files (`DEMO_FILES`), moved
 * to dates after the test clock's present so that the whole job lies ahead.
 */

/** An instant at the centre (UTC+1, no summer time) from a local date and time. */
export const at = (date: string, time = "09:00"): string => {
  const [hours, minutes] = time.split(":").map(Number);
  return `${date}T${String(hours - 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
};

/** The first month of every contract in these scenarios: the job runs in November and is invoiced on 1 December. */
export const MONTH = { start: "2026-11-01", end: "2026-11-30", after: "2026-12-01" } as const;

const DEMO_NAME: Partial<Record<FormKind, string>> = {
  HOUSING_CONTRACT: "housingContract",
  ORG_CONTRACT: "orgContract",
  BUILDING_CONTRACT: "buildingContract",
  COMPLEX_CONTRACT: "complexContract",
  HOUSING_REQUEST: "housingRequest",
};

/** The end date his form would carry for a contract that starts on 1 November. */
const END_OF: Record<string, string> = { M1: "2026-11-30", M3: "2027-01-31", M6: "2027-04-30", Y1: "2027-10-31" };

/**
 * Clients' demo answers for a form kind, with the contract starting on
 * 1 November 2026, signed today, and paid month by month at the month's end.
 */
export function contractInput(kind: FormKind): RegisterFileInput {
  const model = DEMO_FILES.find((file) => file.name === DEMO_NAME[kind]);
  if (!model) throw new Error(`acceptance: Clients' demo has no ${kind} to start from`);
  const duration = String(model.input.values.contractDuration ?? "M1");
  return {
    ...model.input,
    values: {
      ...model.input.values,
      issuedDate: "2026-10-12",
      startDate: MONTH.start,
      endDate: END_OF[duration] ?? MONTH.end,
      firstDueDate: MONTH.end,
      paymentFrequency: "MONTHLY",
      paymentMethods: ["CASH"],
    },
    office: { ...model.input.office, amountBasis: "PER_PAYMENT_PERIOD" },
    // The dates of keys and residents in the demo are before its own contract: keep them before this one too.
  };
}

/** A returned order as it comes back when all went well: everyone on time, everything ticked, the client satisfied. */
export function returnedSheet(
  blank: ReturnedOrderValues,
  visit: { visitDate: string; plannedStartTime: string; plannedDurationMin: number },
  signedBy: string,
): ReturnedOrderValues {
  const [hours, minutes] = visit.plannedStartTime.split(":").map(Number);
  const endMinutes = hours * 60 + minutes + visit.plannedDurationMin;
  const end = `${String(Math.floor(endMinutes / 60)).padStart(2, "0")}:${String(endMinutes % 60).padStart(2, "0")}`;
  return {
    ...blank,
    returnedDate: visit.visitDate,
    workers: blank.workers.map((worker) => ({
      ...worker,
      attended: true,
      arrivedTime: visit.plannedStartTime,
      workStartTime: visit.plannedStartTime,
      workEndTime: end,
      leftTime: end,
      arrivalInitialled: true,
      departureInitialled: true,
      lateReason: "",
    })),
    checklist: blank.checklist.map((line) => ({ ...line, done: true })),
    problemOnSite: false,
    problemKinds: [],
    problemDetails: "",
    completion: "FULL",
    completionPercent: 100,
    incompleteReason: "",
    needsExtraVisit: false,
    needsSupervisor: false,
    signoffStatus: "ACCEPTED",
    signoffName: signedBy,
    signoffRole: "",
    signoffDate: visit.visitDate,
    signoffNotes: "",
    wantsOtherService: false,
    ratings: { quality: 5, punctuality: 5, behaviour: 5, materials: 4, overall: 5 },
    wouldRecommend: true,
    signedOnPaper: true,
    workerSigned: true,
  } as ReturnedOrderValues;
}

export interface PlannedVisit {
  id: string;
  visitDate: string;
  plannedStartTime: string;
  plannedDurationMin: number;
  workersNeeded: number;
}

/** The visits of a file, in date order. A read of Operations' table, to know what to do next. */
export async function visitsOf(test: TestDatabase, fileId: string): Promise<PlannedVisit[]> {
  return test.db
    .selectFrom("Visit")
    .select(["id", "visitDate", "plannedStartTime", "plannedDurationMin", "workersNeeded"])
    .where("fileId", "=", fileId)
    .orderBy("visitDate")
    .orderBy("plannedStartTime")
    .execute();
}

/**
 * One visit as the office lives it (script steps A5 to A8): in the morning the
 * team is chosen from the workers the rules let through and the order is
 * printed; in the afternoon the returned order is typed in, with everybody's
 * times and the client's sign-off. Returns how many workers took a seat.
 */
export async function doVisit(test: TestDatabase, visit: PlannedVisit, by: Session, signedBy: string): Promise<number> {
  test.clock.set(at(visit.visitDate, "07:30"));
  const seated = await test.transact(async (ex, ctx) => {
    const candidates = await listSeatCandidates(ex, ctx, { visitId: visit.id });
    const team = candidates
      .filter(
        (candidate) =>
          !candidate.sanctioned && candidate.worstLevel !== "REFUSED" && candidate.worstLevel !== "NEEDS_MANAGER",
      )
      .slice(0, visit.workersNeeded);
    for (const candidate of team) await assignVisitWorker(ex, ctx, { visitId: visit.id, workerId: candidate.id });
    await recordOrderPrinted(ex, ctx, { visitId: visit.id });
    return team.length;
  }, by);

  test.clock.set(at(visit.visitDate, "15:00"));
  await test.transact(async (ex, ctx) => {
    const entry = await getVisitEntry(ex, ctx, { visitId: visit.id });
    await saveReturnedOrder(ex, ctx, {
      visitId: visit.id,
      values: returnedSheet(entryValuesOf(entry, visit.visitDate), visit, signedBy),
    });
  }, by);
  return seated;
}

/** The log's entries about one row, oldest first: what each step left behind. */
export async function logOf(test: TestDatabase, entity: string, entityId: string) {
  return test.db
    .selectFrom("AuditLog")
    .select(["operation", "action", "entity", "userName", "reason"])
    .where("entity", "=", entity)
    .where("entityId", "=", entityId)
    .orderBy("chainSeq")
    .execute();
}

/**
 * The office opens the program every day: somebody at reception looks at the
 * file each morning up to (and including) `until`. A real month leaves an entry
 * in the log every working day; without it the clock check that guards invoices
 * and receipts (`assertClockSane`, three days by default) would see a week-long
 * hole between two weekly visits and ask the manager to confirm the date.
 */
export async function openEachMorning(test: TestDatabase, fileId: string, by: Session, until: string): Promise<void> {
  const day = new Date(`${test.ctx().today}T00:00:00.000Z`);
  const last = new Date(`${until}T00:00:00.000Z`);
  for (day.setUTCDate(day.getUTCDate() + 1); day <= last; day.setUTCDate(day.getUTCDate() + 1)) {
    test.clock.set(at(day.toISOString().slice(0, 10), "07:00"));
    await test.transact((ex, ctx) => recordFileOpened(ex, ctx, { fileId }), by);
  }
}
