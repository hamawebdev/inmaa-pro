import { sql, type Insertable, type Selectable } from "kysely";

import { appendChained, invoiceContentDigest } from "@/lib/chain";
import { CHAINED_TABLES, type ChainedTable } from "@/lib/db/chain-columns";
import type { TableName } from "@/lib/db/column-meta";
import type { DB } from "@/lib/db/schema";
import { withStampedTransaction } from "@/lib/sync/session";
import { peekLegalNumber } from "@/lib/numbering";
import type { Executor, ServiceContext } from "@/lib/service/context";

import type { TestDatabase } from "./database";
import { TABLE_SHAPES } from "./table-shapes";

/**
 * Rows written by hand, for tests.
 *
 *     const site = await test.rows.insert("Site", { photoConsent: 1 });
 *     const file = await test.rows.insert("File", { siteId: site.id, clientId: site.clientId, division: site.division });
 *
 * `insert` gives every required column a value the database accepts, creates
 * the parents a row cannot exist without (one of each, reused), and returns
 * the row as the database holds it. Give the columns the test is about; leave
 * the rest. A row of a chained table goes through `appendChained`, and an
 * invoice or a receipt takes the next legal number, because nothing else can
 * be inserted there.
 *
 * This is for arranging a test, and for the model's own tests. A scenario test
 * calls the owners' services instead: a raw insert skips their rules.
 */
export interface Rows {
  insert<T extends TableName>(
    table: T,
    over?: Partial<Insertable<DB[T]>>,
    at?: { ex?: Executor; ctx?: ServiceContext },
  ): Promise<Selectable<DB[T]>>;
  /** One row of a table, created the first time it is asked for. What `insert` uses for a parent nobody gave. */
  make<T extends TableName>(table: T, at?: { ex?: Executor; ctx?: ServiceContext }): Promise<Selectable<DB[T]>>;
  /** The values `insert` would write, without writing them. */
  fill(
    table: TableName,
    over?: Record<string, unknown>,
    at?: { ex?: Executor; ctx?: ServiceContext },
  ): Promise<Record<string, unknown>>;
}

/** Values that satisfy the CHECK constraints of a table when the test gives none. */
const FIXED: Readonly<Record<string, Record<string, unknown>>> = {
  RoleGrant: { kind: "CAPABILITY", access: "GRANTED" },
  AuditLog: { operation: "CHANGE" },
  StaffMember: { kind: "WORKER", sex: "F" },
  StaffEvent: { kind: "STATUS", toStatus: "ACCEPTED" },
  Sanction: { state: "SUSPENDED", subjectKind: "WORKER" },
  SanctionDecision: { status: "PENDING" },
  PayRun: { status: "DRAFT" },
  StaffDebtEntry: { amount: 1, direction: "INCREASE", balanceAfter: 1, seq: 1 },
  Site: { division: "HOUSING" },
  File: { division: "HOUSING", serviceType: "CONTRACT", stage: "NEW" },
  Visit: { status: "CONFIRMED", origin: "CONTRACT" },
  VisitWorker: { seatStatus: "ASSIGNED" },
  WorkerAbsence: { category: "SICK" },
  Invoice: { division: "HOUSING" },
  Payment: { division: "HOUSING", method: "BANK_TRANSFER", collectorKind: "OFFICE" },
  Receipt: { collectorKind: "OFFICE" },
  ReceiptBatch: { collectorKind: "OFFICE" },
  CashReconciliation: { collectorKind: "OFFICE" },
  LegalEvent: { type: "PRINTED" },
  HandOut: { purpose: "WORKER_KIT" },
};

/** Tables whose seeded or first-run row serves as the parent, instead of a new one. */
const EXISTING: Readonly<Record<string, string>> = {
  Branch: "branch-main",
  User: "user-manager",
  Role: "ADMINISTRATION",
};

/** Whole-number columns that must differ from row to row: they are part of a unique index. */
const COUNTED = new Set(["numberSeq", "seq", "version"]);

/**
 * A row made by hand takes its document number from far above anything a
 * counter gives in a test: `nextNumber` starts at 1, and a hand-made worker
 * numbered 1 would take the number of the first one a service registers.
 */
const HAND_MADE_NUMBERS_FROM = 900_000;

const isChained = (table: string): table is ChainedTable => (CHAINED_TABLES as readonly string[]).includes(table);

/** One counter for every database a test file opens: a copy "restored" from another already holds its rows. */
let counter = 0;
const uid = (prefix: string) => `${prefix}-${++counter}`;

export function createRows(test: Pick<TestDatabase, "db" | "ctx">): Rows {
  const made = new Map<string, Record<string, unknown>>();

  async function read(ex: Executor, table: string, id: unknown): Promise<Record<string, unknown>> {
    const found = await sql<Record<string, unknown>>`SELECT * FROM ${sql.table(table)} WHERE "id" = ${id}`.execute(ex);
    if (!found.rows[0]) throw new Error(`rows: ${table} ${String(id)} was not found after its insert`);
    return found.rows[0];
  }

  async function make(
    table: string,
    at: { ex?: Executor; ctx?: ServiceContext } = {},
  ): Promise<Record<string, unknown>> {
    const cached = made.get(table);
    if (cached) return cached;
    const ex = at.ex ?? test.db;
    const preset = EXISTING[table];
    if (preset) {
      const found = await sql<
        Record<string, unknown>
      >`SELECT * FROM ${sql.table(table)} WHERE "id" = ${preset}`.execute(ex);
      if (found.rows[0]) {
        made.set(table, found.rows[0]);
        return found.rows[0];
      }
    }
    const row = await insert(table, {}, at);
    made.set(table, row);
    return row;
  }

  async function fill(
    table: string,
    over: Record<string, unknown> = {},
    at: { ex?: Executor; ctx?: ServiceContext } = {},
  ): Promise<Record<string, unknown>> {
    const shape = TABLE_SHAPES[table];
    if (!shape) throw new Error(`rows: no table named ${table}`);
    const ctx = at.ctx ?? test.ctx();
    const ex = at.ex ?? test.db;
    const fixed = FIXED[table] ?? {};
    const chained = isChained(table);
    const row: Record<string, unknown> = {};

    // A file's site decides its client and its division: the database checks they agree.
    if (table === "File" && over.siteId === undefined) {
      const site = await make("Site", at);
      over = { siteId: site.id, clientId: site.clientId, division: site.division, ...over };
    }
    // A legal document carries the next number of its sequence, and a date in that year.
    if ((table === "Invoice" || table === "Receipt") && over.numberSeq === undefined) {
      const date = (over.issueDate as typeof ctx.today | undefined) ?? ctx.today;
      const next = await peekLegalNumber(ex, ctx, table === "Invoice" ? "INVOICE" : "RECEIPT", { date });
      over = { issueDate: date, numberSeq: next.seq, numberYear: next.year, number: next.display, ...over };
    }
    // An invoice commits to its lines: with none given, to no lines (a test that adds lines gives the digest).
    if (table === "Invoice" && over.contentDigest === undefined) {
      over = { contentDigest: await invoiceContentDigest({ lines: [], visits: [] }), ...over };
    }
    // Exactly one subject for an event on a legal document.
    if (
      table === "LegalEvent" &&
      over.invoiceId === undefined &&
      over.paymentId === undefined &&
      over.receiptId === undefined
    ) {
      over = { invoiceId: (await make("Invoice", at)).id, ...over };
    }

    for (const [name, kind, need, references] of shape) {
      if (chained && (name === "hashV" || name === "chainSeq" || name === "prevHash" || name === "hash")) continue;
      if (name in over) {
        if (over[name] !== undefined) row[name] = over[name];
        continue;
      }
      if (name in fixed) {
        row[name] = fixed[name];
        continue;
      }
      if (need === "def") continue;
      if (need === "opt") {
        // A chained row is hashed with every column present: an empty one is written null.
        if (chained) row[name] = null;
        continue;
      }
      if (need === "id") row[name] = uid(table);
      else if (references) row[name] = (await make(references, at)).id;
      else if (kind === "int" && name === "numberSeq") row[name] = HAND_MADE_NUMBERS_FROM + ++counter;
      else if (kind === "int") row[name] = COUNTED.has(name) ? ++counter : 0;
      else if (kind === "bool") row[name] = 0;
      else if (kind === "date") row[name] = ctx.today;
      else if (kind === "time") row[name] = "08:00";
      else if (kind === "instant") row[name] = ctx.now;
      else row[name] = uid(name);
    }
    return row;
  }

  async function insert(
    table: string,
    over: Record<string, unknown> = {},
    at: { ex?: Executor; ctx?: ServiceContext } = {},
  ): Promise<Record<string, unknown>> {
    // Outside a transaction, one of its own, stamped: once sync is set up the capture triggers refuse an unstamped write.
    if (!at.ex) {
      // Parents made inside a transaction that rolls back are forgotten with it.
      const known = new Set(made.keys());
      try {
        return await withStampedTransaction(test.db, at.ctx ?? test.ctx(), (ex, ctx) =>
          insert(table, over, { ex, ctx }),
        );
      } catch (error) {
        for (const key of [...made.keys()]) if (!known.has(key)) made.delete(key);
        throw error;
      }
    }
    const ex = at.ex;
    const ctx = at.ctx ?? test.ctx();
    const row = await fill(table, over, { ex, ctx });
    if (isChained(table)) {
      await appendChained(ex, ctx, table, row);
    } else {
      const columns = Object.keys(row);
      await sql`INSERT INTO ${sql.table(table)} (${sql.join(columns.map((column) => sql.ref(column)))}) VALUES (${sql.join(columns.map((column) => row[column]))})`.execute(
        ex,
      );
    }
    return read(ex, table, row.id);
  }

  return { insert, make, fill } as unknown as Rows;
}
