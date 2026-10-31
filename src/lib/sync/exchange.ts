import type { Kysely } from "kysely";

import { writeAnchor, type AnchorStore } from "@/lib/chain/anchor";
import type { Clock } from "@/lib/clock";
import type { DB } from "@/lib/db/schema";
import { buildContext, SYSTEM_SESSION, type Executor, type ServiceContext } from "@/lib/service/context";
import {
  equalBytes,
  fromHex,
  MAX_ENVELOPE_BYTES,
  openEnvelope,
  partCount,
  sealEnvelope,
  fileBlobId,
  type KeyRing,
} from "@/lib/sync/crypto";

import { applyChange, beginApplying, emptyOutcome, endApplying, foldTransaction, type ApplyOutcome } from "./apply";
import { hlcInstant } from "./hlc";
import { mailboxFailureOf, type MailboxClient, type MailboxEnvelope } from "./mailbox";
import {
  decodePayload,
  encodePayload,
  readOutbox,
  type FileRef,
  type OutboxTx,
  type Payload,
  type RemoteTx,
} from "./payload";
import {
  readReceive,
  readSend,
  readState,
  writeFileState,
  writeState,
  type PendingSend,
  type ReceiveState,
} from "./state";

/**
 * Sending and receiving (docs/sync/DECISION.md section 6, steps 2 to 4).
 *
 * Send: the outbox's whole transactions, in order, numbered, packed into
 * envelopes under 1.5 MB, sealed by relay's crypto and put on the mailbox. The
 * batch is written down (`SyncState.send.pending`) before the first put, so a
 * cut and a resend carry the same transactions under the same numbers; the
 * outbox is pruned only once the mailbox stored every envelope of the batch.
 *
 * Receive: the envelopes after this laptop's cursor, in the mailbox's order;
 * each one's seal and number checked (a gap waits for the missing envelope);
 * each transaction applied in one database transaction together with the
 * cursor, so a power cut leaves it applied whole or not at all.
 */

export interface SyncEnv {
  db: Kysely<DB>;
  clock: Clock;
  mailbox: MailboxClient;
  centreId: string;
  deviceId: string;
  ring: KeyRing;
  /** The anchor kept outside the database, rewritten after applied rows joined a chain. Null keeps none. */
  anchor: AnchorStore | null;
}

/** This laptop sent an envelope the mailbox already holds with other content: it was restored from a backup. */
export class RestoredDatabase extends Error {
  constructor() {
    super("sync: the mailbox holds envelopes of this laptop that this database never sent");
    this.name = "RestoredDatabase";
  }
}

/** The mailbox no longer holds what this laptop has not applied: it starts again from the full copy. */
export class BehindMailbox extends Error {
  constructor() {
    super("sync: the mailbox collected envelopes this laptop never applied");
    this.name = "BehindMailbox";
  }
}

export function syncContext(env: Pick<SyncEnv, "clock" | "deviceId">): ServiceContext {
  const ctx = buildContext(SYSTEM_SESSION, env.clock);
  ctx.syncDeviceId = env.deviceId;
  return ctx;
}

/** The mailbox's clock minus this PC's, kept for the stamps and the status. */
export async function measureClock(env: Pick<SyncEnv, "db" | "clock">, relayTime: number): Promise<number> {
  const offsetMs = Math.round(relayTime - env.clock.now().getTime());
  await writeState(env.db, "clock", { offsetMs, measuredAt: env.clock.now().toISOString() });
  return offsetMs;
}

// ─── Sending ─────────────────────────────────────────────────────────────────

/** How many outbox rows one batch reads at most. */
const BATCH_ROWS = 5000;

interface Envelope {
  seq: number;
  payload: Uint8Array;
}

/** Cuts a batch into envelopes whose sealed size is under the limit. Deterministic: a resend cuts the same way. */
async function cutEnvelopes(
  env: SyncEnv,
  txs: RemoteTx[],
  files: FileRef[],
  applied: Record<string, number>,
  firstEnvSeq: number,
): Promise<Envelope[]> {
  const out: Envelope[] = [];
  const fits = async (payload: Uint8Array, seq: number) => {
    const { sealed } = await sealEnvelope(
      env.ring,
      { centreId: env.centreId, deviceId: env.deviceId, seq, kind: "tx" },
      payload,
    );
    return sealed.byteLength <= MAX_ENVELOPE_BYTES;
  };
  const filesOf = (group: RemoteTx[]) => {
    const urls = new Set(
      group.flatMap((tx) => tx.changes.filter((c) => c.t === "Upload" && c.op === "I").map((c) => String(c.data.url))),
    );
    const mine = files.filter((file) => urls.has(file.url));
    return mine.length > 0 ? mine : undefined;
  };
  const make = (group: RemoteTx[]): Payload => ({
    v: 1,
    origin: env.deviceId,
    txs: group,
    applied,
    files: filesOf(group),
  });

  async function place(group: RemoteTx[]): Promise<void> {
    const seq = firstEnvSeq + out.length;
    const payload = encodePayload(make(group));
    if (await fits(payload, seq)) {
      out.push({ seq, payload });
      return;
    }
    if (group.length > 1) {
      const half = Math.ceil(group.length / 2);
      await place(group.slice(0, half));
      await place(group.slice(half));
      return;
    }
    // One transaction larger than an envelope: cut its changes into parts applied together.
    const tx = group[0];
    for (let parts = 2; parts <= tx.changes.length; parts *= 2) {
      const size = Math.ceil(tx.changes.length / parts);
      const pieces: Envelope[] = [];
      let ok = true;
      const count = Math.ceil(tx.changes.length / size);
      for (let part = 0; part < count; part++) {
        const piece: RemoteTx = {
          ...tx,
          changes: tx.changes.slice(part * size, (part + 1) * size),
          part,
          parts: count,
        };
        const pieceSeq = firstEnvSeq + out.length + part;
        const payload = encodePayload(make([piece]));
        if (!(await fits(payload, pieceSeq))) {
          ok = false;
          break;
        }
        pieces.push({ seq: pieceSeq, payload });
      }
      if (ok) {
        out.push(...pieces);
        return;
      }
    }
    throw new Error("sync: one change is larger than an envelope");
  }

  await place(txs);
  return out;
}

async function fileRefs(env: SyncEnv, txs: OutboxTx[]): Promise<FileRef[]> {
  const refs: FileRef[] = [];
  for (const tx of txs) {
    for (const change of tx.changes) {
      if (change.t !== "Upload" || change.op !== "I") continue;
      const sha256 = String(change.data.sha256 ?? "");
      if (!/^[0-9a-f]{64}$/.test(sha256)) continue;
      const size = Number(change.data.sizeBytes ?? 0);
      refs.push({
        url: String(change.data.url),
        blobId: await fileBlobId(env.ring, fromHex(sha256)),
        keyId: env.ring.current,
        sha256,
        size,
        parts: partCount(size),
      });
    }
  }
  return refs;
}

export interface SendResult {
  envelopes: number;
  transactions: number;
  relayTime: number | null;
}

/** Sends everything the outbox holds, batch after batch. Throws the mailbox's failures. */
export async function sendOutbox(env: SyncEnv, options: { maxBatches?: number } = {}): Promise<SendResult> {
  const result: SendResult = { envelopes: 0, transactions: 0, relayTime: null };
  for (let batch = 0; batch < (options.maxBatches ?? 50); batch++) {
    const sent = await sendBatch(env);
    if (!sent) break;
    result.envelopes += sent.envelopes;
    result.transactions += sent.transactions;
    result.relayTime = sent.relayTime;
  }
  return result;
}

async function sendBatch(env: SyncEnv): Promise<{ envelopes: number; transactions: number; relayTime: number } | null> {
  const state = await readSend(env.db);
  let plan: PendingSend;
  let txs: OutboxTx[];
  if (state.pending) {
    plan = state.pending;
    txs = await readOutbox(env.db, { afterSeq: plan.fromSeq - 1, toSeq: plan.toSeq, limit: Number.MAX_SAFE_INTEGER });
  } else {
    txs = await readOutbox(env.db, { limit: BATCH_ROWS });
    if (txs.length === 0) return null;
    plan = {
      envSeq: state.nextEnvSeq,
      envCount: 0,
      fromSeq: txs[0].fromSeq,
      toSeq: txs[txs.length - 1].toSeq,
      firstTxSeq: state.nextTxSeq,
      txCount: txs.length,
    };
  }
  const remote: RemoteTx[] = txs.map((tx, i) => ({
    seq: plan.firstTxSeq + i,
    txId: tx.txId,
    hlc: tx.hlc,
    changes: tx.changes,
  }));
  const receive = await readReceive(env.db);
  const applied = Object.fromEntries(Object.entries(receive.origins).map(([id, origin]) => [id, origin.tx]));
  const files = await fileRefs(env, txs);
  const envelopes = await cutEnvelopes(env, remote, files, applied, plan.envSeq);
  if (!state.pending || state.pending.envCount !== envelopes.length) {
    plan = { ...plan, envCount: envelopes.length };
    // Written down before the first put: a cut and a resend carry the same transactions under the same numbers.
    await writeState(env.db, "send", { ...state, pending: plan });
  }

  let relayTime = 0;
  for (const envelope of envelopes) {
    relayTime = await putOnce(env, envelope);
  }

  // Every envelope is on the mailbox: the outbox gives the batch up, in one transaction.
  await env.db.transaction().execute(async (trx) => {
    await trx.deleteFrom("SyncOutbox").where("seq", "<=", plan.toSeq).execute();
    for (const file of files) {
      await writeFileState(trx, { ...file, stage: "SEND" });
    }
    await writeState(trx, "send", {
      nextEnvSeq: plan.envSeq + plan.envCount,
      nextTxSeq: plan.firstTxSeq + plan.txCount,
      pending: null,
    });
  });
  return { envelopes: envelopes.length, transactions: plan.txCount, relayTime };
}

async function putOnce(env: SyncEnv, envelope: Envelope): Promise<number> {
  const { keyId, sealed } = await sealEnvelope(
    env.ring,
    { centreId: env.centreId, deviceId: env.deviceId, seq: envelope.seq, kind: "tx" },
    envelope.payload,
  );
  try {
    const answer = await env.mailbox.putEnvelope({ seq: envelope.seq, keyId, kind: "tx", body: sealed });
    return answer.relayTime;
  } catch (error) {
    if (mailboxFailureOf(error) !== "conflict") throw error;
    // The mailbox has this number already: stored before a cut lost its answer, or put by this laptop before a restore.
    const stored = await env.mailbox.getEnvelope({ deviceId: env.deviceId, seq: envelope.seq });
    const payload = await openEnvelope(
      env.ring,
      { centreId: env.centreId, deviceId: env.deviceId, seq: envelope.seq, keyId: stored.keyId, kind: stored.kind },
      stored.body,
    );
    if (!equalBytes(payload, envelope.payload)) throw new RestoredDatabase();
    return stored.relayTime;
  }
}

// ─── Receiving ───────────────────────────────────────────────────────────────

export interface ReceiveResult {
  outcome: ApplyOutcome;
  transactions: number;
  /** A gap: an envelope of a laptop is missing; the rest waits. */
  waiting: boolean;
  relayTime: number | null;
  /** Catching up: this laptop's own transactions met on the mailbox. */
  ownTxIds: string[];
  ownMaxTx: number;
}

/** Envelopes listed at once. */
const PAGE = 50;

/**
 * Applies the envelopes after the cursor. With `includeOwn` (catching up after
 * a restore), this laptop's own envelopes that the database does not hold are
 * applied too, in the mailbox's order with the other laptop's.
 */
export async function receiveEnvelopes(
  env: SyncEnv,
  options: { includeOwn?: boolean; onProgress?: (done: number, total: number | null) => void } = {},
): Promise<ReceiveResult> {
  const result: ReceiveResult = {
    outcome: emptyOutcome(),
    transactions: 0,
    waiting: false,
    relayTime: null,
    ownTxIds: [],
    ownMaxTx: 0,
  };
  let state = await readReceive(env.db);
  if (options.includeOwn) state = await withOwnOrigin(env, state);

  for (;;) {
    const page = await env.mailbox.listEnvelopes({ after: state.cursor, limit: PAGE });
    result.relayTime = page.relayTime;
    if (page.behind) throw new BehindMailbox();
    const listed = page.envelopes;
    let advanced = false;
    for (let i = 0; i < listed.length; i++) {
      const envelope = listed[i];
      const own = envelope.deviceId === env.deviceId;
      if ((own && !options.includeOwn) || envelope.kind !== "tx") {
        state = await advanceCursor(env, state, envelope.mseq);
        advanced = true;
        continue;
      }
      const origin = state.origins[envelope.deviceId] ?? { env: 0, tx: 0, at: null };
      if (envelope.seq <= origin.env) {
        state = await advanceCursor(env, state, envelope.mseq);
        advanced = true;
        continue;
      }
      if (envelope.seq > origin.env + 1) {
        result.waiting = true;
        return finish(env, result, state);
      }
      const payload = await openPayload(env, envelope);
      const applied = await applyEnvelope(env, state, envelope, payload, listed.slice(i + 1), result);
      if (applied === null) {
        result.waiting = true;
        return finish(env, result, state);
      }
      state = applied;
      advanced = true;
      options.onProgress?.(result.transactions, null);
    }
    if (!page.more || (!advanced && listed.length === 0)) break;
  }
  return finish(env, result, state);
}

async function finish(env: SyncEnv, result: ReceiveResult, state: ReceiveState): Promise<ReceiveResult> {
  await writeState(env.db, "receive", state);
  return result;
}

async function advanceCursor(env: SyncEnv, state: ReceiveState, mseq: number): Promise<ReceiveState> {
  const next = { ...state, cursor: Math.max(state.cursor, mseq) };
  await writeState(env.db, "receive", next);
  return next;
}

/** Catching up: this laptop's own transactions the database holds are those it numbered, or holds unsent. */
async function withOwnOrigin(env: SyncEnv, state: ReceiveState): Promise<ReceiveState> {
  const send = await readSend(env.db);
  const pending = send.pending;
  const envDone = pending ? pending.envSeq + pending.envCount - 1 : send.nextEnvSeq - 1;
  const txDone = pending ? pending.firstTxSeq + pending.txCount - 1 : send.nextTxSeq - 1;
  const outbox = await env.db.selectFrom("SyncOutbox").select("txId").distinct().execute();
  const known = state.origins[env.deviceId];
  return {
    ...state,
    origins: {
      ...state.origins,
      [env.deviceId]: {
        env: Math.max(envDone, known?.env ?? 0),
        tx: Math.max(txDone, known?.tx ?? 0),
        at: known?.at ?? null,
      },
    },
    skipTxIds: [...new Set([...state.skipTxIds, ...outbox.map((row) => row.txId)])],
  };
}

async function openPayload(env: SyncEnv, envelope: MailboxEnvelope): Promise<Payload> {
  const bytes = await openEnvelope(
    env.ring,
    {
      centreId: env.centreId,
      deviceId: envelope.deviceId,
      seq: envelope.seq,
      keyId: envelope.keyId,
      kind: envelope.kind,
    },
    envelope.body,
  );
  const payload = decodePayload(bytes);
  if (payload.origin !== envelope.deviceId) throw new Error("sync: an envelope's payload names another laptop");
  return payload;
}

/**
 * Applies one envelope's transactions, each in its own database transaction
 * with the cursor. Returns the new state, or null when a transaction cut
 * across envelopes is not whole yet.
 */
async function applyEnvelope(
  env: SyncEnv,
  start: ReceiveState,
  envelope: MailboxEnvelope,
  payload: Payload,
  following: MailboxEnvelope[],
  result: ReceiveResult,
): Promise<ReceiveState | null> {
  let state = start;
  const origin = envelope.deviceId;
  let lastEnv = envelope.seq;
  let txs = payload.txs;
  let files = payload.files ?? [];

  // A transaction cut across envelopes: gather its parts from the following envelopes of the same laptop.
  const cut = txs.find((tx) => (tx.parts ?? 1) > 1);
  if (cut) {
    const parts: RemoteTx[] = [cut];
    const mine = following.filter((next) => next.deviceId === origin && next.kind === "tx");
    for (let part = 1; part < (cut.parts ?? 1); part++) {
      const next = mine.find((candidate) => candidate.seq === envelope.seq + part);
      if (!next) return null;
      const more = await openPayload(env, next);
      parts.push(...more.txs.filter((tx) => tx.txId === cut.txId));
      files = [...files, ...(more.files ?? [])];
      lastEnv = next.seq;
    }
    parts.sort((a, b) => (a.part ?? 0) - (b.part ?? 0));
    txs = [{ seq: cut.seq, txId: cut.txId, hlc: cut.hlc, changes: parts.flatMap((part) => part.changes) }];
  }

  const already = state.origins[origin] ?? { env: 0, tx: 0, at: null };
  const pending = txs.filter((tx) => tx.seq > already.tx);
  if (pending.length > 0 && pending[0].seq !== already.tx + 1) {
    throw new Error(`sync: transaction ${pending[0].seq} of ${origin} arrived after ${already.tx}`);
  }
  for (let i = 0; i < txs.length; i++) {
    const tx = txs[i];
    const last = i === txs.length - 1;
    if (tx.seq <= already.tx && !last) continue;
    if (origin === env.deviceId) {
      result.ownTxIds.push(tx.txId);
      result.ownMaxTx = Math.max(result.ownMaxTx, tx.seq);
    }
    const skip = tx.seq <= (state.origins[origin]?.tx ?? 0) || state.skipTxIds.includes(tx.txId);
    const next: ReceiveState = {
      cursor: last ? Math.max(state.cursor, envelope.mseq) : state.cursor,
      origins: {
        ...state.origins,
        [origin]: {
          env: last ? lastEnv : lastEnv - 1,
          tx: Math.max(tx.seq, state.origins[origin]?.tx ?? 0),
          at: hlcInstant(tx.hlc) ?? state.origins[origin]?.at ?? null,
        },
      },
      skipTxIds: state.skipTxIds.filter((id) => id !== tx.txId),
    };
    if (skip) {
      await writeState(env.db, "receive", next);
    } else {
      await applyRemoteTransaction(env, origin, tx, next, files, result.outcome);
      result.transactions += 1;
    }
    state = next;
  }
  if (txs.length === 0) state = await advanceCursor(env, { ...state }, envelope.mseq);
  return state;
}

/** One remote transaction and the cursor after it, in one database transaction. */
export async function applyRemoteTransaction(
  env: Pick<SyncEnv, "db" | "clock" | "deviceId" | "anchor">,
  origin: string,
  tx: RemoteTx,
  cursor: ReceiveState,
  files: FileRef[],
  outcome: ApplyOutcome,
): Promise<void> {
  const ctx = syncContext(env);
  await env.db.transaction().execute(async (trx) => {
    await trx.updateTable("SyncSession").set({ txId: null }).where("id", "=", "session").execute();
    await beginApplying(trx, tx.hlc);
    const changes = foldTransaction(tx.changes);
    for (let index = 0; index < changes.length; index++) {
      await applyChange(trx, ctx, { deviceId: origin, txSeq: tx.seq, hlc: tx.hlc, index }, changes[index], outcome);
    }
    await endApplying(trx);
    await rememberFiles(trx, outcome, files);
    await writeState(trx, "receive", cursor);
  });
  await anchorAfterApply(env, ctx);
}

/** The bytes of every Upload row applied here are fetched later (`files.ts`). */
async function rememberFiles(ex: Executor, outcome: ApplyOutcome, files: FileRef[]): Promise<void> {
  while (outcome.uploads.length > 0) {
    const row = outcome.uploads.shift()!;
    const ref = files.find((file) => file.url === row.url);
    if (!ref) continue; // a file sent before the blob reference existed: found again by the full scan (files.ts)
    await writeFileState(ex, { ...ref, stage: "FETCH" });
  }
}

export async function anchorAfterApply(env: Pick<SyncEnv, "db" | "anchor">, ctx: ServiceContext): Promise<void> {
  if (!env.anchor || ctx.touchedChains.size === 0) return;
  try {
    await writeAnchor(env.db, env.anchor, ctx.now);
  } catch (error) {
    // Committed; a missed anchor is found "ahead" and repaired at the next start.
    console.error("anchor: write after sync failed", error);
  }
}

/** Whether the mailbox has envelopes of this laptop that this database never sent: it was restored. */
export async function restoredBehindMailbox(env: SyncEnv): Promise<{ restored: boolean; relayTime: number }> {
  const answer = await env.mailbox.devices();
  const me = answer.devices.find((device) => device.id === env.deviceId);
  const send = await readSend(env.db);
  const known = send.pending ? send.pending.envSeq + send.pending.envCount - 1 : send.nextEnvSeq - 1;
  return { restored: (me?.lastSeq ?? 0) > known, relayTime: answer.relayTime };
}

/**
 * After catching up: this laptop numbers on after what the mailbox holds of
 * it, and gives up the outbox transactions the mailbox already had; those it
 * never had stay, to be sent under the next numbers.
 */
export async function settleAfterCatchUp(env: SyncEnv, caughtUp: ReceiveResult): Promise<void> {
  const answer = await env.mailbox.devices();
  const me = answer.devices.find((device) => device.id === env.deviceId);
  const met = new Set(caughtUp.ownTxIds);
  await env.db.transaction().execute(async (trx) => {
    const send = await readSend(trx);
    const receive = await readReceive(trx);
    const own = receive.origins[env.deviceId];
    if (met.size > 0)
      await trx
        .deleteFrom("SyncOutbox")
        .where("txId", "in", [...met])
        .execute();
    const unsent = new Set((await trx.selectFrom("SyncOutbox").select("txId").distinct().execute()).map((r) => r.txId));
    const lastSeq = me?.lastSeq ?? 0;
    const stored = send.pending !== null && lastSeq >= send.pending.envSeq;
    await writeState(trx, "send", {
      nextEnvSeq: Math.max(stored ? send.pending!.envSeq + send.pending!.envCount : send.nextEnvSeq, lastSeq + 1),
      nextTxSeq: Math.max(
        stored ? send.pending!.firstTxSeq + send.pending!.txCount : send.nextTxSeq,
        (own?.tx ?? 0) + 1,
        caughtUp.ownMaxTx + 1,
      ),
      pending: stored ? null : send.pending,
    });
    const origins = { ...receive.origins };
    delete origins[env.deviceId];
    await writeState(trx, "receive", {
      ...receive,
      origins,
      skipTxIds: receive.skipTxIds.filter((txId) => !unsent.has(txId)),
    });
    await writeState(trx, "catchUp", null);
  });
}

export { readState };
