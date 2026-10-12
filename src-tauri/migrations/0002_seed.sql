-- First-run seed. PROVISIONAL, like 0001_init.sql.
--
-- The one row the shell cannot run without: the local "user" that every
-- settings row points at and that carries the centre's name on screen and on
-- paper. Sign-in and real accounts arrive with the data model.

INSERT INTO "User" (
  "id", "name", "email", "password", "role", "isActive", "academyName",
  "createdAt", "updatedAt"
) VALUES (
  'local-admin',
  'المدير',
  'local@inmaa.invalid',
  -- Nothing reads this column yet.
  '',
  'ADMIN',
  1,
  'مركز إنماء برو',
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
  strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
);
