// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-db-types.mjs from prisma/schema.prisma.

import type { DB } from "./schema";

export type TableName = keyof DB & string;

/** Columns stored as ISO-8601 text that the app expects as Date objects. */
export const DATE_COLUMNS = {
  User: ["accessStartDate", "accessEndDate", "createdAt", "updatedAt"],
  Setting: ["updatedAt"],
} as const satisfies Record<TableName, readonly string[]>;

/** Columns stored as 0/1 that the app expects as booleans. */
export const BOOLEAN_COLUMNS = {
  User: ["isActive"],
  Setting: [],
} as const satisfies Record<TableName, readonly string[]>;
