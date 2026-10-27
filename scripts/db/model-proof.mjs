// The data model's proof: 157 attempts to break the rules the database promises.
//
// It runs against the REAL schema migration (src-tauri/migrations/0001_init.sql,
// with the two pragmas the program connects with), not against freshly
// generated DDL. The body below is the model's own proof, unchanged; only the
// way the database is opened and what is written at the end are this
// repository's.
//
//   node scripts/db/model-proof.mjs            run it, rewrite the tape and the log
//   node scripts/db/model-proof.mjs --check    run it and fail if the tape on disk is stale
//
// It also writes a TAPE of every statement it ran and how the engine answered
// (src-tauri/proof/model-proof.tape.json). Node's SQLite is a newer release
// than the one compiled into the program, so the Rust test
// `the_model_proof_holds_on_the_shipped_engine` replays the tape on the real
// engine and demands the same answer to every statement.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DatabaseSync } from "node:sqlite";

import { MIGRATIONS_DIR, modelsOfInit, ROOT } from "./schema-tools.mjs";

const TAPE_FILE = resolve(ROOT, "src-tauri/proof/model-proof.tape.json");
const LOG_FILE = resolve(ROOT, "src-tauri/proof/model-proof.txt");

// The proof runs on 0001 alone: the tables of later migrations are proven by their owners' tests.
const models = modelsOfInit();
const db = new DatabaseSync(":memory:");
db.exec("PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON;");
// The schema only. The seed migration is data, and the proof writes its own rows.
db.exec(readFileSync(resolve(MIGRATIONS_DIR, "0001_init.sql"), "utf8"));

const by = new Map(models.map((m) => [m.name, m]));
const NOW = "2026-10-12T08:00:00.000Z",
  TODAY = "2026-10-12";
const sha = (s) => createHash("sha256").update(s, "utf8").digest("hex");
let n = 0;
const uid = (p) => `${p}-${++n}`;
const log = [];
let pass = 0,
  fail = 0;
const ok = (name, cond) => {
  cond ? pass++ : fail++;
  log.push(`${cond ? "ok  " : "FAIL"} ${name}`);
  if (!cond) console.log("FAIL " + name);
};
const refuses = (name, fn, text) => {
  try {
    fn();
    ok(`${name} (was accepted)`, false);
  } catch (e) {
    ok(`${name} -> ${String(e.message).slice(0, 70)}`, String(e.message).includes(text));
  }
};
const accepts = (name, fn) => {
  try {
    fn();
    ok(name, true);
  } catch (e) {
    ok(`${name} -> ${e.message}`, false);
  }
};

// The tape: each statement, its parameters, and the answer. A refusal is kept as
// the part of the message both engines word the same way: a trigger's own text
// in full, a constraint by its kind.
const tape = [];
const refusal = (message) =>
  /^[A-Z_]+:/.test(message) ? message : (/^([A-Z ]+ constraint failed)/.exec(message) ?? [message])[0];
const taped = (kind, sql, params, action) => {
  try {
    const result = action();
    tape.push(kind === "get" ? { k: "get", sql, p: params, r: result ?? null } : { k: "run", sql, p: params, e: null });
    return result;
  } catch (error) {
    tape.push({ k: kind, sql, p: params, e: refusal(String(error.message)) });
    throw error;
  }
};
const get = (sql, ...p) => taped("get", sql, p, () => db.prepare(sql).get(...p));
const run = (sql, ...p) => taped("run", sql, p, () => db.prepare(sql).run(...p));

// values that satisfy the CHECK constraints
const FIXED = {
  Site: { division: "HOUSING" },
  File: { division: "HOUSING", serviceType: "CONTRACT", stage: "NEW" },
  StaffMember: { kind: "WORKER" },
  Sanction: { state: "SUSPENDED", subjectKind: "WORKER" },
  Visit: { status: "CONFIRMED", origin: "CONTRACT" },
  AuditLog: { operation: "CHANGE" },
  Invoice: { division: "HOUSING" },
  Payment: { division: "HOUSING", method: "BANK_TRANSFER", collectorKind: "OFFICE" },
  Receipt: { collectorKind: "OFFICE" },
  CashReconciliation: { collectorKind: "OFFICE" },
  ReceiptBatch: { collectorKind: "OFFICE" },
  RoleGrant: { kind: "CAPABILITY", access: "GRANTED" },
  StaffEvent: { kind: "STATUS", toStatus: "ACCEPTED" },
  HandOut: { purpose: "WORKER_KIT" },
  PayRun: { status: "DRAFT" },
  SanctionDecision: { status: "PENDING" },
  WorkerAbsence: { category: "SICK" },
  VisitWorker: { seatStatus: "ASSIGNED" },
  StaffDebtEntry: { amount: 1 },
  Expense: {},
};
const cache = {};
function make(table) {
  if (cache[table]) return cache[table];
  if (table === "File") {
    const site = make("Site");
    return (cache.File = ins("File", { siteId: site.id, clientId: site.clientId, division: site.division }));
  }
  return (cache[table] = ins(table));
}
function fill(table, over = {}) {
  const m = by.get(table);
  const row = {};
  for (const c of m.cols) {
    if (c.name in over) {
      if (over[c.name] !== undefined) row[c.name] = over[c.name];
      continue;
    }
    if (FIXED[table] && c.name in FIXED[table]) {
      row[c.name] = FIXED[table][c.name];
      continue;
    }
    if (c.optional || c.def !== null) continue;
    if (c.id) {
      row.id = uid(table);
      continue;
    }
    const rel = m.rels.find((r) => r.col === c.name);
    if (rel) {
      row[c.name] = make(rel.target).id;
      continue;
    }
    if (c.name === "userId" || /UserId$/.test(c.name)) {
      row[c.name] = make("User").id;
      continue;
    }
    row[c.name] =
      c.type === "Int" || c.type === "Boolean"
        ? 0
        : c.isDate
          ? TODAY
          : c.isTime
            ? "08:00"
            : c.type === "DateTime"
              ? NOW
              : uid(c.name);
  }
  return row;
}
function ins(table, over) {
  const row = fill(table, over);
  const cols = Object.keys(row);
  run(
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    ...cols.map((c) => row[c]),
  );
  return row;
}
const CHAINED = [
  "AuditLog",
  "Invoice",
  "InvoiceLine",
  "InvoiceVisit",
  "Payment",
  "PaymentAllocation",
  "Receipt",
  "LegalEvent",
];
for (const t of CHAINED) run(`INSERT INTO "ChainHead" VALUES (?, 0, ?, ?)`, t, sha(`GENESIS\ndb-1\n${t}`), NOW);
// canonical form: EVERY column of the table except `hash`, in ASCII order, null for an empty one (DESIGN.md section 8).
// Walking only the keys the writer happened to supply breaks verification: a column left empty is absent when hashed and present when read back.
const canonical = (table, row) =>
  JSON.stringify(
    Object.fromEntries(
      by
        .get(table)
        .cols.map((c) => c.name)
        .filter((k) => k !== "hash")
        .sort()
        .map((k) => [k, row[k] ?? null]),
    ),
  );
function chain(table, over = {}) {
  const head = get(`SELECT "lastSeq", "lastHash" FROM "ChainHead" WHERE "id" = ?`, table);
  const row = fill(table, {
    hashV: 1,
    chainSeq: head.lastSeq + 1,
    prevHash: head.lastHash,
    hash: "x".repeat(64),
    ...over,
  });
  if (!("hash" in over)) row.hash = sha(`${row.prevHash}\n${table}\n${canonical(table, row)}`);
  const cols = Object.keys(row);
  run(
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    ...cols.map((c) => row[c]),
  );
  return row;
}
const seq = (key, year) =>
  run(
    `INSERT OR IGNORE INTO "Sequence" ("id","key","year","lastValue","updatedAt") VALUES (?,?,?,0,?)`,
    `${key}-${year}`,
    key,
    year,
    NOW,
  );
const peek = (key, year) => get(`SELECT "lastValue" + 1 n FROM "Sequence" WHERE "key" = ? AND "year" = ?`, key, year).n;
const invoice = (date = TODAY, over = {}) => {
  const y = Number(date.slice(0, 4));
  seq("INVOICE", y);
  return chain("Invoice", {
    numberSeq: peek("INVOICE", y),
    numberYear: y,
    issueDate: date,
    createdAt: date + "T09:00:00.000Z",
    ...over,
  });
};
const receipt = (date = TODAY, over = {}) => {
  const y = Number(date.slice(0, 4));
  seq("RECEIPT", y);
  return chain("Receipt", {
    numberSeq: peek("RECEIPT", y),
    numberYear: y,
    issueDate: date,
    createdAt: date + "T09:00:00.000Z",
    ...over,
  });
};
const cash = (r, over = {}) =>
  chain("Payment", {
    method: "CASH",
    receiptId: r.id,
    amountWordsAr: "a",
    amountWordsFr: "b",
    receiptReason: "c",
    ...over,
  });

// ── A. structure ─────────────────────────────────────────────────────────────
ok(
  "every table is STRICT",
  db
    .prepare(
      `SELECT COUNT(*) n FROM pragma_table_list WHERE schema = 'main' AND type = 'table' AND name NOT LIKE 'sqlite_%' AND strict = 0`,
    )
    .get().n === 0,
);
ok(
  "no column is REAL or untyped",
  models.every((m) =>
    db
      .prepare(`PRAGMA table_info("${m.name}")`)
      .all()
      .every((c) => c.type === "TEXT" || c.type === "INTEGER"),
  ),
);
refuses(
  "a float in a centime column",
  () => ins("Expense", { amount: 12.5, source: "MANUAL", division: "COMMON", category: "RENT" }),
  "cannot store REAL",
);
refuses("an instant in a date column", () => ins("Expense", { date: NOW, source: "MANUAL" }), "CHECK");
refuses("a time written 8:5", () => ins("WorkerAbsence", { startTime: "8:5" }), "CHECK");

// ── B. foundation ────────────────────────────────────────────────────────────
const role = ins("Role", { id: "MANAGER", isSystem: 1 });
cache.Role = role;
const boss = ins("User", { roleId: "MANAGER" });
cache.User = boss;
refuses(
  "the last active manager deactivated",
  () => run(`UPDATE "User" SET "isActive" = 0 WHERE "id" = ?`, boss.id),
  "LAST_MANAGER",
);
refuses("a user deleted", () => run(`DELETE FROM "User" WHERE "id" = ?`, boss.id), "NO_DELETE:User");
refuses("the system role deleted", () => run(`DELETE FROM "Role" WHERE "id" = 'MANAGER'`), "NO_DELETE:Role");
refuses("backup.restore granted to a role", () => ins("RoleGrant", { key: "backup.restore" }), "CHECK");
ins("Setting", { key: "system.databaseId", value: '"db-1"' });
refuses(
  "the database id rewritten",
  () => run(`UPDATE "Setting" SET "value" = '"x"' WHERE "key" = 'system.databaseId'`),
  "FROZEN:Setting",
);
make("Branch");
run(`UPDATE "Branch" SET "isDefault" = 1`);
refuses("a second default branch", () => ins("Branch", { isDefault: 1 }), "UNIQUE");
refuses(
  "a counter seeded above 0",
  () => run(`INSERT INTO "Sequence" ("id","key","year","lastValue","updatedAt") VALUES ('s','QUOTE',2026,5,?)`, NOW),
  "SEQUENCE:seed",
);
seq("QUOTE", 2026);
run(`UPDATE "Sequence" SET "lastValue" = 40 WHERE "key" = 'QUOTE'`);
ok(
  "an ordinary counter may jump forward (a number claimed from paper)",
  get(`SELECT "lastValue" v FROM "Sequence" WHERE "key" = 'QUOTE'`).v === 40,
);
refuses(
  "an ordinary counter moved back",
  () => run(`UPDATE "Sequence" SET "lastValue" = 3 WHERE "key" = 'QUOTE'`),
  "SEQUENCE:backwards",
);

// ── C. the chained tables ────────────────────────────────────────────────────
const inv1 = invoice();
chain("InvoiceLine", { invoiceId: inv1.id, seq: 1, createdAt: inv1.createdAt });
chain("InvoiceVisit", { invoiceId: inv1.id, seq: 1, createdAt: inv1.createdAt });
const rc1 = receipt();
const pay1 = cash(rc1);
const due1 = ins("PaymentDue", { amount: 4500000, kind: "SCHEDULE", periodStart: "2026-09-01", dueDate: "2026-09-05" });
const al1 = chain("PaymentAllocation", { paymentId: pay1.id, dueId: due1.id, amount: 4500000 });
chain("AuditLog");
chain("LegalEvent", { invoiceId: inv1.id, type: "PRINTED" });
for (const t of CHAINED) {
  const id = get(`SELECT "id" FROM "${t}" LIMIT 1`).id;
  refuses(
    `${t}: update`,
    () => run(`UPDATE "${t}" SET "createdAt" = 'z' WHERE "id" = ?`, id),
    `APPEND_ONLY:${t}:update`,
  );
  refuses(`${t}: delete`, () => run(`DELETE FROM "${t}" WHERE "id" = ?`, id), `APPEND_ONLY:${t}:delete`);
  refuses(
    `${t}: INSERT OR REPLACE over a row`,
    () => run(`INSERT OR REPLACE INTO "${t}" SELECT * FROM "${t}" WHERE "id" = ?`, id),
    "",
  );
  const head = get(`SELECT "lastSeq" s FROM "ChainHead" WHERE "id" = ?`, t).s;
  ok(`${t}: the head follows the rows`, head === get(`SELECT MAX("chainSeq") s FROM "${t}"`).s);
}
refuses("a chained row with a sequence of its own", () => chain("AuditLog", { chainSeq: 99 }), "CHAIN:AuditLog");
refuses(
  "a chained row with a wrong previous hash",
  () => chain("AuditLog", { prevHash: "0".repeat(64) }),
  "CHAIN:AuditLog",
);
refuses(
  "a chain head rewound",
  () => run(`UPDATE "ChainHead" SET "lastSeq" = 0 WHERE "id" = 'Invoice'`),
  "CHAIN:ChainHead:step",
);
refuses("a chain head deleted", () => run(`DELETE FROM "ChainHead" WHERE "id" = 'Invoice'`), "NO_DELETE:ChainHead");
{
  let prev = sha("GENESIS\ndb-1\nAuditLog"),
    good = true,
    s = 0;
  for (const r of db.prepare(`SELECT * FROM "AuditLog" ORDER BY "chainSeq"`).all()) {
    if (r.chainSeq !== ++s || r.prevHash !== prev || r.hash !== sha(`${prev}\nAuditLog\n${canonical("AuditLog", r)}`))
      good = false;
    prev = r.hash;
  }
  ok(
    "the log chain verifies from genesis to head",
    good && prev === get(`SELECT "lastHash" h FROM "ChainHead" WHERE "id" = 'AuditLog'`).h,
  );
}

// ── D. the legal sequences ───────────────────────────────────────────────────
const inv2 = invoice();
ok(
  "invoices take 1 then 2, and the counter and its date follow by themselves",
  inv1.numberSeq === 1 &&
    inv2.numberSeq === 2 &&
    get(`SELECT "lastValue" v, "lastDate" d FROM "Sequence" WHERE "key" = 'INVOICE'`).d === TODAY,
);
refuses(
  "the legal counter moved by hand with no document",
  () => run(`UPDATE "Sequence" SET "lastValue" = 3 WHERE "key" = 'INVOICE'`),
  "SEQUENCE:legal_step",
);
refuses("an invoice that skips a number", () => invoice(TODAY, { numberSeq: 4 }), "LEGAL_SEQUENCE:Invoice:number");
refuses("an invoice that reuses a number", () => invoice(TODAY, { numberSeq: 2 }), "LEGAL_SEQUENCE:Invoice:number");
refuses(
  "an invoice dated before the last one",
  () => invoice("2026-10-11", { createdAt: NOW }),
  "LEGAL_SEQUENCE:Invoice:date",
);
refuses(
  "an invoice dated after the day it is written",
  () => invoice("2026-10-20", { createdAt: NOW }),
  "LEGAL_SEQUENCE:Invoice:date",
);
refuses(
  "an invoice whose year is not its number's year",
  () => invoice(TODAY, { numberYear: 2027 }),
  "LEGAL_SEQUENCE:Invoice",
);
refuses(
  "a line slipped into the invoice before the last",
  () => chain("InvoiceLine", { invoiceId: inv1.id, seq: 9, createdAt: inv1.createdAt }),
  "closed_parent",
);
refuses(
  "a line added later to the last invoice",
  () => chain("InvoiceLine", { invoiceId: inv2.id, seq: 9, createdAt: "2026-10-13T09:00:00.000Z" }),
  "closed_parent",
);
refuses(
  "a jump of the legal counter with no gap row",
  () => run(`UPDATE "Sequence" SET "lastValue" = 9, "lastDate" = '2026-10-15' WHERE "key" = 'INVOICE'`),
  "SEQUENCE:legal_step",
);
ins("SequenceGap", { key: "INVOICE", year: 2026, kind: "RESTORE", fromValue: 3, toValue: 9, auditLogId: undefined });
accepts("the same jump once a gap row covers it (restore of an older backup)", () =>
  run(`UPDATE "Sequence" SET "lastValue" = 9, "lastDate" = '2026-10-15' WHERE "key" = 'INVOICE'`),
);
refuses(
  "after the jump, an invoice dated before the lost ones",
  () => invoice("2026-10-14", { createdAt: "2026-10-16T09:00:00.000Z" }),
  "LEGAL_SEQUENCE:Invoice:date",
);
ok("after the jump the next invoice is 10", invoice("2026-10-16").numberSeq === 10);
ok("a new year starts at 1", invoice("2027-01-02").numberSeq === 1);
refuses(
  "back to the old year afterwards",
  () => invoice("2026-12-31", { createdAt: "2027-01-03T09:00:00.000Z" }),
  "LEGAL_SEQUENCE:Invoice:date",
);
refuses("a gap row edited", () => run(`UPDATE "SequenceGap" SET "toValue" = 99`), "APPEND_ONLY:SequenceGap");
ok("receipts have the same counter rules", rc1.numberSeq === 1 && receipt().numberSeq === 2);
refuses(
  "the receipt counter moved by hand",
  () => run(`UPDATE "Sequence" SET "lastValue" = 7 WHERE "key" = 'RECEIPT'`),
  "SEQUENCE:legal_step",
);

// ── E. voids, receipts, payments ─────────────────────────────────────────────
accepts("an invoice voided by one event", () =>
  chain("LegalEvent", { invoiceId: inv2.id, type: "VOIDED", reason: "wrong client" }),
);
refuses(
  "the same invoice voided twice",
  () => chain("LegalEvent", { invoiceId: inv2.id, type: "VOIDED", reason: "again" }),
  "UNIQUE",
);
refuses("a void with no reason", () => chain("LegalEvent", { invoiceId: inv1.id, type: "VOIDED" }), "CHECK");
refuses(
  "an event with two subjects",
  () => chain("LegalEvent", { invoiceId: inv1.id, paymentId: pay1.id, type: "VOIDED", reason: "r" }),
  "CHECK",
);
refuses("a cash payment with no receipt", () => chain("Payment", { method: "CASH" }), "CHECK");
refuses("a transfer that carries stamp duty", () => chain("Payment", { stampDuty: 100, totalReceived: 100 }), "CHECK");
refuses("a total that is not amount plus stamp", () => chain("Payment", { amount: 500, totalReceived: 400 }), "CHECK");
refuses("a second payment on a used receipt", () => cash(rc1), "UNIQUE");
refuses(
  "a receipt in use voided before its payment",
  () => chain("LegalEvent", { receiptId: rc1.id, type: "VOIDED", reason: "r" }),
  "RECEIPT:in_use",
);
const rc3 = receipt();
chain("LegalEvent", { receiptId: rc3.id, type: "MISSING", reason: "lost by the collector" });
refuses("a payment on a receipt reported missing", () => cash(rc3), "RECEIPT:closed");
refuses(
  "a receipt ended twice",
  () => chain("LegalEvent", { receiptId: rc3.id, type: "VOIDED", reason: "unused" }),
  "UNIQUE",
);
// voiding a cash payment: reversal rows, the payment's event, then its receipt's
ok(
  "paid on the due follows its allocations",
  get(`SELECT "paidAmount" p FROM "PaymentDue" WHERE "id" = ?`, due1.id).p === 4500000,
);
chain("PaymentAllocation", { paymentId: pay1.id, dueId: due1.id, amount: -4500000, reversesAllocationId: al1.id });
chain("LegalEvent", { paymentId: pay1.id, type: "VOIDED", reason: "typed on the wrong file" });
accepts("the receipt of a voided payment is voided after it", () =>
  chain("LegalEvent", { receiptId: rc1.id, type: "VOIDED", reason: "payment voided" }),
);
ok(
  "after the reversal the due is open again, with no event in the sum",
  get(`SELECT "paidAmount" p FROM "PaymentDue" WHERE "id" = ?`, due1.id).p === 0,
);
refuses(
  "an allocation reversed twice",
  () =>
    chain("PaymentAllocation", { paymentId: pay1.id, dueId: due1.id, amount: -4500000, reversesAllocationId: al1.id }),
  "UNIQUE",
);
refuses(
  "paidAmount written by anything but the trigger",
  () => run(`UPDATE "PaymentDue" SET "paidAmount" = 77 WHERE "id" = ?`, due1.id),
  "CACHE:PaymentDue",
);
accepts("a whole-row save that carries the right paidAmount", () =>
  run(`UPDATE "PaymentDue" SET "note" = 'x', "paidAmount" = 0 WHERE "id" = ?`, due1.id),
);
{
  const plan = db
    .prepare(
      `EXPLAIN QUERY PLAN SELECT "id" FROM "PaymentDue" WHERE "cancelledAt" IS NULL AND "paidAmount" < "amount" AND "dueDate" < '2026-10-12'`,
    )
    .all()
    .map((r) => r.detail)
    .join(" | ");
  ok(`the overdue list reads the partial index (${plan})`, plan.includes("PaymentDue_open"));
}
refuses(
  "a second live due for the same period (syncDues run twice)",
  () => ins("PaymentDue", { fileId: due1.fileId, seq: 2, kind: "SCHEDULE", periodStart: "2026-09-01" }),
  "UNIQUE",
);
run(`UPDATE "PaymentDue" SET "cancelledAt" = ? WHERE "id" = ?`, NOW, due1.id);
accepts("a cancelled due frees its period", () =>
  ins("PaymentDue", { fileId: due1.fileId, seq: 2, kind: "SCHEDULE", periodStart: "2026-09-01" }),
);
refuses(
  "invoice totals that do not add up",
  () => invoice("2027-01-03", { totalHT: 100, vatAmount: 19, totalTTC: 100, netToPay: 100, grossAmount: 100 }),
  "CHECK",
);
refuses(
  "an IFU invoice that shows VAT",
  () =>
    invoice("2027-01-03", {
      taxMode: "IFU",
      ifuMention: "m",
      vatRate: 1900,
      vatAmount: 19,
      totalHT: 100,
      totalTTC: 119,
      netToPay: 119,
      grossAmount: 119,
    }),
  "CHECK",
);
refuses(
  "stamp duty on an invoice not paid in cash",
  () => invoice("2027-01-03", { paymentMethod: "BANK_TRANSFER", stampDuty: 100, netToPay: 100 }),
  "CHECK",
);
accepts("one closing per collector and day", () => ins("CashReconciliation", { date: TODAY }));
refuses("a second closing of the same day", () => ins("CashReconciliation", { date: TODAY }), "UNIQUE");
refuses("a closing edited", () => run(`UPDATE "CashReconciliation" SET "countedCash" = 1`), "APPEND_ONLY");

// ── F. stock ─────────────────────────────────────────────────────────────────
const item = ins("StockItem", { minLevel: 10000 });
const mv = ins("StockMovement", { itemId: item.id, qty: 30000 });
ins("StockMovement", { itemId: item.id, qty: -21000 });
ok(
  "on hand follows the movements (30.000 - 21.000)",
  get(`SELECT "onHandQty" q FROM "StockItem" WHERE "id" = ?`, item.id).q === 9000,
);
refuses(
  "onHandQty written by anything but the trigger",
  () => run(`UPDATE "StockItem" SET "onHandQty" = 5 WHERE "id" = ?`, item.id),
  "CACHE:StockItem",
);
refuses(
  "a movement edited",
  () => run(`UPDATE "StockMovement" SET "qty" = 1 WHERE "id" = ?`, mv.id),
  "APPEND_ONLY:StockMovement",
);
ins("StockMovement", { itemId: item.id, qty: -30000, reversesMovementId: mv.id });
refuses(
  "a movement reversed twice",
  () => ins("StockMovement", { itemId: item.id, qty: -30000, reversesMovementId: mv.id }),
  "UNIQUE",
);
{
  const plan = db
    .prepare(
      `EXPLAIN QUERY PLAN SELECT "id" FROM "StockItem" WHERE "isActive" = 1 AND "minLevel" IS NOT NULL AND "onHandQty" <= "minLevel"`,
    )
    .all()
    .map((r) => r.detail)
    .join(" | ");
  ok(`low stock reads the partial index (${plan})`, plan.includes("StockItem_low"));
}
refuses("a job hand-out with no file", () => ins("HandOut", { purpose: "JOB" }), "CHECK");
const hl = ins("HandOutLine", { expectReturn: 0 });
refuses(
  "a hand-out line edited",
  () => run(`UPDATE "HandOutLine" SET "qty" = 2 WHERE "id" = ?`, hl.id),
  "APPEND_ONLY:HandOutLine",
);
refuses("a hand-out deleted", () => run(`DELETE FROM "HandOut"`), "NO_DELETE:HandOut");

// ── G. people ────────────────────────────────────────────────────────────────
const prun = ins("PayRun", { periodStart: "2026-09-01" });
const slip = ins("Payslip", { payRunId: prun.id });
ins("PayslipItem", { payslipId: slip.id });
const vw = make("VisitWorker");
ins("PayslipSeat", { payslipId: slip.id, visitWorkerId: vw.id });
accepts("a draft payslip is deleted with its lines and seats", () => {
  run(`DELETE FROM "Payslip" WHERE "id" = ?`, slip.id);
  if (get(`SELECT COUNT(*) n FROM "PayslipItem"`).n + get(`SELECT COUNT(*) n FROM "PayslipSeat"`).n)
    throw new Error("children left");
});
const slip2 = ins("Payslip", { payRunId: prun.id });
ins("PayslipItem", { payslipId: slip2.id });
ins("PayslipSeat", { payslipId: slip2.id, visitWorkerId: vw.id });
accepts("closing a run numbers it in the same update", () =>
  run(
    `UPDATE "PayRun" SET "status" = 'CLOSED', "numberSeq" = 1, "numberYear" = 2026, "number" = '0001/2026', "closedAt" = ? WHERE "id" = ?`,
    NOW,
    prun.id,
  ),
);
refuses(
  "a payslip inserted into a closed run",
  () => ins("Payslip", { payRunId: prun.id, staffId: ins("StaffMember", { numberSeq: 50 }).id }),
  "FROZEN:Payslip:insert",
);
refuses(
  "a closed run's period changed",
  () => run(`UPDATE "PayRun" SET "periodEnd" = '2026-12-31' WHERE "id" = ?`, prun.id),
  "FROZEN:PayRun",
);
refuses(
  "a closed run reopened",
  () => run(`UPDATE "PayRun" SET "status" = 'DRAFT' WHERE "id" = ?`, prun.id),
  "FROZEN:PayRun:status",
);
refuses("a closed run deleted", () => run(`DELETE FROM "PayRun" WHERE "id" = ?`, prun.id), "NO_DELETE:PayRun");
refuses(
  "a closed payslip's net rewritten",
  () => run(`UPDATE "Payslip" SET "netAmount" = 1 WHERE "id" = ?`, slip2.id),
  "FROZEN:Payslip:update",
);
accepts("a closed payslip's payment recorded", () =>
  run(
    `UPDATE "Payslip" SET "paidAmount" = 100, "paidDate" = '2026-10-12', "updatedAt" = ? WHERE "id" = ?`,
    NOW,
    slip2.id,
  ),
);
refuses(
  "a line added to a closed payslip",
  () => ins("PayslipItem", { payslipId: slip2.id }),
  "FROZEN:PayslipItem:insert",
);
refuses("a closed payslip deleted", () => run(`DELETE FROM "Payslip" WHERE "id" = ?`, slip2.id), "FROZEN:Payslip");
refuses(
  "a second live run for the same kind, period and branch",
  () => ins("PayRun", { periodStart: "2026-09-01", staffKind: prun.staffKind, periodType: prun.periodType }),
  "UNIQUE",
);
const prun2 = ins("PayRun", { periodStart: "2026-10-01", staffKind: prun.staffKind, periodType: prun.periodType });
const slip3 = ins("Payslip", { payRunId: prun2.id });
refuses(
  "a seat paid a second time by the next run",
  () => ins("PayslipSeat", { payslipId: slip3.id, visitWorkerId: vw.id }),
  "PAID_TWICE",
);
run(`UPDATE "PayRun" SET "status" = 'VOID' WHERE "id" = ?`, prun.id);
accepts("once the first run is voided the seat can be paid again", () =>
  ins("PayslipSeat", { payslipId: slip3.id, visitWorkerId: vw.id }),
);
accepts("after the void the period can be run again", () =>
  ins("PayRun", { periodStart: "2026-09-01", staffKind: prun.staffKind, periodType: prun.periodType }),
);

const sanction = ins("Sanction", { staffId: make("StaffMember").id });
const dec = ins("SanctionDecision", { sanctionId: sanction.id });
refuses(
  "a pending request consumed",
  () => run(`UPDATE "SanctionDecision" SET "consumedAt" = ? WHERE "id" = ?`, NOW, dec.id),
  "FROZEN:SanctionDecision:consumed",
);
run(
  `UPDATE "SanctionDecision" SET "status" = 'ALLOWED', "answeredByUserId" = ?, "answeredAt" = ?, "answerReason" = 'ok' WHERE "id" = ?`,
  boss.id,
  NOW,
  dec.id,
);
refuses(
  "the manager's answer changed",
  () => run(`UPDATE "SanctionDecision" SET "status" = 'REFUSED' WHERE "id" = ?`, dec.id),
  "FROZEN:SanctionDecision:status",
);
refuses(
  "the reason of the answer rewritten",
  () => run(`UPDATE "SanctionDecision" SET "answerReason" = 'other' WHERE "id" = ?`, dec.id),
  "FROZEN:SanctionDecision:answer",
);
accepts("a yes consumed by one registration", () =>
  run(
    `UPDATE "SanctionDecision" SET "consumedAt" = ?, "consumedEntityKind" = 'FILE', "consumedEntityId" = 'f' WHERE "id" = ?`,
    NOW,
    dec.id,
  ),
);
refuses(
  "the same yes consumed again",
  () => run(`UPDATE "SanctionDecision" SET "consumedAt" = ?, "consumedEntityId" = 'g' WHERE "id" = ?`, NOW, dec.id),
  "FROZEN:SanctionDecision:consumed",
);
const dec2 = ins("SanctionDecision", { sanctionId: sanction.id });
run(`UPDATE "SanctionDecision" SET "status" = 'REFUSED' WHERE "id" = ?`, dec2.id);
refuses(
  "a no consumed",
  () => run(`UPDATE "SanctionDecision" SET "consumedAt" = ? WHERE "id" = ?`, NOW, dec2.id),
  "FROZEN:SanctionDecision:consumed",
);
refuses("a decision deleted", () => run(`DELETE FROM "SanctionDecision"`), "NO_DELETE");
refuses(
  "a sanction with a client and a staff member",
  () => ins("Sanction", { staffId: make("StaffMember").id, clientId: make("Client").id }),
  "CHECK",
);

const st = make("StaffMember").id;
accepts("debt line 1 with its balance", () =>
  ins("StaffDebtEntry", { staffId: st, seq: 1, direction: "INCREASE", amount: 500000, balanceAfter: 500000 }),
);
refuses(
  "a debt line with a wrong balance",
  () => ins("StaffDebtEntry", { staffId: st, seq: 2, direction: "DECREASE", amount: 100000, balanceAfter: 999 }),
  "LEDGER",
);
refuses(
  "a debt line that skips a number",
  () => ins("StaffDebtEntry", { staffId: st, seq: 5, direction: "DECREASE", amount: 100000, balanceAfter: 400000 }),
  "LEDGER",
);
refuses(
  "a debt line of zero",
  () => ins("StaffDebtEntry", { staffId: st, seq: 2, direction: "DECREASE", amount: 0, balanceAfter: 500000 }),
  "",
);
accepts("debt line 2", () =>
  ins("StaffDebtEntry", { staffId: st, seq: 2, direction: "DECREASE", amount: 100000, balanceAfter: 400000 }),
);
refuses("a debt line edited", () => run(`UPDATE "StaffDebtEntry" SET "amount" = 1`), "APPEND_ONLY");
ins("StaffMember", { numberSeq: 60, nationalIdNumber: "109876543210987654" });
refuses(
  "two live workers with one national number",
  () => ins("StaffMember", { numberSeq: 61, nationalIdNumber: "109876543210987654" }),
  "UNIQUE",
);
ins("StaffDocument", { staffId: st, type: "MEDICAL_CERT" });
refuses(
  "two current documents of one type",
  () => ins("StaffDocument", { staffId: st, type: "MEDICAL_CERT" }),
  "UNIQUE",
);
refuses("a leave absence with no leave type", () => ins("WorkerAbsence", { category: "LEAVE" }), "CHECK");
refuses(
  "a staff history row edited",
  () => {
    ins("StaffEvent");
    run(`UPDATE "StaffEvent" SET "reason" = 'x'`);
  },
  "APPEND_ONLY:StaffEvent",
);

// ── H. clients and operations ────────────────────────────────────────────────
const file = make("File");
const otherSite = ins("Site", { clientId: ins("Client", { numberSeq: 70 }).id });
refuses(
  "a file on another client's site",
  () => ins("File", { siteId: otherSite.id, clientId: file.clientId, numberSeq: 71 }),
  "MISMATCH:File:site",
);
refuses(
  "a site with files moved to another client",
  () => run(`UPDATE "Site" SET "clientId" = ? WHERE "id" = ?`, otherSite.clientId, file.siteId),
  "MISMATCH:Site:files",
);
refuses("a file hard-deleted", () => run(`DELETE FROM "File" WHERE "id" = ?`, file.id), "");
refuses(
  "a file at CONTRACT_ENDED with no end date",
  () => run(`UPDATE "File" SET "stage" = 'CONTRACT_ENDED' WHERE "id" = ?`, file.id),
  "CHECK",
);
const renew = (seqNo) =>
  ins("File", {
    siteId: file.siteId,
    clientId: file.clientId,
    division: file.division,
    numberSeq: seqNo,
    renewalOfFileId: file.id,
  });
accepts("a renewal of the file", () => renew(72));
refuses("a second renewal of the same file", () => renew(73), "UNIQUE");
accepts("a «قديم» copy does not count as a renewal", () => {
  ins("File", {
    siteId: file.siteId,
    clientId: file.clientId,
    division: file.division,
    numberSeq: 74,
    copiedFromFileId: file.id,
  });
  ins("File", {
    siteId: file.siteId,
    clientId: file.clientId,
    division: file.division,
    numberSeq: 75,
    copiedFromFileId: file.id,
  });
});
refuses(
  "two files with one number on the same form",
  () =>
    ins("File", {
      siteId: file.siteId,
      clientId: file.clientId,
      division: file.division,
      numberSeq: 75,
      formKind: get(`SELECT "formKind" f FROM "File" WHERE "numberSeq" = 75`).f,
    }),
  "UNIQUE",
);
accepts("an accepted quote", () => ins("Quote", { fileId: file.id, result: "ACCEPTED" }));
refuses(
  "a second accepted quote on the file",
  () => ins("Quote", { fileId: file.id, result: "ACCEPTED", numberSeq: 2 }),
  "UNIQUE",
);
refuses("a service row with neither code nor label", () => ins("FileService", { fileId: file.id }), "CHECK");
accepts("an option with the detail typed on its dotted line", () =>
  ins("FileService", { fileId: file.id, list: "PROVIDED", code: "APPLIANCES", customLabel: "المكيفات" }),
);
ins("FileService", { fileId: file.id, list: "PROVIDED", customLabel: "a", blankSlot: 1 });
refuses(
  "two texts on one blank line",
  () => ins("FileService", { fileId: file.id, list: "PROVIDED", customLabel: "b", blankSlot: 1 }),
  "UNIQUE",
);
ins("Contact", { siteId: file.siteId, clientId: file.clientId, isCoordinator: 1 });
refuses(
  "two coordinators on one site",
  () => ins("Contact", { siteId: file.siteId, clientId: file.clientId, isCoordinator: 1 }),
  "UNIQUE",
);

const slot = ins("FileSlot", { fileId: file.id });
const visit = ins("Visit", {
  fileId: file.id,
  fileSlotId: slot.id,
  slotDate: "2026-11-01",
  visitDate: "2026-11-01",
  numberSeq: 1,
});
run(`UPDATE "Visit" SET "visitDate" = '2026-11-03' WHERE "id" = ?`, visit.id);
refuses(
  "the generator run again after a visit was moved",
  () =>
    ins("Visit", {
      fileId: file.id,
      fileSlotId: slot.id,
      slotDate: "2026-11-01",
      visitDate: "2026-11-01",
      numberSeq: 2,
    }),
  "UNIQUE",
);
run(`UPDATE "Visit" SET "status" = 'CANCELLED', "statusReason" = 'PROGRAMME_CHANGED' WHERE "id" = ?`, visit.id);
accepts("a visit cancelled because the programme changed frees its slot", () =>
  ins("Visit", { fileId: file.id, fileSlotId: slot.id, slotDate: "2026-11-01", visitDate: "2026-11-01", numberSeq: 2 }),
);
refuses("a visit deleted", () => run(`DELETE FROM "Visit" WHERE "id" = ?`, visit.id), "");
refuses(
  "a visit with a status outside the seven",
  () => run(`UPDATE "Visit" SET "status" = 'LATE' WHERE "id" = ?`, visit.id),
  "CHECK",
);
refuses(
  "an absent seat with no absence row",
  () => ins("VisitWorker", { visitId: visit.id, workerId: st, seatStatus: "ABSENT" }),
  "CHECK",
);
ins("VisitWorker", { visitId: visit.id, workerId: st, seatStatus: "RESTING" });
refuses(
  "the resting worker seated again on her rest day",
  () => ins("VisitWorker", { visitId: visit.id, workerId: st }),
  "UNIQUE",
);
ins("Inspection", { fileId: file.id, planPeriod: "2026-11", numberSeq: 1 });
refuses(
  "two planned inspections for one file and month",
  () => ins("Inspection", { fileId: file.id, planPeriod: "2026-11", numberSeq: 2 }),
  "UNIQUE",
);
refuses(
  "a supervisor row with a zone and a worker",
  () => ins("SupervisorAssignment", { zoneId: make("Zone").id, workerId: st }),
  "CHECK",
);

const tapeText =
  JSON.stringify({
    migration: "0001_init.sql",
    pragmas: ["foreign_keys = ON", "recursive_triggers = ON"],
    steps: tape,
  }) + "\n";
const logText = log.join("\n") + `\n${pass} passed, ${fail} failed\n`;
console.log(`${pass} passed, ${fail} failed; ${tape.length} statements on the tape`);
if (process.argv.includes("--check")) {
  const stale = !existsSync(TAPE_FILE) || readFileSync(TAPE_FILE, "utf8") !== tapeText;
  if (stale)
    console.log("The tape on disk is stale: run `node scripts/db/model-proof.mjs` and commit src-tauri/proof/.");
  process.exit(fail || stale ? 1 : 0);
}
writeFileSync(TAPE_FILE, tapeText);
writeFileSync(LOG_FILE, logText);
process.exit(fail ? 1 : 0);
