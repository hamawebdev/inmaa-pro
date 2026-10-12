// The data model's documents against the schema, against each other, and
// against the code that carries them (docs/data-model is Foundation's).
//
//   npm run db:docs                 (also run by npm run db:verify)
//
// Sections 1 to 7 are the model's own checker (it lived beside the model as
// check-schema.mjs), reading the schema from prisma/ and the documents from
// docs/data-model/. Section 8 is new: the catalogues in src/lib must say what
// the documents say, so a setting, a capability, an event, a log action, a
// sequence key or a role cannot exist on one side only.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { ROOT } from "./schema-tools.mjs";

const SOURCES = {
  "schema.prisma": "prisma/schema.prisma",
  "triggers.sql": "prisma/triggers.sql",
};
const read = (f) => {
  const file = resolve(ROOT, SOURCES[f] ?? `docs/data-model/${f}`);
  return existsSync(file) ? readFileSync(file, "utf8") : "";
};
const text = read("schema.prisma");
const SCALARS = new Set(["String", "Int", "Boolean", "DateTime"]);
const FORBIDDEN = new Set(["Float", "Decimal", "Json", "Bytes", "BigInt"]);
const RESERVED = new Set([
  "order",
  "from",
  "to",
  "group",
  "index",
  "table",
  "default",
  "check",
  "select",
  "where",
  "values",
  "references",
  "transaction",
]);

let problems = 0;
const say = (s) => {
  problems++;
  console.log(s);
};

// ── 1. the schema itself ─────────────────────────────────────────────────────
const lines = text.split("\n");
const models = [];
for (let i = 0; i < lines.length; i++) {
  const h = /^model\s+(\w+)\s*\{/.exec(lines[i]);
  if (!h) continue;
  let d = i;
  while (d > 0 && lines[d - 1].startsWith("///")) d--;
  const doc = lines.slice(d, i).map((l) => l.replace(/^\/\/\/\s?/, ""));
  const fields = [],
    blockAttrs = [];
  for (i++; lines[i] !== "}"; i++) {
    const raw = lines[i];
    const comment = (/\/\/(.*)$/.exec(raw) || [, ""])[1];
    const line = raw.replace(/\/\/.*$/, "").trim();
    if (!line) continue;
    if (line.startsWith("@@")) {
      blockAttrs.push(line);
      continue;
    }
    const f = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
    if (!f) {
      say(`UNPARSED ${h[1]}: ${line}`);
      continue;
    }
    fields.push({ name: f[1], type: f[2], list: !!f[3], optional: !!f[4], attrs: f[5] || "", comment });
  }
  models.push({ name: h[1], fields, blockAttrs, doc });
}
const names = new Set(models.map((x) => x.name));
const byName = new Map(models.map((x) => [x.name, x]));
const dup = models.map((x) => x.name).filter((n, i, a) => a.indexOf(n) !== i);
if (dup.length) say(`DUPLICATE MODELS: ${dup.join(", ")}`);
const CHAIN_COLS = ["hashV", "chainSeq", "prevHash", "hash"];

for (const model of models) {
  const scalar = new Map(model.fields.filter((f) => SCALARS.has(f.type)).map((f) => [f.name, f]));
  const seen = new Set();
  for (const f of model.fields) {
    if (seen.has(f.name)) say(`${model.name}.${f.name}: duplicate field`);
    seen.add(f.name);
    if (FORBIDDEN.has(f.type)) say(`${model.name}.${f.name}: forbidden type ${f.type}`);
    if (RESERVED.has(f.name)) say(`${model.name}.${f.name}: SQL keyword as a column name`);
    if (!SCALARS.has(f.type)) {
      if (!names.has(f.type)) say(`${model.name}.${f.name}: unknown model ${f.type}`);
      const rel = /fields:\s*\[(\w+)\]/.exec(f.attrs);
      if (!rel) say(`${model.name}.${f.name}: relation without fields`);
      else {
        const fk = scalar.get(rel[1]);
        if (!fk) say(`${model.name}.${f.name}: fk column ${rel[1]} missing`);
        else if (fk.optional !== f.optional) say(`${model.name}.${f.name}: optional mark differs from ${rel[1]}`);
      }
      if (!/onDelete:\s*(Restrict|Cascade)/.test(f.attrs))
        say(`${model.name}.${f.name}: no delete rule (Restrict or Cascade)`);
    } else {
      if (f.type === "DateTime" && !/At$|^timestamp$/.test(f.name))
        say(`${model.name}.${f.name}: DateTime not named ...At`);
      if (f.type === "String" && /At$/.test(f.name)) say(`${model.name}.${f.name}: String named ...At`);
      if (/Date$|^date$/.test(f.name) && f.type === "String" && !/@date/.test(f.comment))
        say(`${model.name}.${f.name}: date without @date tag`);
      if (/Time$/.test(f.name) && f.type === "String" && !/@time/.test(f.comment))
        say(`${model.name}.${f.name}: time without @time tag`);
      if (/Url$/.test(f.name) && !/@url/.test(f.comment)) say(`${model.name}.${f.name}: url without @url tag`);
      if (/Min$/.test(f.name) && f.type === "Int" && !/@min/.test(f.comment))
        say(`${model.name}.${f.name}: minutes without @min tag`);
      if (/^(notes|position|minutes|at)$|Minutes$/.test(f.name))
        say(`${model.name}.${f.name}: a name the conventions replaced (note, sortOrder, ...Min, createdAt)`);
    }
  }
  if (!scalar.has("id")) say(`${model.name}: no id`);
  if (!scalar.has("createdAt") && !["Setting", "Sequence", "ChainHead", "BackupRun"].includes(model.name))
    say(`${model.name}: no createdAt`);
  for (const attr of model.blockAttrs) {
    const cols = /\[([^\]]+)\]/.exec(attr);
    if (!cols) {
      say(`${model.name}: bad block attr ${attr}`);
      continue;
    }
    for (const c of cols[1].split(",").map((s) => s.trim()))
      if (!scalar.has(c)) say(`${model.name}: ${attr} names unknown column ${c}`);
  }
  const chained = model.doc.includes("@trigger chained"),
    appendOnly = chained || model.doc.includes("@trigger appendOnly");
  if (chained) {
    for (const c of CHAIN_COLS) if (!scalar.has(c)) say(`${model.name}: chained without ${c}`);
    for (const f of scalar.values())
      if (/@default/.test(f.attrs)) say(`${model.name}.${f.name}: a default on a chained table`);
  }
  if (!chained && CHAIN_COLS.some((c) => scalar.has(c))) say(`${model.name}: chain columns without @trigger chained`);
  if (appendOnly)
    for (const c of ["updatedAt", "updatedByUserId", "deletedAt"])
      if (scalar.has(c)) say(`${model.name}: append-only with ${c}`);
  if (model.doc.some((l) => l.startsWith("SQL:")))
    say(`${model.name}: a prose 'SQL:' line (use @check, @uniqueWhere, @index, @trigger)`);
  model.cols = scalar;
  model.chained = chained;
  model.appendOnly = appendOnly && !chained;
}
console.log(`${models.length} models, ${models.reduce((n, x) => n + x.cols.size, 0)} columns`);
const owners = new Map();
{
  let cur = null;
  for (const l of lines) {
    const b = /OWNER: ([A-Z &]+) \((\d+) models\)/.exec(l);
    if (b) {
      cur = b[1].trim();
      owners.set(cur, { said: Number(b[2]), models: [] });
    }
    const h = /^model\s+(\w+)/.exec(l);
    if (h && cur) owners.get(cur).models.push(h[1]);
  }
}
for (const [o, v] of owners) {
  console.log(`  ${o}: ${v.models.length}`);
  if (v.said !== v.models.length) say(`banner of ${o} says ${v.said}, holds ${v.models.length}`);
}

// ── 2. codes against OPTION-CODES.md ─────────────────────────────────────────
const codes = read("OPTION-CODES.md");
const lists = new Set([...text.matchAll(/@codes? ([A-Z][A-Z_0-9]+)/g)].map((x) => x[1]));
for (const l of lists)
  if (!new RegExp(`\\b${l}\\b`).test(codes))
    say(`code list ${l} is used in the schema and missing from OPTION-CODES.md`);

// ── 3. one writer per table in CONTRACTS.md ──────────────────────────────────
const contracts = read("CONTRACTS.md");
{
  const sec = contracts.split("## 2. Every table")[1]?.split("## 3.")[0] || "";
  const head = {
    Foundation: "FOUNDATION",
    People: "PEOPLE",
    "Clients and contracts": "CLIENTS AND CONTRACTS",
    Operations: "OPERATIONS",
    "Money and stock": "MONEY AND STOCK",
  };
  const where = new Map();
  let cur = null;
  for (const l of sec.split("\n")) {
    const h = /^### (.+)$/.exec(l);
    if (h) {
      cur = head[h[1].trim()];
      continue;
    }
    if (!l.startsWith("| `")) continue;
    for (const x of l.split("|")[1].matchAll(/`(\w+)`/g)) {
      if (where.has(x[1])) say(`CONTRACTS section 2 lists ${x[1]} twice`);
      where.set(x[1], cur);
    }
  }
  for (const [o, v] of owners)
    for (const n of v.models) {
      if (!where.has(n)) say(`CONTRACTS section 2 has no row for ${n}`);
      else if (where.get(n) !== o) say(`CONTRACTS puts ${n} under ${where.get(n)}, the schema under ${o}`);
    }
  for (const n of where.keys()) if (!names.has(n)) say(`CONTRACTS section 2 names ${n}, which is not a model`);
}

// ── 4. settings, capabilities, alerts, events: defined once, used anywhere ───
const design = read("DESIGN.md");
const firstCells = (doc, from, to) => {
  const out = new Set();
  for (const l of (doc.split(from)[1]?.split(to)[0] || "").split("\n"))
    if (l.startsWith("| `"))
      for (const x of l.split("|")[1].matchAll(/`([a-z][A-Za-z]*(?:\.[A-Za-z][A-Za-z0-9]*)+)`/g)) out.add(x[1]);
  return out;
};
const settings = firstCells(design, "## 11. Settings", "## 12."),
  caps = firstCells(design, "## 12. Roles", "## 13."),
  alerts = firstCells(design, "## 13. Alerts", "## 14."),
  events = firstCells(contracts, "## 4. Events", "## 5.");
console.log(
  `  defined: ${settings.size} settings, ${caps.size} capabilities, ${alerts.size} alerts, ${events.size} events`,
);
const known = new Set([...settings, ...caps, ...alerts, ...events]);
const prefix = (k) => [...settings].some((s) => s.startsWith(k + ".")); // `stamp`, `work.period` used as a family name
const IGNORE =
  /^(ctx|db|e|p|r|s|d|g|f|x|i|a|v|row|input|license|process|console|import)\.|\.(md|mjs|js|ts|tsx|rs|sql|prisma|txt|json|py|db|html|toml|sh)$|^(node\.js|e\.g|i\.e)$/;
for (const f of [
  "schema.prisma",
  "DESIGN.md",
  "CONTRACTS.md",
  "OPTION-CODES.md",
  "BUILD-NOTES.md",
  "RULINGS-NEEDED.md",
  "triggers.sql",
]) {
  const t = read(f);
  if (!t) {
    say(`${f} is missing`);
    continue;
  }
  const seen = new Set();
  for (const x of t.matchAll(/[`"']([a-z][A-Za-z]*(?:\.[A-Za-z][A-Za-z0-9]*)+)(?:\.\*)?[`"']/g)) {
    const k = x[1];
    if (known.has(k) || IGNORE.test(k) || prefix(k) || seen.has(k)) continue;
    seen.add(k);
    say(`${f}: \`${k}\` is not a setting, capability, alert or event defined in DESIGN.md or CONTRACTS.md`);
  }
}

// ── 5. Model.column references in the documents exist ───────────────────────
for (const f of ["DESIGN.md", "CONTRACTS.md", "OPTION-CODES.md", "BUILD-NOTES.md", "RULINGS-NEEDED.md"]) {
  const seen = new Set();
  for (const x of read(f)
    .split("## 18. Builders' names that changed")[0]
    .matchAll(/`([A-Z][A-Za-z]+)\.([a-z][A-Za-z0-9]*)`/g)) {
    const m = byName.get(x[1]);
    if (!m || seen.has(x[0])) continue;
    seen.add(x[0]);
    if (!m.cols.has(x[2]) && !m.fields.some((fl) => fl.name === x[2]))
      say(`${f}: ${x[0]} is not a column of the schema`);
  }
}

// ── 6. the class lists of DESIGN.md section 4 ────────────────────────────────
{
  const sec = design.split("## 4. Soft delete")[1]?.split("## 5.")[0] || "";
  const listOf = (startsWith) => {
    const l = sec.split("\n").find((x) => x.startsWith(startsWith)) || "";
    return new Set([...l.matchAll(/`(\w+)`/g)].map((x) => x[1]).filter((n) => names.has(n)));
  };
  const same = (label, said, real) => {
    const a = [...real].filter((n) => !said.has(n)),
      b = [...said].filter((n) => !real.has(n));
    if (a.length || b.length)
      say(`DESIGN section 4, ${label}: missing ${a.join(", ") || "none"}; extra ${b.join(", ") || "none"}`);
  };
  same(
    "soft-deletable",
    listOf("Soft-deletable"),
    new Set(models.filter((m) => m.cols.has("deletedAt")).map((m) => m.name)),
  );
  same("class A", listOf("| A."), new Set(models.filter((m) => m.chained).map((m) => m.name)));
  same("class B", listOf("| B."), new Set(models.filter((m) => m.appendOnly).map((m) => m.name)));
  const c = listOf("| C.");
  for (const n of ["Role", "PayRun"]) c.delete(n);
  same("class C", c, new Set(models.filter((m) => m.doc.includes("@trigger noDelete")).map((m) => m.name)));
  const n = /Soft-deletable \((\d+) tables\)/.exec(sec);
  if (n && Number(n[1]) !== models.filter((m) => m.cols.has("deletedAt")).length)
    say(
      `DESIGN section 4 says ${n[1]} soft-deletable tables, the schema has ${models.filter((m) => m.cols.has("deletedAt")).length}`,
    );
}

// ── 7. named triggers ────────────────────────────────────────────────────────
{
  const inFile = new Set([...read("triggers.sql").matchAll(/CREATE TRIGGER "(\w+)"/g)].map((x) => x[1]));
  const wanted = new Set(
    models.flatMap((m) => m.doc.map((l) => /^@trigger named (\w+)$/.exec(l)?.[1]).filter(Boolean)),
  );
  for (const n of wanted) if (!inFile.has(n)) say(`trigger ${n} is named in the schema and missing from triggers.sql`);
  for (const n of inFile) if (!wanted.has(n)) say(`trigger ${n} is in triggers.sql and named by no model`);
}

// ── 8. the code's catalogues against the documents ──────────────────────────
{
  const code = (file) => readFileSync(resolve(ROOT, file), "utf8");
  const differ = (label, documented, built) => {
    const missing = [...documented].filter((k) => !built.has(k));
    const extra = [...built].filter((k) => !documented.has(k));
    if (missing.length || extra.length)
      say(
        `${label}: documented only: ${missing.join(", ") || "none"}; in the code only: ${extra.join(", ") || "none"}`,
      );
  };
  const optionList = (name) => {
    const row = codes.split("\n").find((l) => new RegExp(`^\\| ${name}\\b`).test(l)) ?? "";
    return new Set([...(row.split("|")[2] ?? "").matchAll(/`([A-Z][A-Z0-9_]*)`/g)].map((x) => x[1]));
  };
  const quoted = (text) => new Set([...text.matchAll(/"([A-Z][A-Z0-9_]*)"/g)].map((x) => x[1]));
  const between = (text, from, to) => text.split(from)[1]?.split(to)[0] ?? "";
  const quoted2 = (text) => new Set([...text.matchAll(/"([a-z][A-Za-z]*\.[A-Za-z]+)"/g)].map((x) => x[1]));

  const { SETTING_KEYS } = await import(resolve(ROOT, "src/lib/settings/catalogue.ts"));
  differ("settings (DESIGN section 11 / src/lib/settings/catalogue.ts)", settings, new Set(SETTING_KEYS));
  const { CAPABILITY_KEYS, ROLE_CODES } = await import(resolve(ROOT, "src/lib/access/catalogue.ts"));
  differ("capabilities (DESIGN section 12 / src/lib/access/catalogue.ts)", caps, new Set(CAPABILITY_KEYS));
  differ("roles (OPTION-CODES ROLE / src/lib/access/catalogue.ts)", optionList("ROLE"), new Set(ROLE_CODES));
  const payloads = between(code("src/lib/events/index.ts"), "export interface EventPayloads {", "\n}");
  const eventNames = new Set([...payloads.matchAll(/"([a-z]+\.[A-Za-z]+)":/g)].map((x) => x[1]));
  differ("events (CONTRACTS section 4 / src/lib/events/index.ts)", events, eventNames);
  const logActions = quoted(between(code("src/lib/log/index.ts"), "export const LOG_ACTIONS = [", "]"));
  differ("log actions (OPTION-CODES LOG_ACTION / src/lib/log)", optionList("LOG_ACTION"), logActions);
  const sequenceKeys = quoted(between(code("src/lib/numbering/index.ts"), "export const SEQUENCE_KEYS = [", "]"));
  differ("sequence keys (OPTION-CODES SEQUENCE_KEY / src/lib/numbering)", optionList("SEQUENCE_KEY"), sequenceKeys);
  // The shared option lists (src/lib/options) against OPTION-CODES: a table row of their name, or else the
  // section headed by it (its first column of codes, or its first line pairing codes with his words).
  const sharedListCodes = (name) => {
    const fromRow = optionList(name);
    if (fromRow.size) return fromRow;
    const section = codes.split(new RegExp(`^### ${name}\\b.*$`, "m"))[1]?.split(/^### /m)[0] ?? "";
    const firstColumn = [...section.matchAll(/^\| `([A-Z][A-Z0-9_]*)` \|/gm)].map((x) => x[1]);
    if (firstColumn.length) return new Set(firstColumn);
    const line = section.split("\n").find((text) => /`[A-Z][A-Z0-9_]*` «/.test(text)) ?? "";
    return new Set([...line.matchAll(/`([A-Z][A-Z0-9_]*)` «/g)].map((x) => x[1]));
  };
  const { SHARED_OPTION_LISTS } = await import(resolve(ROOT, "src/lib/options/index.ts"));
  // Not in OPTION-CODES as a list of their own: yes/no is a nullable Boolean there; a woman's role words are
  // the same codes; the corrective actions and recommendations share one table with columns per use.
  const NOT_LISTED = new Set(["YesNo", "WorkerRoleFeminine", "CorrectiveAction", "EvaluationRecommendation"]);
  let sharedChecked = 0;
  for (const [name, listCodes] of Object.entries(SHARED_OPTION_LISTS)) {
    if (NOT_LISTED.has(name)) continue;
    const listName = name.replace(/([a-z])([A-Z])/g, "$1_$2").toUpperCase();
    const documented = sharedListCodes(listName);
    if (!documented.size) say(`src/lib/options: ${listName} is not a list of OPTION-CODES.md`);
    else differ(`shared list ${listName} (OPTION-CODES / src/lib/options)`, documented, new Set(listCodes));
    sharedChecked += 1;
  }
  // Each division's subset of the two service catalogues, in print order, against the table's "col, row" cells.
  const { PROVIDED_SERVICES_OF, PROGRAMMED_SERVICES_OF } = await import(resolve(ROOT, "src/lib/options/index.ts"));
  const subsets = (name, column) => {
    const section = codes.split(new RegExp(`^### ${name}\\b.*$`, "m"))[1]?.split(/^### /m)[0] ?? "";
    return [...section.matchAll(/^\| `([A-Z][A-Z0-9_]*)` \|.*$/gm)]
      .map((row) => ({ code: row[1], cell: row[0].split("|")[column]?.trim() ?? "" }))
      .map(({ code, cell }) => ({ code, at: /col (\d+), (\d+)/.exec(cell) }))
      .filter(({ at }) => at)
      .sort((a, b) => Number(a.at[1]) - Number(b.at[1]) || Number(a.at[2]) - Number(b.at[2]))
      .map(({ code }) => code);
  };
  const inOrder = (label, documented, built) => {
    if (documented.join() !== [...built].join())
      say(`${label}: OPTION-CODES ${documented.join(" ")}; src/lib/options ${[...built].join(" ")}`);
  };
  inOrder("PROVIDED_SERVICE of HOUSING", subsets("PROVIDED_SERVICE", 3), PROVIDED_SERVICES_OF.HOUSING);
  inOrder("PROVIDED_SERVICE of ORGANISATION", subsets("PROVIDED_SERVICE", 4), PROVIDED_SERVICES_OF.ORGANISATION);
  inOrder("PROVIDED_SERVICE of BUILDING", subsets("PROVIDED_SERVICE", 5), PROVIDED_SERVICES_OF.BUILDING);
  inOrder("PROGRAMMED_SERVICE of ORGANISATION", subsets("PROGRAMMED_SERVICE", 3), PROGRAMMED_SERVICES_OF.ORGANISATION);
  inOrder("PROGRAMMED_SERVICE of HOUSING", subsets("PROGRAMMED_SERVICE", 4), PROGRAMMED_SERVICES_OF.HOUSING);
  const alertKeys = quoted2(between(code("src/lib/alerts/index.ts"), "export const ALERT_KEYS = [", "]"));
  differ("alerts (DESIGN section 13 / src/lib/alerts)", alerts, alertKeys);
  const wilayas = (await import(resolve(ROOT, "src/lib/geo/wilayas.ts"))).WILAYAS;
  if (wilayas.length !== 69) say(`src/lib/geo/wilayas.ts holds ${wilayas.length} wilayas; ruling 6 says 69`);
  const sizes = [
    SETTING_KEYS.length,
    CAPABILITY_KEYS.length,
    ROLE_CODES.length,
    eventNames.size,
    logActions.size,
    sequenceKeys.size,
  ];
  if (sizes.some((size) => size === 0)) say(`a catalogue of the code was read as empty: ${sizes.join(", ")}`);
  console.log(
    `  in the code: ${SETTING_KEYS.length} settings, ${CAPABILITY_KEYS.length} capabilities, ${ROLE_CODES.length} roles, ` +
      `${eventNames.size} events, ${logActions.size} log actions, ${sequenceKeys.size} sequence keys, ${wilayas.length} wilayas, ` +
      `${sharedChecked} shared option lists`,
  );
}

console.log(`${problems} problems`);
process.exit(problems === 0 ? 0 : 1);
