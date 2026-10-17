import type { Insertable } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues, SAMPLE_WORKER_VALUES } from "@/features/people/forms/worker-values";
import type { DB } from "@/lib/db/schema";
import type { Session } from "@/lib/service/context";
import { normaliseName } from "@/lib/text/normalise";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  REGISTRATION_REFRESHES,
  registerWorker,
  workerIdentity,
  WORKERS_PATH,
  type RegisterWorkerInput,
} from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const register = (input: RegisterWorkerInput, session?: Session) =>
  test.transact((ex, ctx) => registerWorker(ex, ctx, input), session);

/** The least a worker form needs: who she is, her phone, her sex. */
const MINIMAL: RegisterWorkerInput = {
  ...emptyWorkerValues("2026-10-12"),
  sex: "MALE",
  lastName: "سعدي",
  firstName: "كمال",
  birthDate: "1990-05-02",
  phone: "0770 11 22 33",
};

const count = async (table: "StaffMember" | "StaffConfidential" | "StaffDocument" | "HiringDecision" | "StaffEvent") =>
  Number(
    (
      await test.db
        .selectFrom(table)
        .select((eb) => eb.fn.countAll().as("n"))
        .executeTakeFirstOrThrow()
    ).n,
  );

async function logOf(entity: string) {
  return test.db.selectFrom("AuditLog").selectAll().where("entity", "=", entity).orderBy("chainSeq").execute();
}

describe("registerWorker", () => {
  it("registers the sample worker: her number, her file, her documents, the decision and the log", async () => {
    const result = await register(SAMPLE_WORKER_VALUES);
    expect(result.number).toBe("1/F");

    const worker = await test.db
      .selectFrom("StaffMember")
      .selectAll()
      .where("id", "=", result.id)
      .executeTakeFirstOrThrow();
    expect(worker).toMatchObject({
      kind: "WORKER",
      numberSeq: 1,
      numberSuffix: "F",
      number: "1/F",
      registrationDate: "2026-10-11",
      lastName: "بوزيد",
      firstName: "سميرة",
      sex: "FEMALE",
      phone: "0661203142",
      phoneKeys: "|0661203142|",
      emergencyPhone: "0550123456",
      nameKey: normaliseName("بوزيد سميرة"),
      nameLatinKey: "bouzid samira",
      residenceCommuneId: "commune-0401",
      workedInFieldBefore: 1,
      previousEmployer: "مؤسسة النور للخدمات",
      abilities: JSON.stringify(SAMPLE_WORKER_VALUES.abilities),
      availableDays: JSON.stringify(SAMPLE_WORKER_VALUES.availableDays),
      issuedPlace: "أم البواقي",
      issuedDate: "2026-10-12",
      engagementStatus: "ON_TRIAL",
      branchId: "branch-main",
      role: "CLEANER",
      weeklyCapacityMin: 2400,
      payBasis: "MONTHLY",
      payRate: 3_200_000,
      payPeriod: "MONTHLY",
      createdByUserId: test.manager.userId,
    });
    // Her zone is her commune's, made the first time somebody lives there.
    const zone = await test.db.selectFrom("Zone").selectAll().where("id", "=", worker.zoneId).executeTakeFirstOrThrow();
    expect(zone.name).toBe("أم البواقي");

    const confidential = await test.db
      .selectFrom("StaffConfidential")
      .selectAll()
      .where("staffId", "=", result.id)
      .executeTakeFirstOrThrow();
    expect(confidential).toMatchObject({
      conditions: '["OTHER"]',
      otherText: "حساسية من الغبار",
      scoreAppearance: 8,
      scoreTrustHonesty: 9,
      total: 78,
      evaluatedByUserId: test.manager.userId,
      evaluatedDate: "2026-10-12",
    });

    const documents = await test.db
      .selectFrom("StaffDocument")
      .select(["type", "isRestricted", "delivered", "deliveredDate", "expiryDate", "isCurrent"])
      .where("staffId", "=", result.id)
      .orderBy("type")
      .execute();
    expect(documents).toEqual([
      {
        type: "BIRTH_CERT",
        isRestricted: 0,
        delivered: 1,
        deliveredDate: "2026-10-11",
        expiryDate: null,
        isCurrent: 1,
      },
      {
        type: "CROSSED_CCP_CHEQUE",
        isRestricted: 0,
        delivered: 1,
        deliveredDate: "2026-10-11",
        expiryDate: null,
        isCurrent: 1,
      },
      {
        type: "ID_CARD_COPY",
        isRestricted: 0,
        delivered: 1,
        deliveredDate: "2026-10-11",
        expiryDate: null,
        isCurrent: 1,
      },
      {
        type: "MEDICAL_CERT",
        isRestricted: 1,
        delivered: 1,
        deliveredDate: "2026-10-11",
        expiryDate: "2027-03-31",
        isCurrent: 1,
      },
      {
        type: "RESIDENCE_CERT",
        isRestricted: 0,
        delivered: 1,
        deliveredDate: "2026-10-11",
        expiryDate: null,
        isCurrent: 1,
      },
    ]);

    // «قرار الإدارة» dated by «حررت ... بتاريخ», with the trial's end from the setting (30 days).
    const decision = await test.db.selectFrom("HiringDecision").selectAll().executeTakeFirstOrThrow();
    expect(decision).toMatchObject({
      staffId: result.id,
      decision: "ACCEPTED_ON_TRIAL",
      decisionDate: "2026-10-12",
      decidedByUserId: test.manager.userId,
      trialEndDate: "2026-11-11",
    });

    // A candidate from the day she registered, on trial from the day of the decision; her pay terms from the first day.
    const events = await test.db
      .selectFrom("StaffEvent")
      .select(["kind", "date", "fromStatus", "toStatus", "payBasis", "payRate", "payPeriod", "weeklyCapacityMin"])
      .where("staffId", "=", result.id)
      .orderBy("kind")
      .orderBy("date")
      .execute();
    expect(events).toEqual([
      {
        kind: "PAY_TERMS",
        date: "2026-10-11",
        fromStatus: null,
        toStatus: null,
        payBasis: "MONTHLY",
        payRate: 3_200_000,
        payPeriod: "MONTHLY",
        weeklyCapacityMin: 2400,
      },
      {
        kind: "STATUS",
        date: "2026-10-11",
        fromStatus: null,
        toStatus: "CANDIDATE",
        payBasis: null,
        payRate: null,
        payPeriod: null,
        weeklyCapacityMin: null,
      },
      {
        kind: "STATUS",
        date: "2026-10-12",
        fromStatus: "CANDIDATE",
        toStatus: "ON_TRIAL",
        payBasis: null,
        payRate: null,
        payPeriod: null,
        weeklyCapacityMin: null,
      },
    ]);

    // The log says what was collected, about whom; never her health answers or her score.
    const [collected] = await logOf("StaffMember");
    expect(collected).toMatchObject({
      operation: "COLLECT",
      action: "CREATE",
      ownerCode: "PEOPLE",
      entityId: result.id,
      entityLabel: "1/F بوزيد سميرة",
      subjectKind: "WORKER",
      subjectId: result.id,
      localDate: "2026-10-12",
    });
    const [restricted] = await logOf("StaffConfidential");
    expect(restricted.operation).toBe("COLLECT");
    expect(JSON.parse(restricted.changes ?? "{}")).toEqual({ conditions: ["§", "§"], total: ["§", "§"] });
    const everything = JSON.stringify(await test.db.selectFrom("AuditLog").selectAll().execute());
    expect(everything).not.toContain("حساسية");
    expect(everything).not.toContain("OTHER");
  });

  it("numbers men and women in one sequence, with H or F after the number", async () => {
    const man = await register(MINIMAL);
    const woman = await register({ ...SAMPLE_WORKER_VALUES, phone: "0661 99 88 77" });
    expect([man.number, woman.number]).toEqual(["1/H", "2/F"]);
  });

  it("files a candidate when management has not decided, with no pay terms until a rate is known", async () => {
    const result = await register(MINIMAL);
    const worker = await test.db
      .selectFrom("StaffMember")
      .selectAll()
      .where("id", "=", result.id)
      .executeTakeFirstOrThrow();
    expect(worker).toMatchObject({
      engagementStatus: "CANDIDATE",
      zoneId: null,
      residenceCommuneId: null,
      workedInFieldBefore: null,
      abilities: "[]",
      availableDays: "[]",
      payBasis: null,
      payRate: null,
      nationalIdNumber: null,
    });
    expect(await count("HiringDecision")).toBe(0);
    expect(await count("StaffDocument")).toBe(0);
    const events = await test.db.selectFrom("StaffEvent").select(["kind", "toStatus"]).execute();
    expect(events).toEqual([{ kind: "STATUS", toStatus: "CANDIDATE" }]);
    // Her confidential row exists, empty; nothing restricted was collected, so nothing of it is logged.
    const confidential = await test.db.selectFrom("StaffConfidential").selectAll().executeTakeFirstOrThrow();
    expect(confidential).toMatchObject({ conditions: null, total: null, evaluatedByUserId: null });
    expect(await logOf("StaffConfidential")).toEqual([]);
  });

  it("keeps a total typed alone, and an office zone chosen over the commune's", async () => {
    const zone = await test.rows.insert("Zone", { name: "المنطقة الشمالية" });
    const result = await register({
      ...MINIMAL,
      hiringTotal: "64",
      zoneId: zone.id,
      residenceCommuneId: "commune-0402",
    });
    const worker = await test.db
      .selectFrom("StaffMember")
      .select("zoneId")
      .where("id", "=", result.id)
      .executeTakeFirstOrThrow();
    expect(worker.zoneId).toBe(zone.id);
    const confidential = await test.db.selectFrom("StaffConfidential").selectAll().executeTakeFirstOrThrow();
    expect(confidential).toMatchObject({ total: 64, scoreAppearance: null });
  });

  it("refuses whoever may not register a worker, and saves nothing", async () => {
    const accountant = await test.sessionFor("ACCOUNTANT"); // reads the workers' section only
    const operations = await test.sessionFor("OPERATIONS"); // writes the section, without staff.write
    for (const session of [accountant, operations]) {
      await expect(register(MINIMAL, session)).rejects.toThrow("You do not have permission to do this.");
    }
    expect(await count("StaffMember")).toBe(0);
  });

  it("leaves the health answers, the score and the decision to those who hold them", async () => {
    const hr = await test.sessionFor("HR_OFFICER");
    // The HR officer registers and evaluates; management decides.
    await expect(register(SAMPLE_WORKER_VALUES, hr)).rejects.toThrow(
      "You do not have permission to record the management's decision.",
    );
    const undecided = await register({ ...SAMPLE_WORKER_VALUES, hiringDecision: undefined }, hr);
    expect(undecided.number).toBe("1/F");

    const writerOnly: Session = { ...hr, capabilities: new Set(["staff.write"]) };
    await expect(register({ ...MINIMAL, healthConditions: ["ASTHMA"] }, writerOnly)).rejects.toThrow(
      "You do not have permission to record the health answers.",
    );
    await expect(register({ ...MINIMAL, hiringTotal: "50" }, writerOnly)).rejects.toThrow(
      "You do not have permission to record the confidential evaluation.",
    );
    expect(await count("StaffMember")).toBe(1);
  });

  it("refuses what the form refuses, in the form's words", async () => {
    await expect(register({ ...MINIMAL, lastName: " " })).rejects.toThrow("The surname is required.");
    await expect(register({ ...MINIMAL, healthConditions: ["NONE", "ASTHMA"] })).rejects.toThrow(
      "None cannot be ticked together with an illness.",
    );
    const answer = await test.run.action(registerWorker, { revalidate: REGISTRATION_REFRESHES })({
      ...MINIMAL,
      phone: "12",
    });
    expect(answer).toEqual({ success: false, error: "The phone number has 9 or 10 digits." });
    expect(test.revalidated).toEqual([]);
    // A save the database refuses after the number was taken gives the number back with its transaction.
    await expect(register({ ...MINIMAL, zoneId: "no-such-zone" })).rejects.toThrow();
    expect((await register(MINIMAL)).number).toBe("1/H");
  });

  it("refreshes the workers' list through the screens' wrapper", async () => {
    const answer = await test.run.action(registerWorker, { revalidate: REGISTRATION_REFRESHES })(MINIMAL);
    expect(answer).toMatchObject({ success: true, data: { number: "1/H" } });
    expect(test.revalidated).toEqual([WORKERS_PATH, "/places"]);
  });
});

describe("registerWorker and the suspended-or-penalised check", () => {
  let earlierSeq = 900;
  /** A worker of an earlier year, suspended since 1 October, as the sanction recorded her. */
  async function suspended(identity: Partial<Insertable<DB["Sanction"]>>) {
    earlierSeq += 1;
    const earlier = await test.rows.insert("StaffMember", {
      kind: "WORKER",
      numberSeq: earlierSeq,
      number: `${earlierSeq}/F`,
    });
    return test.rows.insert("Sanction", {
      subjectKind: "WORKER",
      staffId: earlier.id,
      state: "SUSPENDED",
      reason: "غياب متكرر دون مبرر",
      startDate: localDate("2026-10-01"),
      displayName: "بوزيد سميرة",
      displayNumber: "900/F",
      ...identity,
    });
  }

  it("stops a person found by her phone until the manager answers", async () => {
    await suspended({ phoneKeys: "|0661203142|" });
    await expect(register(SAMPLE_WORKER_VALUES)).rejects.toThrow(
      "This person is suspended or penalised. The manager must allow the registration first.",
    );
    // Nothing kept, not even the number.
    expect(await count("StaffMember")).toBe(1);
    expect((await register({ ...MINIMAL })).number).toBe("1/H");
  });

  it("stops a person found by her identity number", async () => {
    await suspended({ nationalIdNumber: "109940317000123" });
    await expect(register({ ...MINIMAL, nationalIdNumber: "1099 4031 7000 123" })).rejects.toThrow(
      "This person is suspended or penalised. The manager must allow the registration first.",
    );
  });

  it("asks the clerk about a name alone, and logs her answer that it is somebody else", async () => {
    const sanction = await suspended({ nameKey: normaliseName("بوزيد سميرة") });
    await expect(register(SAMPLE_WORKER_VALUES)).rejects.toThrow(
      "Someone with this name is suspended or penalised. Confirm that this is another person before saving.",
    );
    const result = await register({ ...SAMPLE_WORKER_VALUES, notTheSamePerson: true });
    const [entry] = await logOf("Sanction");
    expect(entry).toMatchObject({
      operation: "CONSULT",
      action: "SANCTION_CHECK",
      entityId: sanction.id,
      subjectKind: "WORKER",
      subjectId: sanction.staffId,
    });
    expect(JSON.parse(entry.context ?? "{}")).toMatchObject({
      foundBy: "NAME_ONLY",
      answer: "NOT_THE_SAME_PERSON",
      registered: result.id,
    });
  });

  it("does not stop a namesake born on another day (ruling 4)", async () => {
    await suspended({ nameKey: normaliseName("بوزيد سميرة"), birthDate: localDate("1988-01-01") });
    const result = await register(SAMPLE_WORKER_VALUES);
    expect(result.number).toBe("1/F");
    expect(await logOf("Sanction")).toEqual([]);
  });

  it("lets the manager's yes through once, and never his no", async () => {
    const sanction = await suspended({ phoneKeys: "|0661203142|" });
    // The identity the question named: a yes is about it only (PEO-06).
    const decision = (status: string) =>
      test.rows.insert("SanctionDecision", {
        context: "WORKER_REGISTRATION",
        attemptKind: "WORKER",
        attemptIdentity: JSON.stringify(workerIdentity(SAMPLE_WORKER_VALUES)),
        sanctionId: sanction.id,
        matchBasis: "PHONE",
        status,
      });

    const no = await decision("REFUSED");
    await expect(register({ ...SAMPLE_WORKER_VALUES, decisionId: no.id })).rejects.toThrow(
      "The manager did not allow this person to be registered.",
    );

    const yes = await decision("ALLOWED");
    const result = await register({ ...SAMPLE_WORKER_VALUES, decisionId: yes.id });
    const used = await test.db
      .selectFrom("SanctionDecision")
      .selectAll()
      .where("id", "=", yes.id)
      .executeTakeFirstOrThrow();
    expect(used).toMatchObject({
      consumedEntityKind: "STAFF_MEMBER",
      consumedEntityId: result.id,
      consumedAt: test.ctx().now,
    });
    const [collected] = await logOf("StaffMember");
    expect(JSON.parse(collected.context ?? "{}")).toMatchObject({ sanctionDecisionId: yes.id });

    // The same yes does not let a second registration through.
    await expect(register({ ...SAMPLE_WORKER_VALUES, decisionId: yes.id })).rejects.toThrow(
      "This person is suspended or penalised. The manager must allow the registration first.",
    );
  });

  it("ignores a lifted sanction and one that has ended", async () => {
    await suspended({ phoneKeys: "|0661203142|", endDate: localDate("2026-10-11") });
    const lifted = await suspended({ phoneKeys: "|0661203142|" });
    await test.db
      .updateTable("Sanction")
      .set({ liftedAt: test.ctx().now, liftedByUserId: test.manager.userId, liftReason: "رفع" })
      .where("id", "=", lifted.id)
      .execute();
    expect((await register(SAMPLE_WORKER_VALUES)).number).toBe("1/F");
  });
});
