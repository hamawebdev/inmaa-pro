-- مركز إنماء برو — PROVISIONAL schema.
--
-- These are only the two tables the shell itself reads: the settings rows
-- (password hashes, locked sections) and the single local "user" row that
-- carries the centre's name and logo. Their shape is the academy app's,
-- unchanged, so the shell code that came with them runs as it did.
--
-- The data model for the whole program replaces this file. Until the first
-- installer leaves the developer's machine, migrations may be rewritten and
-- every development database is disposable (see CLAUDE.md, "How this codebase
-- works"). After that, migrations are forward-only: a new numbered file, never
-- an edit.
--
-- Type mapping:
--   text      -> TEXT
--   integer   -> INTEGER
--   boolean   -> INTEGER (0/1)
--   date/time -> TEXT, ISO-8601 UTC ("2026-08-05T19:22:00.000Z")

CREATE TABLE "User" (
  "id"              TEXT PRIMARY KEY NOT NULL,
  "name"            TEXT NOT NULL,
  "email"           TEXT NOT NULL,
  "password"        TEXT NOT NULL,
  "role"            TEXT NOT NULL DEFAULT 'ADMIN',
  "parentAdminId"   TEXT,
  "permissions"     TEXT,
  "isActive"        INTEGER NOT NULL DEFAULT 1,
  "academyName"     TEXT,
  "logoUrl"         TEXT,
  "phone"           TEXT,
  "notes"           TEXT,
  "accessStartDate" TEXT,
  "accessEndDate"   TEXT,
  "createdAt"       TEXT NOT NULL,
  "updatedAt"       TEXT NOT NULL,
  CONSTRAINT "User_parentAdminId_fkey" FOREIGN KEY ("parentAdminId") REFERENCES "User" ("id") ON DELETE CASCADE
);
CREATE UNIQUE INDEX "User_email_key" ON "User" ("email");
CREATE INDEX "User_parentAdminId_idx" ON "User" ("parentAdminId");

CREATE TABLE "Setting" (
  "id"        TEXT PRIMARY KEY NOT NULL,
  "adminId"   TEXT,
  "key"       TEXT NOT NULL,
  "value"     TEXT NOT NULL,
  "updatedAt" TEXT NOT NULL,
  CONSTRAINT "Setting_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "User" ("id") ON DELETE SET NULL
);
CREATE UNIQUE INDEX "Setting_adminId_key_key" ON "Setting" ("adminId", "key");
CREATE INDEX "Setting_adminId_idx" ON "Setting" ("adminId");
