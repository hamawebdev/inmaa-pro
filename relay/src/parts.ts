/**
 * File parts, in eight Durable Objects per centre so that none grows past about 1 GB (Cloudflare's free plan
 * keeps 5 GB in all). A part goes to the shard its id names: the blob id is already a keyed hash, so its first
 * byte plus the part number, modulo 8, spreads the parts evenly at no cost.
 *
 * Only the centre's mailbox reaches a shard: it has checked the device and keeps the index of parts and the bytes
 * stored. Internal routes:
 *   PUT    /:blobId/:part   store, unless stored (`{ existed }`)
 *   GET    /:blobId/:part   the bytes
 *   DELETE /:blobId         every part of that blob in this shard
 */
import type { DurableObjectState, Env, SqlStorage } from "./cf";
import { bytes, json, refuse } from "./http";

export const PART_SHARDS = 8;

export function shardOf(blobId: string, part: number): number {
  return (parseInt(blobId.slice(0, 2), 16) + part) % PART_SHARDS;
}

export function shardName(centreId: string, shard: number): string {
  return `${centreId}:parts:${shard}`;
}

export class PartStore {
  private readonly sql: SqlStorage;

  constructor(
    state: DurableObjectState,
    private readonly env: Env,
  ) {
    this.sql = state.storage.sql;
    this.sql.exec(
      `CREATE TABLE IF NOT EXISTS part (blobId TEXT NOT NULL, part INTEGER NOT NULL, body BLOB NOT NULL,
        PRIMARY KEY (blobId, part))`,
    );
  }

  async fetch(request: Request): Promise<Response> {
    const [, blobId, partText] = new URL(request.url).pathname.split("/");
    const part = Number(partText);
    if (request.method === "PUT") {
      const body = await request.arrayBuffer();
      const cursor = this.sql.exec(
        `INSERT OR IGNORE INTO part (blobId, part, body) VALUES (?, ?, ?)`,
        blobId,
        part,
        body,
      );
      return json(this.env, { existed: cursor.rowsWritten === 0 });
    }
    if (request.method === "GET") {
      const row = this.sql
        .exec<{ body: ArrayBuffer }>(`SELECT body FROM part WHERE blobId = ? AND part = ?`, blobId, part)
        .toArray()[0];
      return row ? bytes(this.env, row.body) : refuse(this.env, 404, "NOT_FOUND");
    }
    if (request.method === "DELETE") {
      this.sql.exec(`DELETE FROM part WHERE blobId = ?`, blobId);
      return json(this.env, {});
    }
    return refuse(this.env, 404, "NOT_FOUND");
  }
}
