// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-db-types.mjs from prisma/schema.prisma.

import type { Generated } from "kysely";

/**
 * Raw storage shapes. Dates are ISO-8601 UTC strings and booleans are 0/1
 * integers, because that is literally what SQLite holds. Convert with
 * hydrate() / dehydrate() from ./rows before handing rows to the app.
 */

export interface UserTable {
  id: Generated<string>;
  name: string;
  email: string;
  password: string;
  role: Generated<string>;
  parentAdminId: string | null;
  permissions: string | null;
  isActive: Generated<number>;
  academyName: string | null;
  logoUrl: string | null;
  phone: string | null;
  notes: string | null;
  accessStartDate: string | null;
  accessEndDate: string | null;
  createdAt: Generated<string>;
  updatedAt: Generated<string>;
}

export interface SettingTable {
  id: Generated<string>;
  adminId: string | null;
  key: string;
  value: string;
  updatedAt: Generated<string>;
}

export interface DB {
  User: UserTable;
  Setting: SettingTable;
}
