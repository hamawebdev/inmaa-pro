import { appendChained } from "@/lib/chain";
import { newId } from "@/lib/db/rows";
import type { Executor, ServiceContext } from "@/lib/service/context";

/**
 * The access and change log.
 *
 * Law 18-07 (art. 41 bis 3) asks that every operation on personal data leave
 * five things: the operation, its reason, the date, the time and the user.
 * `AuditLog` holds them, append-only and hash-chained, and nothing is ever
 * purged from it.
 *
 * One service writes it, this one, called by every owner inside the same
 * transaction as the change it records: if the change is rolled back, so is
 * its entry, and a change cannot be committed without it.
 *
 *     await logChange(ex, ctx, { owner: "PEOPLE", action: "UPDATE", entity: "StaffMember", entityId: id,
 *       entityLabel: staff.number, subject: { kind: "WORKER", id, label: staff.fullName }, changes });
 */

export type LogOperation = "COLLECT" | "CONSULT" | "CHANGE" | "DISCLOSE" | "ERASE" | "SECURITY";

export const LOG_ACTIONS = [
  "CREATE",
  "UPDATE",
  "SOFT_DELETE",
  "STATUS_CHANGE",
  "VIEW",
  "VIEW_RESTRICTED",
  "PRINT",
  "EXPORT",
  "BACKUP",
  "RESTORE",
  "ISSUE",
  "VOID",
  "CANCEL",
  "APPROVE",
  "REFUSE",
  "OVERRIDE",
  "NUMBER_CLAIM",
  "SANCTION_CHECK",
  "SANCTION_SET",
  "SANCTION_LIFT",
  "UPLOAD_REMOVE",
  "SETTINGS_CHANGE",
  "SIGN_IN",
  "SIGN_IN_FAILED",
  "LOCK",
  "PASSWORD_CHANGE",
  "CHAIN_VERIFY",
  "ANCHOR_REBASE",
  "CLOCK_WARNING",
] as const;
export type LogAction = (typeof LOG_ACTIONS)[number];

export type LogOwner = "FOUNDATION" | "PEOPLE" | "CLIENTS" | "OPERATIONS" | "MONEY";
export type DataSubject = "WORKER" | "EMPLOYEE" | "CLIENT" | "RESIDENT" | "CONTACT" | "USER";

/**
 * Acts whose reason the user must type: the log then carries his words, not a
 * standard purpose. A service that records one of these without a reason is
 * refused here, so the rule cannot be forgotten on one screen.
 */
export const ACTIONS_NEEDING_A_TYPED_REASON: ReadonlySet<LogAction> = new Set([
  "VOID",
  "CANCEL",
  "SOFT_DELETE",
  "RESTORE",
  "OVERRIDE",
  "NUMBER_CLAIM",
  "SANCTION_SET",
  "SANCTION_LIFT",
  "APPROVE",
  "REFUSE",
]);

/** A routine act's reason: its standard purpose, kept as a code the log screen words in the reader's language. */
export const standardReason = (action: LogAction) => `STANDARD:${action}`;

/**
 * Values that never enter the log. `changes` still names the field, so the
 * entry says *that* it changed, and carries this mark in place of both values:
 * the log can be opened by people who may not see the health answers, a
 * password hash or a cost.
 */
export const WITHHELD = "§";

const WITHHELD_TABLES: ReadonlySet<string> = new Set(["StaffConfidential", "CostStudy"]);
const WITHHELD_COLUMNS: Readonly<Record<string, ReadonlySet<string>>> = {
  User: new Set(["passwordHash", "recoveryHash"]),
};

export interface LogEntry {
  /** Which part of the program wrote the entry. */
  owner: LogOwner;
  action: LogAction;
  /** Typed by the user where the act needs it; otherwise left out and the standard purpose is recorded. */
  reason?: string;
  /** The record touched: its table, id and a label that reads without a join (a number, a name). */
  entity?: string;
  entityId?: string;
  entityLabel?: string;
  /** Whose personal data it is. */
  subject?: { kind: DataSubject; id: string; label?: string };
  /** `{ field: [old, new] }`, changed fields only. */
  changes?: Record<string, readonly [unknown, unknown]>;
  /** Free details: counts, a file name, the route. */
  context?: Record<string, unknown>;
  /** For a disclosure: how, and to whom when that is known. */
  disclosure?: "PRINT" | "EXPORT" | "BACKUP";
  recipient?: string;
  /** The manager who answered inside this user's session. */
  approvedByUserId?: string;
}

function withhold(entity: string | undefined, changes: LogEntry["changes"]): string | null {
  if (!changes || Object.keys(changes).length === 0) return null;
  const all = entity !== undefined && WITHHELD_TABLES.has(entity);
  const some = entity !== undefined ? WITHHELD_COLUMNS[entity] : undefined;
  const safe = Object.fromEntries(
    Object.entries(changes).map(([field, pair]) => [field, all || some?.has(field) ? [WITHHELD, WITHHELD] : pair]),
  );
  return JSON.stringify(safe);
}

async function record(ex: Executor, ctx: ServiceContext, operation: LogOperation, entry: LogEntry): Promise<string> {
  const typed = entry.reason?.trim();
  if (!typed && ACTIONS_NEEDING_A_TYPED_REASON.has(entry.action)) {
    throw new Error(`log: ${entry.action} needs the reason the user typed.`);
  }

  const id = newId();
  await appendChained(ex, ctx, "AuditLog", {
    id,
    occurredAt: ctx.now,
    localDate: ctx.today,
    localTime: ctx.nowTime,
    operation,
    action: entry.action,
    userId: ctx.userId,
    userName: ctx.userName,
    userRole: ctx.roleId,
    approvedByUserId: entry.approvedByUserId ?? null,
    reason: typed || standardReason(entry.action),
    ownerCode: entry.owner,
    entity: entry.entity ?? null,
    entityId: entry.entityId ?? null,
    entityLabel: entry.entityLabel ?? null,
    subjectKind: entry.subject?.kind ?? null,
    subjectId: entry.subject?.id ?? null,
    subjectLabel: entry.subject?.label ?? null,
    disclosure: operation === "DISCLOSE" ? (entry.disclosure ?? "PRINT") : null,
    recipient: entry.recipient ?? null,
    changes: withhold(entry.entity, entry.changes),
    context: entry.context ? JSON.stringify(entry.context) : null,
    createdAt: ctx.now,
  });
  return id;
}

/** A row holding personal data was created. */
export const logCollect = (ex: Executor, ctx: ServiceContext, entry: LogEntry) => record(ex, ctx, "COLLECT", entry);
/** Restricted data was read, or a person's file was opened. Lists are not logged. */
export const logConsult = (ex: Executor, ctx: ServiceContext, entry: LogEntry) => record(ex, ctx, "CONSULT", entry);
/** A record was changed: old and new value per field, a status, a setting. */
export const logChange = (ex: Executor, ctx: ServiceContext, entry: LogEntry) => record(ex, ctx, "CHANGE", entry);
/** A sheet naming a person was printed, a file exported, a backup made. */
export const logDisclose = (ex: Executor, ctx: ServiceContext, entry: LogEntry) => record(ex, ctx, "DISCLOSE", entry);
/** A record was soft-deleted, or an upload taken off its row. */
export const logErase = (ex: Executor, ctx: ServiceContext, entry: LogEntry) => record(ex, ctx, "ERASE", entry);
/** What is not about a person's data: sign-in, a manager's approval, a restore, a clock warning. */
export const logSecurity = (ex: Executor, ctx: ServiceContext, entry: LogEntry) => record(ex, ctx, "SECURITY", entry);
