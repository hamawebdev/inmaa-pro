import {
  CAPABILITY_KEYS,
  MANAGER_ROLE,
  SECTION_CODES,
  type Capability,
  type SectionCode,
  type SectionLevel,
} from "@/lib/access/catalogue";
import type { Executor, Session } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";

/**
 * Who may do what.
 *
 * A user has one role. A role's rights are a level on each bar section and a
 * set of capabilities (docs/data-model/DESIGN.md section 12). They are loaded
 * once, at sign-in, into the session; every check reads that snapshot and never
 * the database, so a check is safe inside a transaction. A change of rights
 * takes effect at the next sign-in.
 *
 * `MANAGER` holds everything and needs no row. So does the program itself
 * (`userId` null): the day-start job is not a person asking for permission.
 */

function holdsEverything(who: Pick<Session, "userId" | "roleId">): boolean {
  return who.userId === null || who.roleId === MANAGER_ROLE;
}

export function can(who: Session, capability: Capability): boolean {
  return holdsEverything(who) || who.capabilities.has(capability);
}

export function requireCapability(who: Session, capability: Capability): void {
  if (!can(who, capability)) throw new ServiceError("You do not have permission to do this.");
}

/** The role's level on a bar section, or null for no access. */
export function sectionLevel(who: Session, section: SectionCode): SectionLevel | null {
  if (holdsEverything(who)) return "WRITE";
  return who.sections[section] ?? null;
}

export function requireSection(who: Session, section: SectionCode, level: SectionLevel): void {
  const held = sectionLevel(who, section);
  if (held === null || (level === "WRITE" && held !== "WRITE")) {
    throw new ServiceError("You do not have permission to do this.");
  }
}

/** Loads a user's session snapshot. Called at sign-in, and by tests. */
export async function loadSession(ex: Executor, userId: string): Promise<Session> {
  const user = await ex
    .selectFrom("User")
    .select(["id", "displayName", "roleId", "staffMemberId", "branchId", "isActive"])
    .where("id", "=", userId)
    .executeTakeFirst();
  if (!user || !user.isActive) throw new ServiceError("This account does not exist or is not active.");

  const grants = await ex
    .selectFrom("RoleGrant")
    .select(["kind", "key", "access"])
    .where("roleId", "=", user.roleId)
    .execute();
  const sections: Partial<Record<SectionCode, SectionLevel>> = {};
  const capabilities = new Set<string>();
  for (const grant of grants) {
    if (grant.kind === "SECTION" && (SECTION_CODES as readonly string[]).includes(grant.key)) {
      sections[grant.key as SectionCode] = grant.access as SectionLevel;
    } else if (grant.kind === "CAPABILITY" && (CAPABILITY_KEYS as readonly string[]).includes(grant.key)) {
      capabilities.add(grant.key);
    }
  }

  const branchId =
    user.branchId ??
    (await ex.selectFrom("Branch").select("id").where("isDefault", "=", 1).executeTakeFirst())?.id ??
    "branch-main";

  return {
    userId: user.id,
    userName: user.displayName,
    roleId: user.roleId,
    staffMemberId: user.staffMemberId,
    branchId,
    sections,
    capabilities,
  };
}

// ── The session of the running program ─────────────────────────────────────

let current: Session | null = null;

/** Set at sign-in. Until sign-in exists, the stand-in manager is signed in at start (first-run.ts). */
export function setCurrentSession(session: Session | null): void {
  current = session;
}

/** The signed-in user. For the action wrapper and for screens; a service reads its `ctx` instead. */
export function currentSession(): Session {
  if (!current) throw new ServiceError("Nobody is signed in.");
  return current;
}

export function hasSession(): boolean {
  return current !== null;
}
