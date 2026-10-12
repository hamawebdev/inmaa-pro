import type { SectionId } from "@/navigation/sections";

/**
 * Which sections the manager password protects.
 *
 * The gate is driven by an owner-editable list stored in
 * the setting `shell.lockedSections`, so a centre can protect only its money, or
 * everything, or nothing at all.
 *
 * This is the academy shell's mechanism, kept until sign-in and roles replace
 * the section picker with "role by section".
 *
 * The security model: one password, one session-wide unlock, and a locked
 * section is never rendered rather than merely blurred. See
 * src/components/security/route-gate.tsx.
 */

/**
 * Everything the password can protect.
 *
 * `home` is deliberately absent and can never be locked. A centre that locks
 * itself out of its own landing screen has a program that opens onto a password
 * prompt with no way past it that is not the password — and the person who most
 * needs to see the day's board is often not the person who set it.
 */
export type LockableId = Exclude<SectionId, "home">;

export interface LockableSection {
  /** Stable id persisted in settings — never renamed, or the centre loses its
   *  choices on upgrade. */
  id: LockableId;
  /** Key inside the `Nav` i18n namespace, so the picker reads exactly like the
   *  bottom bar. */
  labelKey: string;
}

export const LOCKABLE_SECTIONS: readonly LockableSection[] = [
  { id: "employees", labelKey: "Employees" },
  { id: "workers", labelKey: "Workers" },
  { id: "requests", labelKey: "Requests" },
  { id: "money", labelKey: "Money" },
  { id: "stock", labelKey: "Stock" },
  { id: "settings", labelKey: "Settings" },
];

/**
 * What a centre gets before it ever opens the picker.
 *
 * `money` holds income, expenses, invoices and every debt. `settings` holds
 * backup and restore — which can overwrite the whole database — and the lock
 * picker itself. `employees` holds the centre's own staff: personal records,
 * contracts and pay, which is exactly what a manager does not want readable
 * from a shared desk.
 *
 * `workers`, `requests` and `stock` stay open by default: they are what the
 * office is *for*. Locking the request files would put a password between the
 * assistant and a client on the phone.
 *
 * A centre that has already made a choice keeps it — this list is only
 * consulted when nothing was ever stored (see {@link parseLockedSections}), so
 * adding an id here cannot lock a section under an existing user without them
 * asking for it.
 */
export const DEFAULT_LOCKED_SECTIONS: readonly string[] = ["employees", "money", "settings"];

const KNOWN_IDS = new Set<string>(LOCKABLE_SECTIONS.map((s) => s.id));

/**
 * Reads the stored list.
 *
 * An absent or blank value means "never configured" and yields the defaults
 * above. `"[]"` is a real choice — lock nothing — and must survive the read,
 * which is why the empty array cannot be used as the not-configured sentinel.
 *
 * Fails **closed** on anything malformed: corrupt JSON falls back to the
 * defaults rather than to an open app, so a damaged settings row cannot quietly
 * expose the payroll.
 */
export function parseLockedSections(raw: string | undefined): string[] {
  if (!raw?.trim()) return [...DEFAULT_LOCKED_SECTIONS];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [...DEFAULT_LOCKED_SECTIONS];
    // Unknown ids are dropped, not kept: a section removed in a later version
    // must not linger and lock an id that has since been reused.
    return parsed.filter((id): id is string => typeof id === "string" && KNOWN_IDS.has(id));
  } catch {
    return [...DEFAULT_LOCKED_SECTIONS];
  }
}

/** Serializes the picker's selection for the setting `shell.lockedSections`. */
export function serializeLockedSections(ids: readonly string[]): string {
  // Stored in registry order rather than click order, so the value is stable and
  // two centres with the same choices hold byte-identical rows.
  return JSON.stringify(LOCKABLE_SECTIONS.filter((s) => ids.includes(s.id)).map((s) => s.id));
}

/**
 * Whether the given section is currently protected.
 *
 * A section owned by no entry in the registry — `home`, or an unmatched
 * route — is never locked.
 */
export function isSectionLocked(section: SectionId | undefined, lockedIds: readonly string[]): boolean {
  if (!section || !KNOWN_IDS.has(section)) return false;
  return lockedIds.includes(section);
}
