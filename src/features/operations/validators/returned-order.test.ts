import { describe, expect, it } from "vitest";

import { zodErrorMap } from "@/i18n/errors";

import {
  missingForComplete,
  presenceProofOf,
  returnedOrderSchema,
  weakestPresenceProof,
  type ReturnedOrderValues,
  type ReturnedWorkerValues,
} from "./returned-order";

function worker(over: Partial<ReturnedWorkerValues> = {}): ReturnedWorkerValues {
  return {
    seatId: "seat-1",
    attended: true,
    arrivedTime: "09:05",
    workStartTime: "09:15",
    workEndTime: "13:40",
    leftTime: "13:50",
    arrivalInitialled: true,
    departureInitialled: true,
    lateReason: "",
    ...over,
  };
}

function order(over: Partial<ReturnedOrderValues> = {}): ReturnedOrderValues {
  return {
    returnedDate: "2026-10-12",
    workers: [worker()],
    checklist: [{ id: "line-1", done: true }],
    problemOnSite: false,
    problemKinds: [],
    problemDetails: "",
    completion: "FULL",
    completionPercent: 100,
    incompleteReason: "",
    needsExtraVisit: false,
    needsSupervisor: false,
    signoffStatus: "ACCEPTED",
    signoffAbsentReason: "",
    signoffName: "ليلى حمدي",
    signoffRole: "",
    signoffDate: "2026-10-12",
    signoffNotes: "",
    wantsOtherService: null,
    otherServiceText: "",
    ratings: { quality: 5, punctuality: 4, behaviour: 5, materials: 4, overall: 5 },
    wouldRecommend: true,
    signedOnPaper: true,
    workerSigned: true,
    ...over,
  };
}

function problems(values: ReturnedOrderValues) {
  const result = returnedOrderSchema.safeParse(values, { errorMap: zodErrorMap });
  return result.success
    ? []
    : result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message }));
}

describe("a returned order", () => {
  it("accepts a complete sheet", () => {
    expect(problems(order())).toEqual([]);
  });

  it("accepts a sheet left almost blank", () => {
    const blank = order({
      returnedDate: "",
      workers: [worker({ arrivedTime: "", workStartTime: "", workEndTime: "", leftTime: "" })],
      problemOnSite: null,
      completion: null,
      completionPercent: null,
      signoffStatus: null,
      signoffName: "",
      signoffDate: "",
      ratings: { quality: null, punctuality: null, behaviour: null, materials: null, overall: null },
      wouldRecommend: null,
    });
    expect(problems(blank)).toEqual([]);
  });

  it("refuses a time that is not a time, and a date that is not a date", () => {
    expect(problems(order({ workers: [worker({ arrivedTime: "9:05" })] }))).toEqual([
      { path: "workers.0.arrivedTime", message: "Enter a time as HH:MM." },
    ]);
    expect(problems(order({ signoffDate: "2026-02-30" }))).toEqual([
      { path: "signoffDate", message: "Enter a valid date." },
    ]);
  });

  it("refuses times for a worker marked absent", () => {
    expect(problems(order({ workers: [worker({ attended: false, leftTime: "" })] }))).toEqual([
      { path: "workers.0.arrivedTime", message: "A worker marked absent cannot have times." },
      { path: "workers.0.workStartTime", message: "A worker marked absent cannot have times." },
      { path: "workers.0.workEndTime", message: "A worker marked absent cannot have times." },
    ]);
    expect(
      problems(
        order({
          workers: [worker({ attended: false, arrivedTime: "", workStartTime: "", workEndTime: "", leftTime: "" })],
        }),
      ),
    ).toEqual([]);
  });

  it("refuses times out of order, and names the first one that is", () => {
    expect(problems(order({ workers: [worker({ workEndTime: "09:10" })] }))).toEqual([
      {
        path: "workers.0.workEndTime",
        message: "The times must follow each other: arrival, start of work, end of work, departure.",
      },
    ]);
  });

  it("reads a night visit across midnight in order", () => {
    const night = worker({ arrivedTime: "21:50", workStartTime: "22:00", workEndTime: "01:45", leftTime: "02:00" });
    expect(problems(order({ workers: [night] }))).toEqual([]);
  });

  it("checks only the times that are written", () => {
    expect(problems(order({ workers: [worker({ workStartTime: "", workEndTime: "" })] }))).toEqual([]);
    // Only the end of work and the departure are written: they are in order.
    expect(
      problems(order({ workers: [worker({ arrivedTime: "", workStartTime: "", workEndTime: "13:40" })] })),
    ).toEqual([]);
    // A departure before the end of work is refused, whatever is blank.
    expect(
      problems(order({ workers: [worker({ arrivedTime: "", workStartTime: "", workEndTime: "14:00" })] })).map(
        (issue) => issue.path,
      ),
    ).toEqual(["workers.0.leftTime"]);
  });

  it("refuses a problem kind ticked under «no problem»", () => {
    expect(problems(order({ problemOnSite: false, problemKinds: ["PRIOR_DAMAGE"] }))).toEqual([
      { path: "problemKinds", message: "Problem kinds are ticked, but the sheet says there was no problem." },
    ]);
    expect(problems(order({ problemOnSite: true, problemKinds: ["PRIOR_DAMAGE"] }))).toEqual([]);
    expect(problems(order({ problemOnSite: null, problemKinds: ["PRIOR_DAMAGE"] }))).toEqual([]);
  });

  it("refuses the client's answer together with a reason nobody signed", () => {
    expect(problems(order({ signoffAbsentReason: "المسؤول غائب" }))).toEqual([
      { path: "signoffAbsentReason", message: "Give either the client's answer or why nobody signed, not both." },
    ]);
    expect(problems(order({ signoffStatus: null, signoffAbsentReason: "المسؤول غائب" }))).toEqual([]);
  });

  it("keeps ratings and the percentage in their scales", () => {
    expect(problems(order({ completionPercent: 101 })).map((issue) => issue.path)).toEqual(["completionPercent"]);
    expect(
      problems(order({ ratings: { quality: 6, punctuality: 0, behaviour: 5, materials: 4, overall: 5 } })).map(
        (issue) => issue.path,
      ),
    ).toEqual(["ratings.quality", "ratings.punctuality"]);
  });
});

describe("what a complete entry still needs", () => {
  it("is nothing for a complete sheet", () => {
    expect(missingForComplete(order())).toEqual([]);
  });

  it("asks for both times of every worker who came", () => {
    const values = order({
      workers: [
        worker({ arrivedTime: "" }),
        worker({ seatId: "seat-2", leftTime: "" }),
        worker({ seatId: "seat-3", attended: false, arrivedTime: "", leftTime: "" }),
      ],
    });
    expect(missingForComplete(values)).toEqual([
      { code: "WORKER_ARRIVAL", workerIndex: 0 },
      { code: "WORKER_DEPARTURE", workerIndex: 1 },
    ]);
  });

  it("asks how far the work got, and why when it did not all get done", () => {
    expect(missingForComplete(order({ completion: null }))).toEqual([{ code: "COMPLETION" }]);
    expect(missingForComplete(order({ completion: "PARTIAL" }))).toEqual([{ code: "INCOMPLETE_REASON" }]);
    expect(missingForComplete(order({ completion: "PARTIAL", incompleteReason: "الشرفة مغلقة" }))).toEqual([]);
  });

  it("asks for the client's answer, or why nobody signed", () => {
    expect(missingForComplete(order({ signoffStatus: null }))).toEqual([{ code: "SIGNOFF" }]);
    expect(missingForComplete(order({ signoffStatus: null, signoffAbsentReason: "لا أحد في الموقع" }))).toEqual([]);
  });
});

describe("the presence proof", () => {
  it("follows the two initials boxes", () => {
    expect(presenceProofOf({ arrivalInitialled: true, departureInitialled: true })).toBe("BOTH");
    expect(presenceProofOf({ arrivalInitialled: true, departureInitialled: false })).toBe("ARRIVAL_ONLY");
    expect(presenceProofOf({ arrivalInitialled: false, departureInitialled: true })).toBe("DEPARTURE_ONLY");
    expect(presenceProofOf({ arrivalInitialled: false, departureInitialled: false })).toBe("NONE");
  });

  it("gives the visit the weakest proof among the workers who came", () => {
    expect(weakestPresenceProof([worker(), worker({ departureInitialled: false })])).toBe("ARRIVAL_ONLY");
    expect(weakestPresenceProof([worker(), worker({ arrivalInitialled: false, departureInitialled: false })])).toBe(
      "NONE",
    );
    expect(weakestPresenceProof([worker({ departureInitialled: false }), worker({ arrivalInitialled: false })])).toBe(
      "NONE",
    );
    expect(weakestPresenceProof([worker(), worker({ attended: false, arrivalInitialled: false })])).toBe("BOTH");
    expect(weakestPresenceProof([])).toBe("NONE");
  });
});
