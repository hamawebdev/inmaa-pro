import { CircleAlert } from "lucide-react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { countStaleBackup } from "@/features/core/alerts";
import { MESSAGES } from "@/i18n/catalogues";
import { newId } from "@/lib/db/rows";
import { ServiceError } from "@/lib/service/errors";
import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  evaluateAlerts,
  loadFeatureAlerts,
  registerAlert,
  registeredAlerts,
  resetFeatureAlerts,
  type AlertDefinition,
} from "./index";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => {
  test.close();
  resetFeatureAlerts();
  loadFeatureAlerts();
  vi.restoreAllMocks();
});

const alert = (over: Partial<AlertDefinition>): AlertDefinition => ({
  key: "payment.overdue",
  section: "money",
  severity: "danger",
  name: "PaymentOverdue",
  icon: CircleAlert,
  route: "/dashboard/payments?state=OVERDUE",
  count: async () => 3,
  ...over,
});

describe("the alert registry", () => {
  it("has a title and a hint in three languages for every alert the folders register", () => {
    const missing = registeredAlerts().flatMap((registered) =>
      (["en", "ar", "fr"] as const).flatMap((locale) => {
        const entry = (MESSAGES[locale].Alerts as Record<string, Record<string, string> | undefined> | undefined)?.[
          registered.name
        ];
        return ["Title", "Hint"]
          .filter((part) => typeof entry?.[part] !== "string")
          .map((part) => `${registered.owner}: ${locale} Alerts.${registered.name}.${part}`);
      }),
    );
    expect(missing).toEqual([]);
    expect(registeredAlerts().map((registered) => registered.key)).toContain("backup.stale");
  });

  it("counts for a reader only the alerts of sections that role may read, most serious first", async () => {
    resetFeatureAlerts();
    registerAlert(
      "stock",
      alert({
        key: "stock.low",
        section: "stock",
        severity: "warning",
        name: "StockLow",
        count: async () => ({ count: 2, route: "/dashboard/inventory?kind=EQUIPMENT&state=TO_BUY" }),
      }),
    );
    registerAlert("money", alert({}));
    registerAlert(
      "people",
      alert({
        key: "sanction.pending",
        section: "workers",
        severity: "info",
        name: "SanctionPending",
        capability: "sanction.answer",
        count: async () => 1,
      }),
    );

    const manager = await test.transact((ex, ctx) => evaluateAlerts(ex, ctx));
    expect(manager.map((state) => [state.key, state.count, state.route])).toEqual([
      ["payment.overdue", 3, "/dashboard/payments?state=OVERDUE"],
      ["stock.low", 2, "/dashboard/inventory?kind=EQUIPMENT&state=TO_BUY"],
      ["sanction.pending", 1, "/dashboard/payments?state=OVERDUE"],
    ]);

    // The supervisor reads stock, not money; and sees workers, but may not answer a sanction.
    const supervisor = await test.transact((ex, ctx) => evaluateAlerts(ex, ctx), await test.sessionFor("SUPERVISOR"));
    expect(supervisor.map((state) => state.key)).toEqual(["stock.low"]);
  });

  it("gives each alert its lead time from Settings", async () => {
    resetFeatureAlerts();
    const seen: Array<number | null> = [];
    registerAlert(
      "money",
      alert({
        key: "payment.dueSoon",
        leadSetting: "alerts.paymentDueLeadDays",
        count: async (_ex, _ctx, { days }) => {
          seen.push(days);
          return 0;
        },
      }),
    );

    const before = await test.transact((ex, ctx) => evaluateAlerts(ex, ctx));
    await test.transact((ex, ctx) => setSetting(ex, ctx, "alerts.paymentDueLeadDays", 10));
    await test.transact((ex, ctx) => evaluateAlerts(ex, ctx));

    expect(seen).toEqual([7, 10]);
    expect(before[0]).toMatchObject({ count: 0, leadDays: 7 });
  });

  it("keeps the other alerts when one cannot be counted, and hides one its owner refuses to this reader", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    resetFeatureAlerts();
    registerAlert("money", alert({ count: async () => Promise.reject(new Error("money: a fault in the query")) }));
    registerAlert("stock", alert({ key: "stock.low", section: "stock", name: "StockLow", count: async () => 4 }));
    registerAlert(
      "clients",
      alert({
        key: "quote.followUp",
        section: "requests",
        name: "QuoteFollowUp",
        count: async () => Promise.reject(new ServiceError("You do not have permission to do this.")),
      }),
    );

    const states = await test.transact((ex, ctx) => evaluateAlerts(ex, ctx));

    expect(states.map((state) => [state.key, state.count])).toEqual([
      ["payment.overdue", null],
      ["stock.low", 4],
    ]);
  });

  it("refuses a key that is not the model's, and two owners for one key", () => {
    resetFeatureAlerts();
    registerAlert("money", alert({}));
    expect(() => registerAlert("stock", alert({}))).toThrow("is registered by money and by stock");
    expect(() => registerAlert("money", alert({ key: "nothing.atAll" as never }))).toThrow("is not a key of the model");
  });
});

describe("backup.stale", () => {
  const backup = (startedAt: string, over: { ok?: number; kind?: string } = {}) =>
    test.db
      .insertInto("BackupRun")
      .values({
        id: newId(),
        kind: over.kind ?? "AUTO",
        startedAt,
        finishedAt: startedAt,
        targetPath: "/media/usb/inmaa",
        ok: over.ok ?? 1,
      })
      .execute();
  const stale = () => test.transact((ex, ctx) => countStaleBackup(ex, ctx, { days: 3 }));

  it("counts while no copy has succeeded for the days Settings allows", async () => {
    expect(await stale()).toBe(1);
    await backup("2026-10-08T09:00:00.000Z");
    expect(await stale()).toBe(1);
    await backup("2026-10-11T09:00:00.000Z", { ok: 0 });
    await backup("2026-10-11T10:00:00.000Z", { kind: "RESTORE" });
    expect(await stale()).toBe(1);
    await backup("2026-10-10T07:00:00.000Z");
    expect(await stale()).toBe(0);
  });

  it("is on the home screen of whoever may run a backup", async () => {
    const forRole = async (role: "ADMINISTRATION" | "ACCOUNTANT") =>
      (await test.transact((ex, ctx) => evaluateAlerts(ex, ctx), await test.sessionFor(role))).map(
        (state) => state.key,
      );

    expect((await test.transact((ex, ctx) => evaluateAlerts(ex, ctx))).map((state) => state.key)).toContain(
      "backup.stale",
    );
    // Neither reads Settings by default: the tile is the manager's until a role is given the section.
    expect(await forRole("ACCOUNTANT")).not.toContain("backup.stale");
  });
});
