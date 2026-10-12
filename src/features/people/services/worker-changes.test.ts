import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues, SAMPLE_WORKER_VALUES } from "@/features/people/forms/worker-values";
import type { WorkerFormValues } from "@/features/people/validators/worker";
import { registerHandler } from "@/lib/events";
import type { Session } from "@/lib/service/context";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { decideOnTheSpot } from "./sanction-decisions";
import { setSanction } from "./sanctions";
import {
  readmitWorker,
  recordWorkerLeaving,
  registerWorker,
  updateWorker,
  workerIdentity,
  type RegisterWorkerInput,
  type UpdateWorkerInput,
} from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const MINIMAL: RegisterWorkerInput = {
  ...emptyWorkerValues("2026-10-12"),
  sex: "MALE",
  lastName: "سعدي",
  firstName: "كمال",
  birthDate: "1990-05-02",
  phone: "0770 11 22 33",
};

const register = (input: RegisterWorkerInput, session?: Session) =>
  test.transact((ex, ctx) => registerWorker(ex, ctx, input), session);
const update = (input: UpdateWorkerInput, session?: Session) =>
  test.transact((ex, ctx) => updateWorker(ex, ctx, input), session);
const worker = (id: string) =>
  test.db.selectFrom("StaffMember").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
const lastChange = (entity: string) =>
  test.db
    .selectFrom("AuditLog")
    .selectAll()
    .where("entity", "=", entity)
    .where("operation", "=", "CHANGE")
    .orderBy("chainSeq", "desc")
    .executeTakeFirst();

const unavailable: unknown[] = [];
registerHandler("money", "staff.unavailable", async (_ex, _ctx, payload) => {
  unavailable.push(payload);
});
beforeEach(() => {
  unavailable.length = 0;
});

describe("updateWorker", () => {
  it("writes only what changed, logs it, and gives the number the letter of a corrected sex", async () => {
    const { id } = await register(MINIMAL);
    const result = await update({ id, values: { ...MINIMAL, lastName: "سعدية", firstName: "كاملة", sex: "FEMALE" } });
    expect(result).toEqual({ id, number: "1/F" });
    expect(await worker(id)).toMatchObject({ lastName: "سعدية", sex: "FEMALE", numberSuffix: "F", number: "1/F" });

    const entry = await lastChange("StaffMember");
    expect(entry).toMatchObject({ action: "UPDATE", entityId: id, subjectKind: "WORKER" });
    expect(JSON.parse(entry?.changes ?? "{}")).toEqual({
      lastName: ["سعدي", "سعدية"],
      firstName: ["كمال", "كاملة"],
      sex: ["MALE", "FEMALE"],
      numberSuffix: ["H", "F"],
      number: ["1/H", "1/F"],
    });

    // Saving the same values again changes nothing and logs nothing.
    const entries = Number((await test.db.selectFrom("AuditLog").select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow()).n);
    await update({ id, values: { ...MINIMAL, lastName: "سعدية", firstName: "كاملة", sex: "FEMALE" } });
    expect(
      Number((await test.db.selectFrom("AuditLog").select((eb) => eb.fn.countAll().as("n")).executeTakeFirstOrThrow()).n),
    ).toBe(entries);
  });

  it("ticks, dates and unticks his documents on their current copies", async () => {
    const { id } = await register(SAMPLE_WORKER_VALUES);
    const documents: WorkerFormValues["documents"] = SAMPLE_WORKER_VALUES.documents.map((line) =>
      line.type === "MEDICAL_CERT"
        ? { ...line, expiryDate: "2026-10-01" }
        : line.type === "BIRTH_CERT"
          ? { ...line, delivered: false, expiryDate: "" }
          : line.type === "EXPERIENCE_CERT"
            ? { ...line, delivered: true }
            : line,
    );
    await update({ id, values: { ...SAMPLE_WORKER_VALUES, documents } });
    const rows = await test.db
      .selectFrom("StaffDocument")
      .select(["type", "delivered", "expiryDate"])
      .where("staffId", "=", id)
      .where("isCurrent", "=", 1)
      .orderBy("type")
      .execute();
    expect(rows).toEqual([
      { type: "BIRTH_CERT", delivered: 0, expiryDate: null },
      { type: "CROSSED_CCP_CHEQUE", delivered: 1, expiryDate: null },
      { type: "EXPERIENCE_CERT", delivered: 1, expiryDate: null },
      { type: "ID_CARD_COPY", delivered: 1, expiryDate: null },
      { type: "MEDICAL_CERT", delivered: 1, expiryDate: "2026-10-01" },
      { type: "RESIDENCE_CERT", delivered: 1, expiryDate: null },
    ]);
    const changes = JSON.parse((await lastChange("StaffMember"))?.changes ?? "{}");
    expect(changes).toEqual({
      "document.BIRTH_CERT.delivered": [1, 0],
      "document.MEDICAL_CERT.expiryDate": ["2027-03-31", "2026-10-01"],
      "document.EXPERIENCE_CERT": [null, true],
    });
  });

  it("records a later decision as a new one, and her status follows from that day", async () => {
    const { id } = await register(MINIMAL);
    test.clock.advance({ days: 5 });
    await update({ id, values: { ...MINIMAL, hiringDecision: "ACCEPTED" } });
    expect((await worker(id)).engagementStatus).toBe("ACCEPTED");
    const decisions = await test.db.selectFrom("HiringDecision").select(["decision", "decisionDate"]).execute();
    expect(decisions).toEqual([{ decision: "ACCEPTED", decisionDate: "2026-10-17" }]);
    const statuses = await test.db
      .selectFrom("StaffEvent")
      .select(["date", "fromStatus", "toStatus"])
      .where("kind", "=", "STATUS")
      .orderBy("date")
      .execute();
    expect(statuses).toEqual([
      { date: "2026-10-12", fromStatus: null, toStatus: "CANDIDATE" },
      { date: "2026-10-17", fromStatus: "CANDIDATE", toStatus: "ACCEPTED" },
    ]);
    // The HR officer keeps the file; the decision is management's.
    const hr = await test.sessionFor("HR_OFFICER");
    await expect(update({ id, values: { ...MINIMAL, hiringDecision: "REFUSED_FINAL" } }, hr)).rejects.toThrow(
      "You do not have permission to record the management's decision.",
    );
    await update({ id, values: { ...MINIMAL, address: "حي النصر", hiringDecision: "ACCEPTED" } }, hr);
    expect((await worker(id)).address).toBe("حي النصر");
  });

  it("dates new pay terms from the day they change", async () => {
    const { id } = await register(SAMPLE_WORKER_VALUES);
    test.clock.advance({ days: 10 });
    await update({ id, values: { ...SAMPLE_WORKER_VALUES, payRate: "35000" } });
    const terms = await test.db
      .selectFrom("StaffEvent")
      .select(["date", "payRate"])
      .where("kind", "=", "PAY_TERMS")
      .orderBy("date")
      .execute();
    expect(terms).toEqual([
      { date: "2026-10-11", payRate: 3_200_000 },
      { date: "2026-10-22", payRate: 3_500_000 },
    ]);
  });

  it("touches her health answers and score only when they were opened, and logs neither value", async () => {
    const { id } = await register(SAMPLE_WORKER_VALUES);
    const closed = { ...SAMPLE_WORKER_VALUES, healthConditions: [], healthOtherText: "", hiringScores: emptyWorkerValues("2026-10-12").hiringScores, hiringTotal: "" };
    await update({ id, values: closed });
    const kept = await test.db.selectFrom("StaffConfidential").selectAll().where("staffId", "=", id).executeTakeFirstOrThrow();
    expect(kept).toMatchObject({ conditions: '["OTHER"]', otherText: "حساسية من الغبار", total: 78 });

    await update({ id, values: { ...closed, healthConditions: ["ASTHMA"] }, opened: { health: true } });
    const changed = await test.db.selectFrom("StaffConfidential").selectAll().where("staffId", "=", id).executeTakeFirstOrThrow();
    expect(changed).toMatchObject({ conditions: '["ASTHMA"]', otherText: null, total: 78 });
    const entry = await lastChange("StaffConfidential");
    expect(JSON.parse(entry?.changes ?? "{}")).toEqual({ conditions: ["§", "§"], otherText: ["§", "§"] });
    const everything = JSON.stringify(await test.db.selectFrom("AuditLog").selectAll().execute());
    expect(everything).not.toContain("ASTHMA");
    // The save read the old answers to compare: that read is in the log too.
    const reads = await test.db.selectFrom("AuditLog").select("action").where("action", "=", "VIEW_RESTRICTED").execute();
    expect(reads.length).toBe(1);

    const operations = await test.sessionFor("OPERATIONS");
    await expect(update({ id, values: closed, opened: { score: true } }, operations)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });

  it("stops an identity edited into someone under sanction, but not her own file", async () => {
    const samira = await register({ ...SAMPLE_WORKER_VALUES, nationalIdNumber: "109940317000123" });
    await test.transact((ex, ctx) =>
      setSanction(ex, ctx, { subjectKind: "WORKER", subjectId: samira.id, state: "SUSPENDED", reason: "غياب", startDate: "2026-10-01" }),
    );
    const other = await register(MINIMAL);
    await expect(update({ id: other.id, values: { ...MINIMAL, phone: "0661203142" } })).rejects.toThrow(
      "This person is suspended or penalised. The manager must allow the registration first.",
    );
    // Her own phone changes without asking anyone.
    await update({ id: samira.id, values: { ...SAMPLE_WORKER_VALUES, nationalIdNumber: "109940317000123", phone: "0661 00 00 01" } });
    expect((await worker(samira.id)).phone).toBe("0661000001");
    // And one identity number stays one person.
    await expect(update({ id: other.id, values: { ...MINIMAL, nationalIdNumber: "109940317000123" } })).rejects.toThrow(
      "A worker with this identity number is already registered. Open that worker's file.",
    );
  });

  it("refuses a worker that does not exist", async () => {
    await expect(update({ id: "nobody", values: MINIMAL })).rejects.toThrow("This worker does not exist.");
  });
});

describe("leaving and coming back", () => {
  it("records her leaving with its day and reason, and tells Operations from that day", async () => {
    const { id } = await register({ ...MINIMAL, hiringDecision: "ACCEPTED" });
    await test.transact((ex, ctx) => recordWorkerLeaving(ex, ctx, { id, leftDate: "2026-10-20", reason: "انتقل إلى ولاية أخرى" }));
    expect(await worker(id)).toMatchObject({ engagementStatus: "LEFT", leftDate: "2026-10-20", leftReason: "انتقل إلى ولاية أخرى" });
    expect(unavailable).toEqual([{ workerId: id, fromDate: "2026-10-20", toDate: null, cause: "LEFT" }]);
    await expect(
      test.transact((ex, ctx) => recordWorkerLeaving(ex, ctx, { id, leftDate: "2026-10-21", reason: "x" })),
    ).rejects.toThrow("This worker has already left.");

    await test.transact((ex, ctx) => readmitWorker(ex, ctx, { id }));
    expect(await worker(id)).toMatchObject({ engagementStatus: "CANDIDATE", leftDate: null, leftReason: null });
    const statuses = await test.db.selectFrom("StaffEvent").select(["date", "toStatus"]).where("kind", "=", "STATUS").orderBy("createdAt").execute();
    expect(statuses.map((s) => s.toStatus)).toEqual(["ACCEPTED", "LEFT", "CANDIDATE"]);
  });

  it("asks the manager before readmitting a worker under sanction, and spends his yes (BUILD-NOTES 6.1)", async () => {
    const samira = await register({ ...SAMPLE_WORKER_VALUES, nationalIdNumber: "109940317000123" });
    await test.transact((ex, ctx) =>
      setSanction(ex, ctx, { subjectKind: "WORKER", subjectId: samira.id, state: "SUSPENDED", reason: "غياب", startDate: "2026-10-01" }),
    );
    await test.transact((ex, ctx) => recordWorkerLeaving(ex, ctx, { id: samira.id, leftDate: "2026-10-12", reason: "توقفت" }));

    // Registering her again under her identity number is refused: she comes back on her own file.
    await expect(register({ ...SAMPLE_WORKER_VALUES, nationalIdNumber: "109940317000123" })).rejects.toThrow(
      "A worker with this identity number is already registered. Open that worker's file.",
    );
    const hr = await test.sessionFor("HR_OFFICER");
    await expect(test.transact((ex, ctx) => readmitWorker(ex, ctx, { id: samira.id }), hr)).rejects.toThrow(
      "This person is suspended or penalised. The manager must allow the registration first.",
    );
    const [sanction] = await test.db.selectFrom("Sanction").select("id").execute();
    const { decisionId } = await test.transact((ex, ctx) =>
      decideOnTheSpot(ex, ctx, {
        context: "READMISSION",
        subjectKind: "WORKER",
        subjectId: samira.id,
        identity: workerIdentity({ ...SAMPLE_WORKER_VALUES, nationalIdNumber: "109940317000123" }),
        sanctionId: sanction.id,
        allow: true,
        reason: "انتهت المدة عمليا",
      }),
    );
    const decision = await test.db.selectFrom("SanctionDecision").selectAll().where("id", "=", decisionId).executeTakeFirstOrThrow();
    expect(decision).toMatchObject({ matchBasis: "SAME_RECORD", attemptStaffId: samira.id });

    await test.transact((ex, ctx) => readmitWorker(ex, ctx, { id: samira.id, decisionId }), hr);
    expect((await worker(samira.id)).engagementStatus).toBe("CANDIDATE");
    const spent = await test.db.selectFrom("SanctionDecision").selectAll().where("id", "=", decisionId).executeTakeFirstOrThrow();
    expect(spent).toMatchObject({ consumedEntityKind: "STAFF_MEMBER", consumedEntityId: samira.id });
  });

  it("readmits only a worker who left or was refused", async () => {
    const { id } = await register(MINIMAL);
    await expect(test.transact((ex, ctx) => readmitWorker(ex, ctx, { id }))).rejects.toThrow(
      "Only a worker who left or was refused can be readmitted.",
    );
  });
});
