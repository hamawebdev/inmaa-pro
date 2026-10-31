import { afterEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

import { addDebtEntry, debtBalanceOf } from "./payouts";
import { decideViolation } from "./violations";

/**
 * A violation's deduction decided on the laptop without the books
 * (coordinator's ruling): the decision saves there, and the books' laptop
 * posts the debt line, once, when it receives it.
 */

let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const ledgerOf = (laptop: SyncLaptop, staffId: string) =>
  laptop.test.db
    .selectFrom("StaffDebtEntry")
    .select(["seq", "direction", "amount", "balanceAfter", "violationId"])
    .where("staffId", "=", staffId)
    .orderBy("seq")
    .execute();

describe("a violation's deduction decided on the laptop without the books", () => {
  it("saves there, and is posted once on the books' laptop; the running balance follows", async () => {
    pair = await createSyncPair();
    const { a, b } = pair;
    const worker = await a.test.rows.insert("StaffMember", { kind: "WORKER", engagementStatus: "ACCEPTED" } as never);
    const staffId = String(worker.id);
    const violation = await a.test.rows.insert("Violation", {
      staffId,
      status: "OPEN",
      action: null,
      sourceKind: "OFFICE",
      severity: "MINOR",
    } as never);
    // A debt already on the ledger, written on the books' laptop.
    await a.transact((ex, ctx) =>
      addDebtEntry(ex, ctx, { staffId, date: "2026-10-12", direction: "INCREASE", reason: "OTHER", amount: 50_000 }),
    );
    await pair.syncAll();

    await b.transact((ex, ctx) =>
      decideViolation(ex, ctx, { violationId: String(violation.id), action: "DEDUCTION", amount: 150_000 }),
    );
    // Saved: decided, and nothing in the ledger on the assistant's laptop.
    const decided = await b.test.db
      .selectFrom("Violation")
      .select(["status", "action"])
      .where("id", "=", String(violation.id))
      .executeTakeFirstOrThrow();
    expect(decided).toEqual({ status: "DECIDED", action: "DEDUCTION" });
    expect((await ledgerOf(b, staffId)).map((entry) => entry.violationId)).toEqual([null]);

    await pair.syncAll();
    await pair.syncAll();
    for (const laptop of [a, b]) {
      expect(await ledgerOf(laptop, staffId)).toEqual([
        { seq: 1, direction: "INCREASE", amount: 50_000, balanceAfter: 50_000, violationId: null },
        { seq: 2, direction: "INCREASE", amount: 150_000, balanceAfter: 200_000, violationId: String(violation.id) },
      ]);
      expect(await debtBalanceOf(laptop.test.db, staffId)).toBe(200_000);
      expect((await verifyChains(laptop.test.db)).ok).toBe(true);
    }
    pair.expectSame();
  });
});
