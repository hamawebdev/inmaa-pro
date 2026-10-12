import { z } from "zod";

import { isClockTime, isIsoDate, minutesNear } from "../rules/calendar";

import { COMPLETIONS, PROBLEM_KINDS, SIGNOFF_STATUSES, type PresenceProof } from "./option-codes";

/**
 * A returned mission order, as the office types it from the sheet: one form,
 * one Save, in the order the sheet prints.
 *
 * Two levels of checking:
 *
 *  - The schema refuses what cannot be right: a time that is not a time, a
 *    worker marked absent with times written in, times in the wrong order, a
 *    problem kind ticked under «لا», the client's answer and "nobody signed"
 *    together. These block the Save.
 *  - `missingForComplete` lists what is still blank for the entry to be
 *    complete. A sheet often comes back with a blank or two; the office saves
 *    what it has, and the visit stays "partly typed" until the rest is known.
 *
 * Empty text and an empty time are written as "", a choice left blank as null.
 */

const timeOrEmpty = z.string().refine((value) => value === "" || isClockTime(value), "Enter a time as HH:MM.");
const dateOrEmpty = z.string().refine((value) => value === "" || isIsoDate(value), "Enter a valid date.");
const rating = z.number().int().min(1).max(5).nullable();
const yesNo = z.boolean().nullable();

export const RETURNED_WORKER_TIMES = ["arrivedTime", "workStartTime", "workEndTime", "leftTime"] as const;
export type ReturnedWorkerTime = (typeof RETURNED_WORKER_TIMES)[number];

export const returnedWorkerSchema = z.object({
  /** The worker's seat on the visit. */
  seatId: z.string().min(1),
  /** False when the worker did not come: the sheet's line stays blank. */
  attended: z.boolean(),
  arrivedTime: timeOrEmpty,
  workStartTime: timeOrEmpty,
  workEndTime: timeOrEmpty,
  leftTime: timeOrEmpty,
  /** The site contact's initials beside the arrival, and beside the departure. */
  arrivalInitialled: z.boolean(),
  departureInitialled: z.boolean(),
  lateReason: z.string().max(300),
});

export const RATING_KEYS = ["quality", "punctuality", "behaviour", "materials", "overall"] as const;
export type RatingKey = (typeof RATING_KEYS)[number];

export const returnedOrderSchema = z
  .object({
    /** The day the sheet came back to the office. */
    returnedDate: dateOrEmpty,
    workers: z.array(returnedWorkerSchema),
    /** Every tick line of the order: tasks, the floor table, the checks before leaving. */
    checklist: z.array(z.object({ id: z.string().min(1), done: z.boolean() })),

    problemOnSite: yesNo,
    problemKinds: z.array(z.enum(PROBLEM_KINDS)),
    problemDetails: z.string().max(1000),

    completion: z.enum(COMPLETIONS).nullable(),
    completionPercent: z.number().int().min(0).max(100).nullable(),
    incompleteReason: z.string().max(500),
    needsExtraVisit: yesNo,
    needsSupervisor: yesNo,

    signoffStatus: z.enum(SIGNOFF_STATUSES).nullable(),
    /** Why nobody signed, when nobody did. */
    signoffAbsentReason: z.string().max(300),
    signoffName: z.string().max(120),
    signoffRole: z.string().max(120),
    signoffDate: dateOrEmpty,
    signoffNotes: z.string().max(1000),
    wantsOtherService: yesNo,
    otherServiceText: z.string().max(300),
    ratings: z.object({
      quality: rating,
      punctuality: rating,
      behaviour: rating,
      materials: rating,
      overall: rating,
    }),
    wouldRecommend: yesNo,
    /** The client or the site contact signed the slip. */
    signedOnPaper: z.boolean(),
    workerSigned: z.boolean(),
  })
  .superRefine((order, ctx) => {
    order.workers.forEach((worker, index) => {
      const written = RETURNED_WORKER_TIMES.filter((name) => worker[name] !== "");
      if (!worker.attended) {
        for (const name of written) {
          ctx.addIssue({
            code: "custom",
            path: ["workers", index, name],
            message: "A worker marked absent cannot have times.",
          });
        }
        return;
      }
      // Each time that is written must come after the ones before it. A night
      // visit runs past midnight, so times are placed around the first one.
      const anchor = worker[written[0] ?? "arrivedTime"];
      if (!anchor || written.some((name) => !isClockTime(worker[name]))) return;
      let previous = -Infinity;
      for (const name of written) {
        const at = minutesNear(worker[name], anchor);
        if (at < previous) {
          ctx.addIssue({
            code: "custom",
            path: ["workers", index, name],
            message: "The times must follow each other: arrival, start of work, end of work, departure.",
          });
          return;
        }
        previous = at;
      }
    });

    if (order.problemOnSite === false && order.problemKinds.length > 0) {
      ctx.addIssue({
        code: "custom",
        path: ["problemKinds"],
        message: "Problem kinds are ticked, but the sheet says there was no problem.",
      });
    }

    if (order.signoffStatus !== null && order.signoffAbsentReason.trim() !== "") {
      ctx.addIssue({
        code: "custom",
        path: ["signoffAbsentReason"],
        message: "Give either the client's answer or why nobody signed, not both.",
      });
    }
  });

export type ReturnedOrderValues = z.infer<typeof returnedOrderSchema>;
export type ReturnedWorkerValues = z.infer<typeof returnedWorkerSchema>;

/** What is still blank for a complete entry. Each item names the place to look. */
export type MissingItem =
  | { code: "WORKER_ARRIVAL"; workerIndex: number }
  | { code: "WORKER_DEPARTURE"; workerIndex: number }
  | { code: "COMPLETION" }
  | { code: "INCOMPLETE_REASON" }
  | { code: "SIGNOFF" };

/**
 * What the sheet still lacks for the visit to count as fully typed in: both
 * times of every worker who came, how far the work got (with the reason when
 * it did not all get done), and the client's answer or why nobody signed.
 */
export function missingForComplete(order: ReturnedOrderValues): MissingItem[] {
  const missing: MissingItem[] = [];
  order.workers.forEach((worker, workerIndex) => {
    if (!worker.attended) return;
    if (worker.arrivedTime === "") missing.push({ code: "WORKER_ARRIVAL", workerIndex });
    if (worker.leftTime === "") missing.push({ code: "WORKER_DEPARTURE", workerIndex });
  });
  if (order.completion === null) missing.push({ code: "COMPLETION" });
  else if (order.completion !== "FULL" && order.incompleteReason.trim() === "") {
    missing.push({ code: "INCOMPLETE_REASON" });
  }
  if (order.signoffStatus === null && order.signoffAbsentReason.trim() === "") missing.push({ code: "SIGNOFF" });
  return missing;
}

/** The presence proof stored for a worker, from the two initials boxes of the sheet. */
export function presenceProofOf(
  worker: Pick<ReturnedWorkerValues, "arrivalInitialled" | "departureInitialled">,
): PresenceProof {
  if (worker.arrivalInitialled && worker.departureInitialled) return "BOTH";
  if (worker.arrivalInitialled) return "ARRIVAL_ONLY";
  if (worker.departureInitialled) return "DEPARTURE_ONLY";
  return "NONE";
}

/**
 * The weakest proof among the workers who came: what the visit as a whole can
 * show. A visit nobody came to proves nothing.
 */
export function weakestPresenceProof(workers: readonly ReturnedWorkerValues[]): PresenceProof {
  const order: readonly PresenceProof[] = ["NONE", "ARRIVAL_ONLY", "DEPARTURE_ONLY", "BOTH"];
  const proofs = workers.filter((worker) => worker.attended).map(presenceProofOf);
  if (proofs.length === 0) return "NONE";
  if (proofs.includes("NONE")) return "NONE";
  // One worker initialled only at arrival and another only at departure: neither time is proved for both.
  if (proofs.includes("ARRIVAL_ONLY") && proofs.includes("DEPARTURE_ONLY")) return "NONE";
  return proofs.reduce((weakest, proof) => (order.indexOf(proof) < order.indexOf(weakest) ? proof : weakest));
}
