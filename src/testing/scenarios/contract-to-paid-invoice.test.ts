import { afterEach, beforeEach, expect, it } from "vitest";

import { ensureCommune, ensureZoneForCommune } from "@/features/core/services/places";
import { appendChained, invoiceContentDigest, verifyChains } from "@/lib/chain";
import { compareAnchor } from "@/lib/chain/anchor";
import { logChange, logCollect } from "@/lib/log";
import { fileSequenceKey, nextNumber, nextNumbers, peekLegalNumber } from "@/lib/numbering";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { normaliseName, phoneKeys } from "@/lib/text/normalise";
import { localDate } from "@/lib/units";

import { createTestDatabase, type TestDatabase } from "../database";

/**
 * A contract file from registration to a paid invoice, written table by table
 * with raw inserts: what each owner's services will do, in the order of
 * CONTRACTS.md section 5, on a database built from the real migrations. It
 * proves that the tables, keys, checks and triggers carry the whole path.
 * The owners' own scenario tests walk it again through their services
 * (BUILD-NOTES section 6, A2).
 *
 * Each step is one user action: one transaction through the program's
 * wrapper, which anchors the chains after the commit. The clock moves between
 * steps as the weeks would.
 */
let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => test.close());

const act = <T>(work: (ex: Executor, ctx: ServiceContext) => Promise<T>) => test.run.transact(work);

const SELLER = JSON.stringify({
  nameAr: "مركز إنماء برو",
  rc: "04/00-0000000A00",
  nis: "000000000000000",
  nif: "000000000000000",
});

it("takes an organisation's contract file from registration to a paid invoice", async () => {
  // ── Monday 12 October: the request is registered (Clients) ─────────────────
  const { client, file, zoneId } = await act(async (ex, ctx) => {
    const { id: communeId } = await ensureCommune(ex, ctx, { wilayaCode: "04", nameAr: "عين مليلة" });
    const { zoneId } = await ensureZoneForCommune(ex, ctx, { communeId });
    const dossier = await nextNumber(ex, ctx, "CLIENT_DOSSIER", { date: ctx.today });
    const client = await test.rows.insert(
      "Client",
      {
        numberSeq: dossier.seq,
        number: dossier.display,
        clientType: "ORGANISATION",
        name: "مؤسسة النور",
        nameKey: normaliseName("مؤسسة النور"),
        phone1: "0659 53 81 83",
        phoneKeys: phoneKeys(["0659 53 81 83"]),
        legalForm: "SARL",
        rcNumber: "04/00-0123456B21",
        nis: "000204012345678",
        nif: "000204012345678",
        branchId: ctx.branchId,
      },
      { ex, ctx },
    );
    await logCollect(ex, ctx, {
      owner: "CLIENTS",
      action: "CREATE",
      entity: "Client",
      entityId: client.id,
      entityLabel: client.number,
      subject: { kind: "CLIENT", id: client.id, label: client.name },
    });
    const site = await test.rows.insert(
      "Site",
      { clientId: client.id, division: "ORGANISATION", address: "حي 500 مسكن", communeId, zoneId },
      { ex, ctx },
    );
    const number = await nextNumber(ex, ctx, fileSequenceKey("ORG_CONTRACT"), { date: ctx.today });
    const file = await test.rows.insert(
      "File",
      {
        formKind: "ORG_CONTRACT",
        numberSeq: number.seq,
        number: number.display,
        registrationDate: ctx.today,
        division: "ORGANISATION",
        serviceType: "CONTRACT",
        clientId: client.id,
        siteId: site.id,
        branchId: ctx.branchId,
        stage: "NEW",
        stageChangedAt: ctx.now,
      },
      { ex, ctx },
    );
    await test.rows.insert("FileStageEvent", { fileId: file.id, toStage: "NEW", changedAt: ctx.now }, { ex, ctx });
    return { client, file, zoneId };
  });
  expect([client.number, file.number]).toEqual(["1", "1"]);

  // ── First visit, quote, contract: one stage a day (Clients) ────────────────
  for (const stage of ["VISIT", "QUOTE", "CONTRACTED"]) {
    test.clock.advance({ days: 1 });
    await act(async (ex, ctx) => {
      const before = await ex.selectFrom("File").select("stage").where("id", "=", file.id).executeTakeFirstOrThrow();
      // Only the columns that change.
      await ex
        .updateTable("File")
        .set({ stage, stageChangedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", file.id)
        .execute();
      await test.rows.insert(
        "FileStageEvent",
        { fileId: file.id, fromStage: before.stage, toStage: stage, changedAt: ctx.now } as never,
        { ex, ctx },
      );
      await logChange(ex, ctx, {
        owner: "CLIENTS",
        action: "STATUS_CHANGE",
        entity: "File",
        entityId: file.id,
        entityLabel: file.number,
        changes: { stage: [before.stage, stage] },
      });
    });
  }

  // ── On «متعاقد»: Operations makes the visits, Money the due ─────────────────
  const { visits, due } = await act(async (ex, ctx) => {
    const dates = ["2026-11-02", "2026-11-09", "2026-11-16", "2026-11-23"].map(localDate);
    const numbers = await nextNumbers(ex, ctx, "VISIT", { date: dates[0], count: dates.length });
    const visits = [];
    for (const [index, visitDate] of dates.entries()) {
      visits.push(
        await test.rows.insert(
          "Visit",
          {
            numberSeq: numbers[index].seq,
            numberYear: numbers[index].year,
            number: numbers[index].display,
            fileId: file.id,
            origin: "CONTRACT",
            visitDate,
            plannedStartTime: "08:00",
            plannedDurationMin: 180,
            workersNeeded: 3,
            zoneId,
            status: "CONFIRMED",
            statusChangedAt: ctx.now,
          } as never,
          { ex, ctx },
        ),
      );
    }
    const due = await test.rows.insert(
      "PaymentDue",
      {
        fileId: file.id,
        seq: 1,
        kind: "SCHEDULE",
        periodStart: "2026-11-01",
        periodEnd: "2026-11-30",
        dueDate: "2026-12-05",
        plannedVisits: 4,
        expectedAmount: 4_500_000,
        amount: 4_500_000,
      } as never,
      { ex, ctx },
    );
    return { visits, due };
  });
  expect(visits.map((visit) => visit.number)).toEqual(["00001/2026", "00002/2026", "00003/2026", "00004/2026"]);

  // ── The visits are done and signed off (Operations) ───────────────────────
  test.clock.set("2026-11-23T12:00:00.000Z");
  await act(async (ex, ctx) => {
    await ex
      .updateTable("Visit")
      .set({ status: "DONE", statusChangedAt: ctx.now, statusChangedByUserId: ctx.userId, updatedAt: ctx.now })
      .where("fileId", "=", file.id)
      .execute();
  });

  // ── 1 December: the month is invoiced with its visit statement (Money) ─────
  test.clock.set("2026-12-01T08:00:00.000Z");
  const invoice = await act(async (ex, ctx) => {
    const next = await peekLegalNumber(ex, ctx, "INVOICE", { date: ctx.today });
    const invoiceId = "invoice-1";
    const line = {
      id: "invoice-1-line-1",
      invoiceId,
      seq: 1,
      kind: "SERVICE",
      description: "خدمة التنظيف لشهر نوفمبر 2026",
      quantity: 1_000,
      unitLabel: "شهر",
      unitPrice: 4_500_000,
      amount: 4_500_000,
      dueId: due.id,
      visitId: null,
      complaintId: null,
      createdAt: ctx.now,
    };
    const statement = visits.map((visit, index) => ({
      id: `invoice-1-visit-${index + 1}`,
      invoiceId,
      seq: index + 1,
      visitId: visit.id,
      visitDate: visit.visitDate,
      dayName: "الاثنين",
      arrival: "08:00",
      departure: "11:00",
      workersCount: 3,
      workedMin: 540,
      completion: "مكتملة بالكامل",
      signOff: "راض",
      signedBy: "مدير المؤسسة",
      billable: 1,
      remark: null,
      createdAt: ctx.now,
    }));
    const contentDigest = await invoiceContentDigest({ lines: [line], visits: statement });
    await appendChained(ex, ctx, "Invoice", {
      id: invoiceId,
      numberSeq: next.seq,
      numberYear: next.year,
      number: next.display,
      fileId: file.id,
      clientId: client.id,
      division: "ORGANISATION",
      serviceType: "CONTRACT",
      branchId: ctx.branchId,
      issueDate: ctx.today,
      issuedAt: ctx.now,
      issuedByUserId: ctx.userId,
      periodStart: "2026-11-01",
      periodEnd: "2026-11-30",
      taxMode: "IFU",
      vatRate: 0,
      pricesIncludeVat: 0,
      grossAmount: 4_500_000,
      discountAmount: 0,
      totalHT: 4_500_000,
      vatAmount: 0,
      totalTTC: 4_500_000,
      paymentMethod: "CASH",
      // 45 000.00 in cash: 1.50 per 100 on the whole amount (BUILD-NOTES section 6 E).
      stampDuty: 67_500,
      netToPay: 4_567_500,
      amountWordsAr: "خمسة وأربعون ألفا وستمائة وخمسة وسبعون دينارا",
      amountWordsFr: "quarante-cinq mille six cent soixante-quinze dinars",
      dueDate: "2026-12-05",
      paymentPlace: "أم البواقي",
      sellerSnapshot: SELLER,
      buyerSnapshot: JSON.stringify({ name: client.name, rc: client.rcNumber, nis: client.nis, nif: client.nif }),
      ifuMention: "خاضع للضريبة الجزافية الوحيدة",
      note: null,
      replacesInvoiceId: null,
      contentDigest,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    });
    await appendChained(ex, ctx, "InvoiceLine", line);
    for (const row of statement) await appendChained(ex, ctx, "InvoiceVisit", row);
    await ex
      .updateTable("PaymentDue")
      .set({ invoiceId, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", due.id)
      .execute();
    await appendChained(ex, ctx, "LegalEvent", {
      id: "invoice-1-printed",
      invoiceId,
      paymentId: null,
      receiptId: null,
      type: "PRINTED",
      reason: null,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    });
    return { id: invoiceId, number: next.display };
  });
  expect(invoice.number).toBe("000001/2026");

  // ── 3 December: paid in cash at the office, with its receipt (Money) ───────
  test.clock.set("2026-12-03T09:00:00.000Z");
  await act(async (ex, ctx) => {
    const next = await peekLegalNumber(ex, ctx, "RECEIPT", { date: ctx.today });
    await appendChained(ex, ctx, "Receipt", {
      id: "receipt-1",
      numberSeq: next.seq,
      numberYear: next.year,
      number: next.display,
      issueDate: ctx.today,
      batchId: null,
      collectorKind: "OFFICE",
      collectorStaffId: null,
      fileId: file.id,
      branchId: ctx.branchId,
      sellerSnapshot: SELLER,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    });
    await appendChained(ex, ctx, "Payment", {
      id: "payment-1",
      fileId: file.id,
      clientId: client.id,
      division: "ORGANISATION",
      branchId: ctx.branchId,
      receivedDate: ctx.today,
      method: "CASH",
      amount: 4_500_000,
      stampDuty: 67_500,
      totalReceived: 4_567_500,
      reference: null,
      payerName: "مسدد أتعاب",
      place: "أم البواقي",
      collectorKind: "OFFICE",
      collectorStaffId: null,
      receiptId: "receipt-1",
      amountWordsAr: "خمسة وأربعون ألفا وستمائة وخمسة وسبعون دينارا",
      amountWordsFr: "quarante-cinq mille six cent soixante-quinze dinars",
      receiptReason: `فاتورة رقم ${invoice.number}`,
      proofUrl: null,
      note: null,
      enteredByUserId: ctx.userId,
      enteredAt: ctx.now,
      createdAt: ctx.now,
    });
    await appendChained(ex, ctx, "PaymentAllocation", {
      id: "allocation-1",
      paymentId: "payment-1",
      dueId: due.id,
      amount: 4_500_000,
      reversesAllocationId: null,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    });
  });

  // ── What must hold ─────────────────────────────────────────────────────────
  // Paid in full: the receivable never includes the stamp, so nothing stays open.
  const paid = await test.db
    .selectFrom("PaymentDue")
    .select(["amount", "paidAmount", "invoiceId"])
    .where("id", "=", due.id)
    .executeTakeFirstOrThrow();
  expect(paid).toEqual({ amount: 4_500_000, paidAmount: 4_500_000, invoiceId: "invoice-1" });

  // Both legal counters moved by their documents, with their date floors.
  const counters = await test.db
    .selectFrom("Sequence")
    .select(["key", "year", "lastValue", "lastDate"])
    .where("key", "in", ["INVOICE", "RECEIPT"])
    .orderBy("key")
    .execute();
  expect(counters).toEqual([
    { key: "INVOICE", year: 2026, lastValue: 1, lastDate: "2026-12-01" },
    { key: "RECEIPT", year: 2026, lastValue: 1, lastDate: "2026-12-03" },
  ]);

  // The stage history has every step.
  const stages = await test.db
    .selectFrom("FileStageEvent")
    .select("toStage")
    .where("fileId", "=", file.id)
    .orderBy("changedAt")
    .execute();
  expect(stages.map((event) => event.toStage)).toEqual(["NEW", "VISIT", "QUOTE", "CONTRACTED"]);

  // A receipt in use cannot be voided before its payment.
  await expect(
    test.rows.insert("LegalEvent", { receiptId: "receipt-1", type: "VOIDED", reason: "غير مستعمل" }),
  ).rejects.toThrow("RECEIPT:in_use");

  // Every chain, digest, legal number and cache verifies; the anchor follows the database.
  expect(await verifyChains(test.db)).toMatchObject({
    ok: true,
    brokenDigests: [],
    missingNumbers: [],
    brokenTotals: [],
  });
  const anchor = await compareAnchor(test.db, test.anchor, test.ctx().now);
  expect(anchor.state).toBe("normal");
  expect(anchor.anchor?.lastInvoice).toEqual({ number: "000001/2026", issueDate: "2026-12-01" });

  // The log holds the client's registration and each stage, with the five things.
  const entries = await test.db
    .selectFrom("AuditLog")
    .select(["operation", "action", "entity", "localDate", "localTime", "userId"])
    .where("ownerCode", "=", "CLIENTS")
    .orderBy("chainSeq")
    .execute();
  expect(entries.map((entry) => `${entry.operation} ${entry.action} ${entry.entity} ${entry.localDate}`)).toEqual([
    "COLLECT CREATE Client 2026-10-12",
    "CHANGE STATUS_CHANGE File 2026-10-13",
    "CHANGE STATUS_CHANGE File 2026-10-14",
    "CHANGE STATUS_CHANGE File 2026-10-15",
  ]);
  expect(entries.every((entry) => entry.userId === test.manager.userId && entry.localTime === "09:00")).toBe(true);
});
