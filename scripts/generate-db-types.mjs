/**
 * Generates everything that is derived from the data model, in one run:
 *
 *   src-tauri/migrations/0001_init.sql   every table, check, index and trigger
 *   src-tauri/migrations/0002_seed.sql   the rows every installation needs
 *   src/lib/db/schema.ts                 Kysely `DB` interface, in storage types
 *   src/lib/db/models.ts                 the row shapes the screens work with
 *   src/lib/db/column-meta.ts            which columns are instants / booleans
 *   src/lib/db/column-tags.ts            the unit or meaning of every tagged column
 *   src/lib/db/chain-columns.ts          what each hash-chained row commits to
 *   src/testing/table-shapes.ts          what a test needs to fill a row
 *
 * Sources: prisma/schema.prisma and prisma/triggers.sql (the model), and the
 * data modules under src/lib (roles and grants, communes). Prisma is not a
 * dependency: the schema is parsed as text.
 *
 *   npm run db:types
 *
 * The generated files are committed. `npm run db:verify` fails when they and
 * their sources disagree.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import {
  CHAINED_TABLES,
  foreignKeysOf,
  initMigrationSql,
  MIGRATIONS_DIR,
  parseSchema,
  ROOT,
  SQLTYPE,
} from "./db/schema-tools.mjs";
import {
  CAPABILITIES,
  DEFAULT_SECTION_LEVELS,
  MANAGER_ROLE,
  ROLE_CODES,
  ROLE_LABELS,
  SECTION_CODES,
} from "../src/lib/access/catalogue.ts";
import { COMMUNES_OUM_EL_BOUAGHI } from "../src/lib/geo/communes-oum-el-bouaghi.ts";
import { normaliseName } from "../src/lib/text/normalise.ts";

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

function chainColumnsTs(models) {
  const body = CHAINED_TABLES.map((name) => {
    const m = models.find((x) => x.name === name);
    const cols = m.cols
      .filter((c) => c.name !== "hash")
      .map((c) => `[${JSON.stringify(c.name)}, ${JSON.stringify(SQLTYPE[c.type])}]`)
      .join(", ");
    return `  ${name}: {\n    1: [${cols}],\n  },`;
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
${CHAINED_TABLES.map((name) => `  ${name}: 1,`).join("\n")}
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

// ── The seed migration ─────────────────────────────────────────────────────

const q = (value) =>
  value === null ? "NULL" : typeof value === "number" ? String(value) : `'${String(value).replace(/'/g, "''")}'`;

function insert(table, columns, rows) {
  return `INSERT INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES\n${rows.map((row) => `  (${row.map(q).join(", ")})`).join(",\n")};`;
}

function seedSql() {
  const roles = ROLE_CODES.map((code, index) => [
    code,
    ROLE_LABELS[code].ar,
    ROLE_LABELS[code].fr,
    ROLE_LABELS[code].en,
    code === MANAGER_ROLE ? 1 : 0,
    1,
    index,
    SEED_AT,
    SEED_AT,
  ]);

  const grants = [];
  for (const role of ROLE_CODES) {
    if (role === MANAGER_ROLE) continue;
    for (const section of SECTION_CODES) {
      const level = DEFAULT_SECTION_LEVELS[role][section];
      if (level) grants.push([`grant-${role}-section-${section}`, role, "SECTION", section, level, SEED_AT, SEED_AT]);
    }
    for (const [capability, holders] of Object.entries(CAPABILITIES)) {
      if (holders.includes(role))
        grants.push([
          `grant-${role}-capability-${capability}`,
          role,
          "CAPABILITY",
          capability,
          "GRANTED",
          SEED_AT,
          SEED_AT,
        ]);
    }
  }

  const communes = COMMUNES_OUM_EL_BOUAGHI.map((commune) => [
    `commune-${commune.code}`,
    "04",
    commune.nameAr,
    commune.nameFr,
    normaliseName(commune.nameAr),
    null,
    1,
    1,
    SEED_AT,
    SEED_AT,
  ]);

  return `-- مركز إنماء برو: the rows every installation needs.
--
-- GENERATED by scripts/generate-db-types.mjs. Do not edit: change the data
-- modules named below and run \`npm run db:types\`.
--
-- Nothing here is a secret and nothing here is asked on the machine. What is
-- only known on the machine (the database id, the chain heads, the first
-- manager account, the centre's tax numbers) is written at first run, by
-- src/features/core/services/first-run.ts.

-- Roles (src/lib/access/catalogue.ts). MANAGER is the system role: it holds
-- everything and has no grant row.
${insert("Role", ["id", "labelAr", "labelFr", "labelEn", "isSystem", "isActive", "sortOrder", "createdAt", "updatedAt"], roles)}

-- What each other role may do by default: its level on a bar section, and its
-- capabilities (docs/data-model/DESIGN.md section 12). Editable afterwards.
${insert("RoleGrant", ["id", "roleId", "kind", "key", "access", "createdAt", "updatedAt"], grants)}

-- One branch. A second one is a label on documents, not a second database.
${insert(
  "Branch",
  ["id", "code", "name", "isDefault", "isActive", "createdAt", "updatedAt"],
  [["branch-main", "MAIN", "المركز الرئيسي", 1, 1, SEED_AT, SEED_AT]],
)}

-- The communes of the wilaya of أم البواقي (src/lib/geo/communes-oum-el-bouaghi.ts),
-- checked on 2026-10-12 against the 2008 census list with its official codes
-- (citypopulation.de) and the French and Arabic Wikipedia pages of the wilaya.
-- A seeded commune's id is "commune-" and its official code:
${COMMUNES_OUM_EL_BOUAGHI.map((commune) => `--   ${commune.code} ${commune.nameAr} (${commune.nameFr})`).join("\n")}
-- The office can add a commune from any address field, or correct one.
${insert(
  "Commune",
  ["id", "wilayaCode", "nameAr", "nameFr", "nameKey", "zoneId", "isSeeded", "isActive", "createdAt", "updatedAt"],
  communes,
)}
`;
}

// ── Write ──────────────────────────────────────────────────────────────────

export function generatedFiles() {
  const models = parseSchema();
  return {
    models,
    files: {
      [resolve(MIGRATIONS_DIR, "0001_init.sql")]: initMigrationSql(),
      [resolve(MIGRATIONS_DIR, "0002_seed.sql")]: seedSql(),
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
