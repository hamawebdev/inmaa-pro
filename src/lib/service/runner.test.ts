import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { compareAnchor, memoryAnchorStore } from "@/lib/chain/anchor";
import { logSecurity } from "@/lib/log";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { anchorWhenClosing } from "./close";
import { ServiceError, UNEXPECTED_ERROR } from "./errors";
import { createRunner } from "./runner";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  test.close();
  vi.restoreAllMocks();
});

async function zoneCount(): Promise<number> {
  const row = await test.db
    .selectFrom("Zone")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

describe("the action wrapper", () => {
  it("answers in the service's own words, or in the sentence of the database's refusal", async () => {
    const refuse = test.run.action(async () => {
      throw new ServiceError("This number is already taken.");
    });
    const tamper = test.run.action(async (ex) => {
      await sql`UPDATE "AuditLog" SET "reason" = 'x'`.execute(ex);
    });
    const duplicate = test.run.action(async (ex, ctx) => {
      await ex
        .insertInto("Branch")
        .values({ id: "branch-2", code: "MAIN", name: "فرع", createdAt: ctx.now, updatedAt: ctx.now })
        .execute();
    });
    const fault = test.run.action(async () => {
      throw new Error("core: a fault in the code");
    });

    expect(await refuse(undefined)).toEqual({ success: false, error: "This number is already taken." });
    expect(await tamper(undefined)).toEqual({
      success: false,
      error: "This record can no longer be changed or deleted.",
    });
    expect(await duplicate(undefined)).toEqual({
      success: false,
      error: "A record with the same value already exists.",
    });
    expect(await fault(undefined)).toEqual({ success: false, error: UNEXPECTED_ERROR });
  });

  it("saves nothing of a service that fails half way, and refreshes no screen", async () => {
    const before = await zoneCount();
    const half = test.run.action(
      async (ex, ctx) => {
        await ex
          .insertInto("Zone")
          .values({ id: "zone-half", name: "x", createdAt: ctx.now, updatedAt: ctx.now })
          .execute();
        throw new ServiceError("This zone does not exist or is not active.");
      },
      { revalidate: ["/places"] },
    );

    expect((await half(undefined)).success).toBe(false);
    expect(await zoneCount()).toBe(before);
    expect(test.revalidated).toEqual([]);
  });

  it("refreshes the screens a save names, from what it returned", async () => {
    const save = test.run.action(
      async (ex, ctx, input: { name: string }) => {
        await ex
          .insertInto("Zone")
          .values({ id: "zone-new", name: input.name, createdAt: ctx.now, updatedAt: ctx.now })
          .execute();
        return { id: "zone-new" };
      },
      { revalidate: (output) => ["/places", `/dashboard/settings/zones/${output.id}`] },
    );

    expect(await save({ name: "الشمال" })).toEqual({ success: true, data: { id: "zone-new" } });
    expect(test.revalidated).toEqual(["/places", "/dashboard/settings/zones/zone-new"]);
  });

  it("writes the anchor after a commit that issued an invoice, and the log's at most once a minute", async () => {
    const store = test.anchor as ReturnType<typeof memoryAnchorStore>;
    const start = store.writes;
    const log = () => test.run.transact((ex, ctx) => logSecurity(ex, ctx, { owner: "FOUNDATION", action: "LOCK" }));

    await test.run.transact((ex, ctx) => test.rows.insert("Invoice", {}, { ex, ctx }));
    expect(store.writes).toBe(start + 1);
    await log();
    expect(store.writes).toBe(start + 1);
    test.clock.advance({ minutes: 2 });
    await log();
    expect(store.writes).toBe(start + 2);
    expect((await store.read())?.heads.AuditLog.seq).toBe(4);
  });

  it("reads through a query, outside any transaction", async () => {
    const roles = test.run.query(async (ex) => ex.selectFrom("Role").select("id").orderBy("sortOrder").execute());

    expect((await roles(undefined)).map((role) => role.id)).toEqual([
      "MANAGER",
      "HR_OFFICER",
      "ADMINISTRATION",
      "SUPERVISOR",
      "RECEPTION_SALES",
      "OPERATIONS",
      "ACCOUNTANT",
    ]);
  });
});

describe("the anchor of the log's last minute (LOG-10)", () => {
  /** A runner on the test database whose timer is in the test's hands. */
  function runnerWithTimer() {
    const timers: Array<{ work: () => void; ms: number }> = [];
    const runner = createRunner({
      db: test.db,
      session: () => test.manager,
      clock: () => test.clock,
      anchor: () => test.anchor,
      revalidate: () => {},
      later: (work, ms) => timers.push({ work, ms }),
    });
    const log = () => runner.transact((ex, ctx) => logSecurity(ex, ctx, { owner: "FOUNDATION", action: "LOCK" }));
    return { runner, timers, log };
  }
  const state = async () => (await compareAnchor(test.db, test.anchor, test.ctx().now)).state;

  it("is written when the window closes: the close path anchors the head the minute rule left behind (LOG-10)", async () => {
    const { runner, log } = runnerWithTimer();
    await log(); // anchored: the first of the minute
    await log(); // inside the same minute: left for later
    expect(await state()).toBe("ahead");

    let closing: (() => Promise<void>) | undefined;
    await anchorWhenClosing(
      {
        onCloseRequested: async (handler) => {
          closing = handler;
        },
      },
      runner.anchorNow,
    );
    if (!closing) throw new Error("test: the close was not watched");
    await closing();
    expect(await state()).toBe("normal");
  });

  it("is written when its minute is up, if nothing anchored it meanwhile (LOG-10)", async () => {
    const { timers, log } = runnerWithTimer();
    await log();
    await log();
    await log();
    // One timer for the minute, however many entries wait.
    expect(timers).toHaveLength(1);
    expect(timers[0].ms).toBeGreaterThan(0);
    expect(timers[0].ms).toBeLessThanOrEqual(60_000);
    expect(await state()).toBe("ahead");
    test.clock.advance({ minutes: 1 });
    timers[0].work();
    await vi.waitFor(async () => expect(await state()).toBe("normal"));
  });

  it("never holds the close up: a write that hangs lets the window close after the wait (LOG-10)", async () => {
    let closing: (() => Promise<void>) | undefined;
    await anchorWhenClosing(
      {
        onCloseRequested: async (handler) => {
          closing = handler;
        },
      },
      () => new Promise<void>(() => {}),
      20,
    );
    await expect(closing?.()).resolves.toBeUndefined();
  });
});
