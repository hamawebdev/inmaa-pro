import { isDate } from "@/features/people/rules/dates";
import {
  checkOutcome,
  findSanctionMatches,
  type FoundBy,
  type PersonIdentity,
  type SanctionEntry,
} from "@/features/people/rules/sanction-match";
import {
  SANCTION_STATES,
  SANCTION_SUBJECTS,
  type ConsumedEntity,
  type SanctionContext,
  type SanctionState,
  type SanctionSubject,
} from "@/features/people/validators/staff-codes";
import type { SectionCode } from "@/lib/access/catalogue";
import { requireCapability, sectionLevel } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange, type DataSubject } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { localDate, type LocalDate } from "@/lib/units";

/**
 * «موقف / متوقف / معاقب» for the three kinds of person (his note: «عند
 * التعامل مع شخص موقفا أو معاقبا يمنعنا من تسجيله وينبهنا ويسألنا: هل نسمح له
 * أم لا؟»; scope decision 3), as People exports it (CONTRACTS section 3):
 *
 *  - `checkSanction` reads the sanctions in force and says what a
 *    registration may do; `consumeDecision` spends the manager's yes on the one
 *    registration it allows (his yes and no: sanction-decisions.ts);
 *  - `setSanction` and `liftSanction` write a person's sanction, with its
 *    reason and dates, for a worker, an employee or a client (Clients calls
 *    them for a client);
 *  - `getSanctionStates` is the one way other owners read a person's state.
 *
 * The matching rule is rules/sanction-match.ts.
 */

export type CheckOutcome = "CLEAR" | "POSSIBLE" | "BLOCKED" | "ALLOWED" | "REFUSED";

export interface CheckSanctionInput {
  context: SanctionContext;
  /** What is being registered. */
  subjectKind: SanctionSubject;
  /** The record being edited or readmitted, when it exists. */
  subjectId?: string | null;
  /** The identity as typed. */
  identity: PersonIdentity;
  /** The manager's answer to this attempt, when he was asked. */
  decisionId?: string | null;
  /**
   * Leave out the record's own sanction: editing a sanctioned worker's phone is
   * not a new attempt to register her. A readmission keeps it.
   */
  ignoreOwnRecord?: boolean;
}

/** A sanction the person matched, as the prompt shows it. Nothing of the restricted table. */
export interface SanctionFound {
  sanctionId: string;
  subjectKind: SanctionSubject;
  /** The sanctioned person's record: a staff member or a client. */
  subjectId: string;
  state: SanctionState;
  reason: string;
  displayName: string;
  displayNumber: string | null;
  startDate: string;
  endDate: string | null;
  foundBy: FoundBy;
  strength: "STRONG" | "WEAK";
}

export interface CheckSanctionResult {
  /**
   * CLEAR: nobody matched. POSSIBLE: a name only; the clerk says whether it is
   * the same person. BLOCKED: wait for the manager. ALLOWED: the manager said
   * yes to this attempt, and the yes is still unused. REFUSED: he said no.
   */
  outcome: CheckOutcome;
  matches: SanctionFound[];
}

/** Only someone who can register a person or a client runs the check. */
const REGISTERING_SECTIONS: readonly SectionCode[] = ["WORKERS", "EMPLOYEES", "REQUESTS"];

function parseExtraKeys(text: string | null): { rc?: string; nis?: string; nif?: string; orgNameKey?: string } {
  if (!text) return {};
  try {
    const value: unknown = JSON.parse(text);
    return value && typeof value === "object" ? (value as Record<string, string>) : {};
  } catch {
    return {};
  }
}

/** The sanctions in force on `ctx.today`, as the matching rule reads them. */
async function sanctionsInForce(ex: Executor, ctx: ServiceContext): Promise<SanctionEntry[]> {
  const rows = await ex
    .selectFrom("Sanction")
    .selectAll()
    .where("liftedAt", "is", null)
    .where("startDate", "<=", ctx.today)
    .where((eb) => eb.or([eb("endDate", "is", null), eb("endDate", ">=", ctx.today)]))
    .execute();
  return rows.map((row) => {
    const extra = parseExtraKeys(row.extraKeys);
    return {
      id: row.id,
      subjectKind: row.subjectKind as SanctionSubject,
      subjectId: row.staffId ?? row.clientId ?? "",
      state: row.state as SanctionState,
      reason: row.reason,
      startDate: row.startDate,
      endDate: row.endDate,
      liftedAt: null,
      displayName: row.displayName,
      displayNumber: row.displayNumber,
      // The identity when the sanction was set. Its keys are normal forms already; the rule normalises again, harmlessly.
      identity: {
        name: row.nameKey ?? extra.orgNameKey ?? null,
        nameLatin: row.nameLatinKey,
        birthDate: row.birthDate,
        phones: (row.phoneKeys ?? "").split("|").filter(Boolean),
        nationalId: row.nationalIdNumber,
        taxNumbers: [extra.rc, extra.nis, extra.nif],
      },
    };
  });
}

export async function checkSanction(
  ex: Executor,
  ctx: ServiceContext,
  input: CheckSanctionInput,
): Promise<CheckSanctionResult> {
  if (!REGISTERING_SECTIONS.some((section) => sectionLevel(ctx, section) === "WRITE")) {
    throw new ServiceError("You do not have permission to do this.");
  }
  const settings = await getSettings(ex, ["sanction.blockingStates", "sanction.matchAcrossKinds"]);
  const ownRecord = (entry: SanctionEntry) =>
    input.ignoreOwnRecord === true &&
    !!input.subjectId &&
    entry.subjectKind === input.subjectKind &&
    entry.subjectId === input.subjectId;
  const found = findSanctionMatches(
    { subjectKind: input.subjectKind, subjectId: input.subjectId, identity: input.identity },
    (await sanctionsInForce(ex, ctx)).filter((entry) => !ownRecord(entry)),
    {
      today: ctx.today,
      blockingStates: settings["sanction.blockingStates"] as Record<SanctionSubject, SanctionState[]>,
      acrossKinds: settings["sanction.matchAcrossKinds"],
    },
  );
  const matches = found.map(({ sanction, foundBy, strength }) => ({
    sanctionId: sanction.id,
    subjectKind: sanction.subjectKind,
    subjectId: sanction.subjectId,
    state: sanction.state,
    reason: sanction.reason,
    displayName: sanction.displayName,
    displayNumber: sanction.displayNumber ?? null,
    startDate: sanction.startDate,
    endDate: sanction.endDate,
    foundBy,
    strength,
  }));
  if (matches.length === 0) return { outcome: "CLEAR", matches };

  if (input.decisionId) {
    const decision = await ex
      .selectFrom("SanctionDecision")
      .select(["id", "context", "attemptKind", "sanctionId", "status", "consumedAt"])
      .where("id", "=", input.decisionId)
      .executeTakeFirst();
    if (!decision) throw new ServiceError("This decision of the manager does not exist.");
    const about = matches.some((match) => match.sanctionId === decision.sanctionId);
    if (about && decision.status === "REFUSED") return { outcome: "REFUSED", matches };
    // A yes is about one sanction and one attempt: it allows only when it covers every match.
    const freshYes =
      decision.status === "ALLOWED" &&
      decision.consumedAt === null &&
      decision.context === input.context &&
      decision.attemptKind === input.subjectKind;
    if (freshYes && matches.every((match) => match.sanctionId === decision.sanctionId)) {
      return { outcome: "ALLOWED", matches };
    }
  }
  return { outcome: checkOutcome(found), matches };
}

/**
 * Spends the manager's yes on the registration it allowed, in that
 * registration's transaction. A yes is used once and a no never; the database
 * refuses both too (`SanctionDecision_consume_once`).
 */
export async function consumeDecision(
  ex: Executor,
  ctx: ServiceContext,
  input: { decisionId: string; entityKind: ConsumedEntity; entityId: string },
): Promise<void> {
  const decision = await ex
    .selectFrom("SanctionDecision")
    .select(["id", "status", "consumedAt"])
    .where("id", "=", input.decisionId)
    .executeTakeFirst();
  if (!decision) throw new ServiceError("This decision of the manager does not exist.");
  if (decision.status !== "ALLOWED") throw new ServiceError("Only the manager's yes allows a registration.");
  if (decision.consumedAt !== null) throw new ServiceError("This decision of the manager has already been used.");
  await ex
    .updateTable("SanctionDecision")
    .set({
      consumedAt: ctx.now,
      consumedEntityKind: input.entityKind,
      consumedEntityId: input.entityId,
      updatedAt: ctx.now,
    })
    .where("id", "=", decision.id)
    .execute();
}

// ── Setting and lifting a sanction ──────────────────────────────────────────

export const SANCTIONS_PATH = "/dashboard/workers/sanctions";

export interface SetSanctionInput {
  subjectKind: SanctionSubject;
  /** The worker's or employee's `StaffMember` id, or the client's `Client` id. */
  subjectId: string;
  state: SanctionState;
  /** Why, in the manager's words: kept on the row and in the log. */
  reason: string;
  /** `YYYY-MM-DD`: in force from this day. */
  startDate: string;
  /** `YYYY-MM-DD`: in force through this day; empty until lifted. */
  endDate?: string | null;
  /** The violation this sanction answers, when there is one. */
  violationId?: string | null;
}

/** Who the sanction is about, as it is kept on the row: the keys keep matching after the record is edited. */
interface IdentitySnapshot {
  displayName: string;
  displayNumber: string | null;
  nameKey: string | null;
  nameLatinKey: string | null;
  birthDate: LocalDate | null;
  phoneKeys: string | null;
  nationalIdNumber: string | null;
  extraKeys: string | null;
}

const orNull = (text: string | null | undefined) => (text && text.trim() !== "" ? text.trim() : null);

async function snapshotOf(ex: Executor, kind: SanctionSubject, id: string): Promise<IdentitySnapshot> {
  if (kind === "CLIENT") {
    // Clients' table, read for the identity the check compares (CONTRACTS section 2).
    const client = await ex
      .selectFrom("Client")
      .select(["id", "number", "name", "nameKey", "managerNameKey", "phoneKeys", "rcNumber", "nis", "nif", "deletedAt"])
      .where("id", "=", id)
      .executeTakeFirst();
    if (!client || client.deletedAt) throw new ServiceError("This client does not exist.");
    const extra = { rc: client.rcNumber, nis: client.nis, nif: client.nif, managerNameKey: client.managerNameKey };
    return {
      displayName: client.name,
      displayNumber: client.number,
      nameKey: client.nameKey,
      nameLatinKey: null,
      birthDate: null,
      phoneKeys: orNull(client.phoneKeys),
      nationalIdNumber: null,
      extraKeys: JSON.stringify(Object.fromEntries(Object.entries(extra).filter(([, value]) => value))),
    };
  }
  const staff = await ex
    .selectFrom("StaffMember")
    .select([
      "id",
      "kind",
      "number",
      "lastName",
      "firstName",
      "nameKey",
      "nameLatinKey",
      "birthDate",
      "phoneKeys",
      "nationalIdNumber",
      "deletedAt",
    ])
    .where("id", "=", id)
    .executeTakeFirst();
  if (!staff || staff.deletedAt || staff.kind !== kind) throw new ServiceError("This person does not exist.");
  return {
    displayName: `${staff.lastName} ${staff.firstName}`,
    displayNumber: staff.number,
    nameKey: staff.nameKey,
    nameLatinKey: staff.nameLatinKey,
    birthDate: staff.birthDate,
    phoneKeys: orNull(staff.phoneKeys),
    nationalIdNumber: staff.nationalIdNumber,
    extraKeys: null,
  };
}

const logSubject = (kind: SanctionSubject, id: string, label: string) => ({
  kind: kind as DataSubject,
  id,
  label,
});

/**
 * Puts a person under sanction: «موقف» (or «متوقف» for a client) or «معاقب»,
 * from a day, until a day or until lifted. The manager's act: it needs
 * `sanction.set`, and his reason goes in the log. A worker's future seats are
 * given up by Operations, which follows `staff.unavailable`.
 */
export async function setSanction(
  ex: Executor,
  ctx: ServiceContext,
  input: SetSanctionInput,
): Promise<{ sanctionId: string }> {
  requireCapability(ctx, "sanction.set");
  if (!(SANCTION_SUBJECTS as readonly string[]).includes(input.subjectKind)) {
    throw new Error(`people: no sanction for a ${input.subjectKind}`);
  }
  if (!(SANCTION_STATES as readonly string[]).includes(input.state)) throw new ServiceError("Choose the sanction.");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write the reason for the sanction.");
  if (!isDate(input.startDate)) throw new ServiceError("Enter a valid date.");
  const endText = orNull(input.endDate);
  if (endText !== null && !isDate(endText)) throw new ServiceError("Enter a valid date.");
  const startDate = localDate(input.startDate);
  const endDate = endText === null ? null : localDate(endText);
  if (endDate !== null && endDate < startDate) {
    throw new ServiceError("The end date must not be before the start date.");
  }
  if (!ctx.userId) throw new Error("people: a sanction is set by a person");

  const snapshot = await snapshotOf(ex, input.subjectKind, input.subjectId);

  // One sanction at a time: an earlier one for these days is lifted first.
  const subjectColumn = input.subjectKind === "CLIENT" ? "clientId" : "staffId";
  const overlapping = await ex
    .selectFrom("Sanction")
    .select("id")
    .where(subjectColumn, "=", input.subjectId)
    .where("liftedAt", "is", null)
    .where((eb) => eb.or([eb("endDate", "is", null), eb("endDate", ">=", startDate)]))
    .$if(endDate !== null, (qb) => qb.where("startDate", "<=", endDate as LocalDate))
    .executeTakeFirst();
  if (overlapping) throw new ServiceError("This person already has a sanction for these days. Lift it first.");

  const sanctionId = newId();
  await ex
    .insertInto("Sanction")
    .values({
      id: sanctionId,
      subjectKind: input.subjectKind,
      staffId: input.subjectKind === "CLIENT" ? null : input.subjectId,
      clientId: input.subjectKind === "CLIENT" ? input.subjectId : null,
      state: input.state,
      reason,
      startDate,
      endDate,
      violationId: input.violationId ?? null,
      setByUserId: ctx.userId,
      setAt: ctx.now,
      ...snapshot,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .execute();

  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "SANCTION_SET",
    reason,
    entity: "Sanction",
    entityId: sanctionId,
    entityLabel: snapshot.displayNumber ? `${snapshot.displayNumber} ${snapshot.displayName}` : snapshot.displayName,
    subject: logSubject(input.subjectKind, input.subjectId, snapshot.displayName),
    changes: { state: [null, input.state], startDate: [null, startDate], endDate: [null, endDate] },
  });
  await emit(ex, ctx, "sanction.changed", { sanctionId });
  if (input.subjectKind === "WORKER") {
    await emit(ex, ctx, "staff.unavailable", {
      workerId: input.subjectId,
      fromDate: startDate,
      toDate: endDate,
      cause: "SANCTION_SET",
    });
  }
  return { sanctionId };
}

/** Ends a sanction before its end date, or one that had none. The manager's act, with his reason. */
export async function liftSanction(
  ex: Executor,
  ctx: ServiceContext,
  input: { sanctionId: string; reason: string },
): Promise<void> {
  requireCapability(ctx, "sanction.set");
  const reason = input.reason.trim();
  if (reason === "") throw new ServiceError("Write why the sanction is lifted.");
  const sanction = await ex
    .selectFrom("Sanction")
    .select(["id", "subjectKind", "staffId", "clientId", "liftedAt", "displayName", "displayNumber"])
    .where("id", "=", input.sanctionId)
    .executeTakeFirst();
  if (!sanction) throw new ServiceError("This sanction does not exist.");
  if (sanction.liftedAt !== null) throw new ServiceError("This sanction has already been lifted.");

  await ex
    .updateTable("Sanction")
    .set({ liftedAt: ctx.now, liftedByUserId: ctx.userId, liftReason: reason, updatedAt: ctx.now })
    .where("id", "=", sanction.id)
    .execute();

  const subjectId = sanction.staffId ?? sanction.clientId ?? "";
  const kind = sanction.subjectKind as SanctionSubject;
  await logChange(ex, ctx, {
    owner: "PEOPLE",
    action: "SANCTION_LIFT",
    reason,
    entity: "Sanction",
    entityId: sanction.id,
    entityLabel: sanction.displayNumber ? `${sanction.displayNumber} ${sanction.displayName}` : sanction.displayName,
    subject: logSubject(kind, subjectId, sanction.displayName),
    changes: { liftedAt: [null, ctx.now] },
  });
  await emit(ex, ctx, "sanction.changed", { sanctionId: sanction.id });
  if (kind === "WORKER") {
    await emit(ex, ctx, "staff.unavailable", {
      workerId: subjectId,
      fromDate: ctx.today,
      toDate: null,
      cause: "SANCTION_LIFTED",
    });
  }
}

// ── Reading a person's state ────────────────────────────────────────────────

/** «موقف / متوقف / معاقب» on a day: the sanction in force, or nothing. */
export interface SanctionStateOf {
  sanctionId: string;
  state: SanctionState;
  reason: string;
  since: string;
  until: string | null;
}

/**
 * The state of each of these people on `ctx.today`: the one way other owners
 * read «متوقف / معاقب» (CONTRACTS section 3). Every id asked for is in the
 * answer, with null when nothing is in force.
 */
export async function getSanctionStates(
  ex: Executor,
  ctx: ServiceContext,
  input: { kind: SanctionSubject; ids: readonly string[] },
): Promise<Record<string, SanctionStateOf | null>> {
  const states: Record<string, SanctionStateOf | null> = Object.fromEntries(input.ids.map((id) => [id, null]));
  if (input.ids.length === 0) return states;
  const column = input.kind === "CLIENT" ? "clientId" : "staffId";
  const rows = await ex
    .selectFrom("Sanction")
    .select(["id", "staffId", "clientId", "state", "reason", "startDate", "endDate"])
    .where("subjectKind", "=", input.kind)
    .where(column, "in", [...input.ids])
    .where("liftedAt", "is", null)
    .where("startDate", "<=", ctx.today)
    .where((eb) => eb.or([eb("endDate", "is", null), eb("endDate", ">=", ctx.today)]))
    .orderBy("startDate")
    .execute();
  for (const row of rows) {
    const id = (input.kind === "CLIENT" ? row.clientId : row.staffId) ?? "";
    states[id] = {
      sanctionId: row.id,
      state: row.state as SanctionState,
      reason: row.reason,
      since: row.startDate,
      until: row.endDate,
    };
  }
  return states;
}

export interface SanctionRow {
  id: string;
  subjectKind: SanctionSubject;
  subjectId: string;
  state: SanctionState;
  reason: string;
  startDate: string;
  endDate: string | null;
  displayName: string;
  displayNumber: string | null;
  setAt: string;
  setBy: string | null;
  liftedAt: string | null;
  liftedBy: string | null;
  liftReason: string | null;
  /** In force today: begun, not over, not lifted. */
  inForce: boolean;
  /** Set for a later day. */
  upcoming: boolean;
}

/** The sanctions of one person (her file), or all of them (the sanctions screen), newest first. */
export async function listSanctions(
  ex: Executor,
  ctx: ServiceContext,
  input: { subjectKind?: SanctionSubject; subjectId?: string; inForceOnly?: boolean } = {},
): Promise<SanctionRow[]> {
  if (!REGISTERING_SECTIONS.some((section) => sectionLevel(ctx, section) !== null)) {
    throw new ServiceError("You do not have permission to do this.");
  }
  let rows = ex
    .selectFrom("Sanction as s")
    .leftJoin("User as setter", "setter.id", "s.setByUserId")
    .leftJoin("User as lifter", "lifter.id", "s.liftedByUserId")
    .select([
      "s.id",
      "s.subjectKind",
      "s.staffId",
      "s.clientId",
      "s.state",
      "s.reason",
      "s.startDate",
      "s.endDate",
      "s.displayName",
      "s.displayNumber",
      "s.setAt",
      "s.liftedAt",
      "s.liftReason",
      "setter.displayName as setBy",
      "lifter.displayName as liftedBy",
    ]);
  if (input.subjectKind) rows = rows.where("s.subjectKind", "=", input.subjectKind);
  if (input.subjectId) {
    const id = input.subjectId;
    rows = rows.where((eb) => eb.or([eb("s.staffId", "=", id), eb("s.clientId", "=", id)]));
  }
  if (input.inForceOnly) {
    rows = rows
      .where("s.liftedAt", "is", null)
      .where((eb) => eb.or([eb("s.endDate", "is", null), eb("s.endDate", ">=", ctx.today)]));
  }
  const found = await rows.orderBy("s.startDate", "desc").orderBy("s.setAt", "desc").execute();
  return found.map((row) => {
    const live = row.liftedAt === null && (row.endDate === null || row.endDate >= ctx.today);
    return {
      id: row.id,
      subjectKind: row.subjectKind as SanctionSubject,
      subjectId: row.staffId ?? row.clientId ?? "",
      state: row.state as SanctionState,
      reason: row.reason,
      startDate: row.startDate,
      endDate: row.endDate,
      displayName: row.displayName,
      displayNumber: row.displayNumber,
      setAt: row.setAt,
      setBy: row.setBy,
      liftedAt: row.liftedAt,
      liftedBy: row.liftedBy,
      liftReason: row.liftReason,
      inForce: live && row.startDate <= ctx.today,
      upcoming: live && row.startDate > ctx.today,
    };
  });
}

// What the screens import.
export const checkSanctionQuery = query(checkSanction);
export const getSanctionStatesQuery = query(getSanctionStates);
export const listSanctionsQuery = query(listSanctions);
/** Refreshes the sanctions screen, every worker's and employee's file, and the lists that show a state. */
const SANCTION_REFRESHES = [SANCTIONS_PATH, "/dashboard/workers", "/dashboard/employees", "/dashboard/clients"];
export const setSanctionAction = action(setSanction, { revalidate: SANCTION_REFRESHES });
export const liftSanctionAction = action(liftSanction, { revalidate: SANCTION_REFRESHES });
