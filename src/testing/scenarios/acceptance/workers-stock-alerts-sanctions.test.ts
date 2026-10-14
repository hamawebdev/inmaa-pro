import { afterEach, describe, expect, it } from "vitest";

import { registerFile } from "@/features/clients/services/files";
import { SAMPLE_WORKER_VALUES } from "@/features/people/forms/worker-values";
import { answerDecision, listDecisions, requestDecision } from "@/features/people/services/sanction-decisions";
import { setSanction } from "@/features/people/services/sanctions";
import { employeeIdentity, registerEmployee, type RegisterEmployeeInput } from "@/features/people/services/employees";
import { workerFormForPrint } from "@/features/people/services/worker-reads";
import { registerWorker, workerIdentity, type RegisterWorkerInput } from "@/features/people/services/workers";
import { emptyEmployeeValues } from "@/features/people/validators/employee";
import { createHandOut, recordHandOutReturn } from "@/features/stock/services/handouts";
import { evaluateAlerts } from "@/lib/alerts";
import { runDayStart } from "@/lib/daily";

import { createTestDatabase, type TestDatabase } from "../../database";
import { at, contractInput } from "./helpers";

/**
 * Acceptance, parts B to E (docs/checker/acceptance.md): a worker registered
 * and her form printed; a stock hand-out and its return; the contract-end and
 * payment-due alerts and the day-start job; the suspended-or-penalised check
 * and the manager's yes or no. Every step is an owner's exported service.
 */

/** A scenario builds a database and walks many steps: room for a machine six teammates are loading. */
const LONG = { timeout: 180_000 };

let test: TestDatabase;
afterEach(() => test?.close());

const BLOCKED = "This person is suspended or penalised. The manager must allow the registration first.";
const REFUSED = "The manager did not allow this person to be registered.";

describe("B: a worker is registered and the form printed", () => {
  it("the HR officer registers her, and printing the filled form is logged with its reason", LONG, async () => {
    test = await createTestDatabase();
    const hr = await test.sessionFor("HR_OFFICER");

    // B1. The HR officer types the form; «قرار الإدارة» is not hers to record (`hiring.decide`), so it stays empty.
    await expect(test.transact((ex, ctx) => registerWorker(ex, ctx, SAMPLE_WORKER_VALUES), hr)).rejects.toThrow(
      "You do not have permission to record the management's decision.",
    );
    const worker = await test.transact(
      (ex, ctx) => registerWorker(ex, ctx, { ...SAMPLE_WORKER_VALUES, hiringDecision: undefined }),
      hr,
    );
    expect(worker.id).toBeTruthy();

    // B2. The filled form shows her health answers and her score: the page asks why, and the log keeps the answer.
    await expect(
      test.transact((ex, ctx) => workerFormForPrint(ex, ctx, { id: worker.id, reason: "  " }), hr),
    ).rejects.toThrow();
    test.clock.advance({ minutes: 10 });
    const printed = await test.transact(
      (ex, ctx) => workerFormForPrint(ex, ctx, { id: worker.id, reason: "للإمضاء والختم بعد التسجيل" }),
      hr,
    );
    expect(printed.name).toContain("بوزيد");
    expect(printed.data).toBeTruthy();

    const log = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "reason", "userId"])
      .where("entityId", "=", worker.id)
      .orderBy("chainSeq")
      .execute();
    expect(log.map((entry) => entry.operation)).toContain("COLLECT");
    expect(log.filter((entry) => entry.reason === "للإمضاء والختم بعد التسجيل").length).toBeGreaterThan(0);
    expect(log.every((entry) => entry.userId === hr.userId)).toBe(true);
  });
});

describe("C: a stock hand-out is recorded", () => {
  it(
    "materials and a tool go out to a named worker for a visit, the stock goes down, and the tool comes back",
    LONG,
    async () => {
      test = await createTestDatabase({ demo: true });
      const operations = await test.sessionFor("OPERATIONS");
      const visitId = test.demo.operations.visitToday;
      const visit = await test.db
        .selectFrom("Visit")
        .select(["id", "fileId"])
        .where("id", "=", visitId)
        .executeTakeFirstOrThrow();
      const seat = await test.db
        .selectFrom("VisitWorker")
        .select("workerId")
        .where("visitId", "=", visitId)
        .where("seatStatus", "=", "ASSIGNED")
        .executeTakeFirstOrThrow();
      const stock = async (code: string) =>
        test.db.selectFrom("StockItem").select(["id", "onHandQty"]).where("code", "=", code).executeTakeFirstOrThrow();
      const cleaner = await stock("FLOOR_CLEANER");
      const brooms = await stock("BROOM");

      // C1.
      test.clock.advance({ minutes: 30 });
      const handOut = await test.transact(
        (ex, ctx) =>
          createHandOut(ex, ctx, {
            date: ctx.today,
            purpose: "JOB",
            fileId: visit.fileId,
            visitId: visit.id,
            workerId: seat.workerId,
            lines: [
              { itemId: cleaner.id, qty: 2 },
              { itemId: brooms.id, qty: 1, condition: "GOOD" },
            ],
            note: "لتنظيف المداخل",
          }),
        operations,
      );
      expect((await stock("FLOOR_CLEANER")).onHandQty).toBe(cleaner.onHandQty - 2000);
      expect((await stock("BROOM")).onHandQty).toBe(brooms.onHandQty - 1000);
      const stored = await test.db
        .selectFrom("HandOut")
        .select(["workerId", "visitId", "fileId"])
        .where("id", "=", handOut.id)
        .executeTakeFirstOrThrow();
      expect(stored).toEqual({ workerId: seat.workerId, visitId: visit.id, fileId: visit.fileId });

      // C2. The broom comes back in the evening.
      const line = await test.db
        .selectFrom("HandOutLine")
        .select("id")
        .where("handOutId", "=", handOut.id)
        .where("itemId", "=", brooms.id)
        .executeTakeFirstOrThrow();
      test.clock.advance({ hours: 6 });
      const back = await test.transact(
        (ex, ctx) =>
          recordHandOutReturn(ex, ctx, { handOutLineId: line.id, date: ctx.today, qtyReturned: 1, condition: "GOOD" }),
        operations,
      );
      expect(back.outstanding).toBe(0);
      expect((await stock("BROOM")).onHandQty).toBe(brooms.onHandQty);
      expect((await stock("FLOOR_CLEANER")).onHandQty, "what was used does not come back").toBe(
        cleaner.onHandQty - 2000,
      );
    },
  );
});

describe("D: the two alerts fire", () => {
  it(
    "the contract-end and payment-due tiles count as their dates come near, and a contract past its date ends by itself",
    LONG,
    async () => {
      test = await createTestDatabase({ demo: true });
      const accountant = await test.sessionFor("ACCOUNTANT");
      const counts = async () => {
        const states = await evaluateAlerts(test.db, test.ctx(accountant));
        return Object.fromEntries(states.map((state) => [state.key, state.count]));
      };

      // D1 and D3, as the home screen reads them, for the accountant.
      const before = await counts();
      test.clock.set(at("2026-10-28", "09:00"));
      const near = await counts();
      expect(near["contract.ending"]).toBeGreaterThan(0);
      expect(near["payment.dueSoon"]).toBeGreaterThan(0);
      expect(near["payment.overdue"]).toBeGreaterThan(0);
      // The home contract that ends on 12 November has come inside its lead time since the 12th of October.
      expect(near["contract.ending"]).toBeGreaterThan(before["contract.ending"] ?? 0);

      // D2. The morning after its end date, the day-start job ends it, once.
      const homeContract = test.demo.clients.housingContract;
      test.clock.set(at("2026-11-13", "08:00"));
      const report = await runDayStart(test.db, test.clock);
      expect(report.failed).toEqual([]);
      expect(report.ran).toContain("clients");
      const ended = await test.db
        .selectFrom("File")
        .select(["stage", "endKind", "endedDate"])
        .where("id", "=", homeContract)
        .executeTakeFirstOrThrow();
      expect(ended).toEqual({ stage: "CONTRACT_ENDED", endKind: "EXPIRED", endedDate: "2026-11-12" });
      const again = await runDayStart(test.db, test.clock);
      expect(again.ran).toEqual([]);

      // Its visits after the end date are cancelled (Operations follows `file.ended`), and nothing of it is left open.
      const open = await test.db
        .selectFrom("Visit")
        .select("id")
        .where("fileId", "=", homeContract)
        .where("visitDate", ">", "2026-11-12" as never)
        .where("status", "not in", ["CANCELLED"])
        .execute();
      expect(open).toEqual([]);
    },
  );
});

describe("E: the suspended-or-penalised check fires and waits for the manager", () => {
  /** Samira is registered, then suspended on 1 October. The others below share her phone number. */
  async function suspendedWorker() {
    test = await createTestDatabase();
    const samira = await test.transact((ex, ctx) => registerWorker(ex, ctx, SAMPLE_WORKER_VALUES));
    const { sanctionId } = await test.transact((ex, ctx) =>
      setSanction(ex, ctx, {
        subjectKind: "WORKER",
        subjectId: samira.id,
        state: "SUSPENDED",
        reason: "غياب متكرر",
        startDate: "2026-10-01",
      }),
    );
    return { samira, sanctionId, hr: await test.sessionFor("HR_OFFICER") };
  }

  const sister: RegisterWorkerInput = {
    ...SAMPLE_WORKER_VALUES,
    lastName: "بن سعيد",
    firstName: "سامية",
    fullNameLatin: "",
    birthDate: "1997-06-02",
    nationalIdNumber: "",
    hiringDecision: undefined,
  };

  it(
    "a worker: refused, then the manager's yes lets exactly one registration through, and is logged",
    LONG,
    async () => {
      const { sanctionId, hr } = await suspendedWorker();

      await expect(test.transact((ex, ctx) => registerWorker(ex, ctx, sister), hr)).rejects.toThrow(BLOCKED);
      const { decisionId } = await test.transact(
        (ex, ctx) =>
          requestDecision(ex, ctx, {
            context: "WORKER_REGISTRATION",
            subjectKind: "WORKER",
            identity: workerIdentity(sister),
            sanctionId,
            draftPayload: sister,
            resumeRoute: "/dashboard/workers/new",
          }),
        hr,
      );
      // It waits: still refused, and on the manager's list.
      await expect(test.transact((ex, ctx) => registerWorker(ex, ctx, { ...sister, decisionId }), hr)).rejects.toThrow(
        BLOCKED,
      );
      expect((await listDecisions(test.db, test.ctx(), { status: "PENDING" })).map((row) => row.id)).toEqual([
        decisionId,
      ]);

      test.clock.advance({ minutes: 20 });
      await test.transact((ex, ctx) => answerDecision(ex, ctx, { decisionId, allow: true, reason: "أختها، وليست هي" }));

      const registered = await test.transact((ex, ctx) => registerWorker(ex, ctx, { ...sister, decisionId }), hr);
      expect(registered.id).toBeTruthy();
      // The yes was for that one registration: it is marked as used, and it opens the door to nobody else.
      const used = await test.db
        .selectFrom("SanctionDecision")
        .select(["status", "consumedAt"])
        .where("id", "=", decisionId)
        .executeTakeFirstOrThrow();
      expect(used.status).toBe("ALLOWED");
      expect(used.consumedAt).not.toBeNull();
      const another: RegisterWorkerInput = { ...sister, firstName: "نوال", birthDate: "1999-01-20" };
      await expect(test.transact((ex, ctx) => registerWorker(ex, ctx, { ...another, decisionId }), hr)).rejects.toThrow(
        /already been used|must allow the registration first/,
      );

      const log = await test.db
        .selectFrom("AuditLog")
        .select(["action", "userId", "reason"])
        .where("action", "=", "APPROVE")
        .execute();
      expect(log).toEqual([{ action: "APPROVE", userId: test.ctx().userId, reason: "أختها، وليست هي" }]);
    },
  );

  it("a worker: the manager's no keeps refusing", LONG, async () => {
    const { sanctionId, hr } = await suspendedWorker();
    const { decisionId } = await test.transact(
      (ex, ctx) =>
        requestDecision(ex, ctx, {
          context: "WORKER_REGISTRATION",
          subjectKind: "WORKER",
          identity: workerIdentity(sister),
          sanctionId,
          draftPayload: sister,
          resumeRoute: "/dashboard/workers/new",
        }),
      hr,
    );
    await test.transact((ex, ctx) => answerDecision(ex, ctx, { decisionId, allow: false, reason: "لا تُسجَّل" }));
    await expect(test.transact((ex, ctx) => registerWorker(ex, ctx, { ...sister, decisionId }), hr)).rejects.toThrow(
      REFUSED,
    );
    await expect(test.transact((ex, ctx) => registerWorker(ex, ctx, sister), hr)).rejects.toThrow(BLOCKED);
  });

  it("an employee who matches her is refused until the manager says yes", LONG, async () => {
    const { sanctionId, hr } = await suspendedWorker();
    const clerk: RegisterEmployeeInput = {
      ...emptyEmployeeValues("2026-10-12"),
      sex: "FEMALE",
      lastName: "بن سعيد",
      firstName: "سامية",
      birthDate: "1997-06-02",
      phone: SAMPLE_WORKER_VALUES.phone,
      residenceCommuneId: "commune-0401",
      jobPosition: "RECEPTION_SALES",
    };
    await expect(test.transact((ex, ctx) => registerEmployee(ex, ctx, clerk), hr)).rejects.toThrow(BLOCKED);
    const { decisionId } = await test.transact(
      (ex, ctx) =>
        requestDecision(ex, ctx, {
          context: "EMPLOYEE_REGISTRATION",
          subjectKind: "EMPLOYEE",
          identity: employeeIdentity(clerk),
          sanctionId,
          resumeRoute: "/dashboard/employees/new",
        }),
      hr,
    );
    await test.transact((ex, ctx) => answerDecision(ex, ctx, { decisionId, allow: true, reason: "قريبتها" }));
    const registered = await test.transact((ex, ctx) => registerEmployee(ex, ctx, { ...clerk, decisionId }), hr);
    expect(registered.id).toBeTruthy();
  });

  it("a client who matches her is refused on a new file until the manager says yes", LONG, async () => {
    const { sanctionId } = await suspendedWorker();
    const reception = await test.sessionFor("RECEPTION_SALES");
    const model = contractInput("HOUSING_CONTRACT");
    const input = {
      ...model,
      values: {
        ...model.values,
        clientName: "بوزيد سميرة",
        payerName: "بوزيد سميرة",
        phone: SAMPLE_WORKER_VALUES.phone,
      },
    };
    await expect(test.transact((ex, ctx) => registerFile(ex, ctx, input), reception)).rejects.toThrow(BLOCKED);
    const { decisionId } = await test.transact(
      (ex, ctx) =>
        requestDecision(ex, ctx, {
          context: "CLIENT_FILE",
          subjectKind: "CLIENT",
          identity: { name: "بوزيد سميرة", phones: [SAMPLE_WORKER_VALUES.phone] },
          sanctionId,
          resumeRoute: "/dashboard/files/new",
        }),
      reception,
    );
    await test.transact((ex, ctx) =>
      answerDecision(ex, ctx, { decisionId, allow: true, reason: "عميلة، والعقوبة تخص عملها" }),
    );
    const file = await test.transact((ex, ctx) => registerFile(ex, ctx, { ...input, decisionId }), reception);
    expect(file.fileId).toBeTruthy();
    const kept = await test.db
      .selectFrom("File")
      .select("sanctionDecisionId")
      .where("id", "=", file.fileId)
      .executeTakeFirstOrThrow();
    expect(kept.sanctionDecisionId).toBe(decisionId);
  });
});
