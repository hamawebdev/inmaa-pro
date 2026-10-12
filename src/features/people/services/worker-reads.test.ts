import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SAMPLE_WORKER_FORM } from "@/features/people/forms/worker-form-data";
import { emptyWorkerValues, SAMPLE_WORKER_VALUES } from "@/features/people/forms/worker-values";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { listWorkers, openWorkerFile, readWorkerRestricted, workerFormForPrint } from "./worker-reads";
import { setSanction } from "./sanctions";
import { registerWorker, updateWorker, type RegisterWorkerInput } from "./workers";

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
  residenceCommuneId: "commune-0402",
  role: "TEAM_LEADER",
};

const register = (input: RegisterWorkerInput) => test.transact((ex, ctx) => registerWorker(ex, ctx, input));
const logOf = (action: string) =>
  test.db.selectFrom("AuditLog").selectAll().where("action", "=", action).orderBy("chainSeq").execute();

describe("listWorkers", () => {
  it("lists the workers newest first, with zone, commune, state, and the documents to renew", async () => {
    const samira = await register(SAMPLE_WORKER_VALUES);
    const kamel = await register(MINIMAL);
    await test.transact((ex, ctx) =>
      setSanction(ex, ctx, {
        subjectKind: "WORKER",
        subjectId: kamel.id,
        state: "PENALISED",
        reason: "تأخر",
        startDate: "2026-10-12",
      }),
    );
    // Her medical certificate expires within the month: one to renew.
    await test.transact((ex, ctx) =>
      updateWorker(ex, ctx, {
        id: samira.id,
        values: {
          ...SAMPLE_WORKER_VALUES,
          documents: SAMPLE_WORKER_VALUES.documents.map((line) =>
            line.type === "MEDICAL_CERT" ? { ...line, expiryDate: "2026-10-30" } : line,
          ),
        },
      }),
    );

    const rows = await test.transact((ex, ctx) => listWorkers(ex, ctx));
    expect(rows.map((row) => row.number)).toEqual(["2/H", "1/F"]);
    expect(rows[0]).toMatchObject({
      lastName: "سعدي",
      role: "TEAM_LEADER",
      status: "CANDIDATE",
      zoneName: "عين البيضاء",
      communeName: "عين البيضاء",
      sanction: { state: "PENALISED", since: "2026-10-12" },
      documentsToRenew: 0,
    });
    expect(rows[1]).toMatchObject({ status: "ON_TRIAL", zoneName: "أم البواقي", sanction: null, documentsToRenew: 1 });
    // A list is not a consultation of anyone's file.
    expect(await logOf("VIEW")).toEqual([]);
  });

  it("is for those who see the workers' section", async () => {
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(test.transact((ex, ctx) => listWorkers(ex, ctx), reception)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});

describe("openWorkerFile", () => {
  it("gives the screen back what was typed, without her restricted answers, and logs that her file was opened", async () => {
    const { id } = await register(SAMPLE_WORKER_VALUES);
    const file = await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
    expect(file.values).toEqual({
      ...SAMPLE_WORKER_VALUES,
      phone: "0661203142",
      emergencyPhone: "0550123456",
      healthConditions: [],
      healthOtherText: "",
      hiringScores: emptyWorkerValues("2026-10-12").hiringScores,
      hiringTotal: "",
      // The zone her commune gave her at registration is hers now, shown as chosen.
      zoneId: file.zone?.id,
    });
    expect(file).toMatchObject({
      number: "1/F",
      status: "ON_TRIAL",
      zone: { name: "أم البواقي" },
      commune: { id: "commune-0401", wilayaCode: "04" },
      photoUrl: null,
      signedScan: null,
      sanction: null,
      sanctions: [],
    });
    expect(file.decisions).toEqual([
      { decision: "ACCEPTED_ON_TRIAL", decisionDate: "2026-10-12", trialEndDate: "2026-11-11", decidedBy: "المدير" },
    ]);
    expect(file.history.map((event) => event.toStatus)).toEqual(["ON_TRIAL", "CANDIDATE"]);
    expect(file.documents.find((document) => document.type === "MEDICAL_CERT")).toMatchObject({
      delivered: true,
      expiryDate: "2027-03-31",
      state: "VALID",
      isRestricted: true,
    });
    expect(file.documents.find((document) => document.type === "EXPERIENCE_CERT")).toMatchObject({
      delivered: false,
      state: "MISSING",
    });
    const [opened] = await logOf("VIEW");
    expect(opened).toMatchObject({ operation: "CONSULT", entityId: id, subjectKind: "WORKER" });
  });

  it("refuses a worker that does not exist", async () => {
    await expect(test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id: "nobody" }))).rejects.toThrow(
      "This worker does not exist.",
    );
  });
});

describe("readWorkerRestricted", () => {
  it("shows her health answers and her score to those allowed, each read logged", async () => {
    const { id } = await register(SAMPLE_WORKER_VALUES);
    const health = await test.transact((ex, ctx) => readWorkerRestricted(ex, ctx, { id, part: "HEALTH" }));
    expect(health).toEqual({ health: { healthConditions: ["OTHER"], healthOtherText: "حساسية من الغبار" } });
    const score = await test.transact((ex, ctx) => readWorkerRestricted(ex, ctx, { id, part: "SCORE" }));
    expect(score.score?.hiringScores).toEqual(SAMPLE_WORKER_VALUES.hiringScores);
    expect(score.score?.hiringTotal).toBe("");
    expect((await logOf("VIEW_RESTRICTED")).length).toBe(2);

    const operations = await test.sessionFor("OPERATIONS");
    await expect(
      test.transact((ex, ctx) => readWorkerRestricted(ex, ctx, { id, part: "HEALTH" }), operations),
    ).rejects.toThrow("You do not have permission to do this.");
  });

  it("gives back a total typed alone", async () => {
    const { id } = await register({ ...MINIMAL, hiringTotal: "64" });
    const score = await test.transact((ex, ctx) => readWorkerRestricted(ex, ctx, { id, part: "SCORE" }));
    expect(score.score?.hiringTotal).toBe("64");
  });
});

describe("workerFormForPrint", () => {
  it("fills his form from the stored worker, as the printed sample, and logs the disclosure with its reason", async () => {
    const { id } = await register(SAMPLE_WORKER_VALUES);
    const printed = await test.transact((ex, ctx) => workerFormForPrint(ex, ctx, { id, reason: "ملف التوظيف" }));
    expect(printed.number).toBe("1/F");
    expect(printed.data).toEqual({
      ...SAMPLE_WORKER_FORM,
      regNumber: "1",
      documentsDelivered: [...SAMPLE_WORKER_FORM.documentsDelivered],
    });
    const [disclosed] = await logOf("PRINT");
    expect(disclosed).toMatchObject({
      operation: "DISCLOSE",
      disclosure: "PRINT",
      reason: "ملف التوظيف",
      entityId: id,
    });
    // Printing reads her restricted answers: both reads are in the log, with the same reason.
    const reads = await logOf("VIEW_RESTRICTED");
    expect(reads.map((entry) => entry.reason)).toEqual(["ملف التوظيف", "ملف التوظيف"]);
  });

  it("needs a reason, and the right to print a filled form", async () => {
    const { id } = await register(SAMPLE_WORKER_VALUES);
    await expect(test.transact((ex, ctx) => workerFormForPrint(ex, ctx, { id, reason: " " }))).rejects.toThrow(
      "Write why the filled form is printed.",
    );
    const operations = await test.sessionFor("OPERATIONS");
    await expect(
      test.transact((ex, ctx) => workerFormForPrint(ex, ctx, { id, reason: "x" }), operations),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});
