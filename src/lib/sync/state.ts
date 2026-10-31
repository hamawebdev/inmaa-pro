import type { Executor } from "@/lib/service/context";

import type { SyncClockState, SyncDeviceIdentity } from "./session";

/**
 * This laptop's own sync state, in `SyncState` (key → JSON). Local: never
 * captured, and reset when a laptop starts from a full copy.
 *
 * | key            | value |
 * |----------------|-------|
 * | device         | `SyncDeviceIdentity`: who this laptop is (session.ts) |
 * | clock          | `SyncClockState`: the mailbox's time minus this PC's |
 * | send           | `SendState`: the next envelope and transaction numbers, and the envelopes being sent |
 * | receive        | `ReceiveState`: the mailbox cursor and, per laptop, what was applied |
 * | exchange       | `ExchangeState`: the last exchange, its outcome, the mailbox's usage |
 * | catchUp        | `CatchUpState` while this laptop must take back what the mailbox holds before anyone works |
 * | file:<url>     | `FileState`: where a stored file's bytes are on the mailbox, and whether they are here |
 * | copy           | `CopyState`: the last full copy this laptop put on the mailbox |
 * | left           | which laptop this was, once the manager took it out of sync (ledger keeps its books state by it) |
 */

export interface PendingSend {
  /** The first envelope number of this batch, and how many envelopes it was cut into. */
  envSeq: number;
  envCount: number;
  /** The outbox rows it holds (inclusive). */
  fromSeq: number;
  toSeq: number;
  /** The transaction number of its first transaction, and how many it holds. */
  firstTxSeq: number;
  txCount: number;
}

export interface SendState {
  nextEnvSeq: number;
  nextTxSeq: number;
  pending: PendingSend | null;
}

export interface OriginState {
  /** The last envelope applied whole, and the last transaction applied (of the envelope being applied). */
  env: number;
  tx: number;
  /** The instant of its newest transaction applied here (from the stamp). */
  at: string | null;
}

export interface ReceiveState {
  /** Everything at or before this mailbox position (mseq) is applied or skipped. */
  cursor: number;
  origins: Record<string, OriginState>;
  /** Transactions already in this database because it started from a full copy that held them unsent. */
  skipTxIds: string[];
}

export type ExchangeOutcome = "OK" | "OFFLINE" | "LIMIT" | "FULL" | "REVOKED" | "REFUSED" | "REJOIN";

export interface ExchangeState {
  lastExchangeAt: string | null;
  lastOutcome: ExchangeOutcome | null;
  offlineSince: string | null;
  limitRetryAt: string | null;
  /** The mailbox position this laptop last acknowledged. */
  ackedUpTo?: number;
  /** The mailbox's refusal code, with REFUSED. */
  refusal?: string | null;
}

export interface CatchUpState {
  reason: "RESTORED" | "BEHIND" | "JOINED";
  /** Set when it began. */
  since: string;
  done: number;
  total: number | null;
}

export type FileStage = "SEND" | "SENT" | "FETCH" | "HERE";

export interface FileState {
  url: string;
  sha256: string;
  size: number;
  blobId: string;
  keyId: string;
  parts: number;
  stage: FileStage;
  tries?: number;
  lastTriedAt?: string | null;
}

export interface CopyState {
  at: string;
  blobId: string;
  covers: number;
}

export const DEFAULT_SEND: SendState = { nextEnvSeq: 1, nextTxSeq: 1, pending: null };
export const DEFAULT_RECEIVE: ReceiveState = { cursor: 0, origins: {}, skipTxIds: [] };
export const DEFAULT_EXCHANGE: ExchangeState = {
  lastExchangeAt: null,
  lastOutcome: null,
  offlineSince: null,
  limitRetryAt: null,
};

interface Keys {
  device: SyncDeviceIdentity;
  clock: SyncClockState;
  send: SendState;
  receive: ReceiveState;
  exchange: ExchangeState;
  catchUp: CatchUpState;
  copy: CopyState;
  left: { deviceId: string; slot: 0 | 1; leftAt: string };
}

export async function readState<K extends keyof Keys>(ex: Executor, key: K): Promise<Keys[K] | null> {
  const row = await ex.selectFrom("SyncState").select("value").where("key", "=", key).executeTakeFirst();
  return row ? (JSON.parse(row.value) as Keys[K]) : null;
}

export async function writeState<K extends keyof Keys>(ex: Executor, key: K, value: Keys[K] | null): Promise<void> {
  if (value === null) {
    await ex.deleteFrom("SyncState").where("key", "=", key).execute();
    return;
  }
  const json = JSON.stringify(value);
  await ex
    .insertInto("SyncState")
    .values({ key, value: json })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: json }))
    .execute();
}

export async function readSend(ex: Executor): Promise<SendState> {
  return (await readState(ex, "send")) ?? { ...DEFAULT_SEND };
}

export async function readReceive(ex: Executor): Promise<ReceiveState> {
  const state = (await readState(ex, "receive")) ?? DEFAULT_RECEIVE;
  return { cursor: state.cursor, origins: { ...state.origins }, skipTxIds: [...(state.skipTxIds ?? [])] };
}

export async function readExchange(ex: Executor): Promise<ExchangeState> {
  return (await readState(ex, "exchange")) ?? { ...DEFAULT_EXCHANGE };
}

// ─── Stored files ────────────────────────────────────────────────────────────

const FILE_PREFIX = "file:";

export async function readFileState(ex: Executor, url: string): Promise<FileState | null> {
  const row = await ex
    .selectFrom("SyncState")
    .select("value")
    .where("key", "=", FILE_PREFIX + url)
    .executeTakeFirst();
  return row ? (JSON.parse(row.value) as FileState) : null;
}

export async function writeFileState(ex: Executor, state: FileState): Promise<void> {
  const json = JSON.stringify(state);
  await ex
    .insertInto("SyncState")
    .values({ key: FILE_PREFIX + state.url, value: json })
    .onConflict((oc) => oc.column("key").doUpdateSet({ value: json }))
    .execute();
}

export async function listFileStates(ex: Executor, stage?: FileStage): Promise<FileState[]> {
  const rows = await ex
    .selectFrom("SyncState")
    .select("value")
    .where("key", ">=", FILE_PREFIX)
    .where("key", "<", "file;")
    .orderBy("key")
    .execute();
  const all = rows.map((row) => JSON.parse(row.value) as FileState);
  return stage ? all.filter((file) => file.stage === stage) : all;
}

// ─── Stable readers for other owners ─────────────────────────────────────────

/** Whether this laptop must take back what the mailbox holds before anyone works (case 7): no number is taken meanwhile. */
export async function catchUpPending(ex: Executor): Promise<boolean> {
  const row = await ex.selectFrom("SyncState").select("key").where("key", "=", "catchUp").executeTakeFirst();
  return row !== undefined;
}

/** Which laptop this was, when the manager took it out of sync; null otherwise. */
export async function leftSync(ex: Executor): Promise<Keys["left"] | null> {
  return readState(ex, "left");
}
