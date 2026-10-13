import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { getSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { alertsToAnnounce, announceAlerts } from "./announce";
import type { AlertState } from "./index";

const state = (key: string, count: number | null): AlertState =>
  ({
    key,
    owner: "core",
    section: "settings",
    severity: "warning",
    name: "X",
    count,
    route: "/",
    leadDays: null,
  }) as AlertState;

describe("which alerts are announced", () => {
  it("announces an alert once a day, and again that day only when it concerns more", () => {
    const states = [state("contract.ending", 2), state("stock.low", 0), state("payment.overdue", null)];
    expect(alertsToAnnounce(states, {}, "2026-10-12").map((alert) => alert.key)).toEqual(["contract.ending"]);

    const announced = { "contract.ending": { date: "2026-10-12", count: 2 } };
    expect(alertsToAnnounce(states, announced, "2026-10-12")).toEqual([]);
    expect(alertsToAnnounce([state("contract.ending", 3)], announced, "2026-10-12")).toHaveLength(1);
    expect(alertsToAnnounce([state("contract.ending", 1)], announced, "2026-10-12")).toEqual([]);
    // The next day it is said again.
    expect(alertsToAnnounce(states, announced, "2026-10-13")).toHaveLength(1);
  });
});

describe("announcing", () => {
  let test: TestDatabase;
  beforeEach(async () => {
    test = await createTestDatabase();
  });
  afterEach(() => test.close());

  it("remembers what it announced, across a restart, and writes nothing to the log", async () => {
    const logged = async () => (await test.db.selectFrom("AuditLog").select("id").execute()).length;
    const before = await logged();

    // A new database has never been backed up: the manager is told once.
    const first = await test.transact((ex, ctx) => announceAlerts(ex, ctx));
    expect(first.map((alert) => alert.key)).toEqual(["backup.stale"]);
    expect(await getSetting(test.db, "system.alertsNotified")).toEqual({
      "backup.stale": { date: "2026-10-12", count: 1 },
    });
    expect(await test.transact((ex, ctx) => announceAlerts(ex, ctx))).toEqual([]);
    expect(await logged()).toBe(before);

    test.clock.advance({ days: 1 });
    expect(await test.transact((ex, ctx) => announceAlerts(ex, ctx))).toHaveLength(1);

    // A role that does not see the alert is not told of it.
    test.clock.advance({ days: 1 });
    const reception = await test.sessionFor("RECEPTION_SALES");
    expect(await test.transact((ex, ctx) => announceAlerts(ex, ctx), reception)).toEqual([]);
  });
});
