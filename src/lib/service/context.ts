import type { Kysely } from "kysely";

import type { Capability, SectionCode, SectionLevel } from "@/lib/access/catalogue";
import { toInstant, toLocal, type Clock } from "@/lib/clock";
import type { DB } from "@/lib/db/schema";
import type { LocalDate, LocalTime } from "@/lib/units";

/**
 * What every service is given besides its input: a database handle, who is
 * acting, and what time it is.
 *
 *     export async function closeVisit(ex: Executor, ctx: ServiceContext, input: { visitId: string }) { … }
 *
 * `ex` is the caller's handle: the open transaction when there is one. A
 * service never opens a transaction of its own when given one, never reads the
 * session or the clock from anywhere else, and never reaches for the program's
 * root database handle (inside a transaction that would wait for itself for
 * ever). That is what lets one user action be one transaction across several
 * owners, and what lets a test drive the same functions on a real database.
 */
export type Executor = Kysely<DB>;

/** Who is signed in, as loaded once at sign-in. Never re-read from the database inside an action. */
export interface Session {
  /** Null when the program acts by itself: the day-start job, an event handler run for the program. */
  userId: string | null;
  /** The name written beside every log entry. "system" for the program itself. */
  userName: string;
  roleId: string | null;
  staffMemberId: string | null;
  branchId: string;
  /** The role's level on each bar section. No entry is no access. */
  sections: Readonly<Partial<Record<SectionCode, SectionLevel>>>;
  capabilities: ReadonlySet<Capability | string>;
}

export interface ServiceContext extends Session {
  /** The instant of this action, as stored: "2026-10-12T08:00:00.000Z". One per action. */
  now: string;
  /** The centre's calendar date at that instant. */
  today: LocalDate;
  /** The centre's clock time at that instant. */
  nowTime: LocalTime;
  toInstant(date: LocalDate, time: LocalTime): string;
  toLocal(instant: string): { date: LocalDate; time: LocalTime };
  /**
   * The hash chains this action added to. Kept by `appendChained`; the action
   * wrapper reads it after the commit to decide whether the anchor must be
   * rewritten at once.
   */
  readonly touchedChains: Set<string>;
  /**
   * This laptop's id once two-laptop sync is set up on it, null before (the
   * program then behaves as 1.0.0). Filled by `stampTransaction`
   * (src/lib/sync/session.ts), the first statement of every write transaction,
   * from this database's own `SyncState`: a context that never opened a write
   * transaction reads it with `syncDeviceIdOf(ex)` from the same file.
   */
  syncDeviceId: string | null;
}

/** The session of the program itself: no user, every right. Used by the day-start job and by first run. */
export const SYSTEM_SESSION: Session = {
  userId: null,
  userName: "system",
  roleId: null,
  staffMemberId: null,
  branchId: "branch-main",
  sections: {},
  capabilities: new Set(),
};

/** One action's context: the session, and the clock read once. */
export function buildContext(session: Session, clock: Clock): ServiceContext {
  const now = clock.now().toISOString();
  const local = toLocal(now, clock.utcOffsetMin);
  return {
    ...session,
    now,
    today: local.date,
    nowTime: local.time,
    toInstant: (date, time) => toInstant(date, time, clock.utcOffsetMin),
    toLocal: (instant) => toLocal(instant, clock.utcOffsetMin),
    touchedChains: new Set(),
    syncDeviceId: null,
  };
}
