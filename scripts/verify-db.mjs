/**
 * db:verify. Fails when the database the program would create is not the one
 * prisma/schema.prisma and prisma/triggers.sql describe.
 *
 *   npm run db:verify
 *
 * 1. Every generated file (the two migrations, the types of src/lib/db, the
 *    test shapes) is what `npm run db:types` would write now.
 * 2. The migrations FOLDER (not a list written here) is applied to a temporary
 *    database file with the program's two connect-time settings, each file in a
 *    transaction as sqlx does, and the result is read back from SQLite itself:
 *    tables, columns, defaults, foreign keys, indexes, checks on dates and
 *    times, triggers. Each is compared with the parsed schema.
 * 3. The seeds hold what the data modules they come from say.
 * 4. The model's proof still answers as its tape says (scripts/db/model-proof.mjs).
 * 5. The documents in docs/data-model agree with the schema and with the code
 *    (scripts/db/check-docs.mjs, also `npm run db:docs`).
 *
 * The same migrations are applied on the engine that ships by the Rust test
 * `migrations_apply_on_the_shipped_engine` (cargo test --lib).
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

import {
  buildDdl,
  CHAINED_TABLES,
  foreignKeysOf,
  listMigrations,
  parseSchema,
  ROOT,
  sqlDefault,
  SQLTYPE,
} from "./db/schema-tools.mjs";
import { generatedFiles } from "./generate-db-types.mjs";

const { CAPABILITIES, DEFAULT_SECTION_LEVELS, ROLE_CODES, ROLE_LABELS } =
  await import("../src/lib/access/catalogue.ts");
const { COMMUNES_OUM_EL_BOUAGHI } = await import("../src/lib/geo/communes-oum-el-bouaghi.ts");

let failures = 0;
function check(label, condition, detail) {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail === undefined || detail === "" ? "" : `: ${detail}`}`);
  }
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const sorted = (list) => [...list].sort();
const list = (items, max = 8) =>
  items.length > max ? `${items.slice(0, max).join(", ")} … (${items.length})` : items.join(", ");

// ── 1. Generated files ───────────────────────────────────────────────────────
console.log("\ngenerated files against prisma/schema.prisma and prisma/triggers.sql");
const { files } = generatedFiles();
for (const [file, text] of Object.entries(files)) {
  const name = relative(ROOT, file);
  check(`${name} is current`, existsSync(file) && readFileSync(file, "utf8") === text, "run npm run db:types");
}

// ── 2. The database the migrations make ─────────────────────────────────────
const { DatabaseSync } = await import("node:sqlite");
const workDir = mkdtempSync(join(tmpdir(), "inmaa-verify-"));
const sqlite = new DatabaseSync(join(workDir, "inmaa.db"));
sqlite.exec("PRAGMA foreign_keys = ON; PRAGMA recursive_triggers = ON;");

console.log("\nmigrations folder");
const migrations = await listMigrations();
check("holds at least the schema and the seed", migrations.length >= 2, list(migrations.map((file) => basename(file))));
for (const file of migrations) {
  let error = null;
  try {
    sqlite.exec("BEGIN");
    sqlite.exec(readFileSync(file, "utf8"));
    sqlite.exec("COMMIT");
  } catch (caught) {
    error = caught instanceof Error ? caught.message : String(caught);
  }
  check(`${basename(file)} applies in one transaction`, error === null, error);
}
check("foreign_keys is on", sqlite.prepare("PRAGMA foreign_keys").get().foreign_keys === 1);
check("recursive_triggers is on", sqlite.prepare("PRAGMA recursive_triggers").get().recursive_triggers === 1);

const models = parseSchema();
const ddl = buildDdl(models);

console.log("\ntables");
const tables = sqlite
  .prepare(
    `SELECT "name", "strict" FROM pragma_table_list WHERE "schema" = 'main' AND "type" = 'table' AND "name" NOT LIKE 'sqlite_%' AND "name" <> '_sqlx_migrations'`,
  )
  .all();
const wanted = models.map((model) => model.name);
const present = tables.map((table) => table.name);
check(
  `the ${wanted.length} tables of the schema, and no other`,
  same(sorted(present), sorted(wanted)),
  `missing: ${list(wanted.filter((name) => !present.includes(name))) || "none"}; extra: ${list(present.filter((name) => !wanted.includes(name))) || "none"}`,
);
const loose = tables.filter((table) => table.strict !== 1).map((table) => table.name);
check("every table is STRICT", loose.length === 0, list(loose));

console.log("\ncolumns, defaults and checks");
const columnProblems = [];
const checkProblems = [];
for (const model of models) {
  if (!present.includes(model.name)) continue;
  const info = sqlite.prepare(`PRAGMA table_info("${model.name}")`).all();
  const expected = model.cols.map((column) => ({
    name: column.name,
    type: SQLTYPE[column.type],
    notnull: column.optional ? 0 : 1,
    dflt_value: column.def === null ? null : String(sqlDefault(column.def)),
    pk: column.id ? 1 : 0,
  }));
  const actual = info.map((column) => ({
    name: column.name,
    type: column.type,
    notnull: column.notnull,
    dflt_value: column.dflt_value,
    pk: column.pk,
  }));
  if (!same(actual, expected)) {
    const names = new Set([...expected, ...actual].map((column) => column.name));
    for (const name of names) {
      const a = actual.find((column) => column.name === name);
      const e = expected.find((column) => column.name === name);
      if (!same(a, e)) columnProblems.push(`${model.name}.${name}`);
    }
    if (!columnProblems.length) columnProblems.push(`${model.name} (column order)`);
  }
  const text = sqlite
    .prepare(`SELECT "sql" FROM sqlite_master WHERE "type" = 'table' AND "name" = ?`)
    .get(model.name).sql;
  for (const column of model.cols.filter((candidate) => candidate.isDate || candidate.isTime)) {
    if (!text.includes(`CHECK ("${column.name}" IS NULL OR "${column.name}" GLOB`))
      checkProblems.push(`${model.name}.${column.name}`);
  }
  const tableChecks = model.directives.filter((directive) => directive.startsWith("@check")).length;
  const found = (text.match(/^\s+CHECK \(/gm) ?? []).length;
  if (found !== tableChecks) checkProblems.push(`${model.name}: ${found} table checks, the schema has ${tableChecks}`);
}
check("every column has its type, NOT NULL, default and key", columnProblems.length === 0, list(columnProblems));
check(
  "every date and time column has its format check, every @check is there",
  checkProblems.length === 0,
  list(checkProblems),
);

console.log("\nforeign keys");
const keyProblems = [];
for (const model of models) {
  if (!present.includes(model.name)) continue;
  const actual = sqlite
    .prepare(`PRAGMA foreign_key_list("${model.name}")`)
    .all()
    .map((key) => `${key.from}->${key.table}.${key.to} ${key.on_delete}`);
  const expected = foreignKeysOf(model).map((key) => `${key.col}->${key.target}.${key.ref} ${key.onDelete}`);
  if (!same(sorted(actual), sorted(expected))) keyProblems.push(model.name);
}
check("every relation and every ...UserId column, with its delete rule", keyProblems.length === 0, list(keyProblems));
const orphans = sqlite.prepare("PRAGMA foreign_key_check").all();
check("no row points at nothing", orphans.length === 0, list(orphans.map((row) => `${row.table} ${row.rowid}`)));

console.log("\nindexes");
const indexProblems = [];
for (const model of models) {
  if (!present.includes(model.name)) continue;
  const indexes = sqlite.prepare(`PRAGMA index_list("${model.name}")`).all();
  const declared = indexes.filter((index) => index.origin === "c").map((index) => index.name);
  if (!same(sorted(declared), sorted(ddl.indexNames.get(model.name) ?? [])))
    indexProblems.push(`${model.name} (indexes)`);
  const uniques = indexes.filter((index) => index.origin === "u").length;
  const wantedUniques = model.uniques.length + model.cols.filter((column) => column.unique).length;
  if (uniques !== wantedUniques)
    indexProblems.push(`${model.name} (${uniques} unique constraints, the schema has ${wantedUniques})`);
}
check(
  "every @@index, @index and @uniqueWhere, every unique constraint",
  indexProblems.length === 0,
  list(indexProblems),
);

console.log("\ntriggers");
const triggerRows = sqlite.prepare(`SELECT "name", "tbl_name" FROM sqlite_master WHERE "type" = 'trigger'`).all();
const triggerProblems = [];
for (const model of models) {
  const actual = triggerRows.filter((row) => row.tbl_name === model.name).map((row) => row.name);
  const expected = ddl.triggerNames.get(model.name) ?? [];
  if (!same(sorted(actual), sorted(expected))) {
    triggerProblems.push(
      `${model.name}: ${list(expected.filter((name) => !actual.includes(name)))} missing, ${list(actual.filter((name) => !expected.includes(name)))} extra`,
    );
  }
}
const expectedTriggers = [...ddl.triggerNames.values()].flat().length;
check(
  `the ${expectedTriggers} triggers of the schema, each on its table`,
  triggerProblems.length === 0 && triggerRows.length === expectedTriggers,
  list(triggerProblems, 4),
);
const chainedWithoutTriggers = CHAINED_TABLES.filter(
  (table) =>
    !["_no_update", "_no_delete", "_chain_insert", "_chain_advance"].every((suffix) =>
      triggerRows.some((row) => row.name === `${table}${suffix}`),
    ),
);
check(
  "each of the eight chained tables is append-only and chained",
  chainedWithoutTriggers.length === 0,
  list(chainedWithoutTriggers),
);

console.log("\nseeds");
const roles = sqlite
  .prepare(`SELECT "id", "labelAr", "labelFr", "labelEn", "isSystem" FROM "Role" ORDER BY "sortOrder"`)
  .all();
check(
  "the seven roles, with their labels; only MANAGER is the system role",
  same(
    roles.map((role) => [role.id, role.labelAr, role.labelFr, role.labelEn, role.isSystem]),
    ROLE_CODES.map((code) => [
      code,
      ROLE_LABELS[code].ar,
      ROLE_LABELS[code].fr,
      ROLE_LABELS[code].en,
      code === "MANAGER" ? 1 : 0,
    ]),
  ),
);
const grants = sqlite
  .prepare(`SELECT "roleId", "kind", "key", "access" FROM "RoleGrant"`)
  .all()
  .map((grant) => `${grant.roleId} ${grant.kind} ${grant.key} ${grant.access}`);
const wantedGrants = [
  ...Object.entries(DEFAULT_SECTION_LEVELS).flatMap(([role, levels]) =>
    Object.entries(levels).map(([section, level]) => `${role} SECTION ${section} ${level}`),
  ),
  ...Object.entries(CAPABILITIES).flatMap(([capability, holders]) =>
    holders.map((role) => `${role} CAPABILITY ${capability} GRANTED`),
  ),
];
check(
  `the ${wantedGrants.length} default grants of src/lib/access/catalogue.ts, none to MANAGER`,
  same(sorted(grants), sorted(wantedGrants)),
);
const branches = sqlite.prepare(`SELECT "id", "isDefault" FROM "Branch"`).all();
check(
  "one branch, the default",
  branches.length === 1 && branches[0].id === "branch-main" && branches[0].isDefault === 1,
);
const communes = sqlite
  .prepare(`SELECT "nameAr" FROM "Commune" WHERE "wilayaCode" = '04' AND "isSeeded" = 1 ORDER BY "id"`)
  .all();
check(
  `the ${COMMUNES_OUM_EL_BOUAGHI.length} communes of wilaya 04 (names still to be verified)`,
  same(
    communes.map((commune) => commune.nameAr),
    COMMUNES_OUM_EL_BOUAGHI.map((commune) => commune.nameAr),
  ),
);
const empty = ["User", "Setting", "Sequence", "ChainHead", "AuditLog"].filter(
  (table) => sqlite.prepare(`SELECT COUNT(*) AS n FROM "${table}"`).get().n !== 0,
);
check(
  "no account, setting, counter, chain head or log entry ships in a migration (first run writes them)",
  empty.length === 0,
  list(empty),
);
check("integrity check", sqlite.prepare("PRAGMA integrity_check").get().integrity_check === "ok");

sqlite.close();
rmSync(workDir, { recursive: true, force: true });

// ── 4. The proof ─────────────────────────────────────────────────────────────
console.log("\nthe model's proof");
const proof = spawnSync(process.execPath, [resolve(ROOT, "scripts/db/model-proof.mjs"), "--check"], {
  encoding: "utf8",
});
const summary = `${proof.stdout}`.trim().split("\n").at(-1) ?? "";
check(
  `scripts/db/model-proof.mjs --check (${summary})`,
  proof.status === 0,
  `${proof.stdout}${proof.stderr}`.trim().split("\n").slice(-4).join(" | "),
);

// ── 5. The documents ─────────────────────────────────────────────────────────
console.log("\nthe data model's documents (docs/data-model)");
const docs = spawnSync(process.execPath, [resolve(ROOT, "scripts/db/check-docs.mjs")], { encoding: "utf8" });
const docsSummary = `${docs.stdout}`.trim().split("\n").at(-1) ?? "";
check(
  `scripts/db/check-docs.mjs (${docsSummary})`,
  docs.status === 0,
  `${docs.stdout}`
    .trim()
    .split("\n")
    .filter((line) => !line.startsWith(" "))
    .slice(-6)
    .join(" | "),
);

console.log(failures === 0 ? "\nAll checks passed.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
