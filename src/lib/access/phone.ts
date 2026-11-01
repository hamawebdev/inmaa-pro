import { MANAGER_ROLE, type RoleCode } from "./catalogue";

/**
 * The roles whose accounts sign in on a phone (docs/phone/DECISION.md section 4).
 *
 * The phone is the director's alone "for now": only an account holding the manager role signs
 * in on it. The sign-in window on a phone lists only these accounts, and the sign-in service
 * refuses any other when `thisDeviceKind(ex)` is "PHONE". This is the one place to widen it.
 */
export const PHONE_ROLES: readonly RoleCode[] = [MANAGER_ROLE];

/** Whether an account of this role may sign in on a phone. */
export function maySignInOnPhone(roleId: string | null): boolean {
  return roleId !== null && (PHONE_ROLES as readonly string[]).includes(roleId);
}

/** The refusal on a phone, under `Errors` in the three languages. */
export const PHONE_ROLE_REFUSED = "Only the manager's account signs in on the phone.";
