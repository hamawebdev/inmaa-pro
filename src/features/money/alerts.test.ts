import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { evaluateAlerts } from "@/lib/alerts";
import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { countDues, findEndingContracts } from "./alerts";
import { syncDues } from "./services/dues";
import { contractedFile } from "./testing/fixtures";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

describe("a contract coming to its end", () => {
  it("counts a live contract within the lead time, and one ended by its date that nobody renewed or closed", async () => {
    const ending = await contractedFile(test, { startDate: "2026-08-01", endDate: "2026-10-31" });
    await contractedFile(test, { startDate: "2026-08-01", endDate: "2027-07-31" });
    const lapsed = await contractedFile(test, {
      stage: "CONTRACT_ENDED",
      endDate: "2026-10-05",
      endedDate: "2026-10-05",
      endKind: "EXPIRED",
    });
    await contractedFile(test, {
      stage: "CONTRACT_ENDED",
      endDate: "2026-10-05",
      endedDate: "2026-10-05",
      endKind: "EXPIRED",
      renewalDecision: "WILL_NOT_RENEW",
    });
    const found = await test.transact((ex, ctx) => findEndingContracts(ex, ctx, { leadDays: 30 }));
    expect(found.sort()).toEqual([ending.id, lapsed.id].sort());

    // A renewal signed: the old contract leaves the list.
    await test.rows.insert("File", {
      stage: "CONTRACTED",
      serviceType: "CONTRACT",
      renewalOfFileId: ending.id,
    } as never);
    expect(await test.transact((ex, ctx) => findEndingContracts(ex, ctx, { leadDays: 30 }))).toEqual([lapsed.id]);
  });
});

describe("payments falling due", () => {
  it("counts the open dues coming within the lead time, and those past their date", async () => {
    // Three monthly dues from 30 November; the clock stands on 12 October.
    const file = await contractedFile(test);
    await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
    const count = (state: "DUE_SOON" | "OVERDUE", leadDays = 7) =>
      test.transact((ex, ctx) => countDues(ex, ctx, { state, leadDays }));
    expect([await count("DUE_SOON"), await count("OVERDUE")]).toEqual([0, 0]);
    expect(await count("DUE_SOON", 49)).toBe(1);

    test.clock.set("2026-12-02T08:00:00.000Z");
    expect([await count("DUE_SOON"), await count("OVERDUE")]).toEqual([0, 1]);
    test.clock.set("2026-12-25T08:00:00.000Z");
    expect([await count("DUE_SOON"), await count("OVERDUE")]).toEqual([1, 1]);
  });

  it("shows on the home screen of those who may open the money section, with their lists", async () => {
    const file = await contractedFile(test, { startDate: "2026-09-01", firstDueDate: "2026-09-30" });
    await test.transact((ex, ctx) => syncDues(ex, ctx, { fileId: file.id }));
    await test.transact((ex, ctx) => setSetting(ex, ctx, "alerts.paymentDueLeadDays", 20));

    const manager = await test.transact((ex, ctx) => evaluateAlerts(ex, ctx));
    const mine = manager.filter((alert) => alert.owner === "money");
    expect(mine.map((alert) => [alert.key, alert.count, alert.route])).toEqual([
      ["payment.overdue", 1, "/dashboard/payments?view=dues&state=OVERDUE"],
      ["contract.ending", 0, "/dashboard/files"],
      ["payment.dueSoon", 1, "/dashboard/payments?view=dues&state=DUE_SOON"],
      ["receipts.unreconciled", 0, "/dashboard/payments?view=reconciliation"],
    ]);
    expect(mine.find((alert) => alert.key === "payment.dueSoon")?.leadDays).toBe(20);

    const reception = await test.transact(
      (ex, ctx) => evaluateAlerts(ex, ctx),
      await test.sessionFor("RECEPTION_SALES"),
    );
    expect(reception.filter((alert) => alert.owner === "money").map((alert) => alert.key)).toEqual(["contract.ending"]);
  });
});
