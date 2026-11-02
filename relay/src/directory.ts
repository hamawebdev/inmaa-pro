/**
 * The pairing tickets, filed by ticket id, in one Durable Object for the whole Worker (pairing is rare).
 *
 * The joining device knows the mailbox's address and the code, not the centre: it finds the ticket by the id it
 * derives from the code, and the ticket says which centre it opens and which kind of device it was made for (a
 * laptop's ticket or the phone's): a device of the other kind is refused without spending the ticket. A ticket is single-use and lives at most
 * 30 minutes. Redeeming is limited per ticket (a few attempts, whatever their outcome) and, for ids that name no
 * ticket, for the whole directory (so ids cannot be tried in bulk); the centre limits how many laptops join it a
 * day (mailbox.ts).
 *
 * The sealed bytes (the centre's key ring under the code) are kept only while the ticket can still be redeemed: they
 * are dropped once a device joined with it, when it expires, when the claim was not followed by a join within a few
 * minutes, and when a device of the centre is removed (every unused ticket of the centre is void then, so a code made
 * before the removal, by the removed device or read aloud near it, opens nothing afterwards). Old rows go a day after
 * they expired. All of it is done on every request that reaches the directory, so nothing waits for another ticket.
 *
 * Internal routes, reached only from the Worker and the mailbox:
 *   PUT    /tickets/:id   `x-centre`, `x-ttl`, `x-kind`, `x-device` + sealed body   file a ticket
 *   POST   /tickets/:id/claim   `x-kind`            take it (single use; answers `x-filed-by`), or say why not
 *   POST   /tickets/:id/release                     give it back when the centre refused the join for a while
 *   POST   /tickets/:id/spent                       the device joined (or the ticket is void): drop the sealed bytes
 *   POST   /centres/:centreId/void                  a device of the centre was removed: void its unused tickets
 */
import type { DurableObjectState, Env, SqlStorage } from "./cf";
import { bytes, isDeviceKind, json, limited, now, refuse } from "./http";

export const TICKET_MAX_TTL_SEC = 30 * 60;
export const TICKET_MIN_TTL_SEC = 60;
/** Attempts on one ticket id, whatever their outcome. */
export const TICKET_MAX_ATTEMPTS = 5;
/** Attempts on ids that name no ticket, across the directory, within the window. */
export const UNKNOWN_TICKET_MAX = 20;
export const UNKNOWN_TICKET_WINDOW_MS = 10 * 60 * 1000;
/** Spent and expired tickets are kept this long, so a late attempt is answered "used" or "expired". */
const TICKET_KEEP_MS = 24 * 60 * 60 * 1000;
/** A claim not followed by a join (the Worker failed between the two) keeps its sealed bytes no longer than this. */
export const CLAIM_HOLD_MS = 5 * 60 * 1000;

export class Directory {
  private readonly sql: SqlStorage;

  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.sql = state.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS ticket (
        id TEXT PRIMARY KEY, centreId TEXT NOT NULL, sealed BLOB NOT NULL,
        createdAt INTEGER NOT NULL, expiresAt INTEGER NOT NULL, usedAt INTEGER, attempts INTEGER NOT NULL DEFAULT 0,
        kind TEXT NOT NULL DEFAULT 'LAPTOP'
      )`,
    );
    this.sql.exec(`CREATE TABLE IF NOT EXISTS miss (at INTEGER NOT NULL)`);
    // Version 2 (2026-11-02): the device that filed each ticket. Added in place: the class was deployed as v1.
    this.sql.exec(`CREATE TABLE IF NOT EXISTS directoryMeta (key TEXT PRIMARY KEY, value)`);
    const version = this.sql.exec(`SELECT value FROM directoryMeta WHERE key = 'schema'`).toArray()[0];
    if (!version || Number(version.value) < 2) {
      state.storage.transactionSync(() => {
        this.sql.exec(`ALTER TABLE ticket ADD COLUMN filedBy TEXT`);
        this.sql.exec(`INSERT OR REPLACE INTO directoryMeta (key, value) VALUES ('schema', 2)`);
      });
    }
  }

  /** Drops what no redeem may use any more, on every request. */
  private tidy(at: number) {
    this.sql.exec(`DELETE FROM ticket WHERE expiresAt < ?`, at - TICKET_KEEP_MS);
    this.sql.exec(
      `UPDATE ticket SET sealed = x'' WHERE length(sealed) > 0 AND (expiresAt <= ? OR (usedAt IS NOT NULL AND usedAt < ?))`,
      at,
      at - CLAIM_HOLD_MS,
    );
    this.sql.exec(`DELETE FROM miss WHERE at < ?`, at - UNKNOWN_TICKET_WINDOW_MS);
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const [, root, id, verb] = url.pathname.split("/");
    this.tidy(now(this.env));
    if (root === "centres" && id && request.method === "POST" && verb === "void") return this.voidCentre(id);
    if (root !== "tickets" || !id) return refuse(this.env, 404, "NOT_FOUND");
    if (request.method === "PUT" && !verb) return this.file(request, id);
    if (request.method === "POST" && verb === "claim") return this.claim(id, request.headers.get("x-kind"));
    if (request.method === "POST" && verb === "release") return this.release(id);
    if (request.method === "POST" && verb === "spent") return this.spent(id);
    return refuse(this.env, 404, "NOT_FOUND");
  }

  private async file(request: Request, id: string): Promise<Response> {
    const centreId = request.headers.get("x-centre") ?? "";
    const ttlSec = Number(request.headers.get("x-ttl"));
    const kind = request.headers.get("x-kind") ?? "LAPTOP";
    const filedBy = request.headers.get("x-device");
    if (!isDeviceKind(kind)) return refuse(this.env, 400, "BAD_REQUEST");
    const sealed = await request.arrayBuffer();
    const at = now(this.env);
    const expiresAt = at + ttlSec * 1000;
    return this.state.storage.transactionSync(() => {
      const existing = this.sql.exec(`SELECT centreId FROM ticket WHERE id = ?`, id).toArray()[0];
      if (existing) return refuse(this.env, 409, "TICKET_EXISTS");
      this.sql.exec(
        `INSERT INTO ticket (id, centreId, sealed, createdAt, expiresAt, kind, filedBy) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        id,
        centreId,
        sealed,
        at,
        expiresAt,
        kind,
        filedBy,
      );
      return json(this.env, { expiresAt }, 201);
    });
  }

  private claim(id: string, joining: string | null): Response {
    const at = now(this.env);
    return this.state.storage.transactionSync(() => {
      const ticket = this.sql
        .exec<{
          centreId: string;
          sealed: ArrayBuffer;
          expiresAt: number;
          usedAt: number | null;
          attempts: number;
          kind: string;
          filedBy: string | null;
        }>(`SELECT centreId, sealed, expiresAt, usedAt, attempts, kind, filedBy FROM ticket WHERE id = ?`, id)
        .toArray()[0];
      if (!ticket) {
        const misses = Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM miss`).toArray()[0].n);
        if (misses >= UNKNOWN_TICKET_MAX) return limited(this.env, "TOO_MANY_ATTEMPTS", at + UNKNOWN_TICKET_WINDOW_MS);
        this.sql.exec(`INSERT INTO miss (at) VALUES (?)`, at);
        return refuse(this.env, 404, "TICKET_UNKNOWN");
      }
      this.sql.exec(`UPDATE ticket SET attempts = attempts + 1 WHERE id = ?`, id);
      if (ticket.attempts >= TICKET_MAX_ATTEMPTS) return limited(this.env, "TOO_MANY_ATTEMPTS", ticket.expiresAt);
      if (ticket.usedAt !== null) return refuse(this.env, 404, "TICKET_USED");
      if (ticket.expiresAt <= at) return refuse(this.env, 404, "TICKET_EXPIRED");
      if (ticket.sealed.byteLength === 0) return refuse(this.env, 404, "TICKET_USED");
      // The other kind of device: the ticket stays unspent for the device it was made for.
      if ((joining ?? "LAPTOP") !== ticket.kind)
        return refuse(this.env, 409, ticket.kind === "PHONE" ? "TICKET_FOR_PHONE" : "TICKET_FOR_LAPTOP");
      this.sql.exec(`UPDATE ticket SET usedAt = ? WHERE id = ?`, at, id);
      const headers: Record<string, string> = { "x-centre": ticket.centreId };
      if (ticket.filedBy) headers["x-filed-by"] = ticket.filedBy;
      return bytes(this.env, ticket.sealed, headers);
    });
  }

  private release(id: string): Response {
    this.sql.exec(
      `UPDATE ticket SET usedAt = NULL WHERE id = ? AND expiresAt > ? AND length(sealed) > 0`,
      id,
      now(this.env),
    );
    return json(this.env, {});
  }

  private spent(id: string): Response {
    this.sql.exec(`UPDATE ticket SET sealed = x'', usedAt = COALESCE(usedAt, ?) WHERE id = ?`, now(this.env), id);
    return json(this.env, {});
  }

  private voidCentre(centreId: string): Response {
    const voided = this.sql.exec(
      `UPDATE ticket SET sealed = x'', usedAt = COALESCE(usedAt, ?) WHERE centreId = ? AND length(sealed) > 0`,
      now(this.env),
      centreId,
    );
    return json(this.env, { voided: voided.rowsWritten });
  }
}
