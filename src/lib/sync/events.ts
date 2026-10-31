/**
 * What the screens hear from the sync engine, outside any transaction.
 *
 * `onSyncApplied` is called after the other laptop's changes were committed
 * here: program refreshes the screens and, when an account, a role or its
 * grants changed, reloads the signed-in session (DECISION section 7, case 10).
 */

export interface SyncAppliedInfo {
  /** The tables a change was applied to. */
  tables: ReadonlySet<string>;
}

type Listener = (info: SyncAppliedInfo) => void;

const listeners = new Set<Listener>();

export function onSyncApplied(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitSyncApplied(info: SyncAppliedInfo): void {
  if (info.tables.size === 0) return;
  for (const listener of listeners) {
    try {
      listener(info);
    } catch (error) {
      console.error("sync: a listener of applied changes failed", error);
    }
  }
}
