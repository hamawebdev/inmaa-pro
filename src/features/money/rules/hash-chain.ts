/**
 * One step of the hash chain that makes Money's legal records tamper-evident:
 * the canonical form of a record, the previous hash, the new hash.
 *
 * Each legal table (invoices, their lines and visit rows, payments,
 * allocations, receipts, their events) is a chain: every row carries the hash
 * of the row before it, and its own hash covers everything it holds. Change
 * one figure in one old row and its hash no longer matches; change the hash
 * too and the next row's `prevHash` no longer matches. Nothing can be altered,
 * removed or slipped in without the chain showing where.
 *
 * The definitions are the data model's (its section on the hash chain):
 *
 *     canonical = JSON of the row's hashed columns, keys in ascending order,
 *                 values exactly as stored, no white space
 *     hash      = hex( SHA-256( prevHash + "\n" + table + "\n" + canonical ) )
 *     genesis   = hex( SHA-256( "GENESIS\n" + databaseId + "\n" + table ) )
 *
 * The digest is Web Crypto's, present in the program's window and in Node, so
 * nothing here needs the desktop shell. Writing a row and moving the chain's
 * head in one transaction is Foundation's `appendChained`; this file is the
 * arithmetic both it and the tests agree on.
 */

/** What SQLite stores in a hashed column: text, a whole number, or nothing. */
export type StoredValue = string | number | null;

/** A row as stored, column by column. */
export type StoredRow = Record<string, unknown>;

/**
 * The canonical text of a row.
 *
 * `columns` is the list the row's version covers: every column but `hash`. A
 * column the row lacks is an error, never a silent omission: left out, an
 * empty column and a missing one would hash alike, and a row could be verified
 * against fewer columns than it was written with. An empty column is `null`.
 *
 * The writer converts before calling: a boolean is stored as 0 or 1, an
 * instant as its ISO text, an amount as whole centimes. Anything else is
 * refused, so that what is hashed is what is stored.
 */
export function canonicalForm(columns: readonly string[], row: StoredRow): string {
  const sorted = [...columns].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const members: string[] = [];
  let previous: string | undefined;

  for (const column of sorted) {
    if (column === previous) throw new TypeError(`column "${column}" is listed twice`);
    previous = column;
    if (!Object.hasOwn(row, column)) throw new TypeError(`column "${column}" is missing from the row`);
    members.push(`${JSON.stringify(column)}:${canonicalValue(column, row[column])}`);
  }
  return `{${members.join(",")}}`;
}

function canonicalValue(column: string, value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value))
      throw new TypeError(`column "${column}" holds ${String(value)}, not a whole number`);
    return String(value === 0 ? 0 : value);
  }
  const kind =
    value instanceof Date
      ? "a Date"
      : value === undefined
        ? "undefined"
        : typeof value === "object"
          ? "an object"
          : `a ${typeof value}`;
  throw new TypeError(`column "${column}" holds ${kind}; convert it to what the database stores first`);
}

/** SHA-256 of a text's UTF-8 bytes, as 64 lower-case hex characters. */
export async function sha256Hex(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** The hash that stands before the first row of a table's chain. */
export function genesisHash(databaseId: string, table: string): Promise<string> {
  return sha256Hex(`GENESIS\n${databaseId}\n${table}`);
}

/** The hash of a row, from the hash before it and its canonical text. */
export function rowHash(prevHash: string, table: string, canonical: string): Promise<string> {
  return sha256Hex(`${prevHash}\n${table}\n${canonical}`);
}

export interface ChainHead {
  /** The last row's sequence number; 0 for an empty chain. */
  seq: number;
  /** The last row's hash; the genesis hash for an empty chain. */
  hash: string;
}

export interface ChainFields {
  chainSeq: number;
  prevHash: string;
  hash: string;
}

/**
 * The next link: given the head of a table's chain and a row without its chain
 * fields, the three fields to store with it.
 *
 * `chainSeq` and `prevHash` are part of what is hashed, so a row cannot be
 * moved to another place in the chain either.
 */
export async function chainStep(input: {
  table: string;
  /** The hashed columns of the row's version, `chainSeq` and `prevHash` among them. */
  columns: readonly string[];
  head: ChainHead;
  row: StoredRow;
}): Promise<ChainFields> {
  const chainSeq = input.head.seq + 1;
  const prevHash = input.head.hash;
  const canonical = canonicalForm(input.columns, { ...input.row, chainSeq, prevHash });
  return { chainSeq, prevHash, hash: await rowHash(prevHash, input.table, canonical) };
}

export type ChainBreak =
  /** A number is missing or repeated: a row was removed, or one was slipped in. */
  | "SEQUENCE"
  /** The row does not point at the row before it. */
  | "PREVIOUS_HASH"
  /** The row's content is not what was hashed when it was written. */
  | "CONTENT";

export type ChainVerdict =
  | { ok: true; rows: number; head: ChainHead }
  | { ok: false; rows: number; brokenSeq: number; reason: ChainBreak };

/**
 * Checks a table's chain from its first row.
 *
 * `rows` are the stored rows in `chainSeq` order, each with its `chainSeq`,
 * `prevHash` and `hash`. Returns the first place the chain does not hold.
 */
export async function verifyChain(input: {
  table: string;
  columns: readonly string[];
  genesis: string;
  rows: readonly StoredRow[];
}): Promise<ChainVerdict> {
  let head: ChainHead = { seq: 0, hash: input.genesis };

  for (let index = 0; index < input.rows.length; index += 1) {
    const row = input.rows[index];
    const expectedSeq = head.seq + 1;
    if (row.chainSeq !== expectedSeq) {
      return { ok: false, rows: index, brokenSeq: expectedSeq, reason: "SEQUENCE" };
    }
    if (row.prevHash !== head.hash) {
      return { ok: false, rows: index, brokenSeq: expectedSeq, reason: "PREVIOUS_HASH" };
    }
    const hash = await rowHash(head.hash, input.table, canonicalForm(input.columns, row));
    if (row.hash !== hash) {
      return { ok: false, rows: index, brokenSeq: expectedSeq, reason: "CONTENT" };
    }
    head = { seq: expectedSeq, hash };
  }

  return { ok: true, rows: input.rows.length, head };
}

/** What an invoice's lines and visit rows are stripped of before the invoice commits to them. */
const NOT_CONTENT = new Set(["id", "invoiceId", "chainSeq", "prevHash", "hash", "createdAt"]);

/**
 * What an invoice commits to: a digest of its lines and of its visit statement.
 *
 * Computed in memory before anything is written, and stored on the invoice
 * row, which is itself in a chain. A line added to an issued invoice, or one
 * of its amounts changed, no longer matches the digest the invoice carries.
 *
 * Each row is taken without its identity and chain fields (they do not exist
 * yet when the digest is computed), over the stated columns, in `seq` order.
 */
export async function invoiceContentDigest(input: {
  /** The hashed columns of a line and of a visit row, as for `canonicalForm`. */
  lineColumns: readonly string[];
  visitColumns: readonly string[];
  lines: readonly StoredRow[];
  visits: readonly StoredRow[];
}): Promise<string> {
  const canonicalList = (columns: readonly string[], rows: readonly StoredRow[]) => {
    const content = columns.filter((column) => !NOT_CONTENT.has(column));
    const ordered = [...rows].sort((a, b) => Number(a.seq) - Number(b.seq));
    return `[${ordered.map((row) => canonicalForm(content, row)).join(",")}]`;
  };
  return sha256Hex(
    `{"lines":${canonicalList(input.lineColumns, input.lines)},"visits":${canonicalList(input.visitColumns, input.visits)}}`,
  );
}
