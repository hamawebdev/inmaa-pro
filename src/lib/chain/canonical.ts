import { CHAIN_COLUMNS, CURRENT_HASH_VERSION, type ChainColumn, type ChainedTable } from "@/lib/db/chain-columns";

/**
 * The exact text a hash-chained row is hashed as (docs/data-model/DESIGN.md section 8).
 *
 * A JSON object whose keys are the columns that version of the hash covers, in
 * ascending ASCII order, and whose values are exactly what SQLite stores: text
 * as a string, an integer as digits, an empty column as `null` — written, never
 * left out. No whitespace.
 *
 * The strictness is the point. A row is hashed when written and hashed again,
 * from what the database returns, when verified. Anything that can differ
 * between those two readings breaks the chain for a row nobody touched: a
 * column left out, a boolean (stored as 0/1), a Date (stored as text), a
 * fraction (the table would refuse it anyway). So each of them is an error
 * here, at the writer, and not a mystery later.
 */
export function canonical(table: ChainedTable, hashV: number, row: Record<string, unknown>): string {
  const columns = CHAIN_COLUMNS[table][hashV];
  if (!columns) throw new Error(`canonical: ${table} has no hash version ${hashV}`);
  return canonicalOver(table, columns, row);
}

/** The canonical text of a row over a given list of its columns. */
function canonicalOver(table: ChainedTable, columns: readonly ChainColumn[], row: Record<string, unknown>): string {
  const entries = columns
    .map(([name, type]) => {
      const value = row[name];
      if (value === undefined)
        throw new Error(`canonical: ${table}.${name} is missing. Every column is given, an empty one as null.`);
      if (value === null) return [name, null] as const;
      if (type === "INTEGER") {
        if (typeof value !== "number" || !Number.isSafeInteger(value)) {
          throw new Error(
            `canonical: ${table}.${name} must be a whole number as the database stores it (a yes/no is 0 or 1).`,
          );
        }
        return [name, value] as const;
      }
      if (typeof value !== "string") {
        throw new Error(
          `canonical: ${table}.${name} must be text as the database stores it (an instant is its ISO string).`,
        );
      }
      return [name, value] as const;
    })
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  return JSON.stringify(Object.fromEntries(entries));
}

/** Any JSON value with its object keys in ascending order, at every depth. For digests of nested content. */
export function canonicalJson(value: unknown): string {
  const sort = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(sort);
    if (node && typeof node === "object") {
      return Object.fromEntries(
        Object.entries(node as Record<string, unknown>)
          .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
          .map(([key, child]) => [key, sort(child)]),
      );
    }
    return node;
  };
  return JSON.stringify(sort(value));
}

/** SHA-256 of a text, as 64 lower-case hex characters. Web Crypto: present in the webview and in Node. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Where a chain starts: it depends on the database, so two databases never
 * share a chain. A chain is a table's name, or a laptop's own log chain
 * (`AuditLog:<deviceId>`, DECISION section 5), whose genesis names it too, so
 * the two laptops' log chains never share a link.
 */
export function genesisHash(databaseId: string, chain: ChainedTable | `AuditLog:${string}`): Promise<string> {
  return sha256Hex(`GENESIS\n${databaseId}\n${chain}`);
}

export function rowHash(table: ChainedTable, prevHash: string, canonicalText: string): Promise<string> {
  return sha256Hex(`${prevHash}\n${table}\n${canonicalText}`);
}

/** What an invoice's lines and visit rows are taken without: they exist only once the row is chained. */
const DIGEST_LEFT_OUT: ReadonlySet<string> = new Set(["id", "invoiceId", "chainSeq", "prevHash", "hash", "createdAt"]);

/**
 * What an invoice commits to: its lines and its visit statement, in `seq`
 * order, each as the canonical text of the columns of its hash version less
 * the ones above (`hashV` stays). Computed in memory before anything is
 * inserted, and stored in `Invoice.contentDigest`; `verifyChains` computes it
 * again from the rows as read back.
 *
 * Over the columns of the row's version, not "every column the row has": a
 * later migration that adds a column to `InvoiceLine` must leave the digests
 * of older invoices true, as it leaves their row hashes. A row not yet written
 * has no `hashV`; it is taken at the current version, which `appendChained`
 * will give it.
 *
 *     {"lines":[{…},{…}],"visits":[{…}]}       sha256 of this text, in hex
 */
export function invoiceContentDigest(content: {
  lines: ReadonlyArray<Record<string, unknown>>;
  visits: ReadonlyArray<Record<string, unknown>>;
}): Promise<string> {
  const part = (table: "InvoiceLine" | "InvoiceVisit", rows: ReadonlyArray<Record<string, unknown>>) =>
    [...rows]
      .sort((a, b) => Number(a.seq) - Number(b.seq))
      .map((row) => {
        const hashV = row.hashV === undefined || row.hashV === null ? CURRENT_HASH_VERSION[table] : Number(row.hashV);
        const columns = CHAIN_COLUMNS[table][hashV];
        if (!columns) throw new Error(`canonical: ${table} has no hash version ${hashV}`);
        const content = columns.filter(([name]) => !DIGEST_LEFT_OUT.has(name));
        return canonicalOver(table, content, { ...row, hashV });
      })
      .join(",");
  return sha256Hex(
    `{"lines":[${part("InvoiceLine", content.lines)}],"visits":[${part("InvoiceVisit", content.visits)}]}`,
  );
}
