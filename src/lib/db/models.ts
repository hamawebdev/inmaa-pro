// GENERATED FILE — do not edit by hand.
// Produced by scripts/generate-db-types.mjs from prisma/schema.prisma.

/**
 * Application-facing row shapes — the same field names and types the Prisma
 * client produced in the web app, so ported code keeps compiling. Rows come out
 * of ./rows#hydrate in this shape.
 */

export interface User {
  id: string;
  name: string;
  email: string;
  password: string;
  role: string;
  parentAdminId: string | null;
  permissions: string | null;
  isActive: boolean;
  academyName: string | null;
  logoUrl: string | null;
  phone: string | null;
  notes: string | null;
  accessStartDate: Date | null;
  accessEndDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface Setting {
  id: string;
  adminId: string | null;
  key: string;
  value: string;
  updatedAt: Date;
}
