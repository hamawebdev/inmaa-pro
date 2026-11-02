/**
 * One centre's mailbox: a SQLite-backed Durable Object, so every request of a centre is served one at a time.
 *
 * It holds sealed envelopes it cannot open, in the order it received them (`mseq`, its own sequence), with the
 * devices' acknowledgements (two laptops and the director's phone at most), the full copies, the key rotations, and the index of file parts (the bytes are in the
 * part shards, parts.ts). It never parses a payload: every request is a few indexed statements, far under
 * Cloudflare's 10 ms of CPU.
 *
 * Every handler does its awaiting (reading the body, hashing, calling a shard) before or after its statements,
 * never between two of them that depend on each other, and writes inside `transactionSync`: Durable Objects let
 * another request in while one awaits anything but storage. What a handler read before an await (the device's row)
 * is read again inside its transaction when a write depends on it.
 *
 * The centre key's chain (`GET /keys`): every replacement of the centre key, in order, from the key it replaced to
 * the new one. A device that meets a key it does not hold follows this chain and nothing else (src/lib/sync/
 * rotation.ts), so a part left by anybody under another name is never taken for the new key. A link may be added
 * only while a replacement is owed (a device was removed since the last one), by any active laptop (the removal
 * may be started on one laptop and finished on the other; a removed device's token is refused, a phone may not, and
 * with nothing owed nobody can change the key at will); it must start from the key in force, and a key once
 * replaced never comes back. Each removed device records the key that answered its removal (`keyAfter`).
 *
 * A device that joined and never used its token within `GHOST_AFTER_MS` (the redeem's answer was lost: the device
 * never got its token) is a ghost: it does not hold a slot against the next pairing, and collection does not wait
 * for its acknowledgement. The next device of its kind to join takes its slot, and its row is deleted (it never sent
 * anything, so nothing refers to it).
 *
 * Routes (the Worker strips `/v1/centres/:centreId`; all but the first two need the device's bearer token):
 *   POST   /create                       internal: the first device, after the setup key was checked
 *   POST   /join                         internal: a device, after its ticket was claimed
 *   POST   /tickets/:ticketId?ttl=&kind= file a pairing ticket for a LAPTOP or the PHONE (body: sealed bytes)
 *   PUT    /envelopes/:seq?key=&kind=    store an envelope (idempotent on identical bytes)
 *   GET    /envelopes?after=&limit=      a page of envelopes, every device's, by mseq (frames.ts)
 *   GET    /envelopes/by-device/:id/:seq one envelope
 *   POST   /ack?upTo=                    this device has applied up to that mseq
 *   PUT    /parts/:blobId/:part?kind=    store a part (file | copy | key); the same id with other bytes is 409
 *   GET    /parts/:blobId/:part
 *   GET    /blobs/:blobId                which parts of a blob are stored
 *   DELETE /blobs/:blobId                (not the current full copy's, nor a key part)
 *   POST   /full-copies                  record a full copy whose parts are stored, reaching what is kept
 *   GET    /full-copies/latest
 *   GET    /devices
 *   DELETE /devices/:deviceId            revoke a device's token (a laptop only); voids the centre's unused tickets
 *   GET    /keys                         the key in force and the chain of replacements
 *   POST   /keys/:keyId?from=&blob=      the centre key was replaced (by a laptop, while a replacement is owed)
 *   GET    /usage
 */
import type { DurableObjectState, Env, SqlStorage } from "./cf";
import { encodeFrames, type EnvelopeHead } from "./frames";
import { TICKET_MAX_TTL_SEC, TICKET_MIN_TTL_SEC } from "./directory";
import {
  bytes,
  HEX_ID,
  intParam,
  isDeviceKind,
  json,
  limited,
  now,
  randomHex,
  readBody,
  readJson,
  refuse,
  sha256Hex,
  STATUS,
  type DeviceKind,
} from "./http";
import { shardName, shardOf } from "./parts";

/** Active devices of each kind a centre may have, and their slots (docs/phone/DECISION.md section 2). */
export const MAX_ACTIVE: Record<DeviceKind, number> = { LAPTOP: 2, PHONE: 1 };
export const SLOTS: Record<DeviceKind, readonly number[]> = { LAPTOP: [0, 1], PHONE: [2] };
/** What a centre full of one kind answers: `TWO_DEVICES` (1.1.0's code, kept for the laptops) or `PHONE_TAKEN`. */
const FULL_CODE: Record<DeviceKind, string> = { LAPTOP: "TWO_DEVICES", PHONE: "PHONE_TAKEN" };
/** Envelopes are cut below 1.5 MB by the laptops; a SQLite row holds 2 MB. */
export const MAX_ENVELOPE_BYTES = 1_900_000;
/** Parts are 1 MiB plain, plus the seal. */
export const MAX_PART_BYTES = 1_100_000;
/** What one listing returns at most, in bytes of envelopes (the laptop's HTTP command takes 16 MB). */
export const LIST_BUDGET_BYTES = 8_000_000;
export const LIST_DEFAULT = 100;
export const LIST_MAX = 500;
/** Writes are refused past this unless `FULL_AT_BYTES` says otherwise: room is left below the account's 5 GB. */
export const DEFAULT_FULL_AT_BYTES = 4_500_000_000;
/** Envelopes are kept at least this long (DECISION section 6). */
export const KEEP_MS = 90 * 24 * 60 * 60 * 1000;
/** A replaced full copy's parts are kept this long, for a laptop still downloading it. */
export const SUPERSEDED_COPY_KEEP_MS = 24 * 60 * 60 * 1000;
/** Collection runs at most this often, on an acknowledgement or a full copy. */
export const GC_EVERY_MS = 10 * 60 * 1000;
export const GC_BATCH = 500;
/** Laptops that may join a centre in a day. */
export const JOINS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;
/** `lastSeenAt` is written at most this often, not on every poll. */
const SEEN_EVERY_MS = 60 * 1000;
/** A device that has not used its token this long after joining never received it (see the head of this file). */
export const GHOST_AFTER_MS = 10 * 60 * 1000;
/** A pairing ticket's sealed body at most. */
const MAX_TICKET_BYTES = 64 * 1024;
/** The part kinds: a file's, a full copy's, and a key ring handed on at a rotation (src/lib/sync/rotation.ts). */
const PART_KINDS = ["file", "copy", "key"] as const;

interface DeviceRow {
  [key: string]: string | number | null;
  id: string;
  name: string;
  slot: number;
  kind: string;
  joinedAt: number;
  removedAt: number | null;
  lastSeq: number;
  ackedUpTo: number;
  lastSeenAt: number | null;
  /** The device that removed it (schema 2; null for a ghost, or a removal before 2026-11-02). */
  removedBy: string | null;
  /** When it first used its token (schema 2): null while it never did. */
  firstUsedAt: number | null;
  /** The centre key recorded after its removal (schema 3): null while the replacement is owed, or never removed. */
  keyAfter: string | null;
}

const DEVICE_COLUMNS =
  "id, name, slot, kind, joinedAt, removedAt, lastSeq, ackedUpTo, lastSeenAt, removedBy, firstUsedAt, keyAfter";

const SCHEMA = [
  `CREATE TABLE meta (key TEXT PRIMARY KEY, value)`,
  `CREATE TABLE device (
    id TEXT PRIMARY KEY, tokenHash TEXT NOT NULL UNIQUE, name TEXT NOT NULL, slot INTEGER NOT NULL,
    joinedAt INTEGER NOT NULL, removedAt INTEGER, lastSeq INTEGER NOT NULL DEFAULT 0,
    ackedUpTo INTEGER NOT NULL DEFAULT 0, lastSeenAt INTEGER, kind TEXT NOT NULL DEFAULT 'LAPTOP'
  )`,
  `CREATE TABLE envelope (
    mseq INTEGER PRIMARY KEY, deviceId TEXT NOT NULL, seq INTEGER NOT NULL, keyId TEXT NOT NULL,
    kind TEXT NOT NULL, at INTEGER NOT NULL, hash TEXT NOT NULL, size INTEGER NOT NULL, body BLOB NOT NULL,
    UNIQUE (deviceId, seq)
  )`,
  `CREATE TABLE part (
    blobId TEXT NOT NULL, part INTEGER NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, at INTEGER NOT NULL,
    PRIMARY KEY (blobId, part)
  )`,
  `CREATE TABLE fullCopy (
    id INTEGER PRIMARY KEY, blobId TEXT NOT NULL, parts INTEGER NOT NULL, bytes INTEGER NOT NULL,
    keyId TEXT NOT NULL, covers INTEGER NOT NULL, deviceId TEXT NOT NULL, at INTEGER NOT NULL, supersededAt INTEGER
  )`,
  `CREATE TABLE keyRotation (keyId TEXT PRIMARY KEY, deviceId TEXT NOT NULL, at INTEGER NOT NULL, mseq INTEGER NOT NULL)`,
  `CREATE TABLE joinLog (at INTEGER NOT NULL)`,
];

/**
 * The changes since the classes were first deployed (v1, 2026-11-01), applied in place to every centre's object,
 * old or new, the first time it is reached: Durable Object migrations only add or rename classes, and a centre's
 * envelopes must stay. Each entry is applied once, in order; `schema` in `meta` says how many were.
 */
const UPGRADES: readonly (readonly string[])[] = [
  [
    `ALTER TABLE device ADD COLUMN removedBy TEXT`,
    // 1 from a device's removal until a replacement of the centre key answers it.
    `ALTER TABLE device ADD COLUMN keyDue INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE device ADD COLUMN firstUsedAt INTEGER`,
    // Devices from before the upgrade are in use: none of them is taken for a ghost.
    `UPDATE device SET firstUsedAt = COALESCE(lastSeenAt, joinedAt)`,
    `ALTER TABLE part ADD COLUMN hash TEXT`,
    // The chain of key replacements; `keyRotation` (v1) is no longer written.
    `CREATE TABLE keyLink (
      seq INTEGER PRIMARY KEY, fromKeyId TEXT, toKeyId TEXT NOT NULL UNIQUE, blobId TEXT, deviceId TEXT NOT NULL,
      at INTEGER NOT NULL, mseq INTEGER NOT NULL
    )`,
  ],
  [
    // The key recorded after a device's removal: the one that answered it (null while the replacement is owed).
    `ALTER TABLE device ADD COLUMN keyAfter TEXT`,
  ],
];

type Meta = "centreId" | "createdAt" | "mseq" | "bytes" | "keyId" | "lastGcAt" | "schema";

export class Mailbox {
  private readonly sql: SqlStorage;
  private exists: boolean | null = null;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.sql = state.storage.sql;
  }

  // ---- storage helpers ------------------------------------------------------------------------------------------

  private hasSchema(): boolean {
    if (this.exists === null) {
      this.exists =
        this.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'meta'`).toArray().length > 0;
      if (this.exists) this.upgrade();
    }
    return this.exists;
  }

  /** Applies the upgrades this centre's object has not had yet (UPGRADES). */
  private upgrade() {
    const done = Number(this.meta("schema") ?? 0);
    if (done >= UPGRADES.length) return;
    this.state.storage.transactionSync(() => {
      for (const statements of UPGRADES.slice(done)) for (const statement of statements) this.sql.exec(statement);
      this.setMeta("schema", UPGRADES.length);
    });
  }

  private meta(key: Meta): string | number | null {
    const row = this.sql.exec(`SELECT value FROM meta WHERE key = ?`, key).toArray()[0];
    return (row?.value ?? null) as string | number | null;
  }

  private setMeta(key: Meta, value: string | number | null) {
    this.sql.exec(
      `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value`,
      key,
      value,
    );
  }

  private addBytes(delta: number) {
    this.setMeta("bytes", Number(this.meta("bytes") ?? 0) + delta);
  }

  private fullAt(): number {
    const configured = Number(this.env.FULL_AT_BYTES);
    return this.env.FULL_AT_BYTES !== undefined && Number.isFinite(configured) ? configured : DEFAULT_FULL_AT_BYTES;
  }

  private wouldBeFull(incoming: number): boolean {
    return Number(this.meta("bytes") ?? 0) + incoming > this.fullAt();
  }

  /** The devices not removed, ghosts left out (see the head of this file). */
  private activeDevices(): DeviceRow[] {
    return this.sql
      .exec<DeviceRow>(
        `SELECT ${DEVICE_COLUMNS} FROM device WHERE removedAt IS NULL AND (firstUsedAt IS NOT NULL OR joinedAt > ?)`,
        now(this.env) - GHOST_AFTER_MS,
      )
      .toArray();
  }

  /** Whether a centre already has every active device of this kind it may have. */
  private kindFull(kind: DeviceKind): boolean {
    return this.activeDevices().filter((device) => device.kind === kind).length >= MAX_ACTIVE[kind];
  }

  /** Deletes the ghosts of a kind, so a device joining takes their slot. */
  private dropGhosts(kind: DeviceKind) {
    this.sql.exec(
      `DELETE FROM device WHERE kind = ? AND removedAt IS NULL AND firstUsedAt IS NULL AND joinedAt <= ?`,
      kind,
      now(this.env) - GHOST_AFTER_MS,
    );
  }

  /** A new device of its kind in a free slot of that kind, with a fresh token whose hash alone is kept. */
  private async addDevice(name: string, kind: DeviceKind) {
    const token = randomHex(32);
    const tokenHash = await sha256Hex(token);
    const id = randomHex(8);
    const at = now(this.env);
    return {
      token,
      write: () => {
        if (this.kindFull(kind)) return null;
        this.dropGhosts(kind);
        const taken = new Set(this.activeDevices().map((d) => d.slot));
        const free = SLOTS[kind].find((s) => !taken.has(s))!;
        this.sql.exec(
          `INSERT INTO device (id, tokenHash, name, slot, kind, joinedAt, lastSeenAt) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          id,
          tokenHash,
          name,
          free,
          kind,
          at,
          at,
        );
        return { deviceId: id, slot: free, kind };
      },
    };
  }

  // ---- the router -----------------------------------------------------------------------------------------------

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const parts = url.pathname.split("/").slice(1);
    const method = request.method;
    const centreId = request.headers.get("x-centre") ?? "";

    if (method === "POST" && parts[0] === "create") return this.create(request, centreId);
    if (!this.hasSchema()) return refuse(this.env, 404, "CENTRE_UNKNOWN");
    if (method === "POST" && parts[0] === "join") return this.join(request);

    // Every other route is a device's.
    const auth = request.headers.get("authorization") ?? "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    if (!HEX_ID.token.test(token)) return refuse(this.env, 401, "TOKEN_UNKNOWN");
    const tokenHash = await sha256Hex(token);
    const device = this.sql
      .exec<DeviceRow>(`SELECT ${DEVICE_COLUMNS} FROM device WHERE tokenHash = ?`, tokenHash)
      .toArray()[0];
    if (!device) return refuse(this.env, 401, "TOKEN_UNKNOWN");
    if (device.removedAt !== null) return refuse(this.env, STATUS.revoked, "REVOKED");
    const at = now(this.env);
    if (device.firstUsedAt === null) {
      this.sql.exec(`UPDATE device SET firstUsedAt = ?, lastSeenAt = ? WHERE id = ?`, at, at, device.id);
    } else if (device.lastSeenAt === null || at - device.lastSeenAt >= SEEN_EVERY_MS) {
      this.sql.exec(`UPDATE device SET lastSeenAt = ? WHERE id = ?`, at, device.id);
    }

    const [root, a, b, c] = parts;
    switch (`${method} ${root}`) {
      case "POST tickets":
        return this.fileTicket(request, centreId, device, a, url);
      case "PUT envelopes":
        return this.putEnvelope(request, device, a, url);
      case "GET envelopes":
        if (a === "by-device") return this.getEnvelope(b, c);
        return this.listEnvelopes(url);
      case "POST ack":
        return this.ack(device, url);
      case "PUT parts":
        return this.putPart(request, centreId, a, b, url);
      case "GET parts":
        return this.getPart(centreId, a, b);
      case "GET blobs":
        return this.blob(a);
      case "DELETE blobs":
        return this.deleteBlob(centreId, a);
      case "POST full-copies":
        return this.putFullCopy(request, device);
      case "GET full-copies":
        return this.latestFullCopy();
      case "GET devices":
        return this.devices();
      case "DELETE devices":
        return this.removeDevice(centreId, device, a);
      case "GET keys":
        return this.keys();
      case "POST keys":
        return this.rotateKey(device, a, url);
      case "GET usage":
        return this.usage();
    }
    return refuse(this.env, 404, "NOT_FOUND");
  }

  // ---- centre and devices ---------------------------------------------------------------------------------------

  private async create(request: Request, centreId: string): Promise<Response> {
    if (this.hasSchema()) return refuse(this.env, 409, "CENTRE_EXISTS");
    const { deviceName } = (await request.json()) as { deviceName: string };
    // The first device is the director's laptop, slot 0 (the Worker refuses a phone before it gets here).
    const device = await this.addDevice(deviceName, "LAPTOP");
    return this.state.storage.transactionSync(() => {
      for (const statement of SCHEMA) this.sql.exec(statement);
      for (const statements of UPGRADES) for (const statement of statements) this.sql.exec(statement);
      this.setMeta("schema", UPGRADES.length);
      this.setMeta("centreId", centreId);
      this.setMeta("createdAt", now(this.env));
      this.setMeta("mseq", 0);
      this.setMeta("bytes", 0);
      const added = device.write()!;
      this.exists = true;
      return json(this.env, { centreId, ...added, token: device.token }, 201);
    });
  }

  private async join(request: Request): Promise<Response> {
    const { deviceName, kind } = (await request.json()) as { deviceName: string; kind?: unknown };
    const joining: DeviceKind = isDeviceKind(kind) ? kind : "LAPTOP";
    const filedBy = request.headers.get("x-filed-by");
    const device = await this.addDevice(deviceName, joining);
    const at = now(this.env);
    return this.state.storage.transactionSync(() => {
      // A ticket filed by a device removed since (or never known here) opens nothing: the removal voided it.
      if (filedBy !== null) {
        const filer = this.sql.exec(`SELECT removedAt FROM device WHERE id = ?`, filedBy).toArray()[0];
        if (!filer || filer.removedAt !== null) return refuse(this.env, 404, "TICKET_USED");
      }
      this.sql.exec(`DELETE FROM joinLog WHERE at < ?`, at - DAY_MS);
      const joins = this.sql
        .exec<{ n: number; first: number | null }>(`SELECT COUNT(*) AS n, MIN(at) AS first FROM joinLog`)
        .toArray()[0];
      if (joins.n >= JOINS_PER_DAY) return limited(this.env, "TOO_MANY_JOINS", Number(joins.first) + DAY_MS);
      const added = device.write();
      if (!added) return refuse(this.env, 409, FULL_CODE[joining]);
      this.sql.exec(`INSERT INTO joinLog (at) VALUES (?)`, at);
      return json(this.env, { centreId: this.meta("centreId"), ...added, token: device.token }, 201);
    });
  }

  private devices(): Response {
    const devices = this.sql.exec<DeviceRow>(`SELECT ${DEVICE_COLUMNS} FROM device ORDER BY rowid`).toArray();
    return json(this.env, { devices, keyId: this.meta("keyId") });
  }

  private directory() {
    return this.env.DIRECTORY.get(this.env.DIRECTORY.idFromName("directory"));
  }

  /**
   * Revokes a device's token. Only a laptop removes (docs/phone/DECISION.md section 2: the phone is removed from a
   * laptop, and a lost phone must not be able to put the laptops out). Every unused pairing ticket of the centre is
   * void afterwards: one filed earlier holds the key ring the removed device knew.
   */
  private async removeDevice(centreId: string, remover: DeviceRow, deviceId: string | undefined): Promise<Response> {
    if (!deviceId || !HEX_ID.device.test(deviceId)) return refuse(this.env, 400, "BAD_REQUEST");
    if (remover.kind === "PHONE") return refuse(this.env, 403, "PHONE_CANNOT_REMOVE");
    const target = this.sql.exec(`SELECT removedAt FROM device WHERE id = ?`, deviceId).toArray()[0];
    if (!target) return refuse(this.env, 404, "DEVICE_UNKNOWN");
    if (target.removedAt === null) {
      this.sql.exec(
        `UPDATE device SET removedAt = ?, removedBy = ?, keyDue = 1 WHERE id = ? AND removedAt IS NULL`,
        now(this.env),
        remover.id,
        deviceId,
      );
    }
    await this.directory().fetch(new Request(`http://directory/centres/${centreId}/void`, { method: "POST" }));
    return json(this.env, {});
  }

  private keyLinks() {
    return this.sql
      .exec<{
        fromKeyId: string | null;
        toKeyId: string;
        blobId: string | null;
        deviceId: string;
        at: number;
      }>(`SELECT fromKeyId, toKeyId, blobId, deviceId, at FROM keyLink ORDER BY seq`)
      .toArray();
  }

  private keys(): Response {
    const links = this.keyLinks().map((link) => ({
      from: link.fromKeyId,
      to: link.toKeyId,
      blobId: link.blobId,
      deviceId: link.deviceId,
      at: link.at,
    }));
    const owed = this.sql.exec(`SELECT 1 FROM device WHERE keyDue = 1 LIMIT 1`).toArray().length > 0;
    return json(this.env, { current: this.meta("keyId"), links, owed });
  }

  /**
   * The centre key was replaced: `keyId` follows `from` (default: the key in force), handed on by the key part
   * `blob` (optional; when given it must be stored, and it is kept for good). Refused from a phone, and while no
   * replacement is owed (403 ROTATION_NOT_DUE), unless `from` is the key in force (409 KEY_NOT_CURRENT, with
   * `current`), and for a key already replaced (409 KEY_REPLACED). The same link again is answered as stored (a
   * retry after a lost answer).
   */
  private rotateKey(device: DeviceRow, keyId: string | undefined, url: URL): Response {
    const from = url.searchParams.get("from");
    const blobId = url.searchParams.get("blob");
    if (
      !keyId ||
      !HEX_ID.key.test(keyId) ||
      (from !== null && (!HEX_ID.key.test(from) || from === keyId)) ||
      (blobId !== null && !HEX_ID.blob.test(blobId))
    ) {
      return refuse(this.env, 400, "BAD_REQUEST");
    }
    const at = now(this.env);
    return this.state.storage.transactionSync(() => {
      const current = this.meta("keyId") as string | null;
      const links = this.keyLinks();
      const same = links.find((link) => link.toKeyId === keyId);
      if (same) {
        if (from === null || from === same.fromKeyId || (same.fromKeyId === null && links[0] === same)) {
          return json(this.env, { keyId, existed: true });
        }
        return refuse(this.env, 409, "KEY_REPLACED");
      }
      if (links.some((link) => link.fromKeyId === keyId)) return refuse(this.env, 409, "KEY_REPLACED");
      if (current === keyId) return json(this.env, { keyId, existed: true });
      if (from !== null && current !== null && from !== current) {
        return refuse(this.env, 409, "KEY_NOT_CURRENT", {}, { current });
      }
      // Owed by a removal, whichever laptop removed it (it may have lost its connection before replacing the key).
      const due = this.sql.exec(`SELECT 1 FROM device WHERE keyDue = 1 LIMIT 1`).toArray();
      if (device.kind !== "LAPTOP" || due.length === 0) return refuse(this.env, 403, "ROTATION_NOT_DUE");
      if (blobId !== null) {
        const part = this.sql.exec(`SELECT 1 FROM part WHERE blobId = ? AND part = 0`, blobId).toArray();
        if (part.length === 0) return refuse(this.env, 409, "PARTS_MISSING");
        this.sql.exec(`UPDATE part SET kind = 'key' WHERE blobId = ?`, blobId);
      }
      this.sql.exec(
        `INSERT INTO keyLink (fromKeyId, toKeyId, blobId, deviceId, at, mseq) VALUES (?, ?, ?, ?, ?, ?)`,
        from ?? current,
        keyId,
        blobId,
        device.id,
        at,
        Number(this.meta("mseq")),
      );
      // A key made after every removal so far answers them all, whoever removed them.
      this.sql.exec(`UPDATE device SET keyDue = 0, keyAfter = ? WHERE keyDue = 1`, keyId);
      this.setMeta("keyId", keyId);
      return json(this.env, { keyId, existed: false }, 201);
    });
  }

  private async fileTicket(
    request: Request,
    centreId: string,
    device: DeviceRow,
    ticketId: string | undefined,
    url: URL,
  ) {
    if (!ticketId || !HEX_ID.ticket.test(ticketId)) return refuse(this.env, 400, "BAD_REQUEST");
    // A pairing code is made on a laptop only (docs/phone/DECISION.md section 3).
    if (device.kind === "PHONE") return refuse(this.env, 403, "PHONE_PAIRS");
    const ttl = intParam(url.searchParams.get("ttl"), 1, 1_000_000);
    const kind = url.searchParams.get("kind") ?? "LAPTOP";
    if (ttl === null || !isDeviceKind(kind)) return refuse(this.env, 400, "BAD_REQUEST");
    if (this.kindFull(kind)) return refuse(this.env, 409, FULL_CODE[kind]);
    const sealed = await readBody(request, MAX_TICKET_BYTES);
    if (sealed === null) return refuse(this.env, 413, "TOO_LARGE");
    if (sealed.byteLength === 0) return refuse(this.env, 400, "BAD_REQUEST");
    const ttlSec = Math.min(TICKET_MAX_TTL_SEC, Math.max(TICKET_MIN_TTL_SEC, ttl));
    return this.directory().fetch(
      new Request(`http://directory/tickets/${ticketId}`, {
        method: "PUT",
        headers: { "x-centre": centreId, "x-ttl": String(ttlSec), "x-kind": kind, "x-device": device.id },
        body: sealed,
      }),
    );
  }

  // ---- envelopes ------------------------------------------------------------------------------------------------

  private async putEnvelope(request: Request, device: DeviceRow, seqText: string | undefined, url: URL) {
    const seq = intParam(seqText ?? null, 1, Number.MAX_SAFE_INTEGER);
    const keyId = url.searchParams.get("key") ?? "";
    const kind = url.searchParams.get("kind") ?? "";
    if (seq === null || !HEX_ID.key.test(keyId) || !HEX_ID.kind.test(kind)) return refuse(this.env, 400, "BAD_REQUEST");
    const body = await readBody(request, MAX_ENVELOPE_BYTES);
    if (body === null) return refuse(this.env, 413, "TOO_LARGE");
    if (body.byteLength === 0) return refuse(this.env, 400, "BAD_REQUEST");
    const hash = await sha256Hex(body);
    const at = now(this.env);

    return this.state.storage.transactionSync(() => {
      // Removed while its body was arriving: refused as any later request.
      const still = this.sql.exec(`SELECT removedAt FROM device WHERE id = ?`, device.id).toArray()[0];
      if (!still || still.removedAt !== null) return refuse(this.env, STATUS.revoked, "REVOKED");
      const stored = this.sql
        .exec<{
          mseq: number;
          hash: string;
        }>(`SELECT mseq, hash FROM envelope WHERE deviceId = ? AND seq = ?`, device.id, seq)
        .toArray()[0];
      if (stored) {
        if (stored.hash === hash) return json(this.env, { mseq: stored.mseq, duplicate: true });
        return refuse(this.env, STATUS.conflict, "SEQ_TAKEN", {}, { mseq: stored.mseq });
      }
      const current = this.meta("keyId");
      if (current !== null && current !== keyId) return refuse(this.env, 422, "OLD_KEY");
      if (this.wouldBeFull(body.byteLength)) return refuse(this.env, STATUS.full, "FULL");
      const mseq = Number(this.meta("mseq")) + 1;
      this.sql.exec(
        `INSERT INTO envelope (mseq, deviceId, seq, keyId, kind, at, hash, size, body) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        mseq,
        device.id,
        seq,
        keyId,
        kind,
        at,
        hash,
        body.byteLength,
        body,
      );
      this.setMeta("mseq", mseq);
      this.addBytes(body.byteLength);
      // The row read before the body arrived may be stale: another put of this device may have passed it.
      this.sql.exec(`UPDATE device SET lastSeq = MAX(lastSeq, ?) WHERE id = ?`, seq, device.id);
      return json(this.env, { mseq, duplicate: false }, 201);
    });
  }

  private listEnvelopes(url: URL): Response {
    const after = intParam(url.searchParams.get("after") ?? "0", 0, Number.MAX_SAFE_INTEGER);
    const limit = intParam(url.searchParams.get("limit") ?? String(LIST_DEFAULT), 1, LIST_MAX);
    if (after === null || limit === null) return refuse(this.env, 400, "BAD_REQUEST");
    const latest = Number(this.meta("mseq"));
    const oldestRow = this.sql.exec<{ m: number | null }>(`SELECT MIN(mseq) AS m FROM envelope`).toArray()[0];
    const oldest = oldestRow.m === null ? latest + 1 : Number(oldestRow.m);
    // Sizes first, so no body beyond the byte budget is read.
    const sizes = this.sql
      .exec<{
        mseq: number;
        size: number;
      }>(`SELECT mseq, size FROM envelope WHERE mseq > ? ORDER BY mseq LIMIT ?`, after, limit + 1)
      .toArray();
    let budget = LIST_BUDGET_BYTES;
    let upTo = after;
    let count = 0;
    for (const row of sizes.slice(0, limit)) {
      if (count > 0 && row.size > budget) break;
      budget -= row.size;
      upTo = row.mseq;
      count++;
    }
    const rows =
      count === 0
        ? []
        : this.sql
            .exec<
              EnvelopeHead & { body: ArrayBuffer; [key: string]: string | number | ArrayBuffer }
            >(`SELECT mseq, deviceId, seq, keyId, kind, at, body FROM envelope WHERE mseq > ? AND mseq <= ? ORDER BY mseq`, after, upTo)
            .toArray();
    const more = sizes.length > count;
    const body = encodeFrames(
      rows.map(({ body, ...head }) => ({
        head: {
          mseq: head.mseq,
          deviceId: head.deviceId,
          seq: head.seq,
          keyId: head.keyId,
          kind: head.kind,
          at: head.at,
        },
        body: new Uint8Array(body),
      })),
    );
    return bytes(this.env, body, {
      "x-relay-more": more ? "1" : "0",
      "x-relay-latest": String(latest),
      "x-relay-oldest": String(oldest),
      "x-relay-behind": after + 1 < oldest ? "1" : "0",
    });
  }

  private getEnvelope(deviceId: string | undefined, seqText: string | undefined): Response {
    const seq = intParam(seqText ?? null, 1, Number.MAX_SAFE_INTEGER);
    if (!deviceId || !HEX_ID.device.test(deviceId) || seq === null) return refuse(this.env, 400, "BAD_REQUEST");
    const row = this.sql
      .exec<
        EnvelopeHead & { body: ArrayBuffer; [key: string]: string | number | ArrayBuffer }
      >(`SELECT mseq, deviceId, seq, keyId, kind, at, body FROM envelope WHERE deviceId = ? AND seq = ?`, deviceId, seq)
      .toArray()[0];
    if (!row) return refuse(this.env, 404, "NOT_FOUND");
    const { body, ...head } = row;
    return bytes(this.env, encodeFrames([{ head: head as EnvelopeHead, body: new Uint8Array(body) }]));
  }

  private async ack(device: DeviceRow, url: URL): Promise<Response> {
    const upTo = intParam(url.searchParams.get("upTo"), 0, Number.MAX_SAFE_INTEGER);
    if (upTo === null) return refuse(this.env, 400, "BAD_REQUEST");
    const latest = Number(this.meta("mseq"));
    const acked = Math.max(device.ackedUpTo, Math.min(upTo, latest));
    if (acked !== device.ackedUpTo) this.sql.exec(`UPDATE device SET ackedUpTo = ? WHERE id = ?`, acked, device.id);
    await this.collect();
    return json(this.env, { ackedUpTo: acked });
  }

  // ---- collection -----------------------------------------------------------------------------------------------

  /**
   * Deletes, at most every 10 minutes and a batch at a time, the envelopes every active device acknowledged that
   * the latest full copy covers and that are older than 90 days; and the parts of full copies replaced more than a
   * day ago. File parts are kept until a laptop deletes their blob.
   */
  private async collect(): Promise<void> {
    const at = now(this.env);
    const last = Number(this.meta("lastGcAt") ?? 0);
    if (at - last < GC_EVERY_MS) return;
    this.setMeta("lastGcAt", at);

    const active = this.activeDevices();
    const latestCopy = this.sql
      .exec<{ covers: number }>(`SELECT covers FROM fullCopy WHERE supersededAt IS NULL ORDER BY id DESC LIMIT 1`)
      .toArray()[0];
    if (active.length > 0 && latestCopy) {
      const upTo = Math.min(latestCopy.covers, ...active.map((d) => d.ackedUpTo));
      const cutoff = at - KEEP_MS;
      this.state.storage.transactionSync(() => {
        const batch = this.sql
          .exec<{ last: number | null; size: number | null }>(
            `SELECT MAX(mseq) AS last, SUM(size) AS size FROM
              (SELECT mseq, size FROM envelope WHERE mseq <= ? AND at < ? ORDER BY mseq LIMIT ?)`,
            upTo,
            cutoff,
            GC_BATCH,
          )
          .toArray()[0];
        if (batch.last === null) return;
        this.sql.exec(`DELETE FROM envelope WHERE mseq <= ? AND at < ?`, batch.last, cutoff);
        this.addBytes(-Number(batch.size));
      });
    }

    const stale = this.sql
      .exec<{
        id: number;
        blobId: string;
      }>(
        `SELECT id, blobId FROM fullCopy WHERE supersededAt IS NOT NULL AND supersededAt < ? LIMIT 4`,
        at - SUPERSEDED_COPY_KEEP_MS,
      )
      .toArray();
    const centreId = String(this.meta("centreId"));
    for (const copy of stale) {
      const still = this.sql
        .exec(`SELECT 1 FROM fullCopy WHERE blobId = ? AND supersededAt IS NULL`, copy.blobId)
        .toArray();
      if (still.length === 0) await this.dropBlob(centreId, copy.blobId);
      this.sql.exec(`DELETE FROM fullCopy WHERE id = ?`, copy.id);
    }
  }

  // ---- parts ----------------------------------------------------------------------------------------------------

  private shard(centreId: string, blobId: string, part: number) {
    return this.env.PARTS.get(this.env.PARTS.idFromName(shardName(centreId, shardOf(blobId, part))));
  }

  private async putPart(
    request: Request,
    centreId: string,
    blobId: string | undefined,
    partText: string | undefined,
    url: URL,
  ): Promise<Response> {
    const part = intParam(partText ?? null, 0, 1_000_000);
    const kind = url.searchParams.get("kind") ?? "file";
    if (!blobId || !HEX_ID.blob.test(blobId) || part === null || !(PART_KINDS as readonly string[]).includes(kind)) {
      return refuse(this.env, 400, "BAD_REQUEST");
    }
    const body = await readBody(request, MAX_PART_BYTES);
    if (body === null) return refuse(this.env, 413, "TOO_LARGE");
    if (body.byteLength === 0) return refuse(this.env, 400, "BAD_REQUEST");
    const hash = await sha256Hex(body);
    // A part stored once stays as it is. The same bytes again are a retry; other bytes are said, never dropped
    // silently (409 PART_DIFFERS): for a file, another sealing of the same plain part; for a key part, a conflict.
    const stored = this.sql
      .exec<{ hash: string | null }>(`SELECT hash FROM part WHERE blobId = ? AND part = ?`, blobId, part)
      .toArray()[0];
    if (stored) {
      if (stored.hash === null || stored.hash === hash) return json(this.env, { existed: true });
      return refuse(this.env, 409, "PART_DIFFERS");
    }
    if (this.wouldBeFull(body.byteLength)) return refuse(this.env, STATUS.full, "FULL");
    const answer = await this.shard(centreId, blobId, part).fetch(
      new Request(`http://parts/${blobId}/${part}`, { method: "PUT", body }),
    );
    if (!answer.ok) return answer;
    // The shard keeps the first bytes it was given and says what it holds: two puts of one id racing across the
    // await above store one of them, and the index records the bytes the shard kept.
    const answered = (await answer.json()) as { existed: boolean; hash?: string; size?: number };
    const held = answered.existed
      ? { existed: true, hash: answered.hash ?? "", size: answered.size ?? 0 }
      : { existed: false, hash, size: body.byteLength };
    const written = this.sql.exec(
      `INSERT OR IGNORE INTO part (blobId, part, kind, size, at, hash) VALUES (?, ?, ?, ?, ?, ?)`,
      blobId,
      part,
      kind,
      held.size,
      now(this.env),
      held.hash,
    );
    if (written.rowsWritten > 0) this.addBytes(held.size);
    if (held.hash !== hash) return refuse(this.env, 409, "PART_DIFFERS");
    return held.existed ? json(this.env, { existed: true }) : json(this.env, { existed: false }, 201);
  }

  private async getPart(centreId: string, blobId: string | undefined, partText: string | undefined) {
    const part = intParam(partText ?? null, 0, 1_000_000);
    if (!blobId || !HEX_ID.blob.test(blobId) || part === null) return refuse(this.env, 400, "BAD_REQUEST");
    if (this.sql.exec(`SELECT 1 FROM part WHERE blobId = ? AND part = ?`, blobId, part).toArray().length === 0) {
      return refuse(this.env, 404, "NOT_FOUND");
    }
    return this.shard(centreId, blobId, part).fetch(new Request(`http://parts/${blobId}/${part}`));
  }

  private blob(blobId: string | undefined): Response {
    if (!blobId || !HEX_ID.blob.test(blobId)) return refuse(this.env, 400, "BAD_REQUEST");
    const rows = this.sql
      .exec<{ part: number; size: number }>(`SELECT part, size FROM part WHERE blobId = ? ORDER BY part`, blobId)
      .toArray();
    return json(this.env, { parts: rows.map((r) => r.part), bytes: rows.reduce((sum, r) => sum + r.size, 0) });
  }

  private async dropBlob(centreId: string, blobId: string) {
    const rows = this.sql
      .exec<{ part: number; size: number }>(`SELECT part, size FROM part WHERE blobId = ?`, blobId)
      .toArray();
    const shards = new Set(rows.map((r) => shardOf(blobId, r.part)));
    for (const shard of shards) {
      const stub = this.env.PARTS.get(this.env.PARTS.idFromName(shardName(centreId, shard)));
      await stub.fetch(new Request(`http://parts/${blobId}`, { method: "DELETE" }));
    }
    const removed = this.sql.exec(`DELETE FROM part WHERE blobId = ?`, blobId);
    if (removed.rowsWritten > 0) this.addBytes(-rows.reduce((sum, r) => sum + r.size, 0));
  }

  private async deleteBlob(centreId: string, blobId: string | undefined): Promise<Response> {
    if (!blobId || !HEX_ID.blob.test(blobId)) return refuse(this.env, 400, "BAD_REQUEST");
    // The current full copy is how every joiner and every device behind starts; a key part hands the key on.
    const current = this.sql.exec(`SELECT 1 FROM fullCopy WHERE blobId = ? AND supersededAt IS NULL`, blobId);
    if (current.toArray().length > 0) return refuse(this.env, 409, "COPY_CURRENT");
    const key = this.sql.exec(`SELECT 1 FROM part WHERE blobId = ? AND kind = 'key' LIMIT 1`, blobId).toArray();
    if (key.length > 0) return refuse(this.env, 409, "KEY_PART");
    await this.dropBlob(centreId, blobId);
    return json(this.env, {});
  }

  // ---- full copies ----------------------------------------------------------------------------------------------

  private async putFullCopy(request: Request, device: DeviceRow): Promise<Response> {
    // The full copy is made by a laptop, never over the phone's data plan (docs/phone/DECISION.md section 6).
    if (device.kind === "PHONE") return refuse(this.env, 403, "PHONE_NO_COPY");
    const input = await readJson<{ blobId: string; parts: number; bytes: number; keyId: string; covers: number }>(
      request,
    );
    if (input === null) return refuse(this.env, 400, "BAD_REQUEST");
    const { blobId, parts, keyId, covers } = input;
    if (
      typeof blobId !== "string" ||
      !HEX_ID.blob.test(blobId) ||
      typeof keyId !== "string" ||
      !HEX_ID.key.test(keyId) ||
      !Number.isSafeInteger(parts) ||
      parts! < 1 ||
      !Number.isSafeInteger(input.bytes) ||
      !Number.isSafeInteger(covers) ||
      covers! < 0
    ) {
      return refuse(this.env, 400, "BAD_REQUEST");
    }
    const stored = this.sql
      .exec<{ n: number }>(`SELECT COUNT(*) AS n FROM part WHERE blobId = ? AND part < ?`, blobId, parts!)
      .toArray()[0];
    if (Number(stored.n) !== parts) return refuse(this.env, 409, "PARTS_MISSING");
    const at = now(this.env);
    const result = this.state.storage.transactionSync(() => {
      const latest = Number(this.meta("mseq"));
      const reach = Math.min(covers!, latest);
      // A copy must join what the mailbox still keeps: a device starting from it lists after `covers`, and an
      // envelope after that already collected would leave it behind for good (a laptop restored from an old
      // backup refreshing the copy before catching up).
      const oldestRow = this.sql.exec<{ m: number | null }>(`SELECT MIN(mseq) AS m FROM envelope`).toArray()[0];
      const oldest = oldestRow.m === null ? latest + 1 : Number(oldestRow.m);
      if (reach + 1 < oldest) return refuse(this.env, 409, "COPY_TOO_OLD", {}, { oldest });
      this.sql.exec(`UPDATE fullCopy SET supersededAt = ? WHERE supersededAt IS NULL`, at);
      this.sql.exec(
        `INSERT INTO fullCopy (blobId, parts, bytes, keyId, covers, deviceId, at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        blobId,
        parts!,
        input.bytes!,
        keyId,
        reach,
        device.id,
        at,
      );
      return json(this.env, { at }, 201);
    });
    if (!result.ok) return result;
    await this.collect();
    return result;
  }

  private latestFullCopy(): Response {
    const copy = this.sql
      .exec(
        `SELECT blobId, parts, bytes, keyId, covers, deviceId, at FROM fullCopy WHERE supersededAt IS NULL ORDER BY id DESC LIMIT 1`,
      )
      .toArray()[0];
    return json(this.env, { copy: copy ?? null });
  }

  // ---- usage ----------------------------------------------------------------------------------------------------

  private usage(): Response {
    const used = Number(this.meta("bytes") ?? 0);
    const limit = this.fullAt();
    const envelopes = Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM envelope`).toArray()[0].n);
    const parts = Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM part`).toArray()[0].n);
    return json(this.env, { bytes: used, limit, envelopes, parts, full: used >= limit, nearFull: used >= limit * 0.8 });
  }
}
