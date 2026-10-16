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

const CLOCK_BEHIND =
  "The date of this PC is earlier than the last recorded operation. Correct the date and time of the PC first.";

/**
 * Entries that say somebody came or left, not that work was done. A session
 * starts with one at whatever date the PC shows, so they are never a reference
 * for the clock: measured against them, a mistyped year looks like minutes.
 */
const SESSION_ACTIONS = ["SIGN_IN", "SIGN_IN_FAILED", "LOCK"] as const;

export type ClockState =
  | { state: "ok"; lastAt: string | null; jumpDays: number }
  | { state: "behind"; lastAt: string; jumpDays: number }
  | { state: "jump"; lastAt: string; jumpDays: number };

/**
 * The newest instant the clock is measured against: the newest work recorded
 * before the reader's present session began, or the manager's latest
 * confirmation of the date (CLOCK_WARNING), whichever is later. What the
 * present session itself wrote is left out: it was written at the date in
 * question. For the program itself (`ctx.userId` null) and for a session that
 * has no sign-in of its own, every entry but the comings and goings counts.
 */
async function clockReference(ex: Executor, ctx: ServiceContext): Promise<string | null> {
  const start =
    ctx.userId === null
      ? undefined
      : await ex
          .selectFrom("AuditLog")
          .select((eb) => eb.fn.max("chainSeq").as("seq"))
          .where("action", "=", "SIGN_IN")
          .where("userId", "=", ctx.userId)
          .executeTakeFirst();
  const sessionStart = start?.seq ?? null;
  const newest = await ex
    .selectFrom("AuditLog")
    .select((eb) => eb.fn.max("occurredAt").as("at"))
    .where((eb) =>
      eb.or([
        eb("action", "=", "CLOCK_WARNING"),
        eb.and([
          eb("action", "not in", SESSION_ACTIONS),
          ...(sessionStart === null ? [] : [eb("chainSeq", "<", sessionStart)]),
        ]),
      ]),
    )
    .executeTakeFirst();
  return (newest?.at as string | null | undefined) ?? null;
}

/**
 * Where the PC's clock stands: behind the reference (it is wrong), more than
 * `system.clockJumpDays` days after it (somebody must look), or fine.
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

/** The manager confirms that the PC's date is right after a jump forward (the centre was closed). Logged. */
export async function confirmClockJump(ex: Executor, ctx: ServiceContext): Promise<void> {
  if (ctx.userId !== null && ctx.roleId !== MANAGER_ROLE)
    throw new ServiceError("You do not have permission to do this.");
  const found = await checkClock(ex, ctx);
  if (found.state === "behind") throw new ServiceError(CLOCK_BEHIND);
  if (found.state === "ok") return;
  await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "CLOCK_WARNING",
    context: { lastOperationAt: found.lastAt, jumpDays: found.jumpDays },
  });
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
 * The reference is the work recorded before the present session (see
 * `clockReference`): signing in at a mistyped date does not make that date
 * look ordinary. The same check runs at sign-in and when the program starts,
 * before the day-start job.
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
