import { afterEach, beforeEach, expect, it } from "vitest";

import { FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import { setFirstPassword, signIn, signOut, type SignInResult } from "@/features/core/services/sign-in";
import { createAccount } from "@/features/core/services/users";
import { SAMPLE_WORKER_VALUES } from "@/features/people/forms/worker-values";
import { answerDecision, listDecisions, requestDecision } from "@/features/people/services/sanction-decisions";
import { setSanction } from "@/features/people/services/sanctions";
import { registerWorker, workerIdentity, type RegisterWorkerInput } from "@/features/people/services/workers";
import { SYSTEM_SESSION, type Session } from "@/lib/service/context";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

/**
 * «هل نسمح له أم لا؟» across two people at one desk: the HR officer is signed
 * in when the question comes up; the manager answers it under his own name,
 * signed in himself. Nobody answers inside somebody else's session.
 */
const FAST = { iterations: 1_000 };

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

async function signedIn(userId: string, password: string): Promise<Session> {
  const answer = (await test.transact(
    (ex, ctx) => signIn(ex, ctx, { userId, password }),
    SYSTEM_SESSION,
  )) as SignInResult;
  if (!answer.ok) throw new Error(`test: sign-in refused (${answer.reason})`);
  return answer.session;
}

it("the HR officer asks while signed in, and the manager answers when he signs in himself", async () => {
  // The two accounts, each with the password its owner chose.
  await test.transact(
    (ex, ctx) => setFirstPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password: "manager-pass", ...FAST }),
    SYSTEM_SESSION,
  );
  const { id: hrId } = await test.transact((ex, ctx) =>
    createAccount(ex, ctx, { username: "hr", displayName: "بن عمر سعاد", roleId: "HR_OFFICER" }),
  );
  await test.transact(
    (ex, ctx) => setFirstPassword(ex, ctx, { userId: hrId, password: "hr-password", ...FAST }),
    SYSTEM_SESSION,
  );

  // A worker suspended since 1 October, and her sister who shares her phone.
  const samira = await test.transact((ex, ctx) =>
    registerWorker(ex, ctx, { ...SAMPLE_WORKER_VALUES, nationalIdNumber: "109940317000123" }),
  );
  const { sanctionId } = await test.transact((ex, ctx) =>
    setSanction(ex, ctx, {
      subjectKind: "WORKER",
      subjectId: samira.id,
      state: "SUSPENDED",
      reason: "غياب متكرر",
      startDate: "2026-10-01",
    }),
  );
  const sister: RegisterWorkerInput = {
    ...SAMPLE_WORKER_VALUES,
    lastName: "بن سعيد",
    firstName: "سامية",
    fullNameLatin: "",
    birthDate: "1997-06-02",
    nationalIdNumber: "",
    hiringDecision: undefined,
  };

  // The HR officer signs in, is stopped, and asks.
  const hr = await signedIn(hrId, "hr-password");
  await expect(test.transact((ex, ctx) => registerWorker(ex, ctx, sister), hr)).rejects.toThrow(
    "This person is suspended or penalised. The manager must allow the registration first.",
  );
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
  // She cannot answer it herself.
  await expect(
    test.transact((ex, ctx) => answerDecision(ex, ctx, { decisionId, allow: true, reason: "أختها" }), hr),
  ).rejects.toThrow("You do not have permission to do this.");
  await test.transact((ex, ctx) => signOut(ex, ctx), hr);

  // The manager signs in under his own name, finds the question waiting, and answers.
  test.clock.advance({ minutes: 20 });
  const manager = await signedIn(FIRST_MANAGER_ID, "manager-pass");
  const waiting = await listDecisions(test.db, test.ctx(manager), { status: "PENDING" });
  expect(waiting.map((row) => row.id)).toEqual([decisionId]);
  await test.transact(
    (ex, ctx) => answerDecision(ex, ctx, { decisionId, allow: true, reason: "أختها، وليست هي" }),
    manager,
  );
  await test.transact((ex, ctx) => signOut(ex, ctx), manager);

  const answered = await test.db
    .selectFrom("SanctionDecision")
    .select(["status", "requestedByUserId", "answeredByUserId"])
    .where("id", "=", decisionId)
    .executeTakeFirstOrThrow();
  expect(answered).toEqual({ status: "ALLOWED", requestedByUserId: hrId, answeredByUserId: FIRST_MANAGER_ID });

  // The log reads as it happened: who came, who asked, who left, who answered.
  const log = await test.db
    .selectFrom("AuditLog")
    .select(["action", "userName"])
    .where("action", "in", ["SIGN_IN", "LOCK", "APPROVE"])
    .orderBy("chainSeq")
    .execute();
  expect(log.slice(-5)).toEqual([
    { action: "SIGN_IN", userName: "بن عمر سعاد" },
    { action: "LOCK", userName: "بن عمر سعاد" },
    { action: "SIGN_IN", userName: "المدير" },
    { action: "APPROVE", userName: "المدير" },
    { action: "LOCK", userName: "المدير" },
  ]);

  // Her yes in hand, the HR officer signs in again and registers.
  const again = await signedIn(hrId, "hr-password");
  const registered = await test.transact((ex, ctx) => registerWorker(ex, ctx, { ...sister, decisionId }), again);
  expect(registered.id).toBeTruthy();
});
