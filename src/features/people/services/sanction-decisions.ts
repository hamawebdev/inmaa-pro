import type { PersonIdentity } from "@/features/people/rules/sanction-match";
import type {
  DecisionStatus,
  MatchBasis,
  SanctionContext,
  SanctionState,
  SanctionSubject,
} from "@/features/people/validators/staff-codes";
import { can, requireCapability, sectionLevel } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logCollect, type DataSubject } from "@/lib/log";
import { STAFF_CONFIDENTIAL_GROUPS } from "@/lib/restricted";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { phoneKey } from "@/lib/text/normalise";

import { checkSanction, SANCTIONS_PATH, type SanctionFound } from "./sanctions";

/**
 * «هل نسمح له أم لا؟»: the manager's yes or no to registering someone under
 * sanction (his note), one `SanctionDecision` row per question.
 *
 *  - `requestDecision` files the question when the check stopped a
 *    registration, with what was typed so far (never the health answers or the
 *    score) and the screen to come back to;
 *  - `answerDecision` is his answer, with his reason, once;
 *  - `decideOnTheSpot` is both at once, when he is the one at the keyboard;
 *  - `cancelDecision` withdraws a question still waiting;
 *  - `listDecisions` and `getDecision` show them: all of them to the manager,
 *    a clerk's own to the clerk.
 *
 * A yes allows the one registration it was asked for: the registration passes
 * its id, `checkSanction` answers ALLOWED, and `consumeDecision` (sanctions.ts)
 * spends it in the registration's transaction.
 */

export interface DecisionRequestInput {
  context: SanctionContext;
  /** What is being registered. */
  subjectKind: SanctionSubject;
  /** The existing record the attempt is about (a readmission, an edited identity). */
  subjectId?: string | null;
  /** The identity as typed. */
  identity: PersonIdentity;
  /** The sanction the check found. */
  sanctionId: string;
  /** The clerk said that a name-only match is the same person. */
  nameConfirmed?: boolean;
  /** What was typed, to fill the screen again after a yes. The restricted answers are dropped. */
  draftPayload?: unknown;
  /** The screen to come back to: `/dashboard/workers/new`. */
  resumeRoute?: string | null;
}

export interface DecisionRow {
  id: string;
  context: SanctionContext;
  attemptKind: SanctionSubject;
  /** The name as typed in the attempt. */
  attemptName: string;
  matchBasis: MatchBasis;
  status: DecisionStatus;
  requestedAt: string;
  requestedBy: string | null;
  requestedByMe: boolean;
  answeredAt: string | null;
  answeredBy: string | null;
  answerReason: string | null;
  consumedAt: string | null;
  resumeRoute: string | null;
  sanction: {
    id: string;
    subjectKind: SanctionSubject;
    state: SanctionState;
    reason: string;
    displayName: string;
    displayNumber: string | null;
    startDate: string;
    endDate: string | null;
  };
}

export const DECISIONS_PATH = SANCTIONS_PATH;
const DECISION_REFRESHES = [SANCTIONS_PATH, "/dashboard/workers", "/dashboard/employees"];

/** Who may see questions at all: someone who registers people or clients. */
function requireRegisteringSection(ctx: ServiceContext): void {
  if (!(["WORKERS", "EMPLOYEES", "REQUESTS"] as const).some((section) => sectionLevel(ctx, section) !== null)) {
    throw new ServiceError("You do not have permission to do this.");
  }
}

/**
 * The names that never travel in a draft: every column of `StaffConfidential`
 * and the worker form's restricted fields. The screen leaves them out; this
 * drops them again, at any depth.
 */
const RESTRICTED_DRAFT_KEYS: ReadonlySet<string> = new Set([
  ...Object.values(STAFF_CONFIDENTIAL_GROUPS).flat(),
  "healthConditions",
  "healthOtherText",
  "hiringScores",
  "hiringTotal",
]);

export function withoutRestricted(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutRestricted);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !RESTRICTED_DRAFT_KEYS.has(key))
        .map(([key, item]) => [key, withoutRestricted(item)]),
    );
  }
  return value;
}

/** The identity as it is kept on the question: what was typed, phones as digits, nothing empty. */
function identityRecord(identity: PersonIdentity): Record<string, unknown> {
  const record: Record<string, unknown> = {
    lastName: identity.lastName?.trim() || undefined,
    firstName: identity.firstName?.trim() || undefined,
    name: identity.name?.trim() || undefined,
    nameLatin: identity.nameLatin?.trim() || undefined,
    birthDate: identity.birthDate || undefined,
    phones: (identity.phones ?? []).map(phoneKey).filter(Boolean),
    nationalId: identity.nationalId?.replace(/\s/g, "") || undefined,
    taxNumbers: (identity.taxNumbers ?? []).filter(Boolean),
  };
  return Object.fromEntries(
    Object.entries(record).filter(([, value]) => value !== undefined && !(Array.isArray(value) && !value.length)),
  );
}

function parseDraft(text: string | null): unknown {
  if (!text) return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function attemptNameOf(text: string): string {
  try {
    const identity = JSON.parse(text) as Record<string, unknown>;
    const parts = [identity.name ?? [identity.lastName, identity.firstName].filter(Boolean).join(" ")];
    return String(parts[0] ?? "").trim();
  } catch {
    return "";
  }
}

const sanctionSubject = (match: Pick<SanctionFound, "subjectKind" | "subjectId" | "displayName">) => ({
  kind: match.subjectKind as DataSubject,
  id: match.subjectId,
  label: match.displayName,
});

/**
 * Files the question for the manager. The check runs again here: the sanction
 * must be one this identity matches, and a name-only match needs the clerk's
 * word that it is the same person. Asking twice gives the same question back.
 */
export async function requestDecision(
  ex: Executor,
  ctx: ServiceContext,
  input: DecisionRequestInput,
): Promise<{ decisionId: string; status: DecisionStatus }> {
  if (!ctx.userId) throw new Error("people: a question for the manager is asked by a person");
  const check = await checkSanction(ex, ctx, {
    context: input.context,
    subjectKind: input.subjectKind,
    subjectId: input.subjectId,
    identity: input.identity,
  });
  const match = check.matches.find((found) => found.sanctionId === input.sanctionId);
  if (!match) throw new ServiceError("This person does not match this sanction.");
  if (match.foundBy === "NAME_ONLY" && input.nameConfirmed !== true) {
    throw new ServiceError("Say first whether this is the same person.");
  }
  const matchBasis: MatchBasis = match.foundBy === "NAME_ONLY" ? "NAME_CONFIRMED" : match.foundBy;
  const attemptIdentity = JSON.stringify(identityRecord(input.identity));

  const asked = await ex
    .selectFrom("SanctionDecision")
    .select("id")
    .where("status", "=", "PENDING")
    .where("requestedByUserId", "=", ctx.userId)
    .where("sanctionId", "=", match.sanctionId)
    .where("context", "=", input.context)
    .where("attemptKind", "=", input.subjectKind)
    .where("attemptIdentity", "=", attemptIdentity)
    .executeTakeFirst();
  if (asked) return { decisionId: asked.id, status: "PENDING" };

  const decisionId = newId();
  const draft = input.draftPayload === undefined ? null : withoutRestricted(input.draftPayload);
  await ex
    .insertInto("SanctionDecision")
    .values({
      id: decisionId,
      context: input.context,
      attemptKind: input.subjectKind,
      attemptIdentity,
      attemptStaffId: input.subjectKind === "CLIENT" ? null : (input.subjectId ?? null),
      attemptClientId: input.subjectKind === "CLIENT" ? (input.subjectId ?? null) : null,
      sanctionId: match.sanctionId,
      matchBasis,
      requestedByUserId: ctx.userId,
      requestedAt: ctx.now,
      status: "PENDING",
      draftPayload: draft === null ? null : JSON.stringify(draft),
      resumeRoute: input.resumeRoute ?? null,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .execute();

  // Every sanction in force the person matches at this moment is named on the request: one yes covers them all,
  // for this one registration (the coordinator's ruling). A match on the name alone counts once the clerk said it
  // is the same person.
  const covered = check.matches
    .filter((found) => found.foundBy !== "NAME_ONLY" || input.nameConfirmed === true)
    .map((found) => ({
      sanctionId: found.sanctionId,
      matchBasis: (found.foundBy === "NAME_ONLY" ? "NAME_CONFIRMED" : found.foundBy) as MatchBasis,
    }));
  for (const each of covered) {
    await ex
      .insertInto("SanctionDecisionMatch")
      .values({ id: newId(), decisionId, sanctionId: each.sanctionId, matchBasis: each.matchBasis, createdAt: ctx.now })
      .execute();
  }

  await logCollect(ex, ctx, {
    owner: "PEOPLE",
    action: "CREATE",
    entity: "SanctionDecision",
    entityId: decisionId,
    entityLabel: attemptNameOf(attemptIdentity),
    subject: sanctionSubject(match),
    context: {
      context: input.context,
      sanctionId: match.sanctionId,
      matchBasis,
      sanctionIds: covered.map((each) => each.sanctionId),
    },
  });
  return { decisionId, status: "PENDING" };
}

async function decisionOf(ex: Executor, decisionId: string) {
  const decision = await ex
    .selectFrom("SanctionDecision as d")
    .innerJoin("Sanction as s", "s.id", "d.sanctionId")
    .select([
      "d.id",
      "d.status",
      "d.attemptIdentity",
      "d.requestedByUserId",
      "s.subjectKind",
      "s.staffId",
      "s.clientId",
      "s.displayName",
    ])
    .where("d.id", "=", decisionId)
    .executeTakeFirst();
  if (!decision) throw new ServiceError("This decision of the manager does not exist.");
  return {
    ...decision,
    subject: sanctionSubject({
      subjectKind: decision.subjectKind as SanctionSubject,
      subjectId: decision.staffId ?? decision.clientId ?? "",
      displayName: decision.displayName,
    }),
  };
}

/** The manager's yes or no, with his reason. Once: the database refuses a second answer. */
export async function answerDecision(
  ex: Executor,
  ctx: ServiceContext,
  input: { decisionId: string; allow: boolean; reason: string },
): Promise<{ decisionId: string; status: DecisionStatus }> {
  requireCapability(ctx, "sanction.answer");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for the decision.");
  const decision = await decisionOf(ex, input.decisionId);
  if (decision.status !== "PENDING") throw new ServiceError("This request has already been answered.");

  const status: DecisionStatus = input.allow ? "ALLOWED" : "REFUSED";
  await ex
    .updateTable("SanctionDecision")
    .set({ status, answeredByUserId: ctx.userId, answeredAt: ctx.now, answerReason: reason, updatedAt: ctx.now })
    .where("id", "=", decision.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: input.allow ? "APPROVE" : "REFUSE",
    reason,
    entity: "SanctionDecision",
    entityId: decision.id,
    entityLabel: attemptNameOf(decision.attemptIdentity),
    subject: decision.subject,
    changes: { status: ["PENDING", status] },
  });
  return { decisionId: decision.id, status };
}

/**
 * For Clients and Operations (CONTRACTS section 3): whether the manager's yes
 * on a decision was given about this sanction. True when the decision was
 * ALLOWED and named the sanction, as its own or among every sanction the person
 * matched when it was asked (`SanctionDecisionMatch`). Used, the yes still
 * covers: a file registered on it prints its orders without a release per visit.
 */
export async function decisionCovers(
  ex: Executor,
  _ctx: ServiceContext,
  input: { decisionId: string; sanctionId: string },
): Promise<boolean> {
  const decision = await ex
    .selectFrom("SanctionDecision")
    .select(["status", "sanctionId"])
    .where("id", "=", input.decisionId)
    .executeTakeFirst();
  if (!decision || decision.status !== "ALLOWED") return false;
  if (decision.sanctionId === input.sanctionId) return true;
  const named = await ex
    .selectFrom("SanctionDecisionMatch")
    .select("id")
    .where("decisionId", "=", input.decisionId)
    .where("sanctionId", "=", input.sanctionId)
    .executeTakeFirst();
  return named !== undefined;
}

/** The question and the manager's answer at once, when the manager is the one registering. */
export async function decideOnTheSpot(
  ex: Executor,
  ctx: ServiceContext,
  input: DecisionRequestInput & { allow: boolean; reason: string },
): Promise<{ decisionId: string; status: DecisionStatus }> {
  requireCapability(ctx, "sanction.answer");
  if (input.reason.trim() === "") throw new ServiceError("Write the reason for the decision.");
  const { decisionId } = await requestDecision(ex, ctx, input);
  return answerDecision(ex, ctx, { decisionId, allow: input.allow, reason: input.reason });
}

/** Withdraws a question still waiting: by whoever asked it, or by the manager. */
export async function cancelDecision(
  ex: Executor,
  ctx: ServiceContext,
  input: { decisionId: string; reason: string },
): Promise<void> {
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write why the request is withdrawn.");
  const decision = await decisionOf(ex, input.decisionId);
  if (decision.requestedByUserId !== ctx.userId && !can(ctx, "sanction.answer")) {
    throw new ServiceError("You do not have permission to do this.");
  }
  if (decision.status !== "PENDING") throw new ServiceError("This request has already been answered.");
  await ex
    .updateTable("SanctionDecision")
    .set({
      status: "CANCELLED",
      answeredByUserId: ctx.userId,
      answeredAt: ctx.now,
      answerReason: reason,
      updatedAt: ctx.now,
    })
    .where("id", "=", decision.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "CANCEL",
    reason,
    entity: "SanctionDecision",
    entityId: decision.id,
    entityLabel: attemptNameOf(decision.attemptIdentity),
    subject: decision.subject,
    changes: { status: ["PENDING", "CANCELLED"] },
  });
}

function decisionsQuery(ex: Executor) {
  return ex
    .selectFrom("SanctionDecision as d")
    .innerJoin("Sanction as s", "s.id", "d.sanctionId")
    .leftJoin("User as asker", "asker.id", "d.requestedByUserId")
    .leftJoin("User as answerer", "answerer.id", "d.answeredByUserId")
    .select([
      "d.id",
      "d.context",
      "d.attemptKind",
      "d.attemptIdentity",
      "d.matchBasis",
      "d.status",
      "d.requestedAt",
      "d.requestedByUserId",
      "d.answeredAt",
      "d.answerReason",
      "d.consumedAt",
      "d.resumeRoute",
      "d.draftPayload",
      "asker.displayName as requestedBy",
      "answerer.displayName as answeredBy",
      "s.id as sanctionId",
      "s.subjectKind as sanctionKind",
      "s.state",
      "s.reason",
      "s.displayName",
      "s.displayNumber",
      "s.startDate",
      "s.endDate",
    ]);
}

type DecisionQueryRow = Awaited<ReturnType<ReturnType<typeof decisionsQuery>["executeTakeFirstOrThrow"]>>;

function decisionRow(ctx: ServiceContext, row: DecisionQueryRow): DecisionRow {
  return {
    id: row.id,
    context: row.context as SanctionContext,
    attemptKind: row.attemptKind as SanctionSubject,
    attemptName: attemptNameOf(row.attemptIdentity),
    matchBasis: row.matchBasis as MatchBasis,
    status: row.status as DecisionStatus,
    requestedAt: row.requestedAt,
    requestedBy: row.requestedBy,
    requestedByMe: row.requestedByUserId === ctx.userId,
    answeredAt: row.answeredAt,
    answeredBy: row.answeredBy,
    answerReason: row.answerReason,
    consumedAt: row.consumedAt,
    resumeRoute: row.resumeRoute,
    sanction: {
      id: row.sanctionId,
      subjectKind: row.sanctionKind as SanctionSubject,
      state: row.state as SanctionState,
      reason: row.reason,
      displayName: row.displayName,
      displayNumber: row.displayNumber,
      startDate: row.startDate,
      endDate: row.endDate,
    },
  };
}

/** The questions: every one for the manager, a clerk's own for the clerk. Waiting first, then newest first. */
export async function listDecisions(
  ex: Executor,
  ctx: ServiceContext,
  input: { status?: DecisionStatus } = {},
): Promise<DecisionRow[]> {
  requireRegisteringSection(ctx);
  let rows = decisionsQuery(ex);
  if (!can(ctx, "sanction.answer")) rows = rows.where("d.requestedByUserId", "=", ctx.userId ?? "");
  if (input.status) rows = rows.where("d.status", "=", input.status);
  const found = await rows.orderBy("d.requestedAt", "desc").execute();
  return found
    .map((row) => decisionRow(ctx, row))
    .sort((a, b) => Number(b.status === "PENDING") - Number(a.status === "PENDING"));
}

/** One question with what was typed, to fill the screen again: for whoever asked it, or the manager. */
export async function getDecision(
  ex: Executor,
  ctx: ServiceContext,
  input: { decisionId: string },
): Promise<DecisionRow & { draftPayload: unknown }> {
  requireRegisteringSection(ctx);
  const row = await decisionsQuery(ex).where("d.id", "=", input.decisionId).executeTakeFirst();
  if (!row) throw new ServiceError("This decision of the manager does not exist.");
  if (row.requestedByUserId !== ctx.userId && !can(ctx, "sanction.answer")) {
    throw new ServiceError("You do not have permission to do this.");
  }
  return { ...decisionRow(ctx, row), draftPayload: parseDraft(row.draftPayload) };
}

// What the screens import.
export const requestDecisionAction = action(requestDecision, { revalidate: DECISION_REFRESHES });
export const answerDecisionAction = action(answerDecision, { revalidate: DECISION_REFRESHES });
export const decideOnTheSpotAction = action(decideOnTheSpot, { revalidate: DECISION_REFRESHES });
export const cancelDecisionAction = action(cancelDecision, { revalidate: DECISION_REFRESHES });
export const listDecisionsQuery = query(listDecisions);
export const getDecisionQuery = query(getDecision);
