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
 * Internal routes, reached only from the Worker and the mailbox:
 *   PUT    /tickets/:id   `x-centre`, `x-ttl`, `x-kind` + sealed body   file a ticket
 *   POST   /tickets/:id/claim   `x-kind`                              take it (single use), or say why not
 *   POST   /tickets/:id/release                                  give it back when the centre refused the join
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
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const [, root, id, verb] = url.pathname.split("/");
    if (root !== "tickets" || !id) return refuse(this.env, 404, "NOT_FOUND");
    if (request.method === "PUT" && !verb) return this.file(request, id);
    if (request.method === "POST" && verb === "claim") return this.claim(id, request.headers.get("x-kind"));
    if (request.method === "POST" && verb === "release") return this.release(id);
    return refuse(this.env, 404, "NOT_FOUND");
  }

  private async file(request: Request, id: string): Promise<Response> {
    const centreId = request.headers.get("x-centre") ?? "";
    const ttlSec = Number(request.headers.get("x-ttl"));
    const kind = request.headers.get("x-kind") ?? "LAPTOP";
    if (!isDeviceKind(kind)) return refuse(this.env, 400, "BAD_REQUEST");
    const sealed = await request.arrayBuffer();
    const at = now(this.env);
    const expiresAt = at + ttlSec * 1000;
    return this.state.storage.transactionSync(() => {
      this.sql.exec(`DELETE FROM ticket WHERE expiresAt < ?`, at - TICKET_KEEP_MS);
      const existing = this.sql.exec(`SELECT centreId FROM ticket WHERE id = ?`, id).toArray()[0];
      if (existing) return refuse(this.env, 409, "TICKET_EXISTS");
      this.sql.exec(
        `INSERT INTO ticket (id, centreId, sealed, createdAt, expiresAt, kind) VALUES (?, ?, ?, ?, ?, ?)`,
        id,
        centreId,
        sealed,
        at,
        expiresAt,
        kind,
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
        }>(`SELECT centreId, sealed, expiresAt, usedAt, attempts, kind FROM ticket WHERE id = ?`, id)
        .toArray()[0];
      if (!ticket) {
        const since = at - UNKNOWN_TICKET_WINDOW_MS;
        this.sql.exec(`DELETE FROM miss WHERE at < ?`, since);
        const misses = Number(this.sql.exec<{ n: number }>(`SELECT COUNT(*) AS n FROM miss`).toArray()[0].n);
        if (misses >= UNKNOWN_TICKET_MAX) return limited(this.env, "TOO_MANY_ATTEMPTS", at + UNKNOWN_TICKET_WINDOW_MS);
        this.sql.exec(`INSERT INTO miss (at) VALUES (?)`, at);
        return refuse(this.env, 404, "TICKET_UNKNOWN");
      }
      this.sql.exec(`UPDATE ticket SET attempts = attempts + 1 WHERE id = ?`, id);
      if (ticket.attempts >= TICKET_MAX_ATTEMPTS) return limited(this.env, "TOO_MANY_ATTEMPTS", ticket.expiresAt);
      if (ticket.usedAt !== null) return refuse(this.env, 404, "TICKET_USED");
      if (ticket.expiresAt <= at) return refuse(this.env, 404, "TICKET_EXPIRED");
      // The other kind of device: the ticket stays unspent for the device it was made for.
      if ((joining ?? "LAPTOP") !== ticket.kind)
        return refuse(this.env, 409, ticket.kind === "PHONE" ? "TICKET_FOR_PHONE" : "TICKET_FOR_LAPTOP");
      this.sql.exec(`UPDATE ticket SET usedAt = ? WHERE id = ?`, at, id);
      return bytes(this.env, ticket.sealed, { "x-centre": ticket.centreId });
    });
  }

  private release(id: string): Response {
    this.sql.exec(`UPDATE ticket SET usedAt = NULL WHERE id = ? AND expiresAt > ?`, id, now(this.env));
    return json(this.env, {});
  }
}
