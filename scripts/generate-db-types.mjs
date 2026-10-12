/**
 * Generates the database typing layer from prisma/schema.prisma.
 *
 *   src/lib/db/schema.ts       Kysely `DB` interface, in raw storage types
 *                              (dates are TEXT, booleans are INTEGER 0/1)
 *   src/lib/db/models.ts       the row shapes the app works with, matching what
 *                              Prisma returned in the web app (Date, boolean)
 *   src/lib/db/column-meta.ts  which columns are dates / booleans per table, so
 *                              hydrate()/dehydrate() can convert generically
 *
 * Prisma is not a dependency — this parses the schema file as text. Run with:
 *   node scripts/generate-db-types.mjs
 *
 * The generated files are committed; regenerate them if the schema changes.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const schemaText = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");

/** @typedef {{ name: string, type: string, optional: boolean, list: boolean, attrs: string, isRelation: boolean }} Field */

const SCALARS = new Set(["String", "Int", "Float", "Boolean", "DateTime", "Json", "Bytes", "Decimal", "BigInt"]);

function parseModels(text) {
  const models = [];
  const modelRe = /^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm;
  let match;

  while ((match = modelRe.exec(text)) !== null) {
    const [, name, body] = match;
    const fields = [];

    for (const rawLine of body.split("\n")) {
      const line = rawLine.replace(/\/\/.*$/, "").trim();
      if (!line || line.startsWith("@@")) continue;

      const fieldMatch = /^(\w+)\s+(\w+)(\[\])?(\?)?\s*(.*)$/.exec(line);
      if (!fieldMatch) continue;

      const [, fieldName, fieldType, list, optional, attrs] = fieldMatch;
      fields.push({
        name: fieldName,
        type: fieldType,
        optional: Boolean(optional),
        list: Boolean(list),
        attrs: attrs ?? "",
        isRelation: !SCALARS.has(fieldType),
      });
    }

    models.push({ name, fields });
  }

  return models;
}

/** Storage type in SQLite, as the Kysely interface sees it. */
function storageType(field) {
  switch (field.type) {
    case "Int":
    case "Float":
    case "Decimal":
      return "number";
    case "Boolean":
      return "number"; // 0/1
    case "DateTime":
      return "string"; // ISO-8601 UTC
    case "BigInt":
      return "number";
    default:
      return "string";
  }
}

/** The type the application works with, matching Prisma's output shape. */
function modelType(field) {
  switch (field.type) {
    case "Int":
    case "Float":
    case "Decimal":
    case "BigInt":
      return "number";
    case "Boolean":
      return "boolean";
    case "DateTime":
      return "Date";
    default:
      return "string";
  }
}

/** Columns with a DEFAULT can be omitted on insert. */
function hasDefault(field) {
  return /@default\(/.test(field.attrs) || /@updatedAt/.test(field.attrs);
}

const models = parseModels(schemaText);
const scalarFieldsOf = (model) => model.fields.filter((f) => !f.isRelation && !f.list);

const header = `// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-db-types.mjs from prisma/schema.prisma.
`;

// ─── schema.ts ────────────────────────────────────────────────

let schemaOut = `${header}
import type { Generated } from "kysely";

/**
 * Raw storage shapes. Dates are ISO-8601 UTC strings and booleans are 0/1
 * integers, because that is literally what SQLite holds. Convert with
 * hydrate() / dehydrate() from ./rows before handing rows to the app.
 */
`;

for (const model of models) {
  schemaOut += `\nexport interface ${model.name}Table {\n`;
  for (const field of scalarFieldsOf(model)) {
    let type = storageType(field);
    if (field.optional) type += " | null";
    if (hasDefault(field)) type = `Generated<${type}>`;
    schemaOut += `  ${field.name}: ${type};\n`;
  }
  schemaOut += `}\n`;
}

schemaOut += `\nexport interface DB {\n`;
for (const model of models) {
  schemaOut += `  ${model.name}: ${model.name}Table;\n`;
}
schemaOut += `}\n`;

writeFileSync(resolve(root, "src/lib/db/schema.ts"), schemaOut);

// ─── models.ts ────────────────────────────────────────────────

let modelsOut = `${header}
/**
 * Application-facing row shapes — the same field names and types the Prisma
 * client produced in the web app, so ported code keeps compiling. Rows come out
 * of ./rows#hydrate in this shape.
 */
`;

for (const model of models) {
  modelsOut += `\nexport interface ${model.name} {\n`;
  for (const field of scalarFieldsOf(model)) {
    modelsOut += `  ${field.name}: ${modelType(field)}${field.optional ? " | null" : ""};\n`;
  }
  modelsOut += `}\n`;
}

writeFileSync(resolve(root, "src/lib/db/models.ts"), modelsOut);

// ─── column-meta.ts ───────────────────────────────────────────

let metaOut = `${header}
import type { DB } from "./schema";

export type TableName = keyof DB & string;

/** Columns stored as ISO-8601 text that the app expects as Date objects. */
export const DATE_COLUMNS = {
`;

for (const model of models) {
  const dates = scalarFieldsOf(model)
    .filter((f) => f.type === "DateTime")
    .map((f) => `"${f.name}"`);
  metaOut += `  ${model.name}: [${dates.join(", ")}],\n`;
}

metaOut += `} as const satisfies Record<TableName, readonly string[]>;

/** Columns stored as 0/1 that the app expects as booleans. */
export const BOOLEAN_COLUMNS = {
`;

for (const model of models) {
  const booleans = scalarFieldsOf(model)
    .filter((f) => f.type === "Boolean")
    .map((f) => `"${f.name}"`);
  metaOut += `  ${model.name}: [${booleans.join(", ")}],\n`;
}

metaOut += `} as const satisfies Record<TableName, readonly string[]>;
`;

writeFileSync(resolve(root, "src/lib/db/column-meta.ts"), metaOut);

console.log(`Generated ${models.length} models → src/lib/db/{schema,models,column-meta}.ts`);
