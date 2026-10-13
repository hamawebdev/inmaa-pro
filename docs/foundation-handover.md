# Foundation: handover

For a teammate who continues Foundation's work. Read CLAUDE.md first (its last section is Foundation's and is the
manual for builders), then this page. Updated at the end of every round. **Last update: end of F3b**
(on top of the checkpoint 6ab2d78 and the coordinator's 8bca553; what changed since is not committed yet).

## What exists, and where

| Area | State | Where |
|---|---|---|
| Shell (F1b) | The academy app renamed (Inmaa Pro, `com.hamawebdev.inmaa-pro`, `inmaa.db`), seven sections, a placeholder on every route, Arabic first, direction provider mounted, offline enforced (CSP, navigation guard, lint rules, `offline.test.ts`) | `src/navigation`, `src/features/*/routes.tsx`, `src-tauri` |
| Harness (F1a, F2b) | Screens and A4 PDFs in headless Chrome, one-shot; `--demo`, `--keep` (spared a day), CSP check on `dist/` | `scripts/harness`, README there |
| Database (F2) | `prisma/schema.prisma` + `prisma/triggers.sql` → `npm run db:types` → migrations and types; `npm run db:verify` (schema, seeds, the proof's 157 cases, the documents); Rust replays the proof on the shipped SQLite | `prisma`, `src-tauri/migrations`, `src/lib/db`, `scripts/db` |
| What services call (F2) | `src/lib/service` (action/query/transact, ctx), numbering, log, settings, access, events, attachments, restricted, chain + anchor, clock, units, text, geo; places and accounts services | `src/lib`, `src/features/core/services` |
| Tests (F2, F2b) | `createTestDatabase()` from the real migrations; rows helper; scenario walk; demo runner and `npm run demo` | `src/testing`, `scripts/demo.mjs` |
| Shared lists (F2b) | 27 lists, labels `Options.*` in 3 languages, checked against OPTION-CODES by `db:docs` | `src/lib/options` |
| Print kit (F1b, F2b) | A4 sheet, letterhead, text area `SHEET_BODY` (nothing over the pictures), repeating table head, Noto Naskh stand-in scaled per face, calibration panel | `src/components/print`, `public/fonts` |
| Alerts and the home screen (F3) | A registry each folder fills from its own `alerts.ts` (count, list route, severity, lead setting, capability); `backup.stale` is the worked example. The home screen: today's tiles and the day board (slots Operations may take over with `home.tsx`; Foundation's defaults meanwhile), then one tile per raised alert. Seventh chip tone `progress` | `src/lib/alerts`, `src/lib/home`, `src/pages/dashboard/home`, `src/features/core/alerts.ts`, `src/components/status-chip.tsx` |
| Day-start job (F3) | Each folder's `daily.ts` handlers, one transaction per owner as the program, once per local day (setting `system.dayStart`), at start and at midnight; retried hourly for an owner that failed; not run when the anchor has something to ask | `src/lib/daily`, `src/features/core/services/day-start.ts`, `startup.ts` |
| Sign-in and roles (F3) | The sign-in window instead of the program while nobody is signed in; first password, given password replaced, the manager's recovery code; «قفل الآن» signs out; bar, Ctrl+K and route gate follow the role's sections; `useCan`, `useSectionLevel`. The academy's manager password, section lock and their setting are removed | `src/features/core/services/{sign-in,session,users}.ts`, `src/components/security`, `src/components/{lock-menu,bottom-nav,command-palette}.tsx`, `src/lib/auth.ts`, `src/hooks/use-session.ts` |
| Harness sign-in (F3) | Every page the harness opens signs in through the window (`--user`, default manager; password `inmaa-demo`); `--signed-out`, `--before` | `scripts/harness/lib/sign-in.mjs` |
| Print kit additions (F3) | `PrintButton onPrint` (record before the dialog; false or a throw stops it; Ctrl+P follows the button when there is a hook), `SHEET_FONT_STAND_IN` exported from the index; asked by Operations | `src/components/print/{print-sheet.tsx,print-flow.ts,index.ts}` |
| Money format (F3) | `formatMoney`, `formatMoneyAr`, `useMoneyText()`: «195.650,00 دج» | `src/lib/units`, `src/hooks/use-money-text.ts` |
| Settings, four tabs (F3b) | «عام»: name and logo, the centre on its papers, tax and registration numbers, bank, my account, language and appearance, the program (default language, QR on orders, idle lock), backup, licence, system. «قواعد العمل»: every work rule of DESIGN.md section 11, one card per family, and the zones of communes. «المستخدمون والصلاحيات»: accounts (create, name and role, give a password, switch off and on, link to a centre employee) and each role's level per section and capabilities. «السجل»: the log with filters (person, operation, kind of record, dates), the details of an entry, an export logged as a disclosure | `src/pages/dashboard/settings/**`; forms described in `src/features/core/validators/settings-form.ts`; services `settings-form.ts`, `users.ts`, `log-screen.ts` |
| Backup and restore (F3b) | The daily copy after the day-start job into the chosen folder (`inmaa-auto-YYYY-MM-DD.db` + manifest + uploads), rotation by name, a synchronised folder refused, every copy in `BackupRun` and the log; a copy by hand from the card or the lock menu (`backup.run`); the guarded restore (what it would cost, a protected copy first, the manager's reason, a note for the next start); the anchor screen for everybody until the manager answers | `src/features/core/services/{backups,anchor-answer}.ts`, `src/server/backup.ts`, `src-tauri/src/backup.rs`, `src/components/security/{anchor-screen,program-gate}.tsx` |
| Notifications (F3b) | Each alert said once a day on the desktop, again that day only if it concerns more; kept in `system.alertsNotified` | `src/lib/alerts/announce.ts`, `src/components/alert-notifier.tsx` |
| Idle lock (F3b) | `security.idleLockMinutes` (15; 0 off), signs out to the sign-in window, LOCK with cause IDLE, said once on the window | `src/components/security/idle-lock.tsx`, `src/lib/access/idle.ts` |
| Smaller items (F3b) | `CommunePicker` and `ZonePicker`; `logConsultOnce` (ruling 29); `staffName` (surname then first name); the save-text command for exports; tab pages headed with their tab's label and given a line, record pages none (S-13, S-14); today's tiles three to a row (S-15); the sign-in names scroll inside their box (S-17) | `src/components/{commune,zone}-picker.tsx`, `src/lib/log`, `src/lib/text/names.ts`, `src/components/{section,detail}-screen.tsx` |
| Harness (F3b) | A queue of a few runs at once (`HARNESS_SLOTS`), a longer settle time (`HARNESS_SETTLE_MS`), `pdf --routes <file>` and `--before`, `shot --anchor <file>` | `scripts/harness/lib/slots.mjs`, `pdf.mjs`, README |
| Data-model documents | DESIGN (section 19: what changed while building), CONTRACTS, OPTION-CODES, RULINGS, BUILD-NOTES | `docs/data-model` (mine to keep in step) |

## Rulings I was given (beyond docs/data-model/RULINGS.md)

- Names: Latin `Inmaa Pro`, identifier `com.hamawebdev.inmaa-pro`, database `inmaa.db`; Arabic only in window titles and in the app.
- No teammate launches the desktop app; the coordinator does. Verify the policy on the built `dist/` through the harness.
- Stored PDFs are saved as a copy, never opened; images are shown in the app. Native date fields and file buttons stay.
- Direction provider mounted; charts `dir="ltr"`; one `<Ltr>` wrapper; `data:` out of `font-src`.
- Print: do not copy the academy's print approach; nothing prints over his letterhead or footer pictures, his forms included.
- Communes of أم البواقي checked (2026-10-12); ids carry the official codes. Wilayas 59 to 69 stay flagged (press, not the Journal officiel).
- `Inspection.correctionNeeded`; `centre.phone` and `centre.email` from his footer (defaults, not rows).
- F3: one money format on screen and on paper, the academy's: «195.650,00 دج».
- F3: the manager answers sanction decisions while signed in. My reading was accepted: no dialog takes his password
  inside another user's session, `requestManagerApproval` is not built (DESIGN.md sections 12 and 19 say so). No
  lockout on wrong passwords; the recovery code and the demo password `inmaa-demo` are accepted.
- F3b: S-12 (save: `success`, default size, in `PageActions`), S-13 (a tab page is headed with its tab's label, the
  first tab keeps the section's heading), S-14 (the line under the heading on tab pages, none on record pages), S-15
  (home tiles three to a row), S-17 (the sign-in window never grows past the window; its list scrolls inside), one
  rule for a staff name (surname then first name, `staffName`). `src/testing/scenarios/acceptance/**` is the
  Checker's.
- F3b: an idle lock. Setting `security.idleLockMinutes` (default 15; 0 switches it off), the manager's to change;
  after that many minutes without input the program signs out to the sign-in window (a form in progress is lost, as
  with «قفل الآن»), logged as LOCK with cause IDLE.
- F3: the low-stock tile opens `/dashboard/inventory?kind=MATERIAL&state=TO_BUY` (or `EQUIPMENT`): an alert's `count`
  may answer `{ count, route }`.
- Git: teammates run no git command that writes; the coordinator commits.

## What the builders depend on (do not break without telling the coordinator)

The service shape `(ex, ctx, input)` and `action`/`query`; `createTestDatabase` and its options; the demo convention
(`seedDemo` in `demo.ts`, names, owner order); `src/lib/options` names; `SHEET_BODY`, `SheetTable head`,
`SHEET_FONT`; numbering, log, settings and access functions; the events in `src/lib/events/index.ts`; the generated
types. Contracts between owners: `docs/data-model/CONTRACTS.md`. Since F3b also: `CommunePicker`, `ZonePicker`,
`logConsultOnce`, `staffName`, `linkAccountToStaff`, the `TabLines` messages under every tab, the harness's `--routes`
and `--anchor`. Since F3 also: the file names `alerts.ts`,
`daily.ts` and `home.tsx` in a feature folder (found by name); `useSession`, `useCan`, `useSectionLevel`,
`useCentreClock`, `useMoneyText`; the harness's `--user` names and the demo password; the sign-in window's
`data-signin…` attributes, which the harness drives.

## Open items

- Settings: the lists that are other owners' tables (training days and skills, inspection criteria, clause text) have
  no editor yet; a slot for them in قواعد العمل is to build when an owner asks. No branch editor. The letterhead
  pictures have no upload field.
- The log screen names a record by its table (`StaffMember`) beside its label: the tables have no words yet.
- `backup.stale` (settled in F3b): seen by whoever opens Settings and holds `backup.run`, the manager by default. A
  role that holds `backup.run` without Settings (الإدارة) backs up from the lock menu.
- The restore was proven by tests and on the harness up to its dialog; a real restore and restart can only be seen in
  the desktop program, by the coordinator.
- Arabic Typesetting's stand-in scale (62%) is an estimate: measure it with the print sample's calibration panel on a
  PC that has his fonts.
- Each builder folder's `uploads.ts` is no longer read (F2); their owners may delete them.

## How to check everything

`cargo check --offline` and `cargo test --lib --offline` in `src-tauri/`; then `npx tsc --noEmit`, `npm run lint`,
`npm test`, `npm run build`, `npm run format:check`, `npm run csp:check` (all routes), `npm run db:verify`,
`npm run demo`. Judge by your own paths; report builders' failures to the coordinator.
