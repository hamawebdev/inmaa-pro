import { describe, expect, it } from "vitest";

import { addDays, addMonths, diffDays, formatDate, minutesBetween, weekdayFromSaturday } from "./dates";
import { buildDueSchedule, missingDueTerms, type DueTerms, type PlannedVisit } from "./due-schedule";

const da = (dinars: number) => Math.round(dinars * 100);

/** Visits on the given days of November 2026 (the 1st is a Sunday). */
const november = (...days: number[]): PlannedVisit[] =>
  days.map((day) => ({ id: `v${day}`, date: `2026-11-${String(day).padStart(2, "0")}` }));

/** Sunday and Wednesday, «اثنين بالأسبوع». */
const SUN_WED = november(1, 4, 8, 11, 15, 18, 22, 25, 29);

const dates = (dues: { dueDate: string }[]) => dues.map((due) => due.dueDate);
const amounts = (dues: { expectedAmount: number }[]) => dues.map((due) => due.expectedAmount);

describe("calendar dates", () => {
  it("knows the calendar the worked examples rest on", () => {
    // 0 السبت … 6 الجمعة
    expect(weekdayFromSaturday("2026-11-01")).toBe(1);
    expect(weekdayFromSaturday("2026-11-07")).toBe(0);
    expect(weekdayFromSaturday("2026-11-06")).toBe(6);
  });

  it("adds days and months without drifting", () => {
    expect(addDays("2026-11-28", 7)).toBe("2026-12-05");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-03-01", -1)).toBe("2028-02-29");
    expect(addMonths("2027-01-31", 1)).toBe("2027-02-28");
    expect(addMonths("2027-01-31", 2)).toBe("2027-03-31");
    expect(addMonths("2026-11-30", 2)).toBe("2027-01-30");
    expect(addMonths("2026-11-05", 14)).toBe("2028-01-05");
    expect(diffDays("2026-10-12", "2026-11-11")).toBe(30);
    expect(diffDays("2026-11-11", "2026-10-12")).toBe(-30);
  });

  it("writes a date as his forms do and refuses what is not a date", () => {
    expect(formatDate("2026-11-30")).toBe("30/11/2026");
    expect(() => formatDate("2026-02-30")).toThrow(RangeError);
    expect(() => addDays("30/11/2026", 1)).toThrow(RangeError);
  });

  it("counts minutes between two clock times, over midnight too", () => {
    expect(minutesBetween("08:00", "12:00")).toBe(240);
    expect(minutesBetween("22:00", "01:30")).toBe(210);
    expect(() => minutesBetween("8:00", "12:00")).toThrow(RangeError);
  });
});

describe("dues of a contract paid «كل شهر»", () => {
  const threeMonths: DueTerms = {
    serviceType: "CONTRACT",
    startDate: "2026-11-01",
    endDate: "2027-01-31",
    frequency: "MONTHLY",
    totalAmount: da(45_000),
    amountBasis: "PER_PAYMENT_PERIOD",
    firstDueDate: "2026-11-05",
  };

  it("per payment period: the amount each month, on the day he wrote", () => {
    const dues = buildDueSchedule(threeMonths, []);
    expect(dues).toEqual([
      {
        seq: 1,
        kind: "SCHEDULE",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        visitId: null,
        dueDate: "2026-11-05",
        plannedVisits: 0,
        expectedAmount: da(45_000),
      },
      {
        seq: 2,
        kind: "SCHEDULE",
        periodStart: "2026-12-01",
        periodEnd: "2026-12-31",
        visitId: null,
        dueDate: "2026-12-05",
        plannedVisits: 0,
        expectedAmount: da(45_000),
      },
      {
        seq: 3,
        kind: "SCHEDULE",
        periodStart: "2027-01-01",
        periodEnd: "2027-01-31",
        visitId: null,
        dueDate: "2027-01-05",
        plannedVisits: 0,
        expectedAmount: da(45_000),
      },
    ]);
  });

  it("a first date at the end of the month means arrears", () => {
    const dues = buildDueSchedule({ ...threeMonths, firstDueDate: "2026-11-30" }, []);
    expect(dates(dues)).toEqual(["2026-11-30", "2026-12-30", "2027-01-30"]);
  });

  it("keeps the day number: 31 January, 28 February, 31 March", () => {
    const dues = buildDueSchedule(
      { ...threeMonths, startDate: "2027-01-01", endDate: "2027-03-31", firstDueDate: "2027-01-31" },
      [],
    );
    expect(dates(dues)).toEqual(["2027-01-31", "2027-02-28", "2027-03-31"]);
  });

  it("with no first date, each due falls on the last day of its period", () => {
    const dues = buildDueSchedule({ ...threeMonths, firstDueDate: null }, []);
    expect(dates(dues)).toEqual(["2026-11-30", "2026-12-31", "2027-01-31"]);
  });

  it("whole contract: the amount shared, the last due taking the remainder", () => {
    const dues = buildDueSchedule({ ...threeMonths, totalAmount: da(100_000), amountBasis: "WHOLE_CONTRACT" }, []);
    expect(amounts(dues)).toEqual([da(33_333.33), da(33_333.33), da(33_333.34)]);

    const even = buildDueSchedule({ ...threeMonths, totalAmount: da(135_000), amountBasis: "WHOLE_CONTRACT" }, []);
    expect(amounts(even)).toEqual([da(45_000), da(45_000), da(45_000)]);
  });

  it("whole months weigh the same however many visits fall in each", () => {
    // Saturday, Monday, Wednesday: 13 visits in November, 13 in December, 13 in January.
    const visits: PlannedVisit[] = [];
    for (let day = "2026-11-01"; day <= "2027-01-31"; day = addDays(day, 1)) {
      if ([0, 2, 4].includes(weekdayFromSaturday(day))) visits.push({ id: day, date: day });
    }
    const dues = buildDueSchedule(threeMonths, visits);
    expect(dues.map((due) => due.plannedVisits)).toEqual([13, 13, 13]);
    expect(amounts(dues)).toEqual([da(45_000), da(45_000), da(45_000)]);
  });

  it("a contract that starts mid-month has periods from its own start", () => {
    const dues = buildDueSchedule(
      { ...threeMonths, startDate: "2026-11-15", endDate: "2027-01-14", firstDueDate: null },
      [],
    );
    expect(dues.map((due) => [due.periodStart, due.periodEnd])).toEqual([
      ["2026-11-15", "2026-12-14"],
      ["2026-12-15", "2027-01-14"],
    ]);
  });
});

describe("dues of a contract paid «أسبوعيا»", () => {
  const oneMonth: DueTerms = {
    serviceType: "CONTRACT",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    frequency: "WEEKLY",
    totalAmount: da(6_000),
    amountBasis: "PER_PAYMENT_PERIOD",
    firstDueDate: "2026-11-05",
  };

  it("per payment period: four whole weeks, and a last one cut to half its visits", () => {
    const dues = buildDueSchedule(oneMonth, SUN_WED);
    expect(dues.map((due) => [due.periodStart, due.periodEnd, due.plannedVisits])).toEqual([
      ["2026-11-01", "2026-11-07", 2],
      ["2026-11-08", "2026-11-14", 2],
      ["2026-11-15", "2026-11-21", 2],
      ["2026-11-22", "2026-11-28", 2],
      ["2026-11-29", "2026-11-30", 1],
    ]);
    expect(dates(dues)).toEqual(["2026-11-05", "2026-11-12", "2026-11-19", "2026-11-26", "2026-12-03"]);
    expect(amounts(dues)).toEqual([da(6_000), da(6_000), da(6_000), da(6_000), da(3_000)]);
    expect(amounts(dues).reduce((a, b) => a + b)).toBe(da(27_000));
  });

  it("whole contract: the same five amounts from 27 000,00", () => {
    const dues = buildDueSchedule({ ...oneMonth, totalAmount: da(27_000), amountBasis: "WHOLE_CONTRACT" }, SUN_WED);
    expect(amounts(dues)).toEqual([da(6_000), da(6_000), da(6_000), da(6_000), da(3_000)]);
  });

  it("a cut last week with no visit in it has no due", () => {
    // Without the Sunday of the 29th, the two last days of the month hold no visit.
    const dues = buildDueSchedule(oneMonth, SUN_WED.slice(0, 8));
    expect(dues).toHaveLength(4);
    expect(dues.map((due) => due.seq)).toEqual([1, 2, 3, 4]);
    expect(amounts(dues)).toEqual([da(6_000), da(6_000), da(6_000), da(6_000)]);
  });

  it("a cut last week never weighs more than a whole one", () => {
    // Three visits squeezed into the last two days.
    const crowded = [...SUN_WED, { id: "x1", date: "2026-11-30" }, { id: "x2", date: "2026-11-30" }];
    expect(amounts(buildDueSchedule(oneMonth, crowded)).at(-1)).toBe(da(6_000));
  });

  it("before any visit is planned, a cut week weighs its days", () => {
    const dues = buildDueSchedule(oneMonth, []);
    // 2 days of 7: 6 000,00 × 2 ÷ 7 = 1 714,29
    expect(amounts(dues)).toEqual([da(6_000), da(6_000), da(6_000), da(6_000), da(1_714.29)]);
  });

  it("every two weeks: two whole periods and a cut one", () => {
    const dues = buildDueSchedule({ ...oneMonth, frequency: "BIWEEKLY", totalAmount: da(12_000) }, SUN_WED);
    expect(dues.map((due) => [due.periodStart, due.periodEnd, due.plannedVisits])).toEqual([
      ["2026-11-01", "2026-11-14", 4],
      ["2026-11-15", "2026-11-28", 4],
      ["2026-11-29", "2026-11-30", 1],
    ]);
    expect(dates(dues)).toEqual(["2026-11-05", "2026-11-19", "2026-12-03"]);
    expect(amounts(dues)).toEqual([da(12_000), da(12_000), da(3_000)]);
  });

  it("a contract shorter than one period has one due for the whole amount", () => {
    const dues = buildDueSchedule(
      { ...oneMonth, endDate: "2026-11-04", firstDueDate: null },
      SUN_WED.filter((visit) => visit.date <= "2026-11-04"),
    );
    expect(dues).toHaveLength(1);
    expect([dues[0].periodEnd, dues[0].dueDate, dues[0].expectedAmount]).toEqual([
      "2026-11-04",
      "2026-11-04",
      da(6_000),
    ]);
  });
});

describe("dues of a contract paid «بعد كل زيارة»", () => {
  const perVisit: DueTerms = {
    serviceType: "CONTRACT",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    frequency: "PER_VISIT",
    totalAmount: da(3_000),
    amountBasis: "PER_PAYMENT_PERIOD",
    firstDueDate: "2026-11-01",
  };

  it("one due per planned visit, on the visit's day", () => {
    const dues = buildDueSchedule(perVisit, SUN_WED);
    expect(dues).toHaveLength(9);
    expect(dues.every((due) => due.kind === "VISIT" && due.expectedAmount === da(3_000))).toBe(true);
    expect(dates(dues)).toEqual(SUN_WED.map((visit) => visit.date));
    expect(dues.map((due) => due.visitId)).toEqual(SUN_WED.map((visit) => visit.id));
    expect(amounts(dues).reduce((a, b) => a + b)).toBe(da(27_000));
  });

  it("keeps the delay between the first visit and the first due date", () => {
    const dues = buildDueSchedule({ ...perVisit, firstDueDate: "2026-11-03" }, SUN_WED);
    expect(dates(dues).slice(0, 3)).toEqual(["2026-11-03", "2026-11-06", "2026-11-10"]);
  });

  it("whole contract: the amount shared between the visits", () => {
    const dues = buildDueSchedule({ ...perVisit, totalAmount: da(25_000), amountBasis: "WHOLE_CONTRACT" }, SUN_WED);
    // 25 000,00 ÷ 9 = 2 777,78; the ninth takes the remainder.
    expect(amounts(dues)).toEqual([...Array<number>(8).fill(da(2_777.78)), da(2_777.76)]);
  });

  it("has no due until a visit is planned, and ignores visits outside the contract", () => {
    expect(buildDueSchedule(perVisit, [])).toEqual([]);
    const outside = [{ id: "before", date: "2026-10-28" }, ...SUN_WED, { id: "after", date: "2026-12-02" }];
    expect(buildDueSchedule(perVisit, outside)).toHaveLength(9);
  });

  it("orders visits by day whatever order they arrive in", () => {
    const dues = buildDueSchedule(perVisit, [...SUN_WED].reverse());
    expect(dates(dues)).toEqual(SUN_WED.map((visit) => visit.date));
  });
});

describe("dues of a request (on demand)", () => {
  const request: DueTerms = {
    serviceType: "ON_DEMAND",
    startDate: "2026-11-10",
    endDate: "2026-11-12",
    frequency: null,
    totalAmount: da(48_000),
    amountBasis: "WHOLE_CONTRACT",
    firstDueDate: "2026-11-15",
  };

  it("one due for the whole job, on «تاريخ التسديد»", () => {
    expect(buildDueSchedule(request, november(10, 11, 12))).toEqual([
      {
        seq: 1,
        kind: "SINGLE",
        periodStart: "2026-11-10",
        periodEnd: "2026-11-12",
        visitId: null,
        dueDate: "2026-11-15",
        plannedVisits: 3,
        expectedAmount: da(48_000),
      },
    ]);
  });

  it("else on «تاريخ النهاية», else on the last planned visit, else on the start", () => {
    expect(buildDueSchedule({ ...request, firstDueDate: null }, [])[0].dueDate).toBe("2026-11-12");
    expect(buildDueSchedule({ ...request, firstDueDate: null, endDate: null }, november(10, 11))[0].dueDate).toBe(
      "2026-11-11",
    );
    expect(buildDueSchedule({ ...request, firstDueDate: null, endDate: null }, [])[0].dueDate).toBe("2026-11-10");
  });
});

describe("terms that cannot give dues", () => {
  const contract: DueTerms = {
    serviceType: "CONTRACT",
    startDate: "2026-11-01",
    endDate: "2026-11-30",
    frequency: "MONTHLY",
    totalAmount: da(45_000),
    amountBasis: "PER_PAYMENT_PERIOD",
    firstDueDate: null,
  };

  it("a contract with no frequency or no end date expects nothing yet, and says what is missing", () => {
    expect(buildDueSchedule({ ...contract, frequency: null }, [])).toEqual([]);
    expect(buildDueSchedule({ ...contract, endDate: null }, [])).toEqual([]);
    expect(missingDueTerms({ ...contract, frequency: null, endDate: null })).toEqual(["frequency", "endDate"]);
    expect(missingDueTerms(contract)).toEqual([]);
    expect(missingDueTerms({ ...contract, serviceType: "ON_DEMAND", frequency: null, endDate: null })).toEqual([]);
  });

  it("refuses an end before the start and an amount that is not whole centimes", () => {
    expect(() => buildDueSchedule({ ...contract, endDate: "2026-10-31" }, [])).toThrow(RangeError);
    expect(() => buildDueSchedule({ ...contract, totalAmount: 100.5 }, [])).toThrow(RangeError);
    expect(() => buildDueSchedule({ ...contract, totalAmount: -1 }, [])).toThrow(RangeError);
  });
});
