import { sql } from "kysely";

import { fromUtf8, utf8 } from "@/lib/sync/crypto";

import type { Executor } from "@/lib/service/context";

/**
 * What an envelope holds (docs/sync/BUILD.md 2.3): whole transactions, in the
 * order they were written here, as the capture triggers copied them into
 * `SyncOutbox`. Relay compresses and seals these bytes; this file only makes
 * and reads the JSON.
 *
 *     { v: 1, origin, txs: [{ seq, txId, hlc, changes: [{ t, id, op, data }] }], applied: { <deviceId>: <txSeq> } }
 *
 * A transaction too large for one envelope is cut into parts (`part`, `parts`)
 * that the receiving laptop applies together.
 */

export interface RemoteChange {
  t: string;
  id: string;
  op: "I" | "U" | "D";
  data: Record<string, unknown>;
}

export interface RemoteTx {
  /** This laptop's transaction number, from 1, without gaps. */
  seq: number;
  txId: string;
  hlc: string;
  changes: RemoteChange[];
  /** For a transaction cut across envelopes: this part (from 0) and how many. */
  part?: number;
  parts?: number;
}

/** A stored file's bytes, sent beside the envelope that inserts its Upload row. */
export interface FileRef {
  url: string;
  blobId: string;
  keyId: string;
  sha256: string;
  size: number;
  parts: number;
}

export interface Payload {
  v: 1;
  origin: string;
  txs: RemoteTx[];
  /** What the sender had applied of each laptop, by transaction number (for the status: "the other laptop has seen…"). */
  applied: Record<string, number>;
  files?: FileRef[];
}

export function encodePayload(payload: Payload): Uint8Array {
  return utf8(JSON.stringify(payload));
}

export function decodePayload(bytes: Uint8Array): Payload {
  const payload = JSON.parse(fromUtf8(bytes)) as Payload;
  if (payload?.v !== 1 || typeof payload.origin !== "string" || !Array.isArray(payload.txs)) {
    throw new Error("sync: an envelope's payload is not one this program reads");
  }
  return payload;
}

// ─── The outbox ──────────────────────────────────────────────────────────────

export interface OutboxTx {
  txId: string;
  hlc: string;
  /** The outbox rows it spans (inclusive). */
  fromSeq: number;
  toSeq: number;
  changes: RemoteChange[];
}

/**
 * The outbox's whole transactions in order, from `afterSeq`, at most `limit`
 * rows read (a transaction cut by the limit is left for the next read, unless
 * it is the first, which is then read whole).
 */
export async function readOutbox(
  ex: Executor,
  options: { afterSeq?: number; toSeq?: number; limit?: number } = {},
): Promise<OutboxTx[]> {
  const limit = options.limit ?? 5000;
  let rows = await ex
    .selectFrom("SyncOutbox")
    .selectAll()
    .where("seq", ">", options.afterSeq ?? 0)
    .$if(options.toSeq !== undefined, (qb) => qb.where("seq", "<=", options.toSeq!))
    .orderBy("seq")
    .limit(limit + 1)
    .execute();
  if (rows.length > limit) {
    rows = rows.slice(0, limit);
    const lastTx = rows[rows.length - 1].txId;
    const whole = rows.filter((row) => row.txId !== lastTx);
    if (whole.length > 0) rows = whole;
    else {
      // One transaction larger than the limit: read it whole.
      rows = await ex.selectFrom("SyncOutbox").selectAll().where("txId", "=", lastTx).orderBy("seq").execute();
    }
  }
  const txs: OutboxTx[] = [];
  for (const row of rows) {
    let tx = txs[txs.length - 1];
    if (!tx || tx.txId !== row.txId) {
      tx = { txId: row.txId, hlc: row.hlc, fromSeq: row.seq, toSeq: row.seq, changes: [] };
      txs.push(tx);
    }
    tx.toSeq = row.seq;
    tx.changes.push({
      t: row.tbl,
      id: row.rowId,
      op: row.op as RemoteChange["op"],
      data: JSON.parse(row.data) as Record<string, unknown>,
    });
  }
  return txs;
}

export async function outboxTransactionCount(ex: Executor): Promise<number> {
  const { rows } = await sql<{ n: number }>`SELECT COUNT(DISTINCT "txId") AS "n" FROM "SyncOutbox"`.execute(ex);
  return Number(rows[0]?.n ?? 0);
}
