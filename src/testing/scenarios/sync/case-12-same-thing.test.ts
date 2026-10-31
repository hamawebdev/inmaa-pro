import { afterEach, describe, expect, it } from "vitest";

import { DEMO_FILES } from "@/features/clients/demo";
import { registerFile, type RegisterFileInput } from "@/features/clients/services/files";
import { decideQuote, issueQuote, recordQuoteResult, saveQuote, submitQuote } from "@/features/clients/services/quotes";
import type { QuoteInput } from "@/features/clients/validators/pricing";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

import { expectChainsVerify, LONG, openHeld, registerAWorker } from "./helpers";

/**
 * DECISION section 7, case 12: both laptops register the same thing while apart (the same national number, two
 * accepted quotes for one file). Held on both laptops with a plain explanation; the office resolves once, on either
 * laptop; both converge.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
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

/** A quote saved, submitted, approved by the manager and issued, on one laptop. */
async function issuedQuote(laptop: SyncLaptop, fileId: string, unitPrice: number) {
  const quote = { ...QUOTE, lines: [{ ...QUOTE.lines[0], unitPrice }] };
  const saved = await laptop.transact((ex, ctx) => saveQuote(ex, ctx, { fileId, quote }));
  await laptop.transact((ex, ctx) => submitQuote(ex, ctx, { quoteId: saved.quoteId }));
  await laptop.transact((ex, ctx) => decideQuote(ex, ctx, { quoteId: saved.quoteId, approve: true, note: "مناسب" }));
  await laptop.transact((ex, ctx) => issueQuote(ex, ctx, { quoteId: saved.quoteId }));
  return saved.quoteId;
}

describe("case 12: the same thing registered on both laptops while apart", () => {
  it("the same national number: held on both laptops with a plain reason, nothing lost", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
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

    // Each laptop keeps its own record and holds the other's, with the database's reason.
    for (const [laptop, mine, theirs] of [
      [p.a, onA.id, onB.id],
      [p.b, onB.id, onA.id],
    ] as const) {
      const held = (await openHeld(laptop)).filter((row) => row.tbl === "StaffMember");
      expect(
        held.map((row) => row.rowId),
        `laptop ${laptop.name} holds the other's worker`,
      ).toContain(theirs);
      expect(held.find((row) => row.rowId === theirs)!.reason).toMatch(
        /UNIQUE|StaffMember_nationalId|nationalIdNumber/,
      );
      const live = await laptop.test.db
        .selectFrom("StaffMember")
        .select("id")
        .where("nationalIdNumber", "=", "109870012345678")
        .where("deletedAt", "is", null)
        .execute();
      expect(live.map((row) => row.id)).toEqual([mine]);
    }
    await expectChainsVerify(p);
  });

  // Resolved once, on either laptop: held-and-conflicts.test.ts.

  it("two accepted quotes for one file: held on both laptops with a plain reason", LONG, async () => {
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
    const accept = (laptop: SyncLaptop, quoteId: string) =>
      laptop.transact((ex, ctx) =>
        recordQuoteResult(ex, ctx, {
          quoteId,
          result: "ACCEPTED",
          resultDate: ctx.today,
          note: "",
          postponedUntil: null,
        }),
      );
    await accept(p.a, quoteA);
    p.advance({ minutes: 2 });
    await accept(p.b, quoteB);
    p.relay.offline = false;
    await p.syncAll();

    for (const laptop of [p.a, p.b]) {
      const accepted = await laptop.test.db
        .selectFrom("Quote")
        .select("id")
        .where("fileId", "=", fileId)
        .where("result", "=", "ACCEPTED")
        .where("deletedAt", "is", null)
        .execute();
      expect(accepted.length, `one accepted quote on laptop ${laptop.name}`).toBe(1);
      const held = (await openHeld(laptop)).filter((row) => row.tbl === "Quote");
      expect(held.length, `laptop ${laptop.name} holds the other's acceptance`).toBeGreaterThan(0);
      expect(held[0].reason).toMatch(/UNIQUE|Quote_one_accepted|result/);
    }
    await expectChainsVerify(p);
  });

  // Resolved once: held-and-conflicts.test.ts.
});
