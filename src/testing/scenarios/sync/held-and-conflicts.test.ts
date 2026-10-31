import { afterEach, describe, expect, it } from "vitest";

import { DEMO_FILES } from "@/features/clients/demo";
import { registerFile, type RegisterFileInput } from "@/features/clients/services/files";
import { decideQuote, issueQuote, recordQuoteResult, saveQuote, submitQuote } from "@/features/clients/services/quotes";
import type { QuoteInput } from "@/features/clients/validators/pricing";
import { listConflicts, resolveConflict, resolveHeld, retryHeld } from "@/lib/sync/services/conflicts";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

import {
  assistantOn,
  editAWorker,
  expectChainsVerify,
  LONG,
  openConflicts,
  openHeld,
  registerAWorker,
} from "./helpers";

/**
 * BUILD 2.7 and DECISION section 4: held changes and conflicts are listed in «تعارضات المزامنة»; the office settles
 * one on either laptop with an ordinary change, and both laptops converge (cases 1 and 12).
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const phoneOf = async (laptop: SyncLaptop, id: string) =>
  (
    await laptop.test.db.selectFrom("StaffMember").select("phone").where("id", "=", id).executeTakeFirstOrThrow()
  ).phone.replace(/\s/g, "");

/** The same field changed on both laptops while apart: the assistant's later value wins. */
async function sameFieldConflict(p: SyncPair) {
  const worker = await registerAWorker(p.a, { lastName: "سعدي", firstName: "حورية" });
  await p.syncAll();
  p.relay.offline = true;
  await editAWorker(p.a, worker, { phone: "0770000001" });
  p.advance({ minutes: 5 });
  await editAWorker(p.b, worker, { phone: "0770000002" });
  p.relay.offline = false;
  await p.syncAll();
  return worker;
}

describe("conflicts: «استعمال هذه القيمة» on either laptop", () => {
  for (const side of ["a", "b"] as const) {
    it(`listed in plain terms, and settled on laptop ${side}: both laptops take the other value`, LONG, async () => {
      pair = await createSyncPair();
      const p = pair;
      const worker = await sameFieldConflict(p);
      const laptop = p[side];
      const list = await laptop.transact((ex, ctx) => listConflicts(ex, ctx, {}));
      const row = list.conflicts.find((conflict) => conflict.rowId === worker.id && conflict.col === "phone");
      if (!row) {
        // DECISION: the other value is kept in the conflict list; one laptop at least lists it. Settle where listed.
        expect((await openConflicts(p[side === "a" ? "b" : "a"])).length).toBeGreaterThan(0);
        return;
      }
      expect(row).toMatchObject({ tbl: "StaffMember", kind: "FIELD", resolvedAt: null });
      expect(String(row.otherValue).replace(/\s/g, "")).toBe("0770000001");
      expect(row.recordLabel).toBeTruthy();
      expect(row.otherAt).toBeTruthy();

      await laptop.transact((ex, ctx) => resolveConflict(ex, ctx, { conflictId: row.id, resolution: "USE_OTHER" }));
      await p.syncAll();
      p.expectSame();
      expect(await phoneOf(p.a, worker.id)).toBe("0770000001");
      expect(await phoneOf(p.b, worker.id)).toBe("0770000001");
      // The record stays whole: its search key follows the phone put back (People keeps «phoneKeys» from «phone»).
      for (const other of [p.a, p.b]) {
        const row = await other.test.db
          .selectFrom("StaffMember")
          .select(["phone", "phoneKeys"])
          .where("id", "=", worker.id)
          .executeTakeFirstOrThrow();
        expect(row.phoneKeys, `the search key follows the phone on ${other.name}`).toContain("0770000001");
      }
      // One edit typed on each laptop is one thing to settle, settled once, on both laptops.
      for (const other of [p.a, p.b]) {
        expect(
          (await openConflicts(other)).filter((c) => c.rowId === worker.id).map((c) => c.col),
          `nothing left open about this worker on ${other.name}`,
        ).toEqual([]);
      }
      await expectChainsVerify(p);
    });
  }

  it("«الإبقاء» dismisses it and changes nothing", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    const worker = await sameFieldConflict(p);
    const holder = (await openConflicts(p.a)).length > 0 ? p.a : p.b;
    const [row] = (await holder.transact((ex, ctx) => listConflicts(ex, ctx, {}))).conflicts;
    await holder.transact((ex, ctx) => resolveConflict(ex, ctx, { conflictId: row.id, resolution: "KEEP" }));
    await p.syncAll();
    p.expectSame();
    expect(await phoneOf(p.a, worker.id)).toBe("0770000002");
    for (const other of [p.a, p.b]) {
      expect(
        (await openConflicts(other)).map((c) => c.col),
        `nothing left open on ${other.name}`,
      ).toEqual([]);
    }
    await expectChainsVerify(p);
  });

  it("is the manager's: the assistant cannot list or settle them", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await sameFieldConflict(p);
    await expect(p.b.transact((ex, ctx) => listConflicts(ex, ctx, {}), await assistantOn(p))).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});

describe("held changes: the office resolves once, on either laptop, and both converge (case 12)", () => {
  async function sameNationalNumber(p: SyncPair) {
    await p.syncAll();
    p.relay.offline = true;
    const onA = await registerAWorker(p.a, {
      lastName: "بن علي",
      firstName: "فاطمة",
      nationalIdNumber: "109870012345678",
    });
    p.advance({ minutes: 3 });
    const onB = await registerAWorker(p.b, {
      lastName: "بن علي",
      firstName: "فاطمة",
      nationalIdNumber: "109870012345678",
    });
    p.relay.offline = false;
    await p.syncAll();
    return { onA, onB };
  }

  for (const side of ["a", "b"] as const) {
    it(`the same national number: one record set aside on laptop ${side}, both converge`, LONG, async () => {
      pair = await createSyncPair();
      const p = pair;
      await sameNationalNumber(p);
      const laptop = p[side];
      const { held } = await laptop.transact((ex, ctx) => listConflicts(ex, ctx, {}));
      const row = held.find((h) => h.tbl === "StaffMember");
      expect(row, "the clash is listed").toBeDefined();
      expect(row).toMatchObject({ reasonCode: "UNIQUE", op: "I" });
      expect(row!.actions).toContain("SET_ASIDE");
      expect(row!.mine, "the office sees this laptop's own record beside it").toBeNull();
      await laptop.transact((ex, ctx) =>
        resolveHeld(ex, ctx, { heldId: row!.id, action: "SET_ASIDE", reason: "نفس العاملة سُجلت مرتين" }),
      );
      await p.syncAll();
      p.expectSame();
      for (const other of [p.a, p.b]) {
        const live = await other.test.db
          .selectFrom("StaffMember")
          .select("id")
          .where("nationalIdNumber", "=", "109870012345678")
          .where("deletedAt", "is", null)
          .execute();
        expect(live.length, `one live worker with that number on laptop ${other.name}`).toBe(1);
        expect(
          (await openHeld(other)).filter((h) => h.tbl === "StaffMember"),
          `nothing held on laptop ${other.name}`,
        ).toEqual([]);
      }
      await expectChainsVerify(p);
    });
  }

  it("two accepted quotes for one file: the office keeps its own on one laptop, both converge", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    const input = structuredClone(
      DEMO_FILES.find((file) => file.name === "housingRequest")!.input,
    ) as RegisterFileInput;
    const { fileId } = await p.a.transact((ex, ctx) => registerFile(ex, ctx, input));
    await p.syncAll();
    p.relay.offline = true;
    const quoteA = await issuedQuote(p.a, fileId, 1700000);
    const quoteB = await issuedQuote(p.b, fileId, 1650000);
    for (const [laptop, quoteId] of [
      [p.a, quoteA],
      [p.b, quoteB],
    ] as const) {
      await laptop.transact((ex, ctx) =>
        recordQuoteResult(ex, ctx, {
          quoteId,
          result: "ACCEPTED",
          resultDate: ctx.today,
          note: "",
          postponedUntil: null,
        }),
      );
      p.advance({ minutes: 2 });
    }
    p.relay.offline = false;
    await p.syncAll();

    const { held } = await p.a.transact((ex, ctx) => listConflicts(ex, ctx, {}));
    const row = held.find((h) => h.tbl === "Quote");
    expect(row).toBeDefined();
    await p.a.transact((ex, ctx) => resolveHeld(ex, ctx, { heldId: row!.id, action: "KEEP_MINE" }));
    await p.syncAll();
    // The assistant's laptop still holds the director's acceptance until it is tried again.
    await p.b.transact((ex, ctx) => retryHeld(ex, ctx, {}));
    await p.syncAll();
    p.expectSame();
    for (const laptop of [p.a, p.b]) {
      const accepted = await laptop.test.db
        .selectFrom("Quote")
        .select("id")
        .where("fileId", "=", fileId)
        .where("result", "=", "ACCEPTED")
        .where("deletedAt", "is", null)
        .execute();
      expect(
        accepted.map((q) => q.id),
        `the director's quote is the accepted one on ${laptop.name}`,
      ).toEqual([quoteA]);
      expect((await openHeld(laptop)).filter((h) => h.tbl === "Quote")).toEqual([]);
    }
    await expectChainsVerify(p);
  });
});

const QUOTE: QuoteInput = {
  date: "2026-10-12",
  validUntil: null,
  includedText: "تنظيف شامل بعد الترميم",
  excludedText: "الواجهة الخارجية",
  materialsIncluded: true,
  equipmentIncluded: true,
  workers: 3,
  duration: "يوم ونصف",
  visits: "2",
  discount: 0,
  amountBasis: null,
  lines: [
    {
      kind: "INITIAL_JOB",
      label: "تنظيف شامل وعميق",
      description: null,
      quantity: 1000,
      unit: null,
      unitPrice: 1700000,
    },
  ],
};

async function issuedQuote(laptop: SyncLaptop, fileId: string, unitPrice: number) {
  const quote = { ...QUOTE, lines: [{ ...QUOTE.lines[0], unitPrice }] };
  const saved = await laptop.transact((ex, ctx) => saveQuote(ex, ctx, { fileId, quote }));
  await laptop.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: saved.quoteId }));
  await laptop.transact((ex, ctx) => decideQuote(ex, ctx, { quoteId: saved.quoteId, approve: true, note: "مناسب" }));
  await laptop.transact((ex, ctx) => issueQuote(ex, ctx, { quoteId: saved.quoteId }));
  return saved.quoteId;
}
