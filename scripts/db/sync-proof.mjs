// The sync proof: what migration 0005 promises (DESIGN.md section 20), tried on the
// database every migration makes, as the program opens it.
//
//   node scripts/db/sync-proof.mjs            run it, rewrite the tape and the log
//   node scripts/db/sync-proof.mjs --check    run it and fail if the tape on disk is stale
//
// The model's proof (model-proof.mjs) stays on 0001 alone, unchanged. This one runs on
// the full set, because capture, the per-laptop log chain and the sync tables exist
// only from 0005. Like the model's proof it writes a TAPE of every statement and how
// Node's SQLite answered (src-tauri/proof/sync-proof.tape.json); the Rust test
// `the_sync_proof_holds_on_the_shipped_engine` replays it on sqlx's SQLite after the
// program's own migrator has applied every migration, and demands the same answers.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { openMigratedDatabase, parseSchema, ROOT } from "./schema-tools.mjs";

const TAPE_FILE = resolve(ROOT, "src-tauri/proof/sync-proof.tape.json");
const LOG_FILE = resolve(ROOT, "src-tauri/proof/sync-proof.txt");

const models = parseSchema();
const by = new Map(models.map((m) => [m.name, m]));
const db = await openMigratedDatabase();

const NOW = "2026-10-31T08:00:00.000Z",
  TODAY = "2026-10-31";
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

const tape = [];
const refusal = (message) =>
  /^[A-Z_]+(:|$)/.test(message) ? message : (/^([A-Z ]+ constraint failed)/.exec(message) ?? [message])[0];
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
const get = (sql, ...p) => {
  const row = taped("get", sql, p, () => db.prepare(sql).get(...p));
  return row ? { ...row } : row;
};
const run = (sql, ...p) => taped("run", sql, p, () => db.prepare(sql).run(...p));
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

// Rows: every required column filled, parents made on demand (as the model's proof does).
const FIXED = {
  AuditLog: { operation: "CHANGE" },
  StockItem: { kind: "MATERIAL", unit: "PIECE", tracking: "QUANTITY" },
  StockMovement: { type: "ADJUST", branchId: "branch-main" },
  User: { roleId: "MANAGER", branchId: "branch-main" },
};
const cache = {};
const make = (table) => cache[table] ?? (cache[table] = ins(table));
function fill(table, over = {}) {
  const row = {};
  for (const c of by.get(table).cols) {
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
    const rel = by.get(table).rels.find((r) => r.col === c.name);
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
const canonical = (row, cols) => JSON.stringify(Object.fromEntries([...cols].sort().map((k) => [k, row[k] ?? null])));
/** A log row on `chain` (null: the 1.0.0 chain), hash version 2. */
function logRow(chain, over = {}) {
  const head = get(`SELECT "lastSeq", "lastHash" FROM "ChainHead" WHERE "id" = ?`, chain ?? "AuditLog");
  const row = fill("AuditLog", {
    hashV: 2,
    chain,
    chainSeq: (head?.lastSeq ?? 0) + 1,
    prevHash: head?.lastHash ?? "0".repeat(64),
    hash: "x".repeat(64),
    ...over,
  });
  if (!("hash" in over)) {
    const cols = by
      .get("AuditLog")
      .cols.map((c) => c.name)
      .filter((k) => k !== "hash");
    row.hash = sha(`${row.prevHash}\nAuditLog\n${canonical(row, cols)}`);
  }
  const cols = Object.keys(row);
  run(
    `INSERT INTO "AuditLog" (${cols.map((c) => `"${c}"`).join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    ...cols.map((c) => row[c]),
  );
  return row;
}
const outbox = () => get(`SELECT COUNT(*) AS "n" FROM "SyncOutbox"`).n;
const lastChange = () =>
  get(`SELECT "txId", "hlc", "tbl", "rowId", "op", "data" FROM "SyncOutbox" ORDER BY "seq" DESC LIMIT 1`);
const stamp = (txId, hlc) => run(`UPDATE "SyncSession" SET "txId" = ?, "hlc" = ? WHERE "id" = 'session'`, txId, hlc);
const unstamp = () => run(`UPDATE "SyncSession" SET "txId" = NULL WHERE "id" = 'session'`);
const HLC1 = "1761897600000.0000.dev-a",
  HLC2 = "1761897600001.0000.dev-a",
  HLC3 = "1761897600002.0000.dev-a";

// ── A. the sync tables ────────────────────────────────────────────────────────
ok(
  "the one SyncSession row, capture off",
  JSON.stringify(get(`SELECT "id", "capturing", "applying", "txId", "hlc" FROM "SyncSession"`)) ===
    JSON.stringify({ id: "session", capturing: 0, applying: 0, txId: null, hlc: null }),
);
refuses("a second SyncSession row", () => run(`INSERT INTO "SyncSession" ("id") VALUES ('other')`), "CHECK");
refuses("the SyncSession row deleted", () => run(`DELETE FROM "SyncSession"`), "NO_DELETE:SyncSession");
refuses("capturing set to 2", () => run(`UPDATE "SyncSession" SET "capturing" = 2`), "CHECK");
refuses(
  "an outbox row with an unknown op",
  () => run(`INSERT INTO "SyncOutbox" ("txId","hlc","tbl","rowId","op","data") VALUES ('t','h','Zone','z','X','{}')`),
  "CHECK",
);
refuses("a third laptop slot", () => ins("SyncDevice", { slot: 2 }), "CHECK");
const deviceA = ins("SyncDevice", { id: "dev-a", slot: 0 });
refuses("two active laptops in one slot", () => ins("SyncDevice", { id: "dev-c", slot: 0 }), "UNIQUE");
refuses(
  "a laptop removed without a reason",
  () => run(`UPDATE "SyncDevice" SET "removedAt" = ? WHERE "id" = 'dev-a'`, NOW),
  "CHECK",
);
refuses("a laptop row deleted", () => run(`DELETE FROM "SyncDevice" WHERE "id" = 'dev-a'`), "NO_DELETE:SyncDevice");
refuses(
  "books under another id",
  () => ins("SyncBooks", { id: "other", holderDeviceId: deviceA.id, epoch: 1 }),
  "CHECK",
);
refuses(
  "books taken by force without a reason",
  () => ins("SyncBooks", { id: "books", holderDeviceId: deviceA.id, epoch: 1, forced: 1 }),
  "CHECK",
);
accepts("the books on the director's laptop", () =>
  ins("SyncBooks", { id: "books", holderDeviceId: deviceA.id, epoch: 1 }),
);
refuses(
  "a number block of an unknown kind",
  () => ins("NumberBlock", { deviceId: deviceA.id, key: "CLIENT", size: 10, kind: "OTHER" }),
  "CHECK",
);
refuses(
  "a block using more numbers than it holds",
  () => ins("NumberBlock", { deviceId: deviceA.id, key: "CLIENT", size: 10, kind: "START", used: 11 }),
  "CHECK",
);
accepts("a starting block", () =>
  ins("NumberBlock", { id: "CLIENT-0-0-dev-a", deviceId: deviceA.id, key: "CLIENT", size: 10, kind: "START" }),
);

// ── B. capture off: nothing is copied ─────────────────────────────────────────
const zone = ins("Zone");
ok("capture off: an insert is not copied", outbox() === 0);
run(`UPDATE "Zone" SET "name" = 'off' WHERE "id" = ?`, zone.id);
ok(
  "capture off: a change is not copied, no field stamp",
  outbox() === 0 && get(`SELECT COUNT(*) AS "n" FROM "SyncCell"`).n === 0,
);

// ── C. capture on ─────────────────────────────────────────────────────────────
run(`UPDATE "SyncSession" SET "capturing" = 1`);
refuses("an insert in a transaction nobody stamped", () => ins("Zone"), "SYNC_UNSTAMPED");
refuses(
  "a change in a transaction nobody stamped",
  () => run(`UPDATE "Zone" SET "name" = 'x' WHERE "id" = ?`, zone.id),
  "SYNC_UNSTAMPED",
);
ok("a refused write leaves nothing in the outbox", outbox() === 0);
stamp("tx-1", HLC1);
const z2 = ins("Zone", { name: "عين البيضاء" });
{
  const c = lastChange();
  const data = JSON.parse(c.data);
  ok(
    "an insert is copied whole: every column, as stored",
    c.op === "I" &&
      c.tbl === "Zone" &&
      c.rowId === z2.id &&
      c.txId === "tx-1" &&
      c.hlc === HLC1 &&
      JSON.stringify(Object.keys(data).sort()) ===
        JSON.stringify(
          by
            .get("Zone")
            .cols.map((x) => x.name)
            .sort(),
        ) &&
      data.name === "عين البيضاء" &&
      data.isActive === 1 &&
      data.note === null,
  );
}
run(`UPDATE "Zone" SET "name" = 'B', "note" = 'n' WHERE "id" = ?`, z2.id);
ok(
  "a change copies the changed fields only, each with the stamp it replaced (none yet)",
  lastChange().op === "U" && lastChange().data === '{"name":["B",null],"note":["n",null]}',
);
ok(
  "a change stamps each changed field",
  JSON.stringify(
    db
      .prepare(`SELECT "col", "hlc" FROM "SyncCell" WHERE "tbl" = 'Zone' AND "rowId" = ? ORDER BY "col"`)
      .all(z2.id)
      .map((r) => [r.col, r.hlc]),
  ) ===
    JSON.stringify([
      ["name", HLC1],
      ["note", HLC1],
    ]),
);
stamp("tx-2", HLC2);
run(`UPDATE "Zone" SET "name" = 'C' WHERE "id" = ?`, z2.id);
ok(
  "a later change carries the stamp the field had",
  lastChange().data === `{"name":["C","${HLC1}"]}` &&
    get(`SELECT "hlc" FROM "SyncCell" WHERE "tbl" = 'Zone' AND "rowId" = ? AND "col" = 'name'`, z2.id).hlc === HLC2,
);
{
  const before = outbox();
  run(`UPDATE "Zone" SET "name" = 'C' WHERE "id" = ?`, z2.id);
  ok("a change that changes nothing is not copied", outbox() === before);
}
run(`UPDATE "Zone" SET "note" = NULL WHERE "id" = ?`, z2.id);
ok("a field emptied is copied as null", lastChange().data === `{"note":[null,"${HLC1}"]}`);

// The settings this laptop keeps to itself.
{
  const before = outbox();
  ins("Setting", { id: "setting-system.x", key: "system.dayStart", value: "{}" });
  run(`UPDATE "Setting" SET "value" = '{"a":1}' WHERE "key" = 'system.dayStart'`);
  ins("Setting", { id: "setting-backup.folder", key: "backup.folder", value: '"D:/b"' });
  run(`DELETE FROM "Setting" WHERE "key" = 'backup.folder'`);
  ok("a system.* or backup.* setting is never copied", outbox() === before);
  ins("Setting", { id: "setting-ui.x", key: "stamp.minimum", value: "1" });
  ok("another setting is copied", lastChange().tbl === "Setting" && lastChange().op === "I");
  run(`DELETE FROM "Setting" WHERE "key" = 'stamp.minimum'`);
  ok(
    "a delete is copied with the whole old row",
    lastChange().op === "D" && JSON.parse(lastChange().data).key === "stamp.minimum",
  );
}

// The cached totals and the sign-in counters: this laptop's own.
{
  const user = make("User");
  const item = ins("StockItem");
  ok("a stock item's insert is copied with its total as inserted", JSON.parse(lastChange().data).onHandQty === 0);
  const before = outbox();
  ins("StockMovement", { itemId: item.id, qty: 5000 });
  ok(
    "a movement is copied, the total it moves is not",
    outbox() === before + 1 &&
      lastChange().tbl === "StockMovement" &&
      get(`SELECT "onHandQty" FROM "StockItem" WHERE "id" = ?`, item.id).onHandQty === 5000,
  );
  ok(
    "the cached total took no field stamp",
    get(`SELECT COUNT(*) AS "n" FROM "SyncCell" WHERE "tbl" = 'StockItem'`).n === 0,
  );
  const at = outbox();
  run(`UPDATE "User" SET "failedSignInCount" = 1, "lastSignInAt" = ? WHERE "id" = ?`, NOW, user.id);
  ok("a sign-in's counters alone are not copied", outbox() === at);
  run(`UPDATE "User" SET "failedSignInCount" = 0, "displayName" = 'حمدي رضا' WHERE "id" = ?`, user.id);
  ok(
    "a change with the counters copies the other fields only",
    lastChange().tbl === "User" && lastChange().data === '{"displayName":["حمدي رضا",null]}',
  );
}

// Applying the other laptop's changes: not copied back.
run(`UPDATE "SyncSession" SET "applying" = 1, "txId" = NULL`);
{
  const before = outbox();
  const cells = get(`SELECT COUNT(*) AS "n" FROM "SyncCell"`).n;
  accepts("while applying, a write needs no stamp", () => ins("Zone", { id: "zone-applied" }));
  run(`UPDATE "Zone" SET "name" = 'applied' WHERE "id" = 'zone-applied'`);
  ok(
    "while applying, nothing is copied and no field stamp moves",
    outbox() === before && get(`SELECT COUNT(*) AS "n" FROM "SyncCell"`).n === cells,
  );
}
run(`UPDATE "SyncSession" SET "applying" = 0`);
stamp("tx-3", HLC3);

// An append-only table: its insert is copied, and it still refuses changes.
refuses(
  "an append-only row still cannot change",
  () => run(`UPDATE "StockMovement" SET "qty" = 1`),
  "APPEND_ONLY:StockMovement:update",
);

// ── D. one log chain per laptop ───────────────────────────────────────────────
const genesis = (chain) => sha(`GENESIS\ndb-1\n${chain}`);
run(`INSERT INTO "ChainHead" VALUES ('AuditLog', 0, ?, ?)`, genesis("AuditLog"), NOW);
for (const t of ["Invoice", "InvoiceLine", "InvoiceVisit", "Payment", "PaymentAllocation", "Receipt", "LegalEvent"])
  run(`INSERT INTO "ChainHead" VALUES (?, 0, ?, ?)`, t, genesis(t), NOW);
accepts("a row on the 1.0.0 chain (chain null)", () => logRow(null));
accepts("a second one", () => logRow(null));
ok("the 1.0.0 head moved", get(`SELECT "lastSeq" FROM "ChainHead" WHERE "id" = 'AuditLog'`).lastSeq === 2);
refuses(
  "a row on a laptop chain that has no head yet",
  () => logRow("AuditLog:dev-a"),
  "CHAIN:AuditLog:out_of_sequence",
);
run(`INSERT INTO "ChainHead" VALUES ('AuditLog:dev-a', 0, ?, ?)`, genesis("AuditLog:dev-a"), NOW);
run(`INSERT INTO "ChainHead" VALUES ('AuditLog:dev-b', 0, ?, ?)`, genesis("AuditLog:dev-b"), NOW);
refuses(
  "a laptop chain's head seeded above 0",
  () => run(`INSERT INTO "ChainHead" VALUES ('AuditLog:dev-x', 3, ?, ?)`, genesis("AuditLog:dev-x"), NOW),
  "CHAIN:ChainHead:seed",
);
let a1;
accepts("laptop A's first row: seq 1 on its own chain, from its genesis", () => (a1 = logRow("AuditLog:dev-a")));
ok("it was copied for the other laptop, chain included", JSON.parse(lastChange().data).chain === "AuditLog:dev-a");
accepts("laptop B's first row: seq 1 too, on its chain", () => logRow("AuditLog:dev-b"));
accepts("laptop A's second row", () => logRow("AuditLog:dev-a"));
ok(
  "each chain's head is checked and moved alone",
  JSON.stringify(
    db
      .prepare(`SELECT "id", "lastSeq" FROM "ChainHead" WHERE "id" LIKE 'AuditLog%' ORDER BY "id"`)
      .all()
      .map((r) => [r.id, r.lastSeq]),
  ) ===
    JSON.stringify([
      ["AuditLog", 2],
      ["AuditLog:dev-a", 2],
      ["AuditLog:dev-b", 1],
    ]),
);
refuses(
  "a row on laptop A's chain linked to the 1.0.0 head",
  () =>
    logRow("AuditLog:dev-a", { prevHash: get(`SELECT "lastHash" FROM "ChainHead" WHERE "id" = 'AuditLog'`).lastHash }),
  "CHAIN:AuditLog:out_of_sequence",
);
refuses(
  "a row on laptop A's chain at a seq already used",
  () => logRow("AuditLog:dev-a", { chainSeq: 1, prevHash: genesis("AuditLog:dev-a") }),
  "CHAIN:AuditLog:out_of_sequence",
);
refuses("a log row on a chain that is not a log chain", () => logRow("Invoice"), "CHECK");
refuses(
  "two rows at one place of one chain (behind the triggers: the unique index)",
  () => {
    run(`DROP TRIGGER "AuditLog_chain_insert"`);
    try {
      logRow("AuditLog:dev-a", { chainSeq: 1, id: "dup" });
    } finally {
      run(
        `CREATE TRIGGER "AuditLog_chain_insert" BEFORE INSERT ON "AuditLog"\nWHEN NEW."chainSeq" IS NOT (SELECT "lastSeq" + 1 FROM "ChainHead" WHERE "id" = COALESCE(NEW."chain", 'AuditLog'))\n  OR NEW."prevHash" IS NOT (SELECT "lastHash" FROM "ChainHead" WHERE "id" = COALESCE(NEW."chain", 'AuditLog'))\n  OR length(NEW."hash") <> 64\nBEGIN SELECT RAISE(ABORT, 'CHAIN:AuditLog:out_of_sequence'); END`,
      );
    }
  },
  "UNIQUE",
);
refuses(
  "a laptop chain's head moved by hand",
  () => run(`UPDATE "ChainHead" SET "lastSeq" = 3, "lastHash" = ? WHERE "id" = 'AuditLog:dev-a'`, "a".repeat(64)),
  "CHAIN:ChainHead:step",
);
refuses(
  "a laptop chain's head moved onto the other laptop's row",
  () =>
    run(
      `UPDATE "ChainHead" SET "lastSeq" = 2, "lastHash" = (SELECT "hash" FROM "AuditLog" WHERE "chain" = 'AuditLog:dev-a' AND "chainSeq" = 2) WHERE "id" = 'AuditLog:dev-b'`,
    ),
  "CHAIN:ChainHead:step",
);
refuses(
  "a log row changed",
  () => run(`UPDATE "AuditLog" SET "reason" = 'x' WHERE "id" = ?`, a1.id),
  "APPEND_ONLY:AuditLog:update",
);
refuses("a log row deleted", () => run(`DELETE FROM "AuditLog" WHERE "id" = ?`, a1.id), "APPEND_ONLY:AuditLog:delete");

// The legal chains stay single chains.
{
  const head = get(`SELECT "lastSeq", "lastHash" FROM "ChainHead" WHERE "id" = 'LegalEvent'`);
  refuses(
    "a legal row out of its single chain",
    () =>
      run(
        `INSERT INTO "LegalEvent" ("id","chainSeq","prevHash","hash","hashV","type","reason","createdAt","createdByUserId") VALUES ('le',?,?,?,1,'VOIDED','r',?,?)`,
        head.lastSeq + 2,
        head.lastHash,
        "b".repeat(64),
        NOW,
        make("User").id,
      ),
    "CHAIN:LegalEvent:out_of_sequence",
  );
}

// ── E. a gap of the new kind ──────────────────────────────────────────────────
run(
  `INSERT INTO "Sequence" ("id","key","year","lastValue","updatedAt") VALUES ('INVOICE-2026','INVOICE',2026,0,?)`,
  NOW,
);
refuses(
  "an invoice counter jumping with no gap",
  () => run(`UPDATE "Sequence" SET "lastValue" = 7 WHERE "id" = 'INVOICE-2026'`),
  "SEQUENCE:legal_step",
);
accepts("a LOST_DEVICE gap, numbers 1 to 7, explained by a log entry", () =>
  ins("SequenceGap", { key: "INVOICE", year: 2026, kind: "LOST_DEVICE", fromValue: 1, toValue: 7, auditLogId: a1.id }),
);
ok("the gap was copied for the other laptop", lastChange().tbl === "SequenceGap" && lastChange().op === "I");
accepts("the counter moves over the gap", () =>
  run(`UPDATE "Sequence" SET "lastValue" = 7, "lastDate" = ? WHERE "id" = 'INVOICE-2026'`, TODAY),
);
ok("the counter (this laptop's own) was not copied", lastChange().tbl === "SequenceGap");
refuses("a gap row changed", () => run(`UPDATE "SequenceGap" SET "toValue" = 9`), "APPEND_ONLY:SequenceGap:update");
ok(
  "every row points at something",
  db.prepare("PRAGMA foreign_key_check").all().length === 0 && get("PRAGMA integrity_check").integrity_check === "ok",
);

const tapeText =
  JSON.stringify({
    migration: "all",
    pragmas: ["foreign_keys = ON", "recursive_triggers = ON"],
    steps: tape,
  }) + "\n";
const logText = log.join("\n") + `\n${pass} passed, ${fail} failed\n`;
console.log(`${pass} passed, ${fail} failed; ${tape.length} statements on the tape`);
if (process.argv.includes("--check")) {
  const stale = !existsSync(TAPE_FILE) || readFileSync(TAPE_FILE, "utf8") !== tapeText;
  if (stale)
    console.log("The tape on disk is stale: run `node scripts/db/sync-proof.mjs` and commit src-tauri/proof/.");
  process.exit(fail || stale ? 1 : 0);
}
writeFileSync(TAPE_FILE, tapeText);
writeFileSync(LOG_FILE, logText);
process.exit(fail ? 1 : 0);
