import { MANAGER_ROLE } from "@/lib/access/catalogue";
import { ClockJumpError } from "@/lib/clock/sanity";
import type { Session } from "@/lib/service/context";

/** The sentence an action answers when the PC's date jumped forward since the last operation. */
const CLOCK_JUMP_SENTENCE = new ClockJumpError(0).message;

/**
 * Whether an invoice or a receipt was refused because the PC's date jumped
 * forward, and the person signed in is the one who may confirm it: the screen
 * then asks him, and calls again with `confirmedClockJump`.
 */
export function asksClockConfirmation(error: string | null | undefined, session: Session | null): boolean {
  return error === CLOCK_JUMP_SENTENCE && session !== null && session.roleId === MANAGER_ROLE;
}
