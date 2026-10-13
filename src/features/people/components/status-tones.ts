import type { StatusTone } from "@/components/status-chip";
import type { DecisionStatus, EngagementStatus } from "@/features/people/validators/staff-codes";

/**
 * The colour each state is said with, on People's screens. The word and the
 * icon come with it (`StatusChip`): a colour alone is not a status.
 */

/** Where a worker or an employee stands with the centre. */
export const STATUS_TONE: Record<EngagementStatus, StatusTone> = {
  CANDIDATE: "pending",
  ON_TRIAL: "info",
  ACCEPTED: "success",
  REFUSED: "danger",
  LEFT: "neutral",
};

/** The manager's answer to «هل نسمح له أم لا؟». */
export const DECISION_TONE: Record<DecisionStatus, StatusTone> = {
  PENDING: "pending",
  ALLOWED: "success",
  REFUSED: "danger",
  CANCELLED: "neutral",
};

/** A pay run: a draft waits, a closed one is done, a voided one no longer counts. */
export const RUN_TONE: Record<string, StatusTone> = { DRAFT: "pending", CLOSED: "success", VOID: "neutral" };

/** An employee's leave. */
export const LEAVE_TONE: Record<string, StatusTone> = {
  REQUESTED: "pending",
  APPROVED: "success",
  REFUSED: "danger",
  CANCELLED: "neutral",
};
