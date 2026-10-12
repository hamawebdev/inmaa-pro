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

/**
 * Checks the PC's clock before a legal document is issued.
 *
 * A wrong date is the one thing that can block the legal sequences: an invoice
 * dated next year would forbid every invoice until then, and one dated last
 * month would be refused for ever. So:
 *
 *  - a clock earlier than the last entry of the log is refused: it is wrong;
 *  - a clock more than `system.clockJumpDays` days after it is not refused, but
 *    somebody must look: the manager confirms (`confirmedJump`), and the log
 *    keeps a CLOCK_WARNING.
 *
 * Call it first in a service that issues an invoice or a receipt.
 */
export async function assertClockSane(
  ex: Executor,
  ctx: ServiceContext,
  options: { confirmedJump?: boolean } = {},
): Promise<void> {
  const last = await ex
    .selectFrom("AuditLog")
    .select("occurredAt")
    .orderBy("chainSeq", "desc")
    .limit(1)
    .executeTakeFirst();
  if (!last) return;

  const behindMs = Date.parse(last.occurredAt) - Date.parse(ctx.now);
  if (behindMs > 0) {
    throw new ServiceError(
      "The date of this PC is earlier than the last recorded operation. Correct the date and time of the PC first.",
    );
  }

  const jumpDays = Math.floor(-behindMs / 86_400_000);
  const allowed = await getSetting(ex, "system.clockJumpDays");
  if (jumpDays <= allowed) return;

  if (!options.confirmedJump) throw new ClockJumpError(jumpDays);
  if (ctx.userId !== null && ctx.roleId !== MANAGER_ROLE)
    throw new ServiceError("You do not have permission to do this.");
  await logSecurity(ex, ctx, {
    owner: "FOUNDATION",
    action: "CLOCK_WARNING",
    context: { lastOperationAt: last.occurredAt, jumpDays },
  });
}
