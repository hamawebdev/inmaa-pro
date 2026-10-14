import { afterEach, beforeEach, expect, it } from "vitest";

import { openResidentList } from "@/features/clients/services/file-reads";
import { saveClientIdentifiers } from "@/features/clients/services/clients";
import { moveFileStage, registerFile } from "@/features/clients/services/files";
import type { FormKind } from "@/features/clients/validators/option-lists";
import { issueInvoice } from "@/features/money/services/invoices";
import { recordPayment } from "@/features/money/services/payments";
import { getIncomeData } from "@/features/money/services/reports";
import { verifyChains } from "@/lib/chain";
import { localDate } from "@/lib/units";

import { createTestDatabase, type TestDatabase } from "../../database";
import { at, contractInput, doVisit, logOf, MONTH, openEachMorning, visitsOf } from "./helpers";

/**
 * Acceptance, part A: one job from the form to the money, on the contract path,
 * once per division (docs/checker/acceptance.md, steps A1 and A4 to A11).
 *
 * Every step is an owner's exported service, called as the role that does it at
 * the centre: reception registers and contracts, operations runs the visits,
 * the accountant invoices and collects. The clock moves as a month would. A
 * step that fails here is a finding for its owner.
 *
 * Starts from People's demo data, for workers to seat; the file is this test's.
 */

/** A scenario builds a database and walks many steps: room for a machine six teammates are loading. */
const LONG = { timeout: 180_000 };

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase({ demo: ["people"] });
}, LONG.timeout);
afterEach(() => test?.close());

/** An organisation's identifiers, as its papers give them (invented). */
const ORG_IDS = {
  legalForm: "SARL",
  rcNumber: "04/00-1234567 B 20",
  nis: "001204012345678",
  nif: "001204012345678",
  articleNumber: "04011234567",
};

const DIVISIONS: Array<{ kind: FormKind; division: string; name: string }> = [
  { kind: "HOUSING_CONTRACT", division: "HOUSING", name: "المنازل" },
  { kind: "ORG_CONTRACT", division: "ORGANISATION", name: "المؤسسات" },
  // A building's or a complex's form carries «قائمة القاطنين». Reception registers it all the same (the ruling
  // tested at the foot of this file): at the first registration the list comes in with the right to write requests.
  { kind: "BUILDING_CONTRACT", division: "BUILDING", name: "العمارات" },
  { kind: "COMPLEX_CONTRACT", division: "COMPLEX", name: "التجمعات السكنية" },
];

it.each(DIVISIONS)(
  "$name: a contract runs from its form to a paid invoice and shows in income",
  LONG,
  async ({ kind, division }) => {
    const reception = await test.sessionFor("RECEPTION_SALES");
    const operations = await test.sessionFor("OPERATIONS");
    const accountant = await test.sessionFor("ACCOUNTANT");
    const input = contractInput(kind);

    // A1. The file is registered on his form.
    const file = await test.transact((ex, ctx) => registerFile(ex, ctx, input), reception);
    expect(file.fileId).toBeTruthy();

    // A2 and A3 are passed from the form's own date and amount (no first-visit or quote record yet); A4: «متعاقد».
    test.clock.advance({ days: 1 });
    await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "QUOTE" }), reception);
    test.clock.advance({ days: 2 });
    await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "CONTRACTED" }), reception);

    // A5. `file.contracted` made the visits (Operations) and the dues (Money).
    const visits = await visitsOf(test, file.fileId);
    expect(visits.length).toBeGreaterThan(0);
    const dues = await test.db
      .selectFrom("PaymentDue")
      .select(["id", "periodStart", "amount"])
      .where("fileId", "=", file.fileId)
      .where("cancelledAt", "is", null)
      .orderBy("periodStart")
      .execute();
    expect(dues.length).toBeGreaterThan(0);
    const november = dues.find((due) => due.periodStart === MONTH.start);
    expect(november, "a due for the first month").toBeDefined();

    // A5 to A8. Every visit of the month: team, printed order, returned order with attendance and sign-off.
    const month = visits.filter((visit) => visit.visitDate >= MONTH.start && visit.visitDate <= MONTH.end);
    expect(month.length).toBeGreaterThan(0);
    for (const visit of month) {
      await openEachMorning(test, file.fileId, reception, visit.visitDate);
      const seated = await doVisit(test, visit, operations, String(input.values.clientName));
      expect(seated, `workers seated on ${visit.visitDate}`).toBe(visit.workersNeeded);
    }
    const done = await test.db
      .selectFrom("Visit")
      .select(["status"])
      .where("fileId", "=", file.fileId)
      .where("visitDate", "<=", localDate(MONTH.end))
      .execute();
    expect(new Set(done.map((visit) => visit.status))).toEqual(new Set(["DONE"]));

    // A9. The month is over: the accountant issues its invoice from the signed-off visits.
    await openEachMorning(test, file.fileId, reception, MONTH.after);
    test.clock.set(at(MONTH.after, "10:00"));
    if (kind === "ORG_CONTRACT") {
      // An organisation's invoice carries its RC, NIS and NIF: reception types them on the client's card first.
      await test.transact(
        (ex, ctx) => saveClientIdentifiers(ex, ctx, { clientId: file.clientId, identifiers: ORG_IDS }),
        reception,
      );
    }
    const invoice = await test.transact(
      (ex, ctx) => issueInvoice(ex, ctx, { fileId: file.fileId, dueIds: [november!.id], paymentMethod: "CASH" }),
      accountant,
    );
    expect(invoice.id).toBeTruthy();

    // A10. Paid in cash: a receipt, with stamp duty.
    const payment = await test.transact(
      (ex, ctx) =>
        recordPayment(ex, ctx, {
          fileId: file.fileId,
          receivedDate: ctx.today,
          method: "CASH",
          amount: november!.amount,
          dueIds: [november!.id],
        }),
      accountant,
    );
    expect(payment.receiptId, "a cash payment has its receipt").toBeTruthy();

    // A11. It shows in income, under its division.
    const income = await getIncomeData(test.db, test.ctx(accountant), {
      from: localDate(MONTH.after),
      to: localDate("2026-12-31"),
    });
    const line = income.payments.find((row) => row.id === payment.id);
    expect(line).toMatchObject({ division, method: "CASH", amount: november!.amount });
    expect(line!.stampDuty).toBeGreaterThan(0);
    expect(line!.receiptNumber).toBeTruthy();

    // After the paid job: the chains hold, and each step on personal data left its entry in the log.
    expect(await verifyChains(test.db)).toMatchObject({
      ok: true,
      brokenDigests: [],
      missingNumbers: [],
      brokenTotals: [],
    });
    const fileLog = await logOf(test, "File", file.fileId);
    expect(fileLog.map((entry) => entry.operation)).toContain("COLLECT");
    expect(fileLog.map((entry) => entry.action)).toContain("STATUS_CHANGE");
    const visitLog = await logOf(test, "Visit", month[0].id);
    expect(
      visitLog.map((entry) => entry.operation),
      "the printed order names the team: a disclosure",
    ).toContain("DISCLOSE");
    expect(visitLog.length, "the returned order is logged").toBeGreaterThan(1);
    expect((await logOf(test, "Invoice", invoice.id)).length).toBeGreaterThan(0);
    expect((await logOf(test, "Payment", payment.id)).length).toBeGreaterThan(0);
  },
);

it("المؤسسات: without the client's trade register number the invoice is refused, in words", LONG, async () => {
  const reception = await test.sessionFor("RECEPTION_SALES");
  const operations = await test.sessionFor("OPERATIONS");
  const accountant = await test.sessionFor("ACCOUNTANT");
  const input = contractInput("ORG_CONTRACT");
  const file = await test.transact((ex, ctx) => registerFile(ex, ctx, input), reception);
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "QUOTE" }), reception);
  await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: file.fileId, to: "CONTRACTED" }), reception);
  const visits = (await visitsOf(test, file.fileId)).filter((visit) => visit.visitDate <= MONTH.end);
  for (const visit of visits) {
    await openEachMorning(test, file.fileId, reception, visit.visitDate);
    await doVisit(test, visit, operations, String(input.values.clientName));
  }
  const due = await test.db
    .selectFrom("PaymentDue")
    .select("id")
    .where("fileId", "=", file.fileId)
    .where("periodStart", "=", localDate(MONTH.start))
    .executeTakeFirstOrThrow();
  await openEachMorning(test, file.fileId, reception, MONTH.after);
  test.clock.set(at(MONTH.after, "10:00"));
  await expect(
    test.transact(
      (ex, ctx) => issueInvoice(ex, ctx, { fileId: file.fileId, dueIds: [due.id], paymentMethod: "CASH" }),
      accountant,
    ),
  ).rejects.toThrow("This client's trade register number is needed on the invoice.");
});

it(
  "المؤسسات: the office types the organisation's RC, NIS and NIF on its card, and the change is logged",
  LONG,
  async () => {
    const reception = await test.sessionFor("RECEPTION_SALES");
    const file = await test.transact((ex, ctx) => registerFile(ex, ctx, contractInput("ORG_CONTRACT")), reception);
    test.clock.advance({ minutes: 15 });
    const saved = await test.transact(
      (ex, ctx) => saveClientIdentifiers(ex, ctx, { clientId: file.clientId, identifiers: ORG_IDS }),
      reception,
    );
    expect(saved).toEqual({ clientId: file.clientId, changed: true });
    const client = await test.db
      .selectFrom("Client")
      .select(["rcNumber", "nis", "nif", "articleNumber"])
      .where("id", "=", file.clientId)
      .executeTakeFirstOrThrow();
    expect(client).toEqual({
      rcNumber: ORG_IDS.rcNumber,
      nis: ORG_IDS.nis,
      nif: ORG_IDS.nif,
      articleNumber: ORG_IDS.articleNumber,
    });
    const log = await logOf(test, "Client", file.clientId);
    expect(log.map((entry) => entry.operation)).toContain("CHANGE");
    // The same again changes nothing.
    expect(
      await test.transact(
        (ex, ctx) => saveClientIdentifiers(ex, ctx, { clientId: file.clientId, identifiers: ORG_IDS }),
        reception,
      ),
    ).toEqual({ clientId: file.clientId, changed: false });
  },
);

it.each([
  { kind: "BUILDING_CONTRACT" as const, name: "العمارات" },
  { kind: "COMPLEX_CONTRACT" as const, name: "التجمعات السكنية" },
])(
  "$name: reception registers the contract with its residents list, and cannot read the list back",
  LONG,
  async ({ kind }) => {
    // The coordinator's ruling: the first registration of a file carries «قائمة القاطنين» with the section's WRITE level
    // alone, because the clerk copies the paper in front of her, each line logged as a COLLECT. After that the list is
    // read, printed and changed only with `residents.read`, which reception does not hold.
    const reception = await test.sessionFor("RECEPTION_SALES");
    const administration = await test.sessionFor("ADMINISTRATION");
    const input = contractInput(kind);
    const file = await test.transact((ex, ctx) => registerFile(ex, ctx, input), reception);

    const stored = await test.db.selectFrom("Resident").select("id").where("siteId", "=", file.siteId).execute();
    expect(stored.length).toBe(input.residents!.length);
    const collected = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "userId"])
      .where("entity", "=", "Resident")
      .where(
        "entityId",
        "in",
        stored.map((resident) => resident.id),
      )
      .execute();
    expect(collected.length).toBe(stored.length);
    expect(collected.every((entry) => entry.operation === "COLLECT" && entry.userId === reception.userId)).toBe(true);

    await expect(
      test.transact((ex, ctx) => openResidentList(ex, ctx, { fileId: file.fileId }), reception),
    ).rejects.toThrow("You do not have permission to do this.");
    const read = await test.transact((ex, ctx) => openResidentList(ex, ctx, { fileId: file.fileId }), administration);
    expect(read.length).toBe(stored.length);
  },
);
