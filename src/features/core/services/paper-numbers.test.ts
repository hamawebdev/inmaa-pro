import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { peekLegalNumber } from "@/lib/numbering";
import type { LocalDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { declarePaperNumbers, listPaperNumbers } from "./paper-numbers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const declare = (input: Partial<Parameters<typeof declarePaperNumbers>[2]>, session = test.manager) =>
  test.transact(
    (ex, ctx) =>
      declarePaperNumbers(ex, ctx, {
        key: "INVOICE",
        lastValue: 37,
        lastDate: "2026-09-30",
        reason: "دفتر الفواتير الورقي لسنة 2026",
        ...input,
      }),
    session,
  );

describe("numbers issued on paper this year (RULINGS 4)", () => {
  it("are declared once by the manager: an OPENING gap 1 to n, the counter after it, the chains still whole (RULINGS 4)", async () => {
    await declare({});

    const gap = await test.db.selectFrom("SequenceGap").selectAll().executeTakeFirstOrThrow();
    expect(gap).toMatchObject({ key: "INVOICE", year: 2026, kind: "OPENING", fromValue: 1, toValue: 37 });
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("id", "=", gap.auditLogId ?? "")
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({
      operation: "CHANGE",
      action: "NUMBER_CLAIM",
      reason: "دفتر الفواتير الورقي لسنة 2026",
      entity: "Sequence",
    });

    // The next invoice goes on after the last paper one, never dated before it.
    const next = await test.transact((ex, ctx) => peekLegalNumber(ex, ctx, "INVOICE", { date: ctx.today }));
    expect(next).toMatchObject({ display: "000038/2026", notBefore: "2026-09-30" });
    await test.run.transact((ex, ctx) =>
      test.rows.insert("Invoice", { issueDate: "2026-10-12" as LocalDate }, { ex, ctx }),
    );
    const report = await verifyChains(test.db);
    expect(report.ok).toBe(true);

    expect(await test.transact((ex, ctx) => listPaperNumbers(ex, ctx))).toMatchObject([
      { key: "INVOICE", year: 2026, lastValue: 38, opening: { toValue: 37, reason: "دفتر الفواتير الورقي لسنة 2026" } },
      { key: "RECEIPT", year: 2026, lastValue: 0, opening: null },
    ]);
  });

  it("are refused to anyone but the manager, without a reason, twice, or once a number exists that year (RULINGS 4)", async () => {
    await expect(declare({}, await test.sessionFor("ACCOUNTANT"))).rejects.toThrow(
      "You do not have permission to do this.",
    );
    await expect(declare({ reason: "  " })).rejects.toThrow("A reason is required.");
    await expect(declare({ lastValue: 0 })).rejects.toThrow("Type the last number issued on paper");
    await expect(declare({ lastDate: "2026-10-20" })).rejects.toThrow("must be this year, and not after today");
    await expect(declare({ lastDate: "2025-12-30" })).rejects.toThrow("must be this year, and not after today");

    // Receipts: one already issued by the program this year.
    await test.run.transact((ex, ctx) =>
      test.rows.insert("Receipt", { issueDate: "2026-10-12" as LocalDate }, { ex, ctx }),
    );
    await expect(declare({ key: "RECEIPT", lastValue: 12 })).rejects.toThrow("Numbers of this kind already exist");

    await declare({});
    await expect(declare({ lastValue: 40 })).rejects.toThrow("Numbers of this kind already exist");
    expect(await test.db.selectFrom("SequenceGap").select("key").execute()).toEqual([{ key: "INVOICE" }]);
  });
});
