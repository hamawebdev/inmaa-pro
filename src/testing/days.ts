import { confirmClockJump } from "@/lib/clock/sanity";
import { logConsult } from "@/lib/log";

import type { TestDatabase } from "./database";

/**
 * Passing over days in a test the way a real office does, so that the clock
 * guard (src/lib/clock/sanity.ts) sees what it would see at the centre.
 *
 * The guard measures the PC's date against the work recorded, never against a
 * sign-in (written at the PC's own date). A test that sets the clock weeks
 * ahead and issues an invoice looks like a PC whose date was mistyped, and is
 * refused, as it should be. Two honest ways over the gap:
 *
 *     await workUntil(test, "2026-12-01T08:00:00.000Z"); // the office worked every day in between
 *     await confirmDate(test, "2026-12-01T08:00:00.000Z"); // the centre was closed: the manager confirms the date
 *
 * At the centre nothing is logged without a sign-in, and a sign-in on a date
 * that jumped marks its whole session as not counting (audit INV-1). A test
 * has no sign-in: one entry written at the far day would pass the guard where
 * the real office would be stopped. Use these two instead.
 */

const DAY_MS = 86_400_000;

/** One operation of a working day, logged as the manager: what the clock is measured against. */
async function recordWork(test: TestDatabase): Promise<void> {
  await test.transact((ex, ctx) =>
    logConsult(ex, ctx, { owner: "FOUNDATION", action: "VIEW", context: { test: "a working day" } }),
  );
}

/**
 * Moves the clock forward to `instant` as an office that works every day: one
 * logged operation on each day passed over, a day apart, and one at `instant`
 * itself. The clock never jumps more than a day, so nothing asks the manager.
 */
export async function workUntil(test: TestDatabase, instant: string): Promise<void> {
  const target = Date.parse(instant);
  if (Number.isNaN(target)) throw new Error(`testing: ${instant} is not an instant`);
  if (target < test.clock.now().getTime()) {
    throw new Error("testing: workUntil only goes forward; a clock set back is what the guard refuses");
  }
  while (target - test.clock.now().getTime() > DAY_MS) {
    test.clock.advance({ days: 1 });
    await recordWork(test);
  }
  test.clock.set(instant);
  await recordWork(test);
}

/**
 * Moves the clock to `instant` (when given) and has the manager confirm the
 * date through the service, as he does after the centre was closed: a
 * CLOCK_WARNING in the log, and nothing when the date had not jumped. A clock
 * set back is refused, as it is at the centre.
 */
export async function confirmDate(test: TestDatabase, instant?: string): Promise<void> {
  if (instant !== undefined) test.clock.set(instant);
  await test.transact((ex, ctx) => confirmClockJump(ex, ctx));
}
