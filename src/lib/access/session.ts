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

/** A bar section as the navigation names it ("requests") to the code its grants are stored under ("REQUESTS"). */
export function sectionCodeOf(sectionId: string): SectionCode | null {
  const code = sectionId.toUpperCase();
  return (SECTION_CODES as readonly string[]).includes(code) ? (code as SectionCode) : null;
}

/**
 * Whether somebody may open a bar section. Home is everybody's: the program
 * always opens onto something, and what the home screen shows already follows
 * the reader's role.
 */
export function mayOpenSection(who: Session, sectionId: string): boolean {
  if (sectionId === "home") return true;
  const code = sectionCodeOf(sectionId);
  return code !== null && sectionLevel(who, code) !== null;
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
const listeners = new Set<() => void>();

/** Set at sign-in, cleared at sign-out. Every screen that reads the session follows (`useSession`). */
export function setCurrentSession(session: Session | null): void {
  current = session;
  for (const listener of listeners) listener();
}

/** The signed-in user, or null: for a screen that must not throw when nobody is signed in. */
export function peekSession(): Session | null {
  return current;
}

/** Calls `listener` whenever somebody signs in or out. Returns how to stop. */
export function subscribeToSession(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The signed-in user. For the action wrapper and for screens; a service reads its `ctx` instead. */
export function currentSession(): Session {
  if (!current) throw new ServiceError("Nobody is signed in.");
  return current;
}

export function hasSession(): boolean {
  return current !== null;
}
