/**
 * Generates everything that is derived from the data model, in one run:
 *
 *   src-tauri/migrations/0004_…sql       each migration after the first installer that
 *                                        has not shipped yet (LATER_MIGRATIONS): the
 *                                        tables it creates, the columns it adds
 *   src/lib/db/schema.ts                 Kysely `DB` interface, in storage types
 *   src/lib/db/models.ts                 the row shapes the screens work with
 *   src/lib/db/column-meta.ts            which columns are instants / booleans
 *   src/lib/db/column-tags.ts            the unit or meaning of every tagged column
 *   src/lib/db/chain-columns.ts          what each hash-chained row commits to
 *   src/testing/table-shapes.ts          what a test needs to fill a row
 *
 * Sources: prisma/schema.prisma (the model), and the data modules under
 * src/lib (the seed of the service lists). Prisma is not a dependency: the
 * schema is parsed as text.
 *
 * 0001_init.sql and 0002_seed.sql are no longer written: an installed copy has
 * applied them, so their text is frozen (FROZEN_MIGRATIONS in
 * scripts/db/schema-tools.mjs, checked by db:verify). They were generated from
 * the same schema, prisma/triggers.sql, src/lib/access/catalogue.ts and
 * src/lib/geo/communes-oum-el-bouaghi.ts; git history has the code.
 *
 *   npm run db:types
 *
 * The generated files are committed. `npm run db:verify` fails when they and
 * their sources disagree.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  allCaptureTriggers,
  buildAddColumns,
  buildDdl,
  CAPTURE_MIGRATION,
  captureTriggers,
  CHAINED_TABLES,
  HASH_VERSIONS,
  isLocalModel,
  foreignKeysOf,
  FROZEN_MIGRATIONS,
  LATER_MIGRATIONS,
  MIGRATIONS_DIR,
  modelsOfLaterMigration,
  parseSchema,
  rebuildSql,
  ROOT,
  SQLTYPE,
} from "./db/schema-tools.mjs";
import { DIVISIONS } from "../src/lib/options/index.ts";
import {
  SEED_CATALOGUE,
  SERVICE_LIST_CODES,
  seedMembershipId,
  seedServiceId,
} from "../src/lib/options/service-catalogue-seed.ts";

const HEADER =
  "// GENERATED FILE — do not edit by hand.\n// Produced by scripts/generate-db-types.mjs from prisma/schema.prisma.\n";

/** One fixed instant for every seeded row: a migration must be the same text on every machine. */
const SEED_AT = "2026-01-01T00:00:00.000Z";

const BRAND = { date: "LocalDate", time: "LocalTime", money: "Money", min: "Minutes", qty: "Qty", bp: "BasisPoints" };

/** The TypeScript type of a column as SQLite stores it. */
function storageType(col) {
  if (BRAND[col.tag]) return BRAND[col.tag];
  return col.type === "Int" || col.type === "Boolean" ? "number" : "string";
}

/** The type the screens see after hydrate(): instants are Date objects, 0/1 are booleans. */
function modelType(col) {
  if (BRAND[col.tag]) return BRAND[col.tag];
  if (col.type === "DateTime") return "Date";
  if (col.type === "Boolean") return "boolean";
  return col.type === "Int" ? "number" : "string";
}

function schemaTs(models) {
  const tables = models
    .map((m) => {
      const lines = m.cols.map((c) => {
        const base = storageType(c) + (c.optional ? " | null" : "");
        return `  ${c.name}: ${c.def !== null ? `Generated<${base}>` : base};`;
      });
      return `export interface ${m.name}Table {\n${lines.join("\n")}\n}`;
    })
    .join("\n\n");
  return `${HEADER}
import type { Generated } from "kysely";

import type { BasisPoints, LocalDate, LocalTime, Minutes, Money, Qty } from "@/lib/units";

/**
 * Storage shapes: literally what SQLite holds. An instant is an ISO-8601 UTC
 * string, a boolean is 0 or 1, a calendar date and a clock time are branded
 * strings, and money, minutes, quantities and rates are branded whole numbers
 * (see src/lib/units).
 *
 * \`Generated<>\` marks the few columns the database gives a default. The
 * columns id, createdAt and updatedAt have none: the writer always supplies
 * them.
 */

${tables}

export interface DB {
${models.map((m) => `  ${m.name}: ${m.name}Table;`).join("\n")}
}
`;
}

function modelsTs(models) {
  const rows = models
    .map((m) => {
      const lines = m.cols.map((c) => `  ${c.name}: ${modelType(c)}${c.optional ? " | null" : ""};`);
      return `export interface ${m.name}Row {\n${lines.join("\n")}\n}`;
    })
    .join("\n\n");
  return `${HEADER}
import type { BasisPoints, LocalDate, LocalTime, Minutes, Money, Qty } from "@/lib/units";

/**
 * Row shapes as the screens work with them, after hydrate() (./rows): an
 * instant is a Date, a 0/1 column is a boolean. Calendar dates and clock times
 * stay the strings they are. Named \`<Table>Row\` so that \`File\` and \`Payment\`
 * do not shadow other things of the same name.
 */

${rows}
`;
}

function columnMetaTs(models) {
  const list = (pick) =>
    models
      .map(
        (m) =>
          `  ${m.name}: [${m.cols
            .filter(pick)
            .map((c) => JSON.stringify(c.name))
            .join(", ")}],`,
      )
      .join("\n");
  return `${HEADER}
import type { DB } from "./schema";

export type TableName = keyof DB & string;

/** Instants: stored as ISO-8601 UTC text, handed to the screens as Date objects. Calendar dates and clock times are not here: they stay strings. */
export const DATE_COLUMNS = {
${list((c) => c.type === "DateTime")}
} as const satisfies Record<TableName, readonly string[]>;

/** Stored as 0/1, handed to the screens as booleans. An empty one stays null: "neither box ticked". */
export const BOOLEAN_COLUMNS = {
${list((c) => c.type === "Boolean")}
} as const satisfies Record<TableName, readonly string[]>;
`;
}

function columnTagsTs(models) {
  const body = models
    .map((m) => {
      const tagged = m.cols.filter((c) => c.tag);
      if (!tagged.length) return null;
      return `  ${m.name}: { ${tagged.map((c) => `${c.name}: ${JSON.stringify(c.list ? `${c.tag}:${c.list}` : c.tag)}`).join(", ")} },`;
    })
    .filter(Boolean)
    .join("\n");
  return `${HEADER}
/**
 * The unit or meaning of every tagged column, as the schema's trailing comments
 * give it: "date", "time", "money", "min", "qty", "bp", "udeg", "json", "url",
 * "key", "code:<LIST>" (one code of a list of docs/data-model/OPTION-CODES.md)
 * or "codes:<LIST>" (a JSON array of them).
 */
export const COLUMN_TAGS: Record<string, Record<string, string>> = {
${body}
};
`;
}

/** Each version of a chained table's hash: version 1 everywhere; a later version adds the columns a version before it left out. */
function hashVersions(name) {
  return HASH_VERSIONS[name] ?? [{ v: 1, without: [] }];
}

function chainColumnsTs(models) {
  const body = CHAINED_TABLES.map((name) => {
    const m = models.find((x) => x.name === name);
    const versions = hashVersions(name).map(({ v, without = [] }) => {
      const cols = m.cols
        .filter((c) => c.name !== "hash" && !without.includes(c.name))
        .map((c) => `[${JSON.stringify(c.name)}, ${JSON.stringify(SQLTYPE[c.type])}]`)
        .join(", ");
      return `    ${v}: [${cols}],`;
    });
    return `  ${name}: {\n${versions.join("\n")}\n  },`;
  }).join("\n");
  return `${HEADER}
/**
 * What a hash-chained row commits to (docs/data-model/DESIGN.md section 8).
 *
 * \`CHAIN_COLUMNS[table][hashV]\` is the list of columns that version of the
 * hash covers, with the type SQLite stores each in: every column of the table
 * except \`hash\` itself. A row carries its \`hashV\`, so a later migration that
 * adds a column adds a version 2 here and leaves the rows written under
 * version 1 verifiable. Never edit a version that has been used.
 */
export const CHAINED_TABLES = ${JSON.stringify(CHAINED_TABLES)} as const;
export type ChainedTable = (typeof CHAINED_TABLES)[number];

export type ChainColumn = readonly [name: string, type: "TEXT" | "INTEGER"];

export const CHAIN_COLUMNS: Record<ChainedTable, Record<number, readonly ChainColumn[]>> = {
${body}
};

/** The version new rows are written under. */
export const CURRENT_HASH_VERSION: Record<ChainedTable, number> = {
${CHAINED_TABLES.map((name) => `  ${name}: ${Math.max(...hashVersions(name).map(({ v }) => v))},`).join("\n")}
};
`;
}

function tableShapesTs(models) {
  const body = models
    .map((m) => {
      const fks = new Map(foreignKeysOf(m).map((fk) => [fk.col, fk.target]));
      const cols = m.cols
        .map((c) => {
          const need = c.id ? "id" : c.optional ? "opt" : c.def !== null ? "def" : "req";
          const kind =
            c.type === "DateTime"
              ? "instant"
              : c.type === "Boolean"
                ? "bool"
                : c.type === "Int"
                  ? "int"
                  : c.tag === "date" || c.tag === "time"
                    ? c.tag
                    : "text";
          return `[${JSON.stringify(c.name)}, ${JSON.stringify(kind)}, ${JSON.stringify(need)}, ${JSON.stringify(fks.get(c.name) ?? null)}]`;
        })
        .join(", ");
      return `  ${m.name}: [${cols}],`;
    })
    .join("\n");
  return `${HEADER}
/**
 * For tests only: what is needed to write a row of any table by hand.
 * Each column is [name, kind, need, the table its foreign key points at].
 *   kind: "text" | "int" | "bool" | "instant" | "date" | "time"
 *   need: "id" | "req" (must be given) | "opt" (may be empty) | "def" (the database has a default)
 * See src/testing/rows.ts.
 */
export type ColumnShape = readonly [
  name: string,
  kind: "text" | "int" | "bool" | "instant" | "date" | "time",
  need: "id" | "req" | "opt" | "def",
  references: string | null,
];

export const TABLE_SHAPES: Record<string, readonly ColumnShape[]> = {
${body}
};
`;
}

// ── Later migrations ───────────────────────────────────────────────────────

const q = (value) =>
  value === null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;

function insert(table, columns, rows) {
  return `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES\n${rows.map((row) => `  (${row.map(q).join(", ")})`).join(",\n")};`;
}

/** The tables a later migration creates, with their indexes and template triggers. */
function laterDdl(file, models) {
  const { tables, templated, namedWanted } = buildDdl(modelsOfLaterMigration(file, models));
  // A named trigger lives in prisma/triggers.sql, which 0001 holds whole: a later table cannot have one.
  if (namedWanted.length) throw new Error(`${file}: a named trigger (${namedWanted.join(", ")}) in a later migration`);
  return `${tables}\n${templated}\n`;
}

/** The rows of the two service lists, as src/lib/options/service-catalogue-seed.ts holds them. */
function serviceCatalogueRows() {
  const services = [];
  const memberships = [];
  for (const list of SERVICE_LIST_CODES) {
    const { services: listed, of } = SEED_CATALOGUE[list];
    for (const service of listed) {
      services.push([
        seedServiceId(list, service.code),
        list,
        service.code,
        service.ar,
        service.fr,
        service.en,
        1,
        SEED_AT,
        SEED_AT,
        null,
        null,
      ]);
    }
    for (const division of DIVISIONS) {
      of[division].forEach((code, index) => {
        if (!listed.some((service) => service.code === code))
          throw new Error(`seed: ${list} ${division} names ${code}`);
        memberships.push([
          seedMembershipId(list, code, division),
          seedServiceId(list, code),
          division,
          index,
          1,
          SEED_AT,
          SEED_AT,
        ]);
      });
    }
  }
  return { services, memberships };
}

function serviceCatalogueSql(models) {
  const file = "0003_service_catalogue.sql";
  const { services, memberships } = serviceCatalogueRows();
  return `-- مركز إنماء برو: the client's two service lists, «الخدمات المقدمة» and «الخدمات المبرمجة».
--
-- GENERATED by scripts/generate-db-types.mjs from prisma/schema.prisma (the models
-- LATER_MIGRATIONS gives this file in scripts/db/schema-tools.mjs) and
-- src/lib/options/service-catalogue-seed.ts. Do not edit: change the sources and
-- run \`npm run db:types\`. Once an installer carries it, its text never changes again.
--
-- The first migration after the first installer. An installed copy applies it at
-- its next start: the services his six forms printed, each division's in his print
-- order, until the manager edits them in Settings › الخدمات.

${laterDdl(file, models)}
-- His ${services.length} services: «الخدمات المقدمة» (PROVIDED), then «الخدمات المبرمجة» (PROGRAMMED).
${insert(
  "CatalogueService",
  [
    "id",
    "list",
    "code",
    "labelAr",
    "labelFr",
    "labelEn",
    "isActive",
    "createdAt",
    "updatedAt",
    "createdByUserId",
    "updatedByUserId",
  ],
  services,
)}

-- Which divisions' forms list each service, and where: sortOrder is the print order
-- on that division's forms, column by column, the first column on the right.
${insert(
  "CatalogueServiceDivision",
  ["id", "serviceId", "division", "sortOrder", "isActive", "createdAt", "updatedAt"],
  memberships,
)}
`;
}

function staffTrialAndFixedTermSql(models) {
  const file = "0004_staff_trial_and_fixed_term.sql";
  return `-- مركز إنماء برو: two columns of a centre employee, for the employee hiring sheet.
--
-- GENERATED by scripts/generate-db-types.mjs from prisma/schema.prisma (the columns
-- LATER_MIGRATIONS gives this file in scripts/db/schema-tools.mjs). Do not edit:
-- change the sources and run \`npm run db:types\`. Once an installer carries it, its
-- text never changes again.
--
-- The first migration to add columns to a table 0001 created (the developer,
-- 2026-10-30). An installed copy applies it at its next start; every existing row
-- reads null in both, which is what they mean when nothing was recorded:
--   trialEndDate     the end of the trial period (Law 90-11 art. 18 to 20); null, no trial
--   fixedTermReason  why the contract is fixed-term (CDD), Law 90-11 art. 12 and 12 bis

${buildAddColumns(file, models)}
`;
}

function syncSql(models) {
  const file = "0005_sync.sql";
  const migration = LATER_MIGRATIONS.find((candidate) => candidate.file === file);
  const capture = [...allCaptureTriggers(models).values()];
  const shared = models.filter((model) => !isLocalModel(model));
  return `-- مركز إنماء برو: two laptops, one centre (docs/sync/DECISION.md; DESIGN.md section 20).
--
-- GENERATED by scripts/generate-db-types.mjs from prisma/schema.prisma (the models,
-- rebuilds and capture LATER_MIGRATIONS gives this file in scripts/db/schema-tools.mjs)
-- and prisma/triggers.sql. Do not edit: change the sources and run \`npm run db:types\`.
-- Once an installer carries it, its text never changes again.
--
-- An installed copy applies it at its next start, in one transaction. Until sync is
-- set up, capture is off (SyncSession.capturing 0) and the program behaves as 1.0.0.

-- ── 1. The sync tables: six of this laptop's own, three shared ─────────────────

${laterDdl(file, models)}
-- The capture switch, off.
INSERT INTO "SyncSession" ("id", "capturing", "applying") VALUES ('session', 0, 0);

-- ── 2. One log chain per laptop ─────────────────────────────────────────────────
-- AuditLog.chainSeq was UNIQUE on the column in 0001 (a constraint SQLite cannot drop),
-- and each laptop's chain counts from 1. So the table is rebuilt: every row copied
-- unchanged (chain null: the 1.0.0 chain), uniqueness now per chain. SequenceGap,
-- which references AuditLog, is rebuilt with it, its rows unchanged; its kind gains
-- LOST_DEVICE (a code, not a check). ChainHead_step accepts the heads "AuditLog:<id>".

${rebuildSql(migration.rebuilds, models)}

-- ── 3. Capture: ${capture.length} triggers on the ${shared.length} shared tables ──────────────────────
-- Every insert, change and delete is copied into SyncOutbox while capturing = 1 and
-- applying = 0; a write whose transaction was not stamped is refused (SYNC_UNSTAMPED).
-- Not captured: the @local tables (Sequence, ChainHead, BackupRun, the six sync tables),
-- the settings system.* and backup.*, and a change of only the @local columns
-- (PaymentDue.paidAmount, StockItem.onHandQty, User.failedSignInCount, User.lastSignInAt).

${capture.join("\n\n")}
`;
}

/** A migration after the capture one that adds columns to a shared table writes its capture triggers again. */
function recapture(file, models) {
  const at = LATER_MIGRATIONS.findIndex((migration) => migration.file === file);
  const since = LATER_MIGRATIONS.findIndex((migration) => migration.file === CAPTURE_MIGRATION);
  if (since < 0 || at <= since) return "";
  const touched = [...new Set((LATER_MIGRATIONS[at].columns ?? []).map((entry) => entry.model))]
    .map((name) => models.find((model) => model.name === name))
    .filter((model) => model && !isLocalModel(model));
  return touched
    .flatMap((model) => captureTriggers(model).flatMap(([name, sql]) => [`DROP TRIGGER "${name}";`, sql]))
    .join("\n\n");
}

/** Each later migration's text, by file name, while it has not shipped. */
const LATER_MIGRATION_SQL = {
  "0003_service_catalogue.sql": serviceCatalogueSql,
  "0004_staff_trial_and_fixed_term.sql": staffTrialAndFixedTermSql,
  "0005_sync.sql": syncSql,
};

// ── Write ──────────────────────────────────────────────────────────────────

export function generatedFiles() {
  const models = parseSchema();
  return {
    models,
    files: {
      ...Object.fromEntries(
        LATER_MIGRATIONS.filter((migration) => !(migration.file in FROZEN_MIGRATIONS)).map((migration) => {
          const write = LATER_MIGRATION_SQL[migration.file];
          if (!write) throw new Error(`${migration.file}: no generator for this migration`);
          const again = recapture(migration.file, models);
          return [resolve(MIGRATIONS_DIR, migration.file), again ? `${write(models)}\n${again}\n` : write(models)];
        }),
      ),
      [resolve(ROOT, "src/lib/db/schema.ts")]: schemaTs(models),
      [resolve(ROOT, "src/lib/db/models.ts")]: modelsTs(models),
      [resolve(ROOT, "src/lib/db/column-meta.ts")]: columnMetaTs(models),
      [resolve(ROOT, "src/lib/db/column-tags.ts")]: columnTagsTs(models),
      [resolve(ROOT, "src/lib/db/chain-columns.ts")]: chainColumnsTs(models),
      [resolve(ROOT, "src/testing/table-shapes.ts")]: tableShapesTs(models),
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(ROOT, "scripts/generate-db-types.mjs")) {
  const { models, files } = generatedFiles();
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, text);
  }
  console.log(`Generated ${models.length} tables into ${Object.keys(files).length} files.`);
}
