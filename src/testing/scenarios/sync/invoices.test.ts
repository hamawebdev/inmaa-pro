import { afterEach, expect, it } from "vitest";

import { moveFileStage, registerFile } from "@/features/clients/services/files";
import type { FormKind } from "@/features/clients/validators/option-lists";
import { issueInvoice, voidInvoice } from "@/features/money/services/invoices";
import { invoiceContentDigest, verifyChains } from "@/lib/chain";
import { confirmClockJump } from "@/lib/clock/sanity";
import { logConsult } from "@/lib/log";
import { BOOKS_ELSEWHERE } from "@/lib/sync/books";
import { localDate } from "@/lib/units";
import { createSyncPair, type SyncLaptop, type SyncPair } from "@/testing/sync/pair";

import { at, contractInput, doVisit, MONTH, type PlannedVisit } from "../acceptance/helpers";

import { booksHolder, deviceIdOf, expectChainsVerify, expectLegalNumbersUnique, moveBooksTo } from "./helpers";

/**
 * BUILD section 4, "no invoice or receipt number is issued twice" and "the chains verify on both copies", with real
 * invoices through Money's `issueInvoice`: three contract files run their November on the director's laptop (People's
 * demo workers seated, returned orders typed in), and on 1 December the books move between the laptops while each
 * issues in turn. Slow: a month of visits.
 */
const SLOW = { timeout: 900_000 };

let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

const KINDS: FormKind[] = ["HOUSING_CONTRACT", "BUILDING_CONTRACT", "COMPLEX_CONTRACT"];

/** Every laptop's clock and the mailbox's at one instant (the office's two PCs on the same day). */
function alignClocks(p: SyncPair, instant: string) {
  p.clock.set(instant);
  p.a.clock.set(instant);
  p.b.clock.set(instant);
}

const issue = (laptop: SyncLaptop, fileId: string, dueId: string) =>
  laptop.transact((ex, ctx) => issueInvoice(ex, ctx, { fileId, dueIds: [dueId], paymentMethod: "CASH" }));

it(
  "three invoices issued in turn on two laptops: each number once, the same rows on both, the chains whole",
  SLOW,
  async () => {
    pair = await createSyncPair({ demo: ["people"] });
    const p = pair;
    const a = p.a;

    // ── 12 October, the director's laptop: three contracts registered and signed ──
    const files: Array<{ fileId: string; signedBy: string }> = [];
    for (const kind of KINDS) {
      const input = contractInput(kind);
      const { fileId } = await a.transact((ex, ctx) => registerFile(ex, ctx, input));
      await a.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to: "QUOTE" }));
      await a.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to: "CONTRACTED" }));
      files.push({ fileId, signedBy: String(input.values.clientName) });
    }
    await p.syncAll();

    // ── November: every visit of the three files, in date order, on the director's laptop ──
    const visits: Array<PlannedVisit & { fileId: string; signedBy: string }> = [];
    for (const file of files) {
      const rows = await a.test.db
        .selectFrom("Visit")
        .select(["id", "visitDate", "plannedStartTime", "plannedDurationMin", "workersNeeded"])
        .where("fileId", "=", file.fileId)
        .where("visitDate", ">=", localDate(MONTH.start))
        .where("visitDate", "<=", localDate(MONTH.end))
        .execute();
      visits.push(...rows.map((row) => ({ ...row, ...file })));
    }
    visits.sort((x, y) => `${x.visitDate} ${x.plannedStartTime}`.localeCompare(`${y.visitDate} ${y.plannedStartTime}`));
    expect(visits.length).toBeGreaterThan(0);
    let day = "2026-10-12";
    const workDay = async (date: string) => {
      // The office opens the program every day on both laptops: neither clock check sees a jump.
      while (day < date) {
        const next = new Date(`${day}T00:00:00.000Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        day = next.toISOString().slice(0, 10);
        alignClocks(p, at(day, "07:00"));
        for (const laptop of [p.a, p.b]) {
          await laptop.transact((ex, ctx) => logConsult(ex, ctx, { owner: "FOUNDATION", action: "VIEW" }));
        }
      }
    };
    for (const visit of visits) {
      await workDay(visit.visitDate);
      if (a.clock.now().toISOString() > at(visit.visitDate, "07:30")) continue; // a second visit the same day: done below
      const sameDay = visits.filter((other) => other.visitDate === visit.visitDate);
      for (const other of sameDay) await doVisit(a.test, other, a.manager, other.signedBy);
      alignClocks(p, a.clock.now().toISOString());
    }
    await workDay(MONTH.after);
    alignClocks(p, at(MONTH.after, "10:00"));
    await p.syncAll();
    p.expectSame();

    const dues: string[] = [];
    for (const file of files) {
      const due = await a.test.db
        .selectFrom("PaymentDue")
        .select("id")
        .where("fileId", "=", file.fileId)
        .where("periodStart", "=", localDate(MONTH.start))
        .where("cancelledAt", "is", null)
        .executeTakeFirstOrThrow();
      dues.push(due.id);
    }

    // ── 1 December: the holder issues invoice 1 ──
    expect(await booksHolder(a)).toBe(deviceIdOf(a));
    const first = await issue(a, files[0].fileId, dues[0]);
    await p.syncAll();
    // The assistant's laptop is refused with the books' sentence.
    await expect(issue(p.b, files[1].fileId, dues[1])).rejects.toThrow(BOOKS_ELSEWHERE);

    // She asks for the books; they move; she issues invoice 2.
    p.advance({ minutes: 10 });
    await moveBooksTo(p, p.b);
    p.advance({ minutes: 10 });
    const second = await issue(p.b, files[1].fileId, dues[1]).catch(async (error: unknown) => {
      // Her PC's own log may say the date jumped since her last work: the manager confirms it there, as at the centre.
      if (!(error instanceof Error) || !/manager must confirm/.test(error.message)) throw error;
      await p.b.transact((ex, ctx) => confirmClockJump(ex, ctx));
      return issue(p.b, files[1].fileId, dues[1]);
    });
    // The director's laptop is now refused.
    await expect(issue(a, files[2].fileId, dues[2])).rejects.toThrow(BOOKS_ELSEWHERE);

    // The books come back; the director issues invoice 3, then voids invoice 2 on the holder.
    p.advance({ minutes: 10 });
    await moveBooksTo(p, a);
    p.advance({ minutes: 10 });
    const third = await issue(a, files[2].fileId, dues[2]);
    await a.transact((ex, ctx) => voidInvoice(ex, ctx, { invoiceId: second.id, reason: "خطأ في مبلغ الفاتورة" }));
    await p.syncAll();
    p.expectSame();

    // ── Each number once, across both databases; the same rows on both ──
    for (const laptop of [p.a, p.b]) {
      const invoices = await laptop.test.db
        .selectFrom("Invoice")
        .select(["id", "numberSeq", "numberYear", "issueDate", "contentDigest"])
        .where("numberYear", "=", 2026)
        .orderBy("numberSeq")
        .execute();
      const ours = invoices.filter((invoice) => [first.id, second.id, third.id].includes(invoice.id));
      expect(
        ours.map((invoice) => invoice.id),
        `the three invoices in order on ${laptop.name}`,
      ).toEqual([first.id, second.id, third.id]);
      const seqs = invoices.map((invoice) => invoice.numberSeq);
      expect(new Set(seqs).size, `no invoice number twice on ${laptop.name}`).toBe(seqs.length);
      expect(ours.map((invoice) => invoice.numberSeq)).toEqual([seqs.at(-3), seqs.at(-2), seqs.at(-1)]);
      expect(ours[1].numberSeq).toBe(ours[0].numberSeq + 1);
      expect(ours[2].numberSeq).toBe(ours[1].numberSeq + 1);
      // Dates never go below the floor: later numbers, same or later dates.
      for (let i = 1; i < invoices.length; i++) {
        expect(
          invoices[i].issueDate >= invoices[i - 1].issueDate,
          `invoice ${invoices[i].numberSeq} dated after the one before`,
        ).toBe(true);
      }
      // Each invoice still commits to its lines and its visit statement, recomputed here.
      for (const invoice of ours) {
        const lines = await laptop.test.db
          .selectFrom("InvoiceLine")
          .selectAll()
          .where("invoiceId", "=", invoice.id)
          .orderBy("seq")
          .execute();
        const statement = await laptop.test.db
          .selectFrom("InvoiceVisit")
          .selectAll()
          .where("invoiceId", "=", invoice.id)
          .orderBy("seq")
          .execute();
        expect(lines.length).toBeGreaterThan(0);
        expect(statement.length, "the visit statement travelled with its invoice").toBeGreaterThan(0);
        const strip = (row: Record<string, unknown>) => {
          const { hashV, chainSeq, prevHash, hash, ...rest } = row;
          void hashV;
          void chainSeq;
          void prevHash;
          void hash;
          return rest;
        };
        expect(
          await invoiceContentDigest({ lines: lines.map(strip) as never, visits: statement.map(strip) as never }),
          `the digest of invoice ${invoice.numberSeq} on ${laptop.name}`,
        ).toBe(invoice.contentDigest);
      }
      // The void is on both laptops, once.
      const voids = await laptop.test.db
        .selectFrom("LegalEvent")
        .select(["invoiceId", "type"])
        .where("type", "=", "VOIDED")
        .where("invoiceId", "=", second.id)
        .execute();
      expect(voids).toHaveLength(1);
      // Every chain whole: Invoice, InvoiceLine, InvoiceVisit, LegalEvent and both laptops' log chains.
      const report = await verifyChains(laptop.test.db);
      for (const chain of [
        "Invoice",
        "InvoiceLine",
        "InvoiceVisit",
        "LegalEvent",
        `AuditLog:${deviceIdOf(p.a)}`,
        `AuditLog:${deviceIdOf(p.b)}`,
      ]) {
        expect(
          report.chains.find((c) => c.chain === chain),
          `${chain} on ${laptop.name}`,
        ).toMatchObject({ firstBroken: null });
      }
      expect(report.brokenDigests).toEqual([]);
    }
    await expectLegalNumbersUnique(p.a.test, p.b.test);
    await expectChainsVerify(p);
  },
);
