import { localDate, localTime, minutes } from "@/lib/units";

import { addDays, minutesFromTo } from "../../rules/calendar";
import type { Seat } from "../../rules/working-time";
import { DEPARTURE_CHECKS } from "../../sheets/print-labels";
import { parseSampleKey, sampleMissionOrder } from "../../sheets/samples";
import type { MissionOrderData, OrderWorker } from "../../sheets/sheet-data";
import type { Division } from "../../validators/option-codes";

import type { VisitEntryChecklistItem, VisitEntryData, VisitEntryReport, VisitEntryWorker } from "./visit-entry-data";

/**
 * Sample visits for the visit page, until the visit service exists. They are
 * the visits of the print samples (../../sheets/samples.ts), so the page and the
 * printed order show the same team, tasks and answers.
 *
 *   sample-<division>    the order as printed, nothing typed yet
 *   returned-<division>  the order with what came back typed in
 *
 * The people and places are made up.
 */

/** The Saturday that opens the sample week. The sample visits are on Monday 12 October 2026. */
const WEEK = "2026-10-10";

function seat(id: string, siteId: string, dayOffset: number, startTime: string, endTime: string): Seat {
  return {
    visitId: id,
    siteId,
    date: addDays(WEEK, dayOffset),
    startTime,
    durationMin: minutesFromTo(startTime, endTime),
  };
}

/** Each sample worker's other seats that week, and the days her form says she is available. */
const WORKER_WEEKS: Record<string, { seats: Seat[]; availableDays: string[]; weeklyCapacityMin: number }> = {
  // The team leader: 36 hours elsewhere that week, so this visit takes her past the legal 40.
  "012/F": {
    seats: [
      seat("w12-sat", "building-1", 0, "08:00", "16:00"),
      seat("w12-sun", "building-1", 1, "08:00", "16:00"),
      seat("w12-tue", "organisation-2", 3, "08:00", "16:00"),
      seat("w12-wed", "building-1", 4, "08:00", "16:00"),
      seat("w12-thu", "organisation-2", 5, "08:00", "12:00"),
    ],
    availableDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
    weeklyCapacityMin: 2400,
  },
  // Her form does not offer Monday: she stands in for someone that day.
  "027/F": {
    seats: [
      seat("w27-mon-evening", "organisation-1", 2, "16:30", "18:30"),
      seat("w27-sat", "housing-2", 0, "08:00", "12:00"),
      seat("w27-tue", "housing-2", 3, "08:00", "12:00"),
    ],
    availableDays: ["SAT", "SUN", "TUE", "WED", "THU"],
    weeklyCapacityMin: 2400,
  },
  "008/H": {
    seats: [seat("w08-sat", "building-1", 0, "08:00", "12:00"), seat("w08-wed", "building-1", 4, "08:00", "12:00")],
    availableDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"],
    weeklyCapacityMin: 2400,
  },
};

function splitName(name: string): { firstName: string; lastName: string } {
  const [firstName = "", ...rest] = name.trim().split(/\s+/);
  return { firstName, lastName: rest.join(" ") };
}

function workerOf(visitId: string, worker: OrderWorker, index: number): VisitEntryWorker {
  const number = worker.number ?? `000/${worker.sex === "MALE" ? "H" : "F"}`;
  const week = WORKER_WEEKS[number] ?? {
    seats: [],
    availableDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
    weeklyCapacityMin: 2400,
  };
  const time = (value: string | null | undefined) => (value ? localTime(value) : null);
  return {
    seat: {
      id: `${visitId}-seat-${index + 1}`,
      workerId: `worker-${number}`,
      role: worker.role ?? "CLEANER",
      seatStatus: "ASSIGNED",
      arrivedTime: time(worker.arrived),
      workStartTime: time(worker.workStart),
      workEndTime: time(worker.workEnd),
      leftTime: time(worker.left),
      presenceProof: worker.arrived ? (worker.left ? "BOTH" : "ARRIVAL_ONLY") : null,
      lateReason: worker.lateReason ?? null,
    },
    worker: {
      id: `worker-${number}`,
      number,
      ...splitName(worker.name ?? ""),
      sex: worker.sex ?? "FEMALE",
      weeklyCapacityMin: minutes(week.weeklyCapacityMin),
      availableDays: JSON.stringify(week.availableDays),
    },
    otherSeats: week.seats,
    absentDates: [],
  };
}

function checklistOf(visitId: string, order: MissionOrderData): VisitEntryChecklistItem[] {
  const items: VisitEntryChecklistItem[] = [];
  const push = (item: Omit<VisitEntryChecklistItem, "id" | "sortOrder">) =>
    items.push({ ...item, id: `${visitId}-line-${items.length + 1}`, sortOrder: items.length + 1 });

  for (const group of order.taskGroups) {
    for (const task of group.tasks) {
      push({
        kind: "TASK",
        groupLabel: group.place,
        label: task.label,
        frequency: task.frequency,
        priority: null,
        carriedFromItemId: task.carried ? "an-earlier-visit" : null,
        done: task.done ?? null,
        note: null,
      });
    }
  }
  order.specialTasks.forEach((label, index) =>
    push({
      kind: "TASK",
      groupLabel: null,
      label,
      frequency: "SPECIAL",
      priority: index + 1,
      carriedFromItemId: null,
      done: null,
      note: null,
    }),
  );
  for (const area of order.areas) {
    push({
      kind: "AREA",
      groupLabel: null,
      note: area.requiredToday,
      label: area.label,
      frequency: null,
      priority: null,
      carriedFromItemId: null,
      done: area.done ?? null,
    });
  }
  DEPARTURE_CHECKS.forEach((label, index) =>
    push({
      kind: "DEPARTURE",
      groupLabel: null,
      label,
      frequency: null,
      priority: null,
      carriedFromItemId: null,
      done: order.returned ? (order.returned.departureChecks[index] ?? false) : null,
      note: null,
    }),
  );
  return items;
}

function reportOf(order: MissionOrderData): VisitEntryReport | null {
  const returned = order.returned;
  if (!returned) return null;
  const date = (value: string | null) => (value ? localDate(value) : null);
  return {
    returnedDate: date(order.visitDate),
    completion: returned.completion,
    completionPercent: returned.completionPercent,
    incompleteReason: returned.incompleteReason,
    needsExtraVisit: returned.needsExtraVisit,
    needsSupervisor: returned.needsSupervisor,
    workerNotes: returned.problemDetails,
    problemOnSite: returned.problemOnSite,
    signoffStatus: returned.signoff.status,
    signoffAbsentReason: null,
    signoffName: returned.signoff.name,
    signoffRole: returned.signoff.role,
    signoffDate: date(returned.signoff.date),
    signoffNotes: returned.signoff.notes,
    signedOnPaper: true,
    workerSigned: true,
    wantsOtherService: returned.signoff.wantsOtherService,
    otherServiceText: returned.signoff.otherService,
    ratingQuality: returned.signoff.ratings.quality ?? null,
    ratingPunctuality: returned.signoff.ratings.punctuality ?? null,
    ratingBehaviour: returned.signoff.ratings.behaviour ?? null,
    ratingMaterials: returned.signoff.ratings.materials ?? null,
    ratingOverall: returned.signoff.ratings.overall ?? null,
    wouldRecommend: returned.signoff.wouldRecommend,
  };
}

const SITE_IDS: Record<Division, string> = {
  HOUSING: "housing-1",
  ORGANISATION: "organisation-1",
  BUILDING: "building-1",
  COMPLEX: "complex-1",
};

/** The sample visit for a page key; an unknown key gives the homes sample. */
export function sampleVisitEntry(key: string | undefined): VisitEntryData {
  const { kind, division } = parseSampleKey(key);
  const order = sampleMissionOrder(`${kind === "returned" ? "returned" : "sample"}-${division.toLowerCase()}`);
  // Only the homes sample has a returned sheet; another division shows its order untyped.
  const typed = order.returned !== null;
  const visitId = `${typed ? "returned" : "sample"}-${division.toLowerCase()}`;
  const start = order.startTime ?? "08:00";
  return {
    visit: {
      id: visitId,
      number: order.number ?? "",
      visitDate: localDate(order.visitDate ?? "2026-10-12"),
      plannedStartTime: localTime(start),
      plannedDurationMin: minutes(minutesFromTo(start, order.endTime ?? "12:00")),
      workersNeeded: order.team.length,
      status: typed ? "DONE" : "CONFIRMED",
      arrivalReportedAt: null,
      orderPrintedAt: new Date("2026-10-11T15:00:00Z"),
    },
    file: { id: `file-${division.toLowerCase()}`, number: "0042/2026", division, serviceType: "CONTRACT" },
    site: { id: SITE_IDS[division], commonName: order.site.label, address: order.site.address ?? "" },
    commune: order.site.commune ? { nameAr: order.site.commune } : null,
    zone: { name: "أم البواقي" },
    supervisor: splitName(order.supervisor.name ?? ""),
    workers: order.team.map((worker, index) => workerOf(visitId, worker, index)),
    checklist: checklistOf(visitId, order),
    report: reportOf(order),
    problemKinds: order.returned ? [...order.returned.problemKinds] : [],
  };
}
