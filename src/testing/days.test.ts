import { afterEach, beforeEach, expect, it } from "vitest";

import { assertClockSane, ClockJumpError } from "@/lib/clock/sanity";

import { createTestDatabase, type TestDatabase } from "./database";
import { confirmDate, workUntil } from "./days";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const sane = () => test.transact((ex, ctx) => assertClockSane(ex, ctx));

it("passes seven weeks as an office that works every day: the guard has nothing to ask", async () => {
  await workUntil(test, "2026-12-01T08:00:00.000Z");
  expect(test.clock.now().toISOString()).toBe("2026-12-01T08:00:00.000Z");
  await expect(sane()).resolves.toBeUndefined();
  const days = await test.db
    .selectFrom("AuditLog")
    .select("localDate")
    .distinct()
    .where("operation", "=", "CONSULT")
    .execute();
  expect(days).toHaveLength(50);
});

it("passes a closure as the manager does: he confirms the date once", async () => {
  test.clock.set("2026-12-01T08:00:00.000Z");
  await expect(sane()).rejects.toBeInstanceOf(ClockJumpError);
  await confirmDate(test);
  await expect(sane()).resolves.toBeUndefined();
  const last = await test.db
    .selectFrom("AuditLog")
    .select("action")
    .orderBy("chainSeq", "desc")
    .limit(1)
    .executeTakeFirstOrThrow();
  expect(last.action).toBe("CLOCK_WARNING");
});

it("goes forward only: a clock set back is what the guard refuses", async () => {
  await expect(workUntil(test, "2026-10-01T08:00:00.000Z")).rejects.toThrow("only goes forward");
  await expect(confirmDate(test, "2026-10-01T08:00:00.000Z")).rejects.toThrow("earlier than the last recorded");
});
