import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues, SAMPLE_WORKER_VALUES } from "@/features/people/forms/worker-values";
import type { Session } from "@/lib/service/context";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  answerDecision,
  cancelDecision,
  decideOnTheSpot,
  getDecision,
  listDecisions,
  requestDecision,
  withoutRestricted,
  type DecisionRequestInput,
} from "./sanction-decisions";
import { setSanction } from "./sanctions";
import { registerWorker, workerIdentity, type RegisterWorkerInput } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** Samira, registered last year and suspended since 1 October: the person the scenarios meet again. */
async function suspendedSamira() {
  const { id } = await test.transact((ex, ctx) =>
    registerWorker(ex, ctx, { ...SAMPLE_WORKER_VALUES, nationalIdNumber: "109940317000123" }),
  );
  const { sanctionId } = await test.transact((ex, ctx) =>
    setSanction(ex, ctx, {
      subjectKind: "WORKER",
      subjectId: id,
      state: "SUSPENDED",
      reason: "غياب متكرر",
      startDate: "2026-10-01",
    }),
  );
  return { workerId: id, sanctionId };
}

/** Somebody else, registered with Samira's phone: her sister, the manager will say. */
const SAME_PHONE: RegisterWorkerInput = {
  ...SAMPLE_WORKER_VALUES,
  lastName: "بن سعيد",
  firstName: "سامية",
  fullNameLatin: "",
  birthDate: "1997-06-02",
  nationalIdNumber: "",
};

const question = (sanctionId: string, over: Partial<DecisionRequestInput> = {}): DecisionRequestInput => ({
  context: "WORKER_REGISTRATION",
  subjectKind: "WORKER",
  identity: workerIdentity(SAME_PHONE),
  sanctionId,
  draftPayload: SAME_PHONE,
  resumeRoute: "/dashboard/workers/new",
  ...over,
});

const ask = (input: DecisionRequestInput, session?: Session) =>
  test.transact((ex, ctx) => requestDecision(ex, ctx, input), session);
const register = (input: RegisterWorkerInput, session?: Session) =>
  test.transact((ex, ctx) => registerWorker(ex, ctx, input), session);

describe("the manager's yes or no", () => {
  it("lets one registration through after the manager's yes, and logs every step", async () => {
    const { sanctionId } = await suspendedSamira();
    const hr = await test.sessionFor("HR_OFFICER");
    const withoutDecision = { ...SAME_PHONE, hiringDecision: undefined };

    // The HR officer is stopped, and asks.
    await expect(register(withoutDecision, hr)).rejects.toThrow(
      "This person is suspended or penalised. The manager must allow the registration first.",
    );
    const { decisionId, status } = await ask(question(sanctionId), hr);
    expect(status).toBe("PENDING");
    const asked = await test.db
      .selectFrom("SanctionDecision")
      .selectAll()
      .where("id", "=", decisionId)
      .executeTakeFirstOrThrow();
    expect(asked).toMatchObject({
      context: "WORKER_REGISTRATION",
      attemptKind: "WORKER",
      sanctionId,
      matchBasis: "PHONE",
      requestedByUserId: hr.userId,
      status: "PENDING",
      resumeRoute: "/dashboard/workers/new",
    });
    // The question keeps what was typed, never her health answers or her score.
    const draft = JSON.parse(asked.draftPayload ?? "{}") as Record<string, unknown>;
    expect(draft.lastName).toBe("بن سعيد");
    expect(draft).not.toHaveProperty("healthConditions");
    expect(draft).not.toHaveProperty("healthOtherText");
    expect(draft).not.toHaveProperty("hiringScores");
    expect(draft).not.toHaveProperty("hiringTotal");
    expect(asked.draftPayload).not.toContain("حساسية");

    // Asking twice gives the same question; waiting is not a yes.
    expect((await ask(question(sanctionId), hr)).decisionId).toBe(decisionId);
    await expect(register({ ...withoutDecision, decisionId }, hr)).rejects.toThrow(
      "This person is suspended or penalised. The manager must allow the registration first.",
    );

    // The HR officer may not answer; the manager does, with his reason.
    await expect(
      test.transact((ex, ctx) => answerDecision(ex, ctx, { decisionId, allow: true, reason: "x" }), hr),
    ).rejects.toThrow("You do not have permission to do this.");
    await test.transact((ex, ctx) =>
      answerDecision(ex, ctx, { decisionId, allow: true, reason: "انتهت مدة التوقيف عمليا وقدمت تعهدا" }),
    );
    const answered = await test.db
      .selectFrom("SanctionDecision")
      .selectAll()
      .where("id", "=", decisionId)
      .executeTakeFirstOrThrow();
    expect(answered).toMatchObject({
      status: "ALLOWED",
      answeredByUserId: test.manager.userId,
      answerReason: "انتهت مدة التوقيف عمليا وقدمت تعهدا",
    });

    // His yes lets that one registration through, and is spent by it.
    const registered = await register({ ...withoutDecision, decisionId }, hr);
    const spent = await test.db
      .selectFrom("SanctionDecision")
      .selectAll()
      .where("id", "=", decisionId)
      .executeTakeFirstOrThrow();
    expect(spent).toMatchObject({ consumedEntityKind: "STAFF_MEMBER", consumedEntityId: registered.id });
    await expect(register({ ...withoutDecision, decisionId }, hr)).rejects.toThrow(
      "This person is suspended or penalised. The manager must allow the registration first.",
    );

    const log = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "action", "entity", "reason", "subjectId"])
      .where("entity", "in", ["SanctionDecision", "StaffMember"])
      .where("ownerCode", "=", "PEOPLE")
      .orderBy("chainSeq")
      .execute();
    expect(log.slice(-3)).toEqual([
      {
        operation: "COLLECT",
        action: "CREATE",
        entity: "SanctionDecision",
        reason: "STANDARD:CREATE",
        subjectId: expect.any(String),
      },
      {
        operation: "CHANGE",
        action: "APPROVE",
        entity: "SanctionDecision",
        reason: "انتهت مدة التوقيف عمليا وقدمت تعهدا",
        subjectId: expect.any(String),
      },
      {
        operation: "COLLECT",
        action: "CREATE",
        entity: "StaffMember",
        reason: "STANDARD:CREATE",
        subjectId: registered.id,
      },
    ]);
  });

  it("never lets a no through, and a no stays a no", async () => {
    const { sanctionId } = await suspendedSamira();
    const { decisionId } = await test.transact((ex, ctx) =>
      decideOnTheSpot(ex, ctx, { ...question(sanctionId), allow: false, reason: "سرقة سابقة" }),
    );
    await expect(register({ ...SAME_PHONE, decisionId })).rejects.toThrow(
      "The manager did not allow this person to be registered.",
    );
    await expect(
      test.transact((ex, ctx) => answerDecision(ex, ctx, { decisionId, allow: true, reason: "تراجع" })),
    ).rejects.toThrow("This request has already been answered.");
    // The database refuses a rewritten answer whoever asks.
    expect(() =>
      test.raw.prepare(`UPDATE "SanctionDecision" SET "status" = 'ALLOWED' WHERE "id" = ?`).run(decisionId),
    ).toThrow(/FROZEN:SanctionDecision:status/);
  });

  it("answers on the spot when the manager is the one registering", async () => {
    const { sanctionId } = await suspendedSamira();
    const { decisionId, status } = await test.transact((ex, ctx) =>
      decideOnTheSpot(ex, ctx, { ...question(sanctionId), allow: true, reason: "حالة إنسانية" }),
    );
    expect(status).toBe("ALLOWED");
    expect((await register({ ...SAME_PHONE, decisionId })).number).toBe("2/F");
    // Nobody else answers on the spot.
    const hr = await test.sessionFor("HR_OFFICER");
    await expect(
      test.transact((ex, ctx) => decideOnTheSpot(ex, ctx, { ...question(sanctionId), allow: true, reason: "x" }), hr),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => decideOnTheSpot(ex, ctx, { ...question(sanctionId), allow: true, reason: " " })),
    ).rejects.toThrow("Write the reason for the decision.");
  });

  it("asks the clerk first about a name alone, and files the question as a name she confirmed", async () => {
    const { sanctionId } = await suspendedSamira();
    const namesake = {
      ...emptyWorkerValues("2026-10-12"),
      sex: "FEMALE" as const,
      lastName: "بوزيد",
      firstName: "سميرة",
      birthDate: "1994-03-17",
      phone: "0550 99 88 77",
    };
    await expect(
      ask(question(sanctionId, { identity: workerIdentity({ ...namesake, birthDate: "" }) })),
    ).rejects.toThrow("Say first whether this is the same person.");
    const { decisionId } = await ask(
      question(sanctionId, {
        identity: { lastName: "بوزيد", firstName: "سميرة", phones: ["0550998877"] },
        nameConfirmed: true,
      }),
    );
    const row = await test.db
      .selectFrom("SanctionDecision")
      .selectAll()
      .where("id", "=", decisionId)
      .executeTakeFirstOrThrow();
    expect(row.matchBasis).toBe("NAME_CONFIRMED");
  });

  it("refuses a question about a sanction the person does not match", async () => {
    const { sanctionId } = await suspendedSamira();
    await expect(
      ask(question(sanctionId, { identity: { lastName: "سعدي", firstName: "كمال", phones: ["0770112233"] } })),
    ).rejects.toThrow("This person does not match this sanction.");
  });

  it("lets the clerk withdraw her question, and shows each one only her own", async () => {
    const { sanctionId } = await suspendedSamira();
    const hr = await test.sessionFor("HR_OFFICER");
    const operations = await test.sessionFor("OPERATIONS");
    const { decisionId } = await ask(question(sanctionId), hr);

    expect((await test.transact((ex, ctx) => listDecisions(ex, ctx), hr)).map((d) => d.id)).toEqual([decisionId]);
    expect(await test.transact((ex, ctx) => listDecisions(ex, ctx), operations)).toEqual([]);
    const [seen] = await test.transact((ex, ctx) => listDecisions(ex, ctx, { status: "PENDING" }));
    expect(seen).toMatchObject({
      id: decisionId,
      attemptName: "بن سعيد سامية",
      matchBasis: "PHONE",
      status: "PENDING",
      requestedByMe: false,
      sanction: { id: sanctionId, state: "SUSPENDED", displayName: "بوزيد سميرة", displayNumber: "1/F" },
    });
    const opened = await test.transact((ex, ctx) => getDecision(ex, ctx, { decisionId }), hr);
    expect(opened.draftPayload).toMatchObject({ lastName: "بن سعيد", phone: "0661 20 31 42" });
    await expect(test.transact((ex, ctx) => getDecision(ex, ctx, { decisionId }), operations)).rejects.toThrow(
      "You do not have permission to do this.",
    );

    await expect(
      test.transact((ex, ctx) => cancelDecision(ex, ctx, { decisionId, reason: "x" }), operations),
    ).rejects.toThrow("You do not have permission to do this.");
    await test.transact((ex, ctx) => cancelDecision(ex, ctx, { decisionId, reason: "أخطأت في الرقم" }), hr);
    const [cancelled] = await test.transact((ex, ctx) => listDecisions(ex, ctx), hr);
    expect(cancelled).toMatchObject({ status: "CANCELLED", answerReason: "أخطأت في الرقم", requestedByMe: true });
  });

  it("drops the restricted answers from a draft at any depth", () => {
    expect(
      withoutRestricted({
        lastName: "x",
        healthConditions: ["ASTHMA"],
        nested: { total: 50, conditions: "[]", keep: 1 },
        list: [{ hiringScores: {}, ok: true }],
      }),
    ).toEqual({ lastName: "x", nested: { keep: 1 }, list: [{ ok: true }] });
  });
});
