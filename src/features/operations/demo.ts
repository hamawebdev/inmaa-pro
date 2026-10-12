import type { Executor, ServiceContext } from "@/lib/service/context";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { entryValuesOf } from "./components/visit-entry/visit-entry-data";
import { addDays, clockOf, minutesOf } from "./rules/calendar";
import { assignVisitWorker, listSeatCandidates } from "./services/assignment";
import { recordOrderPrinted } from "./services/mission-order";
import { generateFileVisits, OPEN_STATUSES } from "./services/programme";
import { getVisitEntry, reportArrival, saveReturnedOrder } from "./services/visit-entry";
import type { ReturnedOrderValues } from "./validators/returned-order";

/**
 * Operations' demo data, on top of Clients' files.
 *
 * Clients' demo takes its files to «متعاقد», and `file.contracted` has already
 * made their visits (events.ts). This adds what a week of work leaves behind:
 * teams where People's demo has workers to give, two orders returned and
 * signed off (one with the client's notes), today's first order printed and its
 * team's arrival phoned in. Everything goes through the services.
 */
export async function seedDemo(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};

  // A contracted file whose visits were not made (it reached «متعاقد» by another road) gets them now.
  const files = await ex
    .selectFrom("File")
    .select(["id"])
    .where("stage", "=", "CONTRACTED")
    .where("closedAt", "is", null)
    .where("deletedAt", "is", null)
    .orderBy("createdAt")
    .execute();
  for (const file of files) await generateFileVisits(ex, ctx, file.id);

  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "fileId", "visitDate", "plannedStartTime", "plannedDurationMin", "workersNeeded"])
    .where("status", "in", [...OPEN_STATUSES])
    .where("visitDate", ">=", addDays(ctx.today, -7) as typeof ctx.today)
    .where("visitDate", "<=", addDays(ctx.today, 7) as typeof ctx.today)
    .orderBy("visitDate")
    .orderBy("plannedStartTime")
    .orderBy("number")
    .execute();
  if (visits.length === 0) return names;
  names.fileWithVisits = visits[0].fileId;

  // Teams: the first workers the rules let through, visit by visit. Without People's workers, seats stay open.
  for (const visit of visits) {
    const candidates = await listSeatCandidates(ex, ctx, { visitId: visit.id });
    const free = candidates
      .filter(
        (candidate) =>
          !candidate.sanctioned && candidate.worstLevel !== "REFUSED" && candidate.worstLevel !== "NEEDS_MANAGER",
      )
      .slice(0, visit.workersNeeded);
    for (const candidate of free) await assignVisitWorker(ex, ctx, { visitId: visit.id, workerId: candidate.id });
  }

  const past = visits.filter((visit) => visit.visitDate < ctx.today);
  const today = visits.filter((visit) => visit.visitDate === ctx.today);
  const coming = visits.filter((visit) => visit.visitDate > ctx.today);

  // Two orders returned and signed off: the last two visits before today.
  const returned = past.slice(-2);
  for (const [index, visit] of returned.entries()) {
    // Printed the morning of the visit, typed in after the team came back.
    const morning = tools.at(`${visit.visitDate}T06:30:00.000Z`);
    await recordOrderPrinted(ex, morning, { visitId: visit.id });
    const afternoon = tools.at(`${visit.visitDate}T15:00:00.000Z`);
    const entry = await getVisitEntry(ex, afternoon, { visitId: visit.id });
    const withNotes = index === returned.length - 1 && returned.length > 1;
    await saveReturnedOrder(ex, afternoon, {
      visitId: visit.id,
      values: returnedSheet(entryValuesOf(entry, visit.visitDate), visit, withNotes),
    });
    names[withNotes ? "visitReturnedWithNotes" : "visitReturned"] = visit.id;
  }

  // Today: the first order is printed and its team's arrival was phoned in; the next one waits.
  if (today[0]) {
    await recordOrderPrinted(ex, ctx, { visitId: today[0].id });
    await reportArrival(ex, ctx, { visitId: today[0].id, via: "PHONE_SUPERVISOR" });
    names.visitInProgress = today[0].id;
  }
  if (today[1]) names.visitToday = today[1].id;
  if (coming[0]) names.visitTomorrow = coming[0].id;
  return names;
}

/** A sheet as it comes back: everyone on time, everything ticked, the client satisfied (or satisfied with notes). */
function returnedSheet(
  blank: ReturnedOrderValues,
  visit: { plannedStartTime: string; plannedDurationMin: number; visitDate: string },
  withNotes: boolean,
): ReturnedOrderValues {
  const start = minutesOf(visit.plannedStartTime);
  const end = start + visit.plannedDurationMin;
  return {
    ...blank,
    returnedDate: visit.visitDate,
    workers: blank.workers.map((worker, index) => ({
      ...worker,
      attended: true,
      arrivedTime: clockOf(start + (index === 0 && withNotes ? 10 : -5)),
      workStartTime: clockOf(start + (index === 0 && withNotes ? 15 : 0)),
      workEndTime: clockOf(end),
      leftTime: clockOf(end + 10),
      arrivalInitialled: true,
      departureInitialled: true,
      lateReason: index === 0 && withNotes ? "زحمة في الطريق" : "",
    })),
    checklist: blank.checklist.map((line, index) => ({ ...line, done: !(withNotes && index === 1) })),
    problemOnSite: withNotes,
    problemKinds: withNotes ? ["AREA_UNAVAILABLE"] : [],
    problemDetails: withNotes ? "مكان واحد كان مغلقاً ولم يتوفر المفتاح." : "",
    completion: withNotes ? "PARTIAL" : "FULL",
    completionPercent: withNotes ? 90 : 100,
    incompleteReason: withNotes ? "مكان مغلق ولم يتوفر المفتاح" : "",
    needsExtraVisit: false,
    needsSupervisor: false,
    signoffStatus: withNotes ? "ACCEPTED_WITH_NOTES" : "ACCEPTED",
    signoffName: "المسؤول في الموقع",
    signoffRole: "",
    signoffDate: visit.visitDate,
    signoffNotes: withNotes ? "العمل جيد. يبقى المكان المغلق للمرة القادمة." : "",
    wantsOtherService: false,
    ratings: withNotes
      ? { quality: 4, punctuality: 3, behaviour: 5, materials: 4, overall: 4 }
      : { quality: 5, punctuality: 5, behaviour: 5, materials: 4, overall: 5 },
    wouldRecommend: true,
    signedOnPaper: true,
    workerSigned: true,
  };
}
