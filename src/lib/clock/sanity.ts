import { sql } from "kysely";

import { MANAGER_ROLE } from "@/lib/access/catalogue";
import { logSecurity } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";

/** Thrown when the PC's date jumped forward and nobody confirmed it yet. The screen asks the manager, then calls again. */
export class ClockJumpError extends ServiceError {
  constructor(readonly jumpDays: number) {
    super("The date of this PC is several days after the last recorded operation. The manager must confirm it.");
    this.name = "ClockJumpError";
  }
}

export const CLOCK_BEHIND =
  "The date of this PC is earlier than the last recorded operation. Correct the date and time of the PC first.";

/**
 * Entries that say somebody came, left or changed a key, not that work was
 * done. A session starts with them at whatever date the PC shows (a password
 * chosen at the sign-in window is written just before the sign-in), so they
 * are never a reference for the clock: measured against them, a mistyped year
 * looks like minutes.
 */
const SESSION_ACTIONS = ["SIGN_IN", "SIGN_IN_FAILED", "LOCK", "PASSWORD_CHANGE"] as const;

export type ClockState =
  | { state: "ok"; lastAt: string | null; jumpDays: number }
  | { state: "behind"; lastAt: string; jumpDays: number }
  | { state: "jump"; lastAt: string; jumpDays: number };

/**
 * What a sign-in records of a clock it found out of order (in its entry's
 * `context.clock`). The work of that session is then never a reference for the
 * clock: it was done at the date in question.
 */
export type SessionClockNote = { state: "behind" | "jump"; lastAt: string; jumpDays: number };

/**
 * The newest instant the clock is measured against: the work recorded since
 * the manager's latest word on the date (CLOCK_WARNING, itself a reference),
 * leaving out
 *
 *  - the comings and goings (`SESSION_ACTIONS`);
 *  - what the reader's present session wrote (a person signed in): it was
 *    written at the date in question;
 *  - what was written in a session that began on a clock out of order, from
 *    its sign-in to the next one. Without this, a day of ordinary work at a
 *    mistyped year would make that year look ordinary the next morning.
 *
 * The manager's word is a fresh start: what was written before it no longer
 * counts, so a date he confirmed after a wrong one was recorded is measured
 * from his confirmation, not from the wrong date.
 */
async function clockReference(ex: Executor, ctx: ServiceContext): Promise<string | null> {
  const confirmed = await ex
    .selectFrom("AuditLog")
    .select(["chainSeq", "occurredAt"])
    .where("operation", "=", "SECURITY")
    .where("action", "=", "CLOCK_WARNING")
    // The log's order is the order of his words; the date is exactly what is in doubt (audit FND-02).
    .orderBy("chainSeq", "desc")
    .limit(1)
    .executeTakeFirst();
  const from = confirmed?.chainSeq ?? 0;

  const present =
    ctx.userId === null
      ? undefined
      : await ex
          .selectFrom("AuditLog")
          .select("chainSeq")
          .where("operation", "=", "SECURITY")
          .where("action", "=", "SIGN_IN")
          .where("userId", "=", ctx.userId)
          // Her latest sign-in in the log's order, not by its date: one made at a wrong future date is not "present" (FND-03).
          .orderBy("chainSeq", "desc")
          .limit(1)
          .executeTakeFirst();

  const doubtful = await ex
    .selectFrom("AuditLog as s")
    .select((eb) => [
      "s.chainSeq as fromSeq",
      eb
        .selectFrom("AuditLog as n")
        .select((inner) => inner.fn.min("n.chainSeq").as("seq"))
        .where("n.operation", "=", "SECURITY")
        .where("n.action", "=", "SIGN_IN")
        .whereRef("n.chainSeq", ">", "s.chainSeq")
        .as("untilSeq"),
    ])
    .where("s.operation", "=", "SECURITY")
    .where("s.action", "=", "SIGN_IN")
    .where("s.chainSeq", ">", from)
    .where(sql<boolean>`json_extract(s.context, '$.clock') is not null`)
    .execute();

  const presentSeq = present?.chainSeq ?? null;
  const newest = await ex
    .selectFrom("AuditLog")
    .select("occurredAt")
    .where("action", "not in", SESSION_ACTIONS)
    .where("chainSeq", ">", from)
    .$if(presentSeq !== null, (qb) => qb.where("chainSeq", "<", presentSeq ?? 0))
    .$if(doubtful.length > 0, (qb) =>
      qb.where((eb) =>
        eb.and(
          doubtful.map((session) =>
            session.untilSeq === null
              ? eb("chainSeq", "<", session.fromSeq)
              : eb.or([eb("chainSeq", "<", session.fromSeq), eb("chainSeq", ">=", session.untilSeq)]),
          ),
        ),
      ),
    )
    .orderBy("localDate", "desc")
    .orderBy("occurredAt", "desc")
    .limit(1)
    .executeTakeFirst();

  const candidates = [confirmed?.occurredAt, newest?.occurredAt].filter((at): at is string => typeof at === "string");
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, at) => (Date.parse(at) > Date.parse(latest) ? at : latest));
}

/**
 * Where the PC's clock stands: behind the reference (it is wrong), more than
 * `system.clockJumpDays` days after it (somebody must look), or fine. A read:
 * it runs at start-up (as the program, before the day-start job), at every
 * sign-in, before each day's own work, and before a legal document is issued.
 */
export async function checkClock(ex: Executor, ctx: ServiceContext): Promise<ClockState> {
  const lastAt = await clockReference(ex, ctx);
  if (!lastAt) return { state: "ok", lastAt: null, jumpDays: 0 };
  const behindMs = Date.parse(lastAt) - Date.parse(ctx.now);
  if (behindMs > 0) return { state: "behind", lastAt, jumpDays: 0 };
  const jumpDays = Math.floor(-behindMs / 86_400_000);
  const allowed = await getSetting(ex, "system.clockJumpDays");
  return jumpDays > allowed ? { state: "jump", lastAt, jumpDays } : { state: "ok", lastAt, jumpDays };
}

/**
 * The manager's word on the PC's date, logged as CLOCK_WARNING:
 *
 *  - after a jump forward (the centre was closed), that the date is right.
 *    No typed reason is needed: the jump and its size are in the entry;
 *  - with the clock behind the recorded work, that it is the recorded date
 *    that was wrong (a year mistyped, then confirmed by mistake). Rare, and it
 *    is the one way out of a program nobody could sign in to: it needs his
 *    typed reason. It does not move the legal sequences: an invoice dated
 *    before the last one is still refused by the database.
 *
 * Only the manager answers, signed in himself (DESIGN.md section 12).
 */
export async function confirmClockJump(
  ex: Executor,
  ctx: ServiceContext,
  input: { reason?: string } = {},
): Promise<ClockState> {
  if (ctx.userId !== null && ctx.roleId !== MANAGER_ROLE)
    throw new ServiceError("You do not have permission to do this.");
  const found = await checkClock(ex, ctx);
  if (found.state === "ok") return found;
  const reason = input.reason?.trim();
  if (found.state === "behind" && !reason) throw new ServiceError(CLOCK_BEHIND);
  await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "CLOCK_WARNING",
    reason,
    context: {
      direction: found.state === "behind" ? "BEHIND" : "AHEAD",
      lastOperationAt: found.lastAt,
      jumpDays: found.jumpDays,
    },
  });
  return { state: "ok", lastAt: ctx.now, jumpDays: 0 };
}

/**
 * Checks the PC's clock before a legal document is issued.
 *
 * A wrong date is the one thing that can block the legal sequences: an invoice
 * dated next year would forbid every invoice until then, and one dated last
 * month would be refused for ever. So:
 *
 *  - a clock earlier than the reference is refused: it is wrong;
 *  - a clock more than `system.clockJumpDays` days after it is not refused, but
 *    somebody must look: the manager confirms (`confirmedJump`), and the log
 *    keeps a CLOCK_WARNING.
 *
 * The reference is the work recorded before the present session, outside any
 * session opened on a clock out of order (see `clockReference`): signing in at
 * a mistyped date, or working a day at it, does not make that date look
 * ordinary. The same check runs at sign-in and when the program starts, before
 * the day-start job.
 *
 * Call it first in a service that issues an invoice or a receipt.
 */
export async function assertClockSane(
  ex: Executor,
  ctx: ServiceContext,
  options: { confirmedJump?: boolean } = {},
): Promise<void> {
  const found = await checkClock(ex, ctx);
  if (found.state === "ok") return;
  if (found.state === "behind") throw new ServiceError(CLOCK_BEHIND);
  if (!options.confirmedJump) throw new ClockJumpError(found.jumpDays);
  await confirmClockJump(ex, ctx);
}
