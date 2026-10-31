/**
 * Reads prisma/schema.prisma (a type source parsed as text: Prisma is not
 * installed) and turns it, with prisma/triggers.sql, into SQLite DDL: the
 * tables 0001_init.sql created, and those each later migration adds
 * (`LATER_MIGRATIONS`).
 *
 * The parsing and the six trigger templates are the data model's own
 * (docs/data-model/DESIGN.md section 5, written out in BUILD-NOTES section 3).
 * Used by scripts/generate-db-types.mjs, scripts/verify-db.mjs and
 * scripts/db/model-proof.mjs, so the three can never disagree about what the
 * schema says.
 */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
export const SCHEMA_FILE = resolve(ROOT, "prisma/schema.prisma");
export const TRIGGERS_FILE = resolve(ROOT, "prisma/triggers.sql");
export const MIGRATIONS_DIR = resolve(ROOT, "src-tauri/migrations");

/**
 * The migrations an installed copy has already applied, with the sha256 of
 * their text. sqlx refuses to start a database when the text of a migration it
 * applied has changed, so these files never change again: `npm run db:verify`
 * checks each against its hash, and nothing writes them. The first installer
 * (0.1.0) carried 0001 and 0002 (HEAD 0c8b975; they last changed in b4426d2);
 * 1.0.0 carried 0003, the first forward migration; 1.1.0 carried 0004 and 0005
 * (the hiring sheet's two columns and the two-laptop sync).
 *
 * From then on the schema changes forward only: a new numbered migration, never
 * an edit. A change to the roles, their default grants or the communes, which
 * 0002 seeded, is a new migration too.
 */
export const FROZEN_MIGRATIONS = {
  "0001_init.sql": "0fafcec82207786466dfd7ad7cd4c2d0fd7d0a0228133a357a44c5d89047df94",
  "0002_seed.sql": "7dd15e73fb60d06fd91e32e27702ac62a39fb5c7ecaaeeb8437e5c6d510462ff",
  "0003_service_catalogue.sql": "4c5088f113f3171e6afcd544639c61bf963e229daa6605beb73caebaa605f4be",
  "0004_staff_trial_and_fixed_term.sql": "c6e3855d6db2460a6dc5267b2e89a10060cd052a3f7c63786db7fcc52317ebe4",
  "0005_sync.sql": "9e6235c86b77bfa5ed9c5b9087ab62975ccf2b46933b35aa86124786c6885209",
};

/**
 * The migrations written after the first installer, in order, each with the
 * models whose tables it creates and the columns it adds to a table an earlier
 * migration created (`columns`: `{ model, names }`, each an `ALTER TABLE …
 * ADD COLUMN`). Every other model's table, and every other column, was created
 * by 0001. `npm run db:types` writes each one not yet in `FROZEN_MIGRATIONS`;
 * once an installer carries it, its hash goes there and it is never written
 * again.
 */
export const LATER_MIGRATIONS = [
  // The client's two service lists, his to edit in Settings › الخدمات (the developer, 2026-10-22).
  { file: "0003_service_catalogue.sql", models: ["CatalogueService", "CatalogueServiceDivision"] },
  // The employee hiring sheet: the trial period and the reason for a fixed-term contract (the developer, 2026-10-30).
  {
    file: "0004_staff_trial_and_fixed_term.sql",
    models: [],
    columns: [{ model: "StaffMember", names: ["trialEndDate", "fixedTermReason"] }],
  },
  // Two laptops, one centre (docs/sync/DECISION.md, 2026-10-31): the nine sync tables, the
  // per-laptop log chain (AuditLog rebuilt with its `chain` column, and SequenceGap, which
  // references it), and the capture triggers on every shared table.
  {
    file: "0005_sync.sql",
    models: [
      "SyncSession",
      "SyncOutbox",
      "SyncCell",
      "SyncState",
      "SyncHeld",
      "SyncConflict",
      "SyncDevice",
      "SyncBooks",
      "NumberBlock",
    ],
    rebuilds: [
      { model: "AuditLog", added: ["chain"] },
      { model: "SequenceGap", added: [] },
    ],
    capture: true,
  },
];

/** The migration that created the capture triggers: a later one that adds columns to a shared table writes them again. */
export const CAPTURE_MIGRATION = "0005_sync.sql";

/** The columns a later migration adds, as `[model, column]` names, in its order: by ALTER, then by a rebuild. */
function addedColumnNames(migration) {
  return [
    ...(migration.columns ?? []).flatMap(({ model, names }) => names.map((name) => [model, name])),
    ...(migration.rebuilds ?? []).flatMap(({ model, added }) => added.map((name) => [model, name])),
  ];
}

/** Every column some later migration adds, as `Model.column`. */
const laterColumns = () =>
  new Set(LATER_MIGRATIONS.flatMap((migration) => addedColumnNames(migration).map(([m, c]) => `${m}.${c}`)));

/**
 * The models whose tables 0001 created, as 0001 created them: every model a
 * later migration does not add, without the columns a later migration adds.
 */
export function modelsOfInit(models = parseSchema()) {
  const later = new Set(LATER_MIGRATIONS.flatMap((migration) => migration.models));
  const added = laterColumns();
  return models
    .filter((model) => !later.has(model.name))
    .map((model) =>
      model.cols.some((column) => added.has(`${model.name}.${column.name}`))
        ? { ...model, cols: model.cols.filter((column) => !added.has(`${model.name}.${column.name}`)) }
        : model,
    );
}

/**
 * A model's columns in the order the database holds them: those its table was
 * created with, in schema order, then each one a later migration added, in
 * migration order (`ALTER TABLE … ADD COLUMN` puts a column last).
 */
export function columnsInTableOrder(model) {
  const added = LATER_MIGRATIONS.flatMap((migration) =>
    addedColumnNames(migration)
      .filter(([name]) => name === model.name)
      .map(([, column]) => column),
  );
  const created = model.cols.filter((column) => !added.includes(column.name));
  return [...created, ...added.map((name) => model.cols.find((column) => column.name === name)).filter(Boolean)];
}

/**
 * The columns a later migration adds to existing tables, each with its model.
 * Only what `ALTER TABLE … ADD COLUMN` can give an existing table, with nothing
 * else of the schema naming it, so the new column is the whole change: optional
 * or with a default, not a key, not unique, in no index, check or relation.
 */
export function columnsOfLaterMigration(file, models = parseSchema()) {
  const migration = LATER_MIGRATIONS.find((candidate) => candidate.file === file);
  if (!migration) throw new Error(`${file} is not in LATER_MIGRATIONS`);
  return (migration.columns ?? [])
    .flatMap(({ model, names }) => names.map((name) => [model, name]))
    .map(([modelName, name]) => {
      const model = models.find((candidate) => candidate.name === modelName);
      if (!model) throw new Error(`${file}: the schema has no model ${modelName}`);
      if (migration.models.includes(modelName)) throw new Error(`${file}: ${modelName} is created here, not altered`);
      const column = model.cols.find((candidate) => candidate.name === name);
      if (!column) throw new Error(`${file}: the schema has no column ${modelName}.${name}`);
      const named = (text) => new RegExp(`\\b${name}\\b`).test(text);
      if (column.id || column.unique || (!column.optional && column.def === null))
        throw new Error(`${file}: ${modelName}.${name} must be optional or have a default, and be no key`);
      if (
        model.rels.some((rel) => rel.col === name) ||
        foreignKeysOf(model).some((key) => key.col === name) ||
        model.uniques.some((cols) => cols.includes(name)) ||
        model.indexes.some((cols) => cols.includes(name)) ||
        model.directives.some(named) ||
        // A trigger whose UPDATE OF list 0001 wrote would not cover the new column.
        model.directives.some((directive) => /frozenWithRun\(.*\)\s+except/.test(directive))
      )
        throw new Error(
          `${file}: ${modelName}.${name} is named by a relation, index, check or trigger: not a plain ADD`,
        );
      return { model, column };
    });
}

/** The models a later migration adds, in the order it names them. */
export function modelsOfLaterMigration(file, models = parseSchema()) {
  const migration = LATER_MIGRATIONS.find((candidate) => candidate.file === file);
  if (!migration) throw new Error(`${file} is not in LATER_MIGRATIONS`);
  return migration.models.map((name) => {
    const model = models.find((candidate) => candidate.name === name);
    if (!model) throw new Error(`${file}: the schema has no model ${name}`);
    return model;
  });
}

export const SQLTYPE = { String: "TEXT", Int: "INTEGER", Boolean: "INTEGER", DateTime: "TEXT" };
const DATE_GLOB = "[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]";
const TIME_GLOB = "[0-2][0-9]:[0-5][0-9]";

/** The eight hash-chained tables, in the order their heads are seeded. */
export const CHAINED_TABLES = [
  "AuditLog",
  "Invoice",
  "InvoiceLine",
  "InvoiceVisit",
  "Payment",
  "PaymentAllocation",
  "Receipt",
  "LegalEvent",
];

/**
 * The versions of a chained table's hash (DESIGN.md section 8), each with the columns it
 * leaves out; every other column but `hash` is covered, in table order. A row carries its
 * hashV, so an old version stays verifiable. A table not named here has version 1 only.
 */
export const HASH_VERSIONS = {
  // 0005 added `chain` (the per-laptop log chain): version 2 covers it.
  AuditLog: [{ v: 1, without: ["chain"] }, { v: 2 }],
};

/** The unit or meaning a trailing comment gives a column. At most one applies. */
function tagOf(comment) {
  for (const tag of ["date", "time", "money", "min", "qty", "bp", "udeg", "json", "url", "key"]) {
    if (new RegExp(`@${tag}\\b`).test(comment)) return { tag };
  }
  const codes = /@codes\s+(\w+)/.exec(comment);
  if (codes) return { tag: "codes", list: codes[1] };
  const code = /@code\s+(\w+)/.exec(comment);
  if (code) return { tag: "code", list: code[1] };
  return { tag: null };
}

export function parseSchema(file = SCHEMA_FILE) {
  const lines = readFileSync(file, "utf8").split("\n");
  const models = [];
  for (let i = 0; i < lines.length; i++) {
    const header = /^model\s+(\w+)\s*\{/.exec(lines[i]);
    if (!header) continue;
    let d = i;
    while (d > 0 && lines[d - 1].startsWith("///")) d--;
    const directives = lines
      .slice(d, i)
      .map((line) => line.replace(/^\/\/\/\s?/, ""))
      .filter((line) => line.startsWith("@"));
    const model = { name: header[1], cols: [], rels: [], uniques: [], indexes: [], directives, pk: null };
    for (i++; lines[i] !== "}"; i++) {
      const raw = lines[i];
      const comment = (/\/\/(.*)$/.exec(raw) || [, ""])[1];
      const line = raw.replace(/\/\/.*$/, "").trim();
      if (!line) continue;
      if (line.startsWith("@@unique")) {
        model.uniques.push(
          /\[([^\]]+)\]/
            .exec(line)[1]
            .split(",")
            .map((s) => s.trim()),
        );
        continue;
      }
      if (line.startsWith("@@id")) {
        model.pk = /\[([^\]]+)\]/
          .exec(line)[1]
          .split(",")
          .map((s) => s.trim());
        continue;
      }
      if (line.startsWith("@@index")) {
        model.indexes.push(
          /\[([^\]]+)\]/
            .exec(line)[1]
            .split(",")
            .map((s) => s.trim()),
        );
        continue;
      }
      const field = /^(\w+)\s+(\w+)(\?)?\s*(.*)$/.exec(line);
      if (!field) throw new Error(`unparsed ${model.name}: ${line}`);
      if (SQLTYPE[field[2]]) {
        const def = /@default\(([^)]*)\)/.exec(field[4]);
        const { tag, list } = tagOf(comment);
        model.cols.push({
          name: field[1],
          type: field[2],
          optional: !!field[3],
          id: /@id\b/.test(field[4]),
          unique: /@unique\b/.test(field[4]),
          def: def ? def[1] : null,
          tag,
          list: list ?? null,
          isDate: tag === "date",
          isTime: tag === "time",
          // This laptop's own value: a change of it alone is not captured (DESIGN.md section 20).
          local: /@local\b/.test(comment),
        });
      } else {
        const rel = /fields:\s*\[(\w+)\],\s*references:\s*\[(\w+)\],\s*onDelete:\s*(\w+)/.exec(field[4]);
        if (!rel) throw new Error(`${model.name}.${field[1]}: a relation line needs fields, references and onDelete`);
        model.rels.push({
          col: rel[1],
          target: field[2],
          ref: rel[2],
          onDelete: rel[3] === "Cascade" ? "CASCADE" : "RESTRICT",
        });
      }
    }
    models.push(model);
  }
  return models;
}

/** Every foreign key of a model: its relation lines, plus User for each `userId` / `...UserId` column. */
export function foreignKeysOf(model) {
  const named = new Set(model.rels.map((r) => r.col));
  return [
    ...model.rels,
    ...model.cols
      .filter((c) => (c.name === "userId" || /UserId$/.test(c.name)) && !named.has(c.name))
      .map((c) => ({ col: c.name, target: "User", ref: "id", onDelete: "RESTRICT" })),
  ];
}

const quoteCols = (expr, cols) =>
  expr
    .split(/('(?:[^']|'')*')/)
    .map((part, i) => (i % 2 ? part : part.replace(/\b[A-Za-z_]\w*\b/g, (w) => (cols.has(w) ? `"${w}"` : w))))
    .join("");

/** A schema `@default(...)` as the DDL writes it, and as `PRAGMA table_info` reads it back. */
export function sqlDefault(def) {
  if (def === "true") return 1;
  if (def === "false") return 0;
  return def.replace(/^"(.*)"$/, "'$1'");
}

/** A column as CREATE TABLE and ALTER TABLE … ADD COLUMN write it: name, type, key, NOT NULL, default, format check. */
export function columnDdl(c) {
  let s = `"${c.name}" ${SQLTYPE[c.type]}`;
  if (c.id) s += " PRIMARY KEY";
  if (!c.optional) s += " NOT NULL";
  if (c.unique) s += " UNIQUE";
  if (c.def !== null) s += ` DEFAULT ${sqlDefault(c.def)}`;
  if (c.isDate) s += ` CHECK ("${c.name}" IS NULL OR "${c.name}" GLOB '${DATE_GLOB}')`;
  if (c.isTime) s += ` CHECK ("${c.name}" IS NULL OR "${c.name}" GLOB '${TIME_GLOB}')`;
  return s;
}

/** The `ALTER TABLE … ADD COLUMN` statements of a later migration, one a column, in its order. */
export function buildAddColumns(file, models = parseSchema()) {
  return columnsOfLaterMigration(file, models)
    .map(({ model, column }) => `ALTER TABLE "${model.name}" ADD COLUMN ${columnDdl(column)};`)
    .join("\n");
}

export function buildDdl(models = parseSchema()) {
  const out = [];
  const templated = [];
  const namedWanted = [];
  const indexNames = new Map();
  const triggerNames = new Map();
  const triggerSql = new Map();
  for (const m of models) {
    const cols = new Set(m.cols.map((c) => c.name));
    const defs = m.cols.map((c) => `  ${columnDdl(c)}`);
    for (const r of foreignKeysOf(m)) {
      defs.push(`  FOREIGN KEY ("${r.col}") REFERENCES "${r.target}" ("${r.ref}") ON DELETE ${r.onDelete}`);
    }
    if (m.pk) defs.push(`  PRIMARY KEY (${m.pk.map((c) => `"${c}"`).join(", ")})`);
    for (const u of m.uniques) defs.push(`  UNIQUE (${u.map((c) => `"${c}"`).join(", ")})`);
    const post = [];
    const indexes = m.indexes.map((ix) => `${m.name}_${ix.join("_")}_idx`);
    const triggers = [];
    for (const d of m.directives) {
      let x;
      if ((x = /^@check\s+(.+)$/.exec(d))) defs.push(`  CHECK (${quoteCols(x[1], cols)})`);
      else if ((x = /^@(uniqueWhere|index)\s+(\w+)\s+\((.+?)\)(?:\s+WHERE\s+(.+))?$/.exec(d))) {
        indexes.push(x[2]);
        post.push(
          `CREATE ${x[1] === "uniqueWhere" ? "UNIQUE " : ""}INDEX "${x[2]}" ON "${m.name}" (${quoteCols(x[3], cols)})${x[4] ? ` WHERE ${quoteCols(x[4], cols)}` : ""};`,
        );
      } else if ((x = /^@trigger\s+named\s+(\w+)$/.exec(d))) {
        namedWanted.push(x[1]);
        triggers.push(x[1]);
      } else if ((x = /^@trigger\s+(.+)$/.exec(d))) {
        const made = template(m, x[1]);
        templated.push(...made);
        for (const sql of made) {
          const name = /CREATE TRIGGER "(\w+)"/.exec(sql)[1];
          triggers.push(name);
          triggerSql.set(name, sql);
        }
      } else if (d !== "@local" && !/^@syncExcept\s+.+$/.test(d)) throw new Error(`${m.name}: unknown directive ${d}`);
    }
    out.push(`CREATE TABLE "${m.name}" (\n${defs.join(",\n")}\n) STRICT;`);
    for (const ix of m.indexes) {
      out.push(`CREATE INDEX "${m.name}_${ix.join("_")}_idx" ON "${m.name}" (${ix.map((c) => `"${c}"`).join(", ")});`);
    }
    out.push(...post, "");
    indexNames.set(m.name, indexes);
    triggerNames.set(m.name, triggers);
  }
  return {
    models,
    tables: out.join("\n"),
    templated: templated.join("\n\n"),
    namedWanted,
    indexNames,
    triggerNames,
    triggerSql,
  };
}

function template(m, spec) {
  const X = m.name;
  let x;
  const noUpd = `CREATE TRIGGER "${X}_no_update" BEFORE UPDATE ON "${X}"\nBEGIN SELECT RAISE(ABORT, 'APPEND_ONLY:${X}:update'); END;`;
  const noDel = (code) =>
    `CREATE TRIGGER "${X}_no_delete" BEFORE DELETE ON "${X}"\nBEGIN SELECT RAISE(ABORT, '${code}:${X}${code === "APPEND_ONLY" ? ":delete" : ""}'); END;`;
  if (spec === "appendOnly") return [noUpd, noDel("APPEND_ONLY")];
  if (spec === "noDelete") return [noDel("NO_DELETE")];
  if ((x = /^chained(?:\((\w+)\))?$/.exec(spec))) {
    // chained(col): one chain per value of col, its head the ChainHead row of that id; null is the table's own chain.
    if (x[1] && !m.cols.some((c) => c.name === x[1])) throw new Error(`${X}: chained(${x[1]}) names unknown column`);
    const head = x[1] ? `COALESCE(NEW."${x[1]}", '${X}')` : `'${X}'`;
    return [
      noUpd,
      noDel("APPEND_ONLY"),
      `CREATE TRIGGER "${X}_chain_insert" BEFORE INSERT ON "${X}"\nWHEN NEW."chainSeq" IS NOT (SELECT "lastSeq" + 1 FROM "ChainHead" WHERE "id" = ${head})\n  OR NEW."prevHash" IS NOT (SELECT "lastHash" FROM "ChainHead" WHERE "id" = ${head})\n  OR length(NEW."hash") <> 64\nBEGIN SELECT RAISE(ABORT, 'CHAIN:${X}:out_of_sequence'); END;`,
      `CREATE TRIGGER "${X}_chain_advance" AFTER INSERT ON "${X}"\nBEGIN UPDATE "ChainHead" SET "lastSeq" = NEW."chainSeq", "lastHash" = NEW."hash", "updatedAt" = NEW."createdAt" WHERE "id" = ${head}; END;`,
    ];
  }
  if ((x = /^legalNumber\((\w+)\)$/.exec(spec)))
    return [
      `CREATE TRIGGER "${X}_number" BEFORE INSERT ON "${X}"\nWHEN NEW."numberSeq" IS NOT (SELECT "lastValue" + 1 FROM "Sequence" WHERE "key" = '${x[1]}' AND "year" = NEW."numberYear")\nBEGIN SELECT RAISE(ABORT, 'LEGAL_SEQUENCE:${X}:number'); END;`,
      `CREATE TRIGGER "${X}_date" BEFORE INSERT ON "${X}"\nWHEN substr(NEW."issueDate", 1, 4) IS NOT CAST(NEW."numberYear" AS TEXT)\n  OR NEW."issueDate" < COALESCE((SELECT MAX("lastDate") FROM "Sequence" WHERE "key" = '${x[1]}'), '')\n  OR NEW."issueDate" > date(NEW."createdAt", '+1 day')\nBEGIN SELECT RAISE(ABORT, 'LEGAL_SEQUENCE:${X}:date'); END;`,
      `CREATE TRIGGER "${X}_number_advance" AFTER INSERT ON "${X}"\nBEGIN UPDATE "Sequence" SET "lastValue" = NEW."numberSeq", "lastDate" = NEW."issueDate", "updatedAt" = NEW."createdAt" WHERE "key" = '${x[1]}' AND "year" = NEW."numberYear"; END;`,
    ];
  if ((x = /^headOnly\((\w+),\s*(\w+)\)$/.exec(spec)))
    return [
      `CREATE TRIGGER "${X}_head_only" BEFORE INSERT ON "${X}"\nWHEN (SELECT "chainSeq" FROM "${x[1]}" WHERE "id" = NEW."${x[2]}") IS NOT (SELECT "lastSeq" FROM "ChainHead" WHERE "id" = '${x[1]}')\n  OR NEW."createdAt" IS NOT (SELECT "createdAt" FROM "${x[1]}" WHERE "id" = NEW."${x[2]}")\nBEGIN SELECT RAISE(ABORT, 'APPEND_ONLY:${X}:closed_parent'); END;`,
    ];
  if ((x = /^frozenWithRun\(([\w>-]+)\)(?:\s+except\s+(.+))?$/.exec(spec))) {
    const run = (R, cond) =>
      x[1] === "payRunId"
        ? `EXISTS (SELECT 1 FROM "PayRun" r WHERE r."id" = ${R}."payRunId" AND r."status" ${cond})`
        : `EXISTS (SELECT 1 FROM "Payslip" p JOIN "PayRun" r ON r."id" = p."payRunId" WHERE p."id" = ${R}."payslipId" AND r."status" ${cond})`;
    const except = new Set(
      (x[2] || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    for (const e of except) {
      if (!m.cols.some((c) => c.name === e)) throw new Error(`${X}: frozenWithRun except names unknown column ${e}`);
    }
    const of = except.size
      ? ` OF ${m.cols
          .filter((c) => !except.has(c.name))
          .map((c) => `"${c.name}"`)
          .join(", ")}`
      : "";
    return [
      `CREATE TRIGGER "${X}_frozen_insert" BEFORE INSERT ON "${X}"\nWHEN NOT ${run("NEW", "= 'DRAFT'")}\nBEGIN SELECT RAISE(ABORT, 'FROZEN:${X}:insert'); END;`,
      `CREATE TRIGGER "${X}_frozen_update" BEFORE UPDATE${of} ON "${X}"\nWHEN ${run("OLD", "<> 'DRAFT'")}\nBEGIN SELECT RAISE(ABORT, 'FROZEN:${X}:update'); END;`,
      `CREATE TRIGGER "${X}_frozen_delete" BEFORE DELETE ON "${X}"\nWHEN ${run("OLD", "<> 'DRAFT'")}\nBEGIN SELECT RAISE(ABORT, 'FROZEN:${X}:delete'); END;`,
    ];
  }
  throw new Error(`${X}: unknown trigger template ${spec}`);
}

/** The migration files, in the order sqlx applies them. */
export async function listMigrations() {
  const { readdirSync } = await import("node:fs");
  return readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .map((name) => resolve(MIGRATIONS_DIR, name));
}

/** Opens a database the way the program does: the two pragmas of the model, then every migration. */
export async function openMigratedDatabase(file = ":memory:") {
  const { DatabaseSync } = await import("node:sqlite");
  const db = new DatabaseSync(file);
  db.exec("PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON;");
  for (const migration of await listMigrations()) db.exec(readFileSync(migration, "utf8"));
  return db;
}

// ── Two-laptop sync: what is captured (DESIGN.md section 20) ───────────────

/** A table this laptop keeps to itself: never captured, never sent (`/// @local`). */
export const isLocalModel = (model) => model.directives.includes("@local");

/** The tables the capture triggers copy into SyncOutbox: every model but the @local ones. */
export const sharedModels = (models = parseSchema()) => models.filter((model) => !isLocalModel(model));

/** Its rows that are this laptop's own (`/// @syncExcept <SQL>`), as an expression over `ROW."col"`, or null. */
function syncExceptOf(model, row) {
  const directive = model.directives.find((d) => d.startsWith("@syncExcept"));
  if (!directive) return null;
  const cols = new Set(model.cols.map((c) => c.name));
  return quoteCols(directive.replace(/^@syncExcept\s+/, ""), cols).replace(/"(\w+)"/g, (whole, name) =>
    cols.has(name) ? `${row}."${name}"` : whole,
  );
}

/** Whether a model's template triggers refuse updates, or deletes. */
const refusesUpdate = (model) => model.directives.some((d) => /^@trigger\s+(appendOnly|chained)\b/.test(d));
const refusesDelete = (model) => refusesUpdate(model) || model.directives.includes("@trigger noDelete");

/**
 * `{col: value, …}` for every column of a row, as JSON text. SQLite 3.46 (the engine
 * that ships) takes at most 127 arguments in a function call, so the pairs go in
 * groups of 60: json_object of the first, then json_set for each next one.
 */
function rowJson(columns, row) {
  const pairs = columns.map((c) => [`'${c.name}'`, `${row}."${c.name}"`]);
  let sql = `json_object(${pairs
    .slice(0, 60)
    .map((p) => p.join(", "))
    .join(", ")})`;
  for (let i = 60; i < pairs.length; i += 60) {
    sql = `json_set(${sql}, ${pairs
      .slice(i, i + 60)
      .map(([key, value]) => `'$.${key.slice(1, -1)}', ${value}`)
      .join(", ")})`;
  }
  return sql;
}

const SESSION = `"SyncSession" WHERE "id" = 'session'`;
const CAPTURING = `(SELECT "capturing" = 1 AND "applying" = 0 FROM ${SESSION})`;
const UNSTAMPED = `SELECT RAISE(ABORT, 'SYNC_UNSTAMPED') WHERE (SELECT "txId" FROM ${SESSION}) IS NULL;`;

/**
 * The capture triggers of one shared table, as `[name, sql]` pairs (BUILD 2.2):
 * AFTER INSERT always; AFTER UPDATE unless the table refuses updates; AFTER DELETE
 * unless it refuses deletes. Each runs only while `capturing = 1 AND applying = 0`,
 * refuses a write whose transaction was not stamped, and reads the row from NEW or
 * OLD (never from the table), so what it copies is the row as written, before any
 * other trigger touched it (a cached total at its inserted value).
 * On update: only the columns that changed, none of the @local ones, each with
 * the stamp it replaced (SyncCell), and SyncCell then takes this transaction's stamp.
 */
export function captureTriggers(model) {
  const X = model.name;
  if (!model.cols.some((c) => c.name === "id" && c.id)) throw new Error(`${X}: a shared table needs its id column`);
  const except = (row) => {
    const sql = syncExceptOf(model, row);
    return sql ? `\n  AND NOT (${sql})` : "";
  };
  const outbox = (op, row, data) =>
    `INSERT INTO "SyncOutbox" ("txId", "hlc", "tbl", "rowId", "op", "data")\n  SELECT "txId", "hlc", '${X}', ${row}."id", '${op}', ${data} FROM ${SESSION};`;
  const out = [
    [
      `${X}_sync_insert`,
      `CREATE TRIGGER "${X}_sync_insert" AFTER INSERT ON "${X}"\nWHEN ${CAPTURING}${except("NEW")}\nBEGIN\n${UNSTAMPED}\n${outbox("I", "NEW", rowJson(model.cols, "NEW"))}\nEND;`,
    ],
  ];
  if (!refusesUpdate(model)) {
    const watched = model.cols.filter((c) => !c.local);
    const changed = (c) => `NEW."${c.name}" IS NOT OLD."${c.name}"`;
    const cell = (c) =>
      `(SELECT "hlc" FROM "SyncCell" WHERE "tbl" = '${X}' AND "rowId" = NEW."id" AND "col" = '${c.name}')`;
    const values = watched
      .map((c, i) =>
        i === 0
          ? `SELECT '${c.name}' AS "k", json_array(NEW."${c.name}", ${cell(c)}) AS "v" WHERE ${changed(c)}`
          : `SELECT '${c.name}', json_array(NEW."${c.name}", ${cell(c)}) WHERE ${changed(c)}`,
      )
      .join("\n    UNION ALL ");
    const names = watched
      .map((c, i) =>
        i === 0 ? `SELECT '${c.name}' AS "k" WHERE ${changed(c)}` : `SELECT '${c.name}' WHERE ${changed(c)}`,
      )
      .join("\n    UNION ALL ");
    out.push([
      `${X}_sync_update`,
      `CREATE TRIGGER "${X}_sync_update" AFTER UPDATE ON "${X}"\nWHEN ${CAPTURING}${except("NEW")}\n  AND (${watched.map(changed).join("\n    OR ")})\nBEGIN\n${UNSTAMPED}\n${outbox("U", "NEW", `(SELECT json_group_object("k", json("v")) FROM (\n    ${values}))`)}\nINSERT INTO "SyncCell" ("tbl", "rowId", "col", "hlc")\n  SELECT '${X}', NEW."id", "k", (SELECT "hlc" FROM ${SESSION}) FROM (\n    ${names})\n  WHERE true\n  ON CONFLICT ("tbl", "rowId", "col") DO UPDATE SET "hlc" = excluded."hlc";\nEND;`,
    ]);
  }
  if (!refusesDelete(model)) {
    out.push([
      `${X}_sync_delete`,
      `CREATE TRIGGER "${X}_sync_delete" AFTER DELETE ON "${X}"\nWHEN ${CAPTURING}${except("OLD")}\nBEGIN\n${UNSTAMPED}\n${outbox("D", "OLD", rowJson(model.cols, "OLD"))}\nEND;`,
    ]);
  }
  return out;
}

/** Every capture trigger, by name, for the schema as it stands. */
export function allCaptureTriggers(models = parseSchema()) {
  return new Map(sharedModels(models).flatMap((model) => captureTriggers(model)));
}

/** The named triggers of prisma/triggers.sql, by name, each as its whole CREATE TRIGGER statement. */
export function namedTriggers(file = TRIGGERS_FILE) {
  const text = readFileSync(file, "utf8");
  return new Map([...text.matchAll(/CREATE TRIGGER "(\w+)"[\s\S]*?\bEND;/g)].map((m) => [m[1], m[0]]));
}

/**
 * A table rebuilt in place, inside the migration's transaction (`foreign_keys` stays on):
 * the new table is made under `<name>__new` with the schema's shape, the rows copied, the
 * old table dropped, the new one renamed. A table that references a rebuilt one is rebuilt
 * with it (its new copy references the other's `__new`, which the rename then follows), and
 * the referencing one is dropped first, so no row ever points at a dropped table. The named
 * triggers of other tables that read a rebuilt table are dropped first (a rename re-reads
 * every trigger) and written again from prisma/triggers.sql, with the rebuilt tables'
 * indexes and template and named triggers.
 */
export function rebuildSql(rebuilds, models = parseSchema()) {
  const names = rebuilds.map((r) => r.model);
  const byName = new Map(models.map((m) => [m.name, m]));
  const temp = (name) => `${name}__new`;
  const named = namedTriggers();
  const readers = [...named]
    .filter(([, sql]) => {
      const on = /ON "(\w+)"/.exec(sql)[1];
      return !names.includes(on) && names.some((name) => sql.includes(`"${name}"`));
    })
    .map(([name]) => name);
  const out = [];
  for (const name of readers) out.push(`DROP TRIGGER "${name}";`);
  for (const { model: name, added } of rebuilds) {
    const model = byName.get(name);
    if (!model) throw new Error(`rebuild: the schema has no model ${name}`);
    const renamed = {
      ...model,
      name: temp(name),
      rels: model.rels.map((rel) => (names.includes(rel.target) ? { ...rel, target: temp(rel.target) } : rel)),
      directives: model.directives.filter((d) => d.startsWith("@check")),
      indexes: [],
    };
    const created = buildDdl([renamed]).tables.trim();
    const kept = columnsInTableOrder(model)
      .filter((c) => !added.includes(c.name))
      .map((c) => `"${c.name}"`)
      .join(", ");
    out.push(created, `INSERT INTO "${temp(name)}" (${kept})\n  SELECT ${kept} FROM "${name}";`);
  }
  for (const name of [...names].reverse()) out.push(`DROP TABLE "${name}";`);
  for (const name of names) out.push(`ALTER TABLE "${temp(name)}" RENAME TO "${name}";`);
  const { tables, triggerSql, namedWanted } = buildDdl(names.map((name) => byName.get(name)));
  out.push(
    ...tables.split("\n").filter((line) => line.startsWith("CREATE INDEX") || line.startsWith("CREATE UNIQUE INDEX")),
  );
  out.push(...triggerSql.values());
  for (const name of [...namedWanted, ...readers]) {
    if (!named.has(name)) throw new Error(`rebuild: trigger ${name} is not in prisma/triggers.sql`);
    out.push(named.get(name));
  }
  return out.join("\n\n");
}
