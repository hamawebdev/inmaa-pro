import { sql, type Kysely } from "kysely";

import { createAccount, giveAccountPassword } from "@/features/core/services/users";
import { requireCapability } from "@/lib/access/session";
import type { RoleCode } from "@/lib/access/catalogue";
import { startOwnLogChain } from "@/lib/chain";
import type { Clock } from "@/lib/clock";
import type { DB } from "@/lib/db/schema";
import { logSecurity } from "@/lib/log";
import { buildContext, SYSTEM_SESSION, type Executor, type ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { retireBlocks, startBlocks } from "@/lib/sync/blocks";
import { initBooks, takeBooksFromLostLaptop } from "@/lib/sync/books";
import {
  checkKeyRing,
  newKeyRing,
  newPairingCode,
  openPart,
  openTicket,
  parsePairingCode,
  PART_BYTES,
  partCount,
  randomBytes,
  rotateKeyRing,
  sealForTicket,
  sealPart,
  ticketIdFor,
  TICKET_TTL_SEC,
  toHex,
  type KeyRing,
} from "@/lib/sync/crypto";
import type { RelayClient } from "@/lib/sync/relay";

import type { SyncEnv } from "./exchange";
import { queueAllFiles, type FilesEnv, type SyncFiles } from "./files";
import { mailboxFailureOf, refusalCodeOf } from "./mailbox";
import type { NewAssistantAccount, PairingCodeAnswer } from "./services/types";
import { stampTransaction, unstampTransaction, withStampedTransaction, type SyncDeviceIdentity } from "./session";
import {
  listFileStates,
  readReceive,
  readSend,
  readState,
  writeFileState,
  writeState,
  type OriginState,
} from "./state";

/**
 * A centre on the mailbox, and the laptops in it (DECISION sections 2 and 7):
 * setting sync up on the director's laptop, pairing the second laptop,
 * joining from the first screen, the full copy, starting from a copy, taking
 * a laptop out.
 *
 * The network is reached outside any database transaction, and the database
 * is written in stamped transactions of its own: the window's one connection
 * is never held while the mailbox answers.
 */

/** What the vault holds (native's file outside the database and the backups). */
export interface SyncVaultData {
  centreId: string;
  deviceId: string;
  token: string;
  slot: 0 | 1;
  deviceName: string;
  keyRing: KeyRing;
}

export interface SyncVault {
  read(): Promise<SyncVaultData | null>;
  write(data: SyncVaultData): Promise<void>;
  clear(): Promise<void>;
}

export const SYNC_ERRORS = {
  alreadySetUp: "Sync is already set up on this laptop.",
  notSetUp: "Sync is not set up on this laptop.",
  setupKey: "The mailbox refused this setup key.",
  notMailbox: "No mailbox answers at this address. Check the address the developer gave.",
  offline: "The mailbox cannot be reached. Check the internet connection and try again.",
  limit: "The mailbox has reached its daily limit. Try again after 01:00.",
  full: "The mailbox is full. Ask the developer to free some room.",
  twoLaptops: "The centre already has its two laptops. Remove one first.",
  codeUnknown: "This code is not valid, or was already used, or has expired. Ask for a new code.",
  codeTypo: "This code is mistyped. Check each group of four characters.",
  hasWork: "This laptop already holds work. A laptop joins a centre only when it is freshly installed.",
  noCopy: "The mailbox holds no full copy of the centre yet. Try again in a few minutes.",
  managerRole: "The assistant's account cannot have the manager's role.",
  accountUnknown: "This account does not exist or is not active.",
  deviceUnknown: "This laptop is not part of the centre.",
  deviceThis: "This laptop cannot remove itself. Remove it from the other laptop.",
  reasonRequired: "A reason is required.",
  revoked: "This laptop was removed from the centre.",
} as const;

/** The mailbox's failure in the words of the screens: a ServiceError, or the error itself (a fault). */
export function mailboxError(error: unknown): Error {
  const kind = mailboxFailureOf(error);
  if (kind === null) return error instanceof Error ? error : new Error(String(error));
  const code = refusalCodeOf(error);
  if (kind === "offline") return new ServiceError(SYNC_ERRORS.offline);
  if (kind === "limit") return new ServiceError(SYNC_ERRORS.limit);
  if (kind === "full") return new ServiceError(SYNC_ERRORS.full);
  if (kind === "revoked") return new ServiceError(SYNC_ERRORS.revoked);
  if (code === "SETUP_KEY") return new ServiceError(SYNC_ERRORS.setupKey);
  if (code === "NOT_RELAY" || code === "TRANSPORT") return new ServiceError(SYNC_ERRORS.notMailbox);
  if (code === "TWO_DEVICES") return new ServiceError(SYNC_ERRORS.twoLaptops);
  if (code === "TICKET_UNKNOWN" || code === "TICKET_USED" || code === "TICKET_EXPIRED")
    return new ServiceError(SYNC_ERRORS.codeUnknown);
  return error instanceof Error ? error : new Error(String(error));
}

async function onMailbox<T>(work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw mailboxError(error);
  }
}

// ─── Is sync set up here ─────────────────────────────────────────────────────

export async function deviceIdentity(ex: Executor): Promise<SyncDeviceIdentity | null> {
  return readState(ex, "device");
}

/**
 * Whether this laptop may join a centre: first run done, sync not set up, and
 * nothing typed since first run (no client, file, worker, account but the
 * manager's, invoice…). Read before anybody signs in.
 */
export async function mayJoin(ex: Executor): Promise<boolean> {
  if (await deviceIdentity(ex)) return false;
  const typed = await sql<{ n: number }>`
    SELECT (SELECT COUNT(*) FROM "Client") + (SELECT COUNT(*) FROM "File") + (SELECT COUNT(*) FROM "StaffMember")
         + (SELECT COUNT(*) FROM "Invoice") + (SELECT COUNT(*) FROM "Receipt") + (SELECT COUNT(*) FROM "Visit")
         + (SELECT COUNT(*) FROM "User" WHERE "id" <> 'user-manager') AS "n"`.execute(ex);
  return Number(typed.rows[0]?.n ?? 0) === 0;
}

// ─── Set-up on the director's laptop ─────────────────────────────────────────

export interface CentreEnv {
  db: Kysely<DB>;
  clock: Clock;
  vault: SyncVault;
  files: SyncFiles;
  /** A client without credentials on the mailbox's address; the engine gives it credentials. */
  mailbox: RelayClient;
}

export function envFor(env: CentreEnv, vault: SyncVaultData, anchor: SyncEnv["anchor"] = null): FilesEnv {
  return {
    db: env.db,
    clock: env.clock,
    files: env.files,
    mailbox: env.mailbox.withCredentials({ centreId: vault.centreId, deviceId: vault.deviceId, token: vault.token }),
    centreId: vault.centreId,
    deviceId: vault.deviceId,
    ring: vault.keyRing,
    anchor,
  };
}

/**
 * Sets sync up on this laptop (the director's): the centre on the mailbox, a
 * new key ring in the vault, this laptop as slot 0, the books here, the
 * counters as its starting blocks, its own log chain, capture on, every
 * stored file queued, and a first full copy.
 */
export async function setUpCentre(
  env: CentreEnv,
  ctx: ServiceContext,
  input: { setupKey: string; deviceName: string },
): Promise<SyncVaultData> {
  requireCapability(ctx, "sync.manage");
  if (await deviceIdentity(env.db)) throw new ServiceError(SYNC_ERRORS.alreadySetUp);
  const deviceName = input.deviceName.trim() || "1";
  const joined = await onMailbox(() => env.mailbox.createCentre(input.setupKey.trim(), deviceName));
  const vault: SyncVaultData = {
    centreId: joined.centreId,
    deviceId: joined.deviceId,
    token: joined.token,
    slot: 0,
    deviceName,
    keyRing: await newKeyRing(),
  };
  // The key first: without it nothing on the mailbox can ever be opened again.
  await env.vault.write(vault);
  const offsetMs = Math.round(joined.relayTime - env.clock.now().getTime());
  await env.db.transaction().execute(async (trx) => {
    await startCapture(trx, ctx, vault, offsetMs);
    const stamp = await stampTransaction(trx, ctx);
    await insertDevice(trx, ctx, vault, null);
    await startOwnLogChain(trx, ctx, vault.deviceId);
    await initBooks(trx, ctx, vault.deviceId);
    await startBlocks(trx, ctx, vault.deviceId);
    await queueAllFiles(trx, { ring: vault.keyRing }, "SEND");
    await logSecurity(trx, ctx, {
      owner: "FOUNDATION",
      action: "SETTINGS_CHANGE",
      entity: "SyncDevice",
      entityId: vault.deviceId,
      entityLabel: deviceName,
      context: { sync: "SET_UP", centreId: vault.centreId },
    });
    await unstampTransaction(trx, stamp);
  });
  await makeFullCopy(envFor(env, vault));
  return vault;
}

async function startCapture(
  ex: Executor,
  ctx: ServiceContext,
  vault: SyncVaultData,
  offsetMs: number | null,
): Promise<void> {
  const identity: SyncDeviceIdentity = {
    id: vault.deviceId,
    slot: vault.slot,
    centreId: vault.centreId,
    name: vault.deviceName,
  };
  await writeState(ex, "device", identity);
  if (offsetMs !== null) await writeState(ex, "clock", { offsetMs, measuredAt: ctx.now });
  await ex
    .updateTable("SyncSession")
    .set({ capturing: 1, applying: 0, txId: null })
    .where("id", "=", "session")
    .execute();
  ctx.syncDeviceId = vault.deviceId;
}

async function insertDevice(
  ex: Executor,
  ctx: ServiceContext,
  vault: SyncVaultData,
  replacesDeviceId: string | null,
): Promise<void> {
  await ex
    .insertInto("SyncDevice")
    .values({
      id: vault.deviceId,
      name: vault.deviceName,
      slot: vault.slot,
      joinedAt: ctx.now,
      removedAt: null,
      removedReason: null,
      replacesDeviceId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
    })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();
}

// ─── The full copy ───────────────────────────────────────────────────────────

const COPY_NAME = "full-copy.db";

/** Puts a full copy of this database on the mailbox: at set-up, before a pairing, weekly by the books' holder. */
export async function makeFullCopy(env: FilesEnv): Promise<{ blobId: string; parts: number; covers: number }> {
  // Read before the snapshot: the cursor only moves forward, so the copy holds at least this much.
  const covers = (await readReceive(env.db)).cursor;
  const snapshot = await env.files.snapshot(COPY_NAME);
  const blobId = toHex(randomBytes(32));
  const parts = partCount(snapshot.size);
  let bytes = 0;
  try {
    for (let part = 0; part < parts; part++) {
      const plain = await env.files.readPart(snapshot.path, part * PART_BYTES, PART_BYTES);
      const { sealed } = await sealPart(env.ring, { centreId: env.centreId, blobId, part, parts }, plain);
      bytes += sealed.byteLength;
      await env.mailbox.putPart({ blobId, part, kind: "copy", body: sealed });
    }
    await env.mailbox.putFullCopy({ blobId, parts, bytes, keyId: env.ring.current, covers });
  } finally {
    await env.files.remove(snapshot.path).catch(() => undefined);
  }
  await writeState(env.db, "copy", { at: env.clock.now().toISOString(), blobId, covers });
  return { blobId, parts, covers };
}

/** Downloads the latest full copy into sync-tmp/; each part's seal checks it. Returns its path. */
export async function downloadFullCopy(
  env: Pick<FilesEnv, "mailbox" | "files" | "ring" | "centreId">,
  onProgress?: (done: number, total: number) => void,
): Promise<string> {
  const { copy } = await onMailbox(() => env.mailbox.latestFullCopy());
  if (!copy) throw new ServiceError(SYNC_ERRORS.noCopy);
  const path = `sync-tmp/received-${copy.blobId}.db`;
  await env.files.remove(path).catch(() => undefined);
  for (let part = 0; part < copy.parts; part++) {
    const { body } = await onMailbox(() => env.mailbox.getPart({ blobId: copy.blobId, part }));
    const plain = await openPart(
      env.ring,
      { centreId: env.centreId, blobId: copy.blobId, part, parts: copy.parts, keyId: copy.keyId },
      body,
    );
    await env.files.writePart(path, part * PART_BYTES, plain);
    onProgress?.(part + 1, copy.parts);
  }
  return path;
}

// ─── Pairing the second laptop ───────────────────────────────────────────────

/** What the pairing ticket carries beside the centre key. */
interface TicketExtra {
  accountId: string;
}

/**
 * «إضافة الحاسوب الثاني»: the assistant's account (made here when asked), a
 * fresh full copy that holds it, and the pairing code whose ticket carries
 * the centre key. The code is valid 30 minutes, once.
 */
export async function pairSecondLaptop(
  env: CentreEnv,
  ctx: ServiceContext,
  input: { accountId: string } | { newAccount: NewAssistantAccount },
): Promise<PairingCodeAnswer> {
  requireCapability(ctx, "sync.manage");
  const vault = await env.vault.read();
  if (!vault || !(await deviceIdentity(env.db))) throw new ServiceError(SYNC_ERRORS.notSetUp);
  const accountId = await withStampedTransaction(env.db, ctx, async (ex) => {
    if ("accountId" in input) {
      const account = await ex
        .selectFrom("User")
        .select(["id", "isActive"])
        .where("id", "=", input.accountId)
        .executeTakeFirst();
      if (!account?.isActive) throw new ServiceError(SYNC_ERRORS.accountUnknown);
      return account.id;
    }
    const account = input.newAccount;
    if (account.roleId === "MANAGER") throw new ServiceError(SYNC_ERRORS.managerRole);
    const { id } = await createAccount(ex, ctx, {
      username: account.username,
      displayName: account.displayName,
      roleId: account.roleId as RoleCode,
      staffMemberId: account.staffMemberId ?? null,
      branchId: null,
    });
    await giveAccountPassword(ex, ctx, { userId: id, password: account.password });
    return id;
  });
  const engine = envFor(env, vault);
  const { sendOutbox } = await import("./exchange");
  await onMailbox(() => sendOutbox(engine));
  await onMailbox(() => makeFullCopy(engine));
  const code = newPairingCode();
  const extra: TicketExtra = { accountId };
  const { ticketId, sealed } = await sealForTicket(code, {
    centreId: vault.centreId,
    keyRing: vault.keyRing,
    extra: { ...extra },
  });
  const answer = await onMailbox(() => engine.mailbox.createTicket(ticketId, sealed, TICKET_TTL_SEC));
  const offset = answer.relayTime - env.clock.now().getTime();
  return { code, expiresAt: new Date(answer.expiresAt - offset).toISOString(), accountId };
}

// ─── Joining from the first screen ───────────────────────────────────────────

/** What the program writes beside the copy it installs, and reads at the next start (native's install note). */
export interface InstallNote {
  v: 1;
  /** JOIN: a new laptop; CATCH_UP / REJOIN: this laptop again, after a restore or weeks away. */
  mode: "JOIN" | "CATCH_UP" | "REJOIN";
  deviceId: string;
  slot: 0 | 1;
  deviceName: string;
  centreId: string;
  /** The laptop this one replaces (a lost one), if the centre had removed one in that slot. */
  replacesDeviceId?: string | null;
  /**
   * The mailbox's clock minus this PC's, measured when the copy was fetched: written before the laptop's first
   * stamp, so a PC set a day wrong never stamps a day wrong (a hybrid clock never goes back).
   */
  offsetMs?: number | null;
}

/**
 * Redeems the pairing code: this laptop is in the centre (its token and the
 * key ring in the vault), and the full copy is downloaded. The caller installs
 * the copy (native's `sync_install_copy`) with the note, and the program
 * restarts on it.
 */
export async function redeemAndDownload(
  env: CentreEnv,
  input: { code: string; deviceName: string },
  onProgress?: (phase: "TICKET" | "COPY", done: number, total: number | null) => void,
): Promise<{ path: string; note: InstallNote }> {
  if (!(await mayJoin(env.db))) throw new ServiceError(SYNC_ERRORS.hasWork);
  let code: string;
  try {
    code = parsePairingCode(input.code);
  } catch {
    throw new ServiceError(SYNC_ERRORS.codeTypo);
  }
  onProgress?.("TICKET", 0, 1);
  const deviceName = input.deviceName.trim() || "2";
  const joined = await onMailbox(async () => env.mailbox.redeemTicket(await ticketIdFor(code), deviceName));
  const ticket = await openTicket(code, joined.sealed);
  const vault: SyncVaultData = {
    centreId: joined.centreId,
    deviceId: joined.deviceId,
    token: joined.token,
    slot: joined.slot === 0 ? 0 : 1,
    deviceName,
    keyRing: await checkKeyRing(ticket.keyRing),
  };
  await env.vault.write(vault);
  onProgress?.("TICKET", 1, 1);
  const engine = envFor(env, vault);
  const path = await downloadFullCopy(engine, (done, total) => onProgress?.("COPY", done, total));
  const removed = await onMailbox(() => engine.mailbox.devices());
  const offsetMs = Math.round(removed.relayTime - env.clock.now().getTime());
  const replaced = removed.devices.find((device) => device.slot === vault.slot && device.removedAt !== null);
  return {
    path,
    note: {
      v: 1,
      mode: "JOIN",
      deviceId: vault.deviceId,
      slot: vault.slot,
      deviceName,
      centreId: vault.centreId,
      replacesDeviceId: replaced?.id ?? null,
      offsetMs,
    },
  };
}

/**
 * The first start on a copy just installed: the database becomes this
 * laptop's. The other laptop's local state in it (outbox, held changes,
 * conflicts, backups, its own settings) is cleared; what it had applied and
 * sent becomes where this laptop starts receiving; capture is on under this
 * laptop's identity, with its own log chain. A laptop that is itself again
 * (after a restore) then takes back its own envelopes before anyone works.
 */
export async function finishInstall(db: Kysely<DB>, clock: Clock, note: InstallNote): Promise<void> {
  const ctx = buildContext(SYSTEM_SESSION, clock);
  await db.transaction().execute(async (trx) => {
    const maker = await readState(trx, "device");
    const send = await readSend(trx);
    const receive = await readReceive(trx);
    const outbox = await trx.selectFrom("SyncOutbox").select("txId").distinct().execute();

    // Capture off while the laptop's own state is reset: none of it is shared.
    await trx
      .updateTable("SyncSession")
      .set({ capturing: 0, applying: 0, txId: null })
      .where("id", "=", "session")
      .execute();

    const origins: Record<string, OriginState> = { ...receive.origins };
    // A copy this laptop made itself is a backup of itself: its own outbox and numbering stay as they are.
    const ownCopy = maker?.id === note.deviceId;
    if (maker && !ownCopy) {
      const pending = send.pending;
      origins[maker.id] = {
        env: pending ? pending.envSeq + pending.envCount - 1 : send.nextEnvSeq - 1,
        tx: pending ? pending.firstTxSeq + pending.txCount - 1 : send.nextTxSeq - 1,
        at: origins[maker.id]?.at ?? null,
      };
    }
    const own = origins[note.deviceId];
    delete origins[note.deviceId];
    if (!ownCopy) await trx.deleteFrom("SyncOutbox").execute();
    await trx.deleteFrom("SyncHeld").execute();
    await trx.deleteFrom("SyncConflict").execute();
    await trx.deleteFrom("SyncState").where("key", "in", ["exchange", "catchUp", "copy", "clock"]).execute();
    if (!ownCopy) {
      await writeState(trx, "send", {
        nextEnvSeq: (own?.env ?? 0) + 1,
        nextTxSeq: (own?.tx ?? 0) + 1,
        pending: null,
      });
    }
    await writeState(trx, "receive", {
      cursor: receive.cursor,
      origins: own ? { ...origins, [note.deviceId]: own } : origins,
      skipTxIds: ownCopy ? receive.skipTxIds : [...new Set([...receive.skipTxIds, ...outbox.map((row) => row.txId)])],
    });
    // Every stored file is fetched (those already on this disk are found there).
    for (const file of await listFileStates(trx)) await writeFileState(trx, { ...file, stage: "FETCH" });
    // This laptop's own settings and backups start empty.
    await trx
      .deleteFrom("Setting")
      .where((eb) =>
        eb.or([
          eb("key", "like", "backup.%"),
          eb("key", "like", "system.dayStart%"),
          eb("key", "like", "system.alertsNotified%"),
        ]),
      )
      .execute();
    await sql`DELETE FROM "BackupRun"`.execute(trx).catch(() => undefined);
    await trx.updateTable("User").set({ failedSignInCount: 0, lastSignInAt: null }).execute();

    const vault: SyncVaultData = {
      centreId: note.centreId,
      deviceId: note.deviceId,
      token: "",
      slot: note.slot,
      deviceName: note.deviceName,
      keyRing: { current: "", keys: {} },
    };
    await startCapture(trx, ctx, vault, note.offsetMs ?? null);
    if (note.mode !== "JOIN") {
      await writeState(trx, "catchUp", {
        reason: note.mode === "CATCH_UP" ? "RESTORED" : "BEHIND",
        since: ctx.now,
        done: 0,
        total: null,
      });
    }
    const stamp = await stampTransaction(trx, ctx);
    await startOwnLogChain(trx, ctx, note.deviceId);
    if (note.mode === "JOIN") {
      await insertDevice(trx, ctx, vault, note.replacesDeviceId ?? null);
      await logSecurity(trx, ctx, {
        owner: "FOUNDATION",
        action: "SETTINGS_CHANGE",
        entity: "SyncDevice",
        entityId: note.deviceId,
        entityLabel: note.deviceName,
        context: { sync: "JOINED", centreId: note.centreId },
      });
    }
    await unstampTransaction(trx, stamp);
  });
}

// ─── Removing a laptop ───────────────────────────────────────────────────────

/**
 * The manager removes the other laptop (lost, broken, replaced), with her
 * reason: its token revoked, the centre key replaced (the new ring saved
 * first), the laptop marked removed, and the books taken from it when it held
 * them, the last numbers seen on paper declared.
 */
export async function removeOtherLaptop(
  env: CentreEnv,
  ctx: ServiceContext,
  input: { deviceId: string; reason: string; lastInvoice?: number | null; lastReceipt?: number | null },
): Promise<void> {
  requireCapability(ctx, "sync.manage");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError(SYNC_ERRORS.reasonRequired);
  const vault = await env.vault.read();
  const identity = await deviceIdentity(env.db);
  if (!vault || !identity) throw new ServiceError(SYNC_ERRORS.notSetUp);
  if (input.deviceId === identity.id) throw new ServiceError(SYNC_ERRORS.deviceThis);
  const engine = envFor(env, vault);
  let device = await env.db
    .selectFrom("SyncDevice")
    .select(["id", "name", "slot", "joinedAt", "removedAt"])
    .where("id", "=", input.deviceId)
    .executeTakeFirst();
  if (!device) {
    // A laptop lost before its first exchange: the mailbox knows it, this database not yet.
    const known = (await onMailbox(() => engine.mailbox.devices())).devices.find((d) => d.id === input.deviceId);
    if (!known) throw new ServiceError(SYNC_ERRORS.deviceUnknown);
    device = {
      id: known.id,
      name: known.name,
      slot: known.slot,
      joinedAt: new Date(known.joinedAt).toISOString(),
      removedAt: null,
    };
  }

  await onMailbox(() => engine.mailbox.removeDevice(input.deviceId));
  const ring = await rotateKeyRing(vault.keyRing);
  await env.vault.write({ ...vault, keyRing: ring });
  await onMailbox(() => engine.mailbox.rotateKey(ring.current));

  const lost = device;
  await withStampedTransaction(env.db, ctx, async (ex) => {
    await ex
      .insertInto("SyncDevice")
      .values({
        id: lost.id,
        name: lost.name,
        slot: lost.slot,
        joinedAt: lost.joinedAt,
        removedAt: ctx.now,
        removedReason: reason,
        replacesDeviceId: null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .execute();
    if (!lost.removedAt) {
      await ex
        .updateTable("SyncDevice")
        .set({ removedAt: ctx.now, removedReason: reason, updatedAt: ctx.now })
        .where("id", "=", input.deviceId)
        .where("removedAt", "is", null)
        .execute();
    }
    await retireBlocks(ex, ctx, input.deviceId);
    const books = await ex
      .selectFrom("SyncBooks")
      .select("holderDeviceId")
      .where("id", "=", "books")
      .executeTakeFirst();
    if (books?.holderDeviceId === input.deviceId) {
      await takeBooksFromLostLaptop(ex, ctx, {
        deviceId: input.deviceId,
        lastInvoice: input.lastInvoice ?? null,
        lastReceipt: input.lastReceipt ?? null,
        reason,
      });
    }
    await logSecurity(ex, ctx, {
      owner: "FOUNDATION",
      action: "STATUS_CHANGE",
      reason,
      entity: "SyncDevice",
      entityId: input.deviceId,
      entityLabel: lost.name,
      context: { sync: "REMOVED" },
    });
  });
}

/**
 * The manager takes this laptop out of sync (a restored laptop that cannot
 * reach the mailbox, or one leaving the centre): capture off, its sync state
 * and the vault cleared. Its data stays as it is.
 */
export async function leaveCentre(env: CentreEnv, ctx: ServiceContext, input: { reason: string }): Promise<void> {
  requireCapability(ctx, "sync.manage");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError(SYNC_ERRORS.reasonRequired);
  await withStampedTransaction(env.db, ctx, async (ex) => {
    await logSecurity(ex, ctx, {
      owner: "FOUNDATION",
      action: "STATUS_CHANGE",
      reason,
      entity: "SyncDevice",
      entityId: ctx.syncDeviceId ?? "none",
      context: { sync: "LEFT" },
    });
  });
  await env.db.transaction().execute(async (trx) => {
    const identity = await readState(trx, "device");
    await trx
      .updateTable("SyncSession")
      .set({ capturing: 0, applying: 0, txId: null })
      .where("id", "=", "session")
      .execute();
    await trx.deleteFrom("SyncOutbox").execute();
    await trx.deleteFrom("SyncState").execute();
    // Which laptop this was: ledger keeps its books state by it (it never issues again until it rejoins).
    if (identity) await writeState(trx, "left", { deviceId: identity.id, slot: identity.slot, leftAt: ctx.now });
  });
  await env.vault.clear();
}

// ─── Starting again from the full copy ───────────────────────────────────────

/**
 * Case 8: the vault says this laptop is in a centre, but its database knows
 * nothing of it (a backup from before sync was set up was restored). It is no
 * longer in sync: it offers to join again from the full copy.
 */
export async function detectRejoin(db: Executor, vault: SyncVault): Promise<boolean> {
  const data = await vault.read();
  if (!data) return false;
  return (await deviceIdentity(db)) === null;
}

/**
 * Downloads the full copy for this same laptop (its id, slot and key ring
 * kept): case 8, and case 7 when the mailbox no longer holds what it needs.
 * The caller installs it with the note; at the next start `finishInstall`
 * resets the database to this laptop and the loop takes back its own
 * envelopes the copy does not hold, then the other laptop's.
 */
export async function downloadForRejoin(
  env: CentreEnv,
  mode: "CATCH_UP" | "REJOIN",
  onProgress?: (done: number, total: number) => void,
): Promise<{ path: string; note: InstallNote }> {
  const vault = await env.vault.read();
  if (!vault) throw new ServiceError(SYNC_ERRORS.notSetUp);
  const engine = envFor(env, vault);
  const path = await downloadFullCopy(engine, onProgress);
  const { relayTime } = await onMailbox(() => engine.mailbox.time());
  return {
    path,
    note: {
      v: 1,
      offsetMs: Math.round(relayTime - env.clock.now().getTime()),
      mode,
      deviceId: vault.deviceId,
      slot: vault.slot,
      deviceName: vault.deviceName,
      centreId: vault.centreId,
    },
  };
}
