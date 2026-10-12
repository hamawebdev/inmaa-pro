import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { addDays, daysBetween, fixedClock, toInstant, toLocal, yearOf } from "./index";
import { assertClockSane, ClockJumpError } from "./sanity";

describe("the centre's clock", () => {
  it("reads the date and time at the centre's own offset, both ways", () => {
    expect(toLocal("2026-10-12T23:30:00.000Z", 60)).toEqual({ date: "2026-10-13", time: "00:30" });
    expect(toInstant(localDate("2026-10-13"), localTime("00:30"), 60)).toBe("2026-10-12T23:30:00.000Z");
  });

  it("counts calendar days across a month end, a year end and a leap day", () => {
    expect(addDays(localDate("2026-01-31"), 1)).toBe("2026-02-01");
    expect(addDays(localDate("2028-02-28"), 1)).toBe("2028-02-29");
    expect(daysBetween(localDate("2026-12-31"), localDate("2027-01-02"))).toBe(2);
    expect(yearOf(localDate("2027-01-02"))).toBe(2027);
  });

  it("stands still until it is moved", () => {
    const clock = fixedClock("2026-10-12T08:00:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-10-12T08:00:00.000Z");
    clock.advance({ days: 1, hours: 2 });
    expect(clock.now().toISOString()).toBe("2026-10-13T10:00:00.000Z");
    expect(() => clock.set("not an instant")).toThrow("is not an instant");
  });
});

describe("assertClockSane (C3)", () => {
  let test: TestDatabase;

  beforeEach(async () => {
    test = await createTestDatabase();
  });

  afterEach(() => test.close());

  it("refuses a clock behind the last recorded operation", async () => {
    test.clock.advance({ days: -1 });
    await expect(test.transact((ex, ctx) => assertClockSane(ex, ctx))).rejects.toThrow(
      "The date of this PC is earlier than the last recorded operation.",
    );
  });

  it("asks the manager about a jump forward, and logs his answer", async () => {
    test.clock.advance({ days: 10 });
    await expect(test.transact((ex, ctx) => assertClockSane(ex, ctx))).rejects.toBeInstanceOf(ClockJumpError);
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => assertClockSane(ex, ctx, { confirmedJump: true }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");

    await test.transact((ex, ctx) => assertClockSane(ex, ctx, { confirmedJump: true }));

    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "SECURITY", action: "CLOCK_WARNING", localDate: "2026-10-22" });
    expect(JSON.parse(entry.context ?? "null")).toMatchObject({ jumpDays: 10 });
    // Confirmed once: the next issue that day passes.
    await expect(test.transact((ex, ctx) => assertClockSane(ex, ctx))).resolves.toBeUndefined();
  });

  it("lets a normal day pass without a word", async () => {
    test.clock.advance({ days: 2 });
    await expect(test.transact((ex, ctx) => assertClockSane(ex, ctx))).resolves.toBeUndefined();
  });
});
