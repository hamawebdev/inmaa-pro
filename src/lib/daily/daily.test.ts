import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  dailyHandlers,
  loadFeatureDaily,
  registerDailyHandler,
  resetFeatureDaily,
  runDayStart,
  type DayStart,
} from "./index";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
  resetFeatureDaily();
});

afterEach(() => {
  test.close();
  resetFeatureDaily();
  loadFeatureDaily();
  vi.restoreAllMocks();
});

const zone = (id: string) => ({
  id,
  name: id,
  createdAt: "2026-10-12T08:00:00.000Z",
  updatedAt: "2026-10-12T08:00:00.000Z",
});
const zoneIds = async () =>
  (await test.db.selectFrom("Zone").select("id").orderBy("id").execute()).map((row) => row.id);

describe("the day-start job", () => {
  it("runs each owner's handlers once a day, in owner order, as the program itself", async () => {
    const calls: string[] = [];
    registerDailyHandler("money", "dues", async (_ex, ctx) => {
      calls.push(`money as ${ctx.userName}/${ctx.userId}`);
    });
    registerDailyHandler("clients", "endContracts", async (_ex, _ctx, day) => {
      calls.push(`clients ${day.today} since ${day.since}`);
    });
    registerDailyHandler("clients", "second", async () => {
      calls.push("clients second");
    });

    const first = await runDayStart(test.db, test.clock);
    const again = await runDayStart(test.db, test.clock);

    expect(calls).toEqual(["clients 2026-10-12 since null", "clients second", "money as system/null"]);
    expect(first).toMatchObject({ today: "2026-10-12", ran: ["clients", "money"], alreadyDone: [], failed: [] });
    expect(again).toMatchObject({ ran: [], alreadyDone: ["clients", "money"] });
    expect(dailyHandlers()).toEqual([
      { owner: "clients", names: ["endContracts", "second"] },
      { owner: "money", names: ["dues"] },
    ]);
  });

  it("runs again on the next day, also after days the PC was off, and says since when", async () => {
    const days: DayStart[] = [];
    registerDailyHandler("people", "liftSuspensions", async (_ex, _ctx, day) => {
      days.push(day);
    });

    await runDayStart(test.db, test.clock);
    test.clock.advance({ days: 4 });
    await runDayStart(test.db, test.clock);

    expect(days).toEqual([
      { today: "2026-10-12", since: null },
      { today: "2026-10-16", since: "2026-10-12" },
    ]);
    expect(await getSetting(test.db, "system.dayStart")).toEqual({ people: "2026-10-16" });
  });

  it("rolls back an owner whose handler fails, keeps the others, and tries that owner again", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    let fail = true;
    registerDailyHandler("clients", "endContracts", async (ex) => {
      await ex
        .insertInto("Zone")
        .values(zone("by-clients"))
        .onConflict((conflict) => conflict.doNothing())
        .execute();
      if (fail) throw new Error("clients: a contract could not be ended");
    });
    registerDailyHandler("money", "dues", async (ex) => {
      await ex
        .insertInto("Zone")
        .values(zone("by-money"))
        .onConflict((conflict) => conflict.doNothing())
        .execute();
    });

    const first = await runDayStart(test.db, test.clock);
    expect(first.ran).toEqual(["money"]);
    expect(first.failed).toEqual([{ owner: "clients", error: "clients: a contract could not be ended" }]);
    expect(await zoneIds()).toEqual(["by-money"]);
    expect(await getSetting(test.db, "system.dayStart")).toEqual({ money: "2026-10-12" });

    fail = false;
    const second = await runDayStart(test.db, test.clock);
    expect(second).toMatchObject({ ran: ["clients"], alreadyDone: ["money"], failed: [] });
    expect(await zoneIds()).toEqual(["by-clients", "by-money"]);
  });

  it("refuses two handlers of one name for an owner", () => {
    registerDailyHandler("people", "liftSuspensions", async () => {});
    expect(() => registerDailyHandler("people", "liftSuspensions", async () => {})).toThrow(
      "registers liftSuspensions twice",
    );
  });
});
