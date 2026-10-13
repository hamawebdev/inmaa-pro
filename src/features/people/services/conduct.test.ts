import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { seedTrainingModules } from "@/features/people/seeds";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { renewStaffDocument } from "./documents";
import { evaluationTotal, listEvaluations, listEvaluationsDue, recordEvaluation } from "./evaluations";
import { decideHiring, listCandidates, recordInterviewOutcome, scheduleInterview } from "./hiring";
import { debtBalanceOf } from "./payouts";
import { getSanctionStates } from "./sanctions";
import {
  addSkill,
  cancelTrainingSession,
  listTrainingSessions,
  planTrainingSession,
  setTrainingAttendance,
  setWorkerSkills,
} from "./training";
import {
  cancelViolation,
  createViolationFromSource,
  decideViolation,
  listViolations,
  recordViolation,
} from "./violations";
import { registerWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
  await test.transact((ex, ctx) => seedTrainingModules(ex, ctx));
});
afterEach(() => test.close());

async function aCandidate(over: Record<string, unknown> = {}) {
  return (
    await test.transact((ex, ctx) =>
      registerWorker(ex, ctx, {
        ...emptyWorkerValues("2026-08-01"),
        sex: "FEMALE",
        lastName: "قاسمي",
        firstName: "نوال",
        birthDate: "1996-01-12",
        phone: "0555 31 42 53",
        ...over,
      }),
    )
  ).id;
}

const DAYS = ["DAY_1", "DAY_2", "DAY_3", "DAY_4", "DAY_5", "DAY_6", "DAY_7", "CONDUCT"];

describe("hiring", () => {
  it("takes a candidate from the interview to a trial, and her status follows", async () => {
    const id = await aCandidate();
    const { id: interviewId } = await test.transact((ex, ctx) =>
      scheduleInterview(ex, ctx, { staffId: id, date: "2026-10-14", time: "10:00" }),
    );
    let [row] = await test.transact((ex, ctx) => listCandidates(ex, ctx));
    expect(row).toMatchObject({ id, name: "قاسمي نوال", status: "CANDIDATE", interview: { status: "SCHEDULED" } });
    await expect(
      test.transact((ex, ctx) => recordInterviewOutcome(ex, ctx, { interviewId, status: "CANCELLED" })),
    ).rejects.toThrow("Write why the interview is cancelled.");
    await test.transact((ex, ctx) => recordInterviewOutcome(ex, ctx, { interviewId, status: "DONE" }));

    // Only the administration decides; HR keeps the files.
    const hr = await test.sessionFor("HR_OFFICER");
    await expect(
      test.transact((ex, ctx) => decideHiring(ex, ctx, { staffId: id, decision: "ACCEPTED_ON_TRIAL" }), hr),
    ).rejects.toThrow("You do not have permission to do this.");
    await test.transact((ex, ctx) => decideHiring(ex, ctx, { staffId: id, decision: "ACCEPTED_ON_TRIAL" }));
    [row] = await test.transact((ex, ctx) => listCandidates(ex, ctx));
    // 30 days of trial from today, 12 October.
    expect(row).toMatchObject({
      status: "ON_TRIAL",
      decision: { decision: "ACCEPTED_ON_TRIAL", trialEndDate: "2026-11-11" },
    });
    await test.transact((ex, ctx) => decideHiring(ex, ctx, { staffId: id, decision: "ACCEPTED" }));
    expect(await test.transact((ex, ctx) => listCandidates(ex, ctx))).toEqual([]);
    const events = await test.db.selectFrom("StaffEvent").select("toStatus").where("staffId", "=", id).execute();
    expect(events.map((event) => event.toStatus)).toEqual(["CANDIDATE", "ON_TRIAL", "ACCEPTED"]);
  });
});

describe("training", () => {
  it("completes her training on the day of the last required day attended", async () => {
    const id = await aCandidate();
    const sessions: string[] = [];
    for (const [index, code] of DAYS.entries()) {
      const date = `2026-10-0${index + 1}`;
      sessions.push(
        (await test.transact((ex, ctx) => planTrainingSession(ex, ctx, { date, moduleCode: code, staffIds: [id] }))).id,
      );
    }
    // She missed the sixth day: not complete.
    await test.transact((ex, ctx) =>
      setTrainingAttendance(ex, ctx, { sessionId: sessions[5], staffId: id, status: "ABSENT" }),
    );
    let worker = await test.db
      .selectFrom("StaffMember")
      .select("trainingCompletedDate")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(worker.trainingCompletedDate).toBeNull();
    let [row] = await test.transact((ex, ctx) => listCandidates(ex, ctx));
    expect(row.training).toMatchObject({ done: 7, required: 8 });
    // She makes it up on the 10th.
    await test.transact((ex, ctx) =>
      planTrainingSession(ex, ctx, { date: "2026-10-10", moduleCode: "DAY_6", staffIds: [id] }),
    );
    worker = await test.db
      .selectFrom("StaffMember")
      .select("trainingCompletedDate")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(worker.trainingCompletedDate).toBe("2026-10-10");
    [row] = await test.transact((ex, ctx) => listCandidates(ex, ctx));
    expect(row.training).toMatchObject({ done: 8, completedDate: "2026-10-10" });

    await test.transact((ex, ctx) =>
      cancelTrainingSession(ex, ctx, { sessionId: sessions[0], reason: "خطأ في التاريخ" }),
    );
    expect(await test.transact((ex, ctx) => listTrainingSessions(ex, ctx))).toHaveLength(8);
  });

  it("keeps one list of skills and gives a worker hers", async () => {
    const id = await aCandidate();
    const steam = await test.transact((ex, ctx) => addSkill(ex, ctx, { labelAr: "آلة التنظيف بالبخار" }));
    const again = await test.transact((ex, ctx) => addSkill(ex, ctx, { labelAr: "آلة  التنظيف بالبخار" }));
    expect(again.code).toBe(steam.code);
    await test.transact((ex, ctx) => setWorkerSkills(ex, ctx, { workerId: id, skillCodes: [steam.code, "UNKNOWN"] }));
    const worker = await test.db
      .selectFrom("StaffMember")
      .select("skillCodes")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(JSON.parse(worker.skillCodes ?? "[]")).toEqual([steam.code]);
  });
});

describe("violations", () => {
  it("records, decides with a deduction or a suspension, and cancels", async () => {
    const id = await aCandidate({ hiringDecision: "ACCEPTED", issuedDate: "2026-08-01" });
    const written = await test.transact((ex, ctx) =>
      recordViolation(ex, ctx, {
        workerId: id,
        date: "2026-10-10",
        severity: "SERIOUS",
        article: "ART_14",
        article14Item: "LEFT_WITHOUT_LEAVE",
        description: "غادرت مكان العمل قبل نهاية المهمة دون إذن",
      }),
    );
    expect(written.number).toMatch(/\d/);
    const visit = await test.rows.insert("Visit", { status: "DONE" });
    const handed = await test.transact((ex, ctx) =>
      createViolationFromSource(ex, ctx, {
        workerId: id,
        date: "2026-10-11",
        sourceKind: "VISIT",
        sourceId: visit.id,
        description: "شكوى العميل من كسر مزهرية",
      }),
    );
    expect(
      (await test.transact((ex, ctx) => listViolations(ex, ctx, { status: "OPEN" }))).map((row) => row.id).sort(),
    ).toEqual([written.id, handed.id].sort());

    await expect(
      test.transact((ex, ctx) => decideViolation(ex, ctx, { violationId: handed.id, action: "DEDUCTION" })),
    ).rejects.toThrow("Enter an amount above zero.");
    await test.transact((ex, ctx) =>
      decideViolation(ex, ctx, { violationId: handed.id, action: "DEDUCTION", amount: 150_000 }),
    );
    expect(await debtBalanceOf(test.db, id)).toBe(150_000);

    // A suspension is a sanction: the manager's, not HR's.
    const hr = await test.sessionFor("HR_OFFICER");
    await expect(
      test.transact((ex, ctx) => decideViolation(ex, ctx, { violationId: written.id, action: "SUSPENSION" }), hr),
    ).rejects.toThrow("You do not have permission to do this.");
    await test.transact((ex, ctx) =>
      decideViolation(ex, ctx, { violationId: written.id, action: "SUSPENSION", endDate: "2026-10-20" }),
    );
    const states = await test.transact((ex, ctx) => getSanctionStates(ex, ctx, { kind: "WORKER", ids: [id] }));
    expect(states[id]).toMatchObject({ state: "SUSPENDED" });
    await expect(
      test.transact((ex, ctx) => cancelViolation(ex, ctx, { violationId: written.id, reason: "خطأ" })),
    ).rejects.toThrow("This violation has already been decided.");

    const third = await test.transact((ex, ctx) =>
      recordViolation(ex, ctx, { workerId: id, date: "2026-10-12", severity: "MINOR", description: "تأخر" }),
    );
    await test.transact((ex, ctx) => cancelViolation(ex, ctx, { violationId: third.id, reason: "كان التأخر بإذن" }));
    expect(
      (await test.transact((ex, ctx) => listViolations(ex, ctx, { staffId: id }))).map((row) => row.status),
    ).toEqual(["CANCELLED", "DECIDED", "DECIDED"]);
    expect(() => test.raw.prepare(`DELETE FROM "Violation" WHERE "id" = ?`).run(third.id)).toThrow(/NO_DELETE/);
  });
});

describe("periodic evaluation", () => {
  it("scores seven criteria on the scale in Settings, keeps the period's figures, and says who is due", async () => {
    const id = await aCandidate({
      hiringDecision: "ACCEPTED",
      issuedDate: "2026-06-01",
      registrationDate: "2026-06-01",
    });
    expect((await test.transact((ex, ctx) => listEvaluationsDue(ex, ctx))).map((row) => row.staffId)).toEqual([id]);
    const scores = {
      scoreDiscipline: 5,
      scoreAttendance: 4,
      scoreCleaningQuality: 4,
      scoreClientRespect: 5,
      scoreEquipmentCare: 3,
      scoreSafety: 4,
      scoreProgramme: 5,
    };
    expect(evaluationTotal(scores, 5)).toBe(86);
    await expect(
      test.transact((ex, ctx) =>
        recordEvaluation(ex, ctx, {
          staffId: id,
          periodStart: "2026-07-01",
          periodEnd: "2026-09-30",
          scores: { ...scores, scoreSafety: 6 },
        }),
      ),
    ).rejects.toThrow("Give each criterion a mark from 1 to 5.");
    const { total } = await test.transact((ex, ctx) =>
      recordEvaluation(ex, ctx, {
        staffId: id,
        periodStart: "2026-07-01",
        periodEnd: "2026-09-30",
        scores,
        recommendation: "TRAIN_WORKER",
        comment: "تحتاج إلى تدريب على استعمال الآلات",
      }),
    );
    expect(total).toBe(86);
    const [row] = await test.transact((ex, ctx) => listEvaluations(ex, ctx, { staffId: id }));
    expect(row).toMatchObject({ total: 86, scaleMax: 5, recommendation: "TRAIN_WORKER", figures: { daysWorked: 0 } });
    expect(await test.transact((ex, ctx) => listEvaluationsDue(ex, ctx))).toEqual([]);
  });
});

describe("documents", () => {
  it("replaces a certificate that expires; the old one stays, no longer current", async () => {
    const id = await aCandidate();
    await test.transact((ex, ctx) =>
      renewStaffDocument(ex, ctx, {
        staffId: id,
        type: "MEDICAL_CERT",
        deliveredDate: "2026-01-10",
        expiryDate: "2026-10-20",
      }),
    );
    await expect(
      test.transact((ex, ctx) =>
        renewStaffDocument(ex, ctx, {
          staffId: id,
          type: "MEDICAL_CERT",
          deliveredDate: "2026-10-12",
          expiryDate: "2026-10-01",
        }),
      ),
    ).rejects.toThrow("The expiry date must be after the day it was handed in.");
    await test.transact((ex, ctx) =>
      renewStaffDocument(ex, ctx, {
        staffId: id,
        type: "MEDICAL_CERT",
        deliveredDate: "2026-10-12",
        expiryDate: "2027-10-12",
      }),
    );
    const rows = await test.db
      .selectFrom("StaffDocument")
      .select(["isCurrent", "expiryDate", "isRestricted"])
      .where("staffId", "=", id)
      .where("type", "=", "MEDICAL_CERT")
      .orderBy("createdAt")
      .execute();
    expect(rows.filter((row) => row.isCurrent === 1)).toEqual([
      { isCurrent: 1, expiryDate: "2027-10-12", isRestricted: 1 },
    ]);
  });
});
