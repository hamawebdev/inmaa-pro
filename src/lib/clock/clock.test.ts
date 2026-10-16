import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import { setFirstPassword, signIn, signOut } from "@/features/core/services/sign-in";
import { createAccount, giveAccountPassword } from "@/features/core/services/users";
import { issueInvoice } from "@/features/money/services/invoices";
import { logConsult } from "@/lib/log";
import { SYSTEM_SESSION, type Session } from "@/lib/service/context";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { addDays, daysBetween, fixedClock, toInstant, toLocal, yearOf } from "./index";
import { assertClockSane, checkClock, CLOCK_BEHIND, ClockJumpError, confirmClockJump } from "./sanity";

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

describe("the clock across sessions (audit INV-1)", () => {
  let test: TestDatabase;
  const FAST = { iterations: 1_000 };

  beforeEach(async () => {
    test = await createTestDatabase();
  });

  afterEach(() => test.close());

  /** The sign-in window: nobody is signed in, the program asks. */
  const asProgram = <T>(work: Parameters<TestDatabase["transact"]>[0]) =>
    test.transact(work, SYSTEM_SESSION) as Promise<T>;

  async function signInAs(userId: string, password: string): Promise<Session> {
    const answer = await asProgram<{ ok: boolean; session?: Session }>((ex, ctx) =>
      signIn(ex, ctx, { userId, password }),
    );
    if (!answer.ok || !answer.session) throw new Error(`test: ${userId} could not sign in`);
    return answer.session;
  }

  /** The manager with his password, and an accountant who has chosen hers, both at the first day's date. */
  async function office() {
    await asProgram((ex, ctx) =>
      setFirstPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password: "manager-pass", ...FAST }),
    );
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "accountant", displayName: "كريم", roleId: "ACCOUNTANT" }),
    );
    await test.transact((ex, ctx) => giveAccountPassword(ex, ctx, { userId: id, password: "given-pass", ...FAST }));
    await asProgram((ex, ctx) =>
      signIn(ex, ctx, { userId: id, password: "given-pass", newPassword: "own-pass", ...FAST }),
    );
    const accountant = await signInAs(id, "own-pass");
    // A morning's work at the right date, then she leaves.
    await test.transact(
      (ex, ctx) => logConsult(ex, ctx, { owner: "MONEY", action: "VIEW", entity: "PaymentDue" }),
      accountant,
    );
    await test.transact((ex, ctx) => signOut(ex, ctx), accountant);
    return { accountantId: id };
  }

  const issueAs = (session: Session) =>
    test.transact(
      (ex, ctx) => issueInvoice(ex, ctx, { fileId: "no-file", dueIds: [], paymentMethod: "CASH" }),
      session,
    );

  async function lastSignIn() {
    const row = await test.db
      .selectFrom("AuditLog")
      .select("context")
      .where("action", "=", "SIGN_IN")
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    return JSON.parse(row.context ?? "{}") as { how: string; clock?: { state: string; jumpDays: number } };
  }

  it("signs in at a date a year ahead, and refuses the invoice, that day and the next (INV-1)", async () => {
    const { accountantId } = await office();

    test.clock.set("2027-11-12T08:00:00.000Z");
    const accountant = await signInAs(accountantId, "own-pass");
    expect((await lastSignIn()).clock).toMatchObject({ state: "jump", jumpDays: 396 });
    await expect(issueAs(accountant)).rejects.toBeInstanceOf(ClockJumpError);

    // A whole day of work at the wrong date does not make it ordinary.
    await test.transact(
      (ex, ctx) => logConsult(ex, ctx, { owner: "MONEY", action: "VIEW", entity: "PaymentDue" }),
      accountant,
    );
    await test.transact((ex, ctx) => signOut(ex, ctx), accountant);
    test.clock.advance({ days: 1 });
    const nextMorning = await signInAs(accountantId, "own-pass");
    expect((await lastSignIn()).clock).toMatchObject({ state: "jump" });
    await expect(issueAs(nextMorning)).rejects.toBeInstanceOf(ClockJumpError);
    expect((await test.transact((ex, ctx) => checkClock(ex, ctx), SYSTEM_SESSION)).state).toBe("jump");

    // The date corrected: the work done at the wrong one is not a date the clock is "behind".
    await test.transact((ex, ctx) => signOut(ex, ctx), nextMorning);
    test.clock.set("2026-10-13T08:00:00.000Z");
    const corrected = await signInAs(accountantId, "own-pass");
    expect((await lastSignIn()).clock).toBeUndefined();
    expect((await test.transact((ex, ctx) => checkClock(ex, ctx), SYSTEM_SESSION)).state).toBe("ok");
    // Past the clock now: the invoice is refused for what it is (no such file), not for the date.
    await expect(issueAs(corrected)).rejects.not.toBeInstanceOf(ClockJumpError);
  });

  it("lets nobody but the manager sign in on a clock behind the recorded work, and he may say the record was wrong (INV-1)", async () => {
    const { accountantId } = await office();

    test.clock.set("2026-10-10T08:00:00.000Z");
    await expect(
      asProgram((ex, ctx) => signIn(ex, ctx, { userId: accountantId, password: "own-pass" })),
    ).rejects.toThrow(CLOCK_BEHIND);
    const manager = await signInAs(FIRST_MANAGER_ID, "manager-pass");
    expect((await lastSignIn()).clock).toMatchObject({ state: "behind" });

    await expect(test.transact((ex, ctx) => confirmClockJump(ex, ctx), manager)).rejects.toThrow(CLOCK_BEHIND);
    await test.transact((ex, ctx) => confirmClockJump(ex, ctx, { reason: "التاريخ المسجل كان خاطئًا" }), manager);
    const warning = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(warning).toMatchObject({
      action: "CLOCK_WARNING",
      reason: "التاريخ المسجل كان خاطئًا",
      localDate: "2026-10-10",
    });
    expect(JSON.parse(warning.context ?? "null")).toMatchObject({ direction: "BEHIND" });

    const accountant = await signInAs(accountantId, "own-pass");
    await expect(test.transact((ex, ctx) => assertClockSane(ex, ctx), accountant)).resolves.toBeUndefined();
  });

  it("is confirmed once by the manager after a closure; the next sign-ins are ordinary (INV-1)", async () => {
    const { accountantId } = await office();

    test.clock.advance({ days: 6 });
    const early = await signInAs(accountantId, "own-pass");
    await expect(test.transact((ex, ctx) => confirmClockJump(ex, ctx), early)).rejects.toThrow(
      "You do not have permission to do this.",
    );
    await test.transact((ex, ctx) => signOut(ex, ctx), early);

    const manager = await signInAs(FIRST_MANAGER_ID, "manager-pass");
    expect((await lastSignIn()).clock).toMatchObject({ state: "jump", jumpDays: 6 });
    expect(await test.transact((ex, ctx) => confirmClockJump(ex, ctx), manager)).toMatchObject({ state: "ok" });
    expect((await test.transact((ex, ctx) => checkClock(ex, ctx), SYSTEM_SESSION)).state).toBe("ok");
    await test.transact((ex, ctx) => signOut(ex, ctx), manager);

    const accountant = await signInAs(accountantId, "own-pass");
    expect((await lastSignIn()).clock).toBeUndefined();
    await expect(issueAs(accountant)).rejects.not.toBeInstanceOf(ClockJumpError);
  });
});
