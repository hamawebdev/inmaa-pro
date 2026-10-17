# Foundation: handover

For a teammate who continues Foundation's work. Read CLAUDE.md first (its last section is Foundation's and is the
manual for builders), then this page. Updated at the end of every round. **Last update: end of F4** (16 October, late; on top of e4a6db5 and the
owners' commits since; what F4 changed is not committed yet). F3b was accepted.

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
| Owner seeds (F3b) | A registry like events, alerts and daily: each owner's `seeds.ts` exports `registerSeeds(seed)`; first run runs every step in owner order, in its transaction, as the program, after Foundation's rows; the day-start job runs each owner's steps again first in its day transaction (catch-up); steps idempotent; `createTestDatabase({ seeds: false })` for an empty database | `src/lib/seeds`, `first-run.ts`, `src/lib/daily` |
| Names and phones (F3b) | `staffName` (surname then first name); an account goes by its linked employee's name, or its display name written surname first (`accountName`): sign-in window, `ctx.userName`, the log; `phoneText` (4-2-2-2 or 3-2-2-2) | `src/lib/text/{names,phone}.ts`, `src/lib/access/session.ts` |
| Harness (F3b) | A queue of a few runs at once (`HARNESS_SLOTS`), a longer settle time (`HARNESS_SETTLE_MS`), `pdf --routes <file>` and `--before`, `shot --anchor <file>` | `scripts/harness/lib/slots.mjs`, `pdf.mjs`, README |
| Data-model documents | DESIGN (section 19: what changed while building), CONTRACTS, OPTION-CODES, RULINGS, BUILD-NOTES | `docs/data-model` (mine to keep in step) |
| The clock guard (F4, INV-1) | Measured against the work recorded since the manager's last CLOCK_WARNING, without SIGN_IN, SIGN_IN_FAILED, LOCK, PASSWORD_CHANGE, the reader's present session, or any session whose SIGN_IN found the clock out of order (`context.clock`, written by `clockAtSignIn`). Runs at start-up (as the program; the day-start waits), before each day's run, at every sign-in (behind: only the manager gets in), before every invoice and receipt. The manager answers on the clock screen (jump: one click; behind: with his reason) | `src/lib/clock/sanity.ts`, `src/features/core/services/{sign-in,startup,day-start,clock}.ts`, `src/components/security/{clock-screen,program-gate}.tsx` |
| Test helper for days (F4) | `workUntil(test, instant)` (one logged operation a day) and `confirmDate(test, instant?)` (the manager's CLOCK_WARNING) | `src/testing/days.ts` |
| Start-up fails closed (F4, LOG-11) | `reconcileAnchorAtStart`: a comparison that throws is "unchecked"; the anchor screen with «try again» for everybody | `src/lib/chain/anchor.ts`, `startup.ts`, `anchor-screen.tsx` |
| Print guard (F4, LOG-2) | `installPrintGuard()` in both windows' entry: Ctrl+P presses the newest mounted `PrintButton` (a registry, `registerPrinter`) or does nothing; the context menu never opens | `src/components/print/print-flow.ts`, `print-sheet.tsx`, `src/main.tsx`, `src/lock/main.tsx` |
| Disclosures (F4, LOG-3, LOG-5) | A copy of a stored file: `recordUploadCopy` (DISCLOSE EXPORT, capability, the signed form's reason and `staff.printFilledForm`) before `export_upload`. A backup: `beginBackup` (right + DISCLOSE BACKUP) before `backup_to`; `recordBackupRun({ runId })` after | `src/lib/attachments`, `src/server/{uploads,backup}.ts`, `backups.ts` |
| Restores recorded (F4, LOG-4) | A note + foreign/unanchored answer records RESTORE (typed reason, both paths, PRE_RESTORE and RESTORE rows) beside ANCHOR_REBASE, which carries the reason and needs one | `anchor-answer.ts`, `backups.ts` (`recordCleanRestore`), `src/lib/chain/anchor.ts` |
| Costs out of the log (F4, LOG-7) | `COST_SETTING_KEYS` withheld in `changes`; read apart (`readCostSettings`, an action: CONSULT) and changed with `cost.read`; the rules tab hides them otherwise | `src/lib/settings`, `src/lib/log`, `settings-form.ts`, `settings-groups.tsx` |
| The manager's place (F4, ACC-5) | Only the manager gives/changes the MANAGER role or switches a manager's account; `MANAGERS_OWN_CAPABILITIES` (no default holder) given or taken only by him; nobody changes his own role or raises his own role | `users.ts`, `src/lib/access/catalogue.ts`, `account-dialogs.tsx`, `role-grants.tsx` |
| Smaller F4 items | `numbering.legalSeries` frozen in a numbered year (INV-5); `addCommune` guarded (ACC-4); the default day board gates «report arrival» (ACC-12); anchor at close and when the minute is up (LOG-10; `core:window:allow-destroy` added); `fs:allow-remove` removed (LOG-13); offline lint/test forbid geolocation, biometric, barcode-scanner, nfc, localhost plugins (OFF-5, OFF-6); first sign-in and the identity card say what the first invoice needs (INV-3); `useDateText`; Arabic plurals on the anchor screen | see DESIGN.md section 19 |
| Schema in F4 | `Payment.fileNumber`, `Payment.clientName` (@snap, chained v1); `SanctionDecisionMatch` (People's, append-only); `ProblemReport.deletedAt`, `deletedByUserId`; capability `staff.documents.read`; event `staff.unavailable` gains `reason`; EXPORT_KIND `RECEIPTS`. 107 tables, 206 indexes, 120 triggers | `prisma/`, `src-tauri/migrations`, `src-tauri/src/db.rs` (counts), `src-tauri/proof` |
| Harness (F4) | One running clock per session across views (`continuousNow` in `lib/session.mjs`); the sign-in driver confirms a jumped date as the manager | `scripts/harness/lib/{session,sign-in}.mjs`, README |
| After F4 | Tests named OFF-X1 (`src/server/backup.test.ts`, Tauri stood in for; Rust `…_off_x1`), LOG-10 (`runner.test.ts`, the close path in `src/lib/service/close.ts`), LOG-13 (`offline.test.ts`). `FILE_PARTS[].opens` and `mayOpenFilePart` (S-31). The centre's emblem cut from `header.png` (`src/assets/letterhead/emblem.{png,ts}`), the default logo of `AdminLogoMark` and `useCentreLogo()`; the identity card shows it while no logo is stored (S-32). The logo upload field already existed on that card | `src/navigation/file-parts.ts`, `src/assets/letterhead`, `src/hooks/use-centre-logo.ts` |
| Branches (F-47) | `branches.ts` (`listBranches`, `saveBranch`, `setBranchActive`, `requireActiveBranch`; the manager's), the card in Settings › عام, an account's branch on the accounts tab (`createAccount`/`updateAccount` take `branchId`), `useBranches()` and `<BranchPicker allowAll>` for owners' filters | `src/features/core/services/branches.ts`, `src/pages/dashboard/settings/_components/branches-card.tsx`, `src/components/branch-picker.tsx`, `src/hooks/use-branches.ts` |

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
- F3b: the IRG scale on قواعد العمل with a clear empty state, `centre.cnasEmployerNumber` with a demo value; owner
  seeds through a registry; demo accounts and every account name surname first; one phone format in `src/lib/text`.
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
- F4 rulings: LOG-1 (the signed form's scan opens with `staff.health.read` only); INV-5 (legal series frozen for a
  numbered year, refused with a sentence); ACC-5 (only the manager gives the MANAGER role or a manager-only
  capability; nobody raises his own role or grants); LOG-2 (printing only through `PrintButton`; shortcut and context
  menu blocked); LOG-7 (costing settings logged as changed without values); INV-3 (Money refuses the first invoice
  without address and article number besides RC, NIS, NIF; first run and the identity card say so); LOG-X1
  (`staff.unavailable.reason`); LOG-14 (ProblemReport soft delete); one yes covers every matched sanction
  (`SanctionDecisionMatch`, my choice of a join table). Put the audit id in the name of the test that proves a fix.

## What the builders depend on (do not break without telling the coordinator)

The service shape `(ex, ctx, input)` and `action`/`query`; `createTestDatabase` and its options; the demo convention
(`seedDemo` in `demo.ts`, names, owner order); `src/lib/options` names; `SHEET_BODY`, `SheetTable head`,
`SHEET_FONT`; numbering, log, settings and access functions; the events in `src/lib/events/index.ts`; the generated
types. Contracts between owners: `docs/data-model/CONTRACTS.md`. Since F3b also: `CommunePicker`, `ZonePicker`,
`logConsultOnce`, `staffName`, `linkAccountToStaff`, the `TabLines` messages under every tab, the harness's `--routes`
and `--anchor`. Since F3 also: the file names `alerts.ts`,
`daily.ts` and `home.tsx` in a feature folder (found by name); `useSession`, `useCan`, `useSectionLevel`,
`useCentreClock`, `useMoneyText`; the harness's `--user` names and the demo password; the sign-in window's
`data-signin…` attributes, which the harness drives. Since F4 also: `useDateText`, `saveUploadCopy(url, title, log)` and
`MediaUploadField`'s `copyLog` and `mayCopy`, `workUntil` and `confirmDate`, `registerPrinter`, `confirmClockJump`,
`COST_SETTING_KEYS`, `MANAGERS_OWN_CAPABILITIES`, and `data-anchor-screen="clock-jump"`, which the harness answers.

## Open items

- The clock guard's one remaining gap: a date changed by more than `system.clockJumpDays` while a session is open is
  caught inside that session, but what that session wrote after the change counts for the next one (the reference
  is computed per session, not per entry). Closing it needs a trusted checkpoint (a setting the day-start writes)
  and a fold of the entries since it.
- OFF-1 checks that a site photo's taker is a live centre employee, not a supervisor in particular: Clients' first
  visit is made by an employee who need not be a supervisor. A ruling could narrow it to job positions.
- WebView2's accelerator keys and default context menu are blocked in the page (`installPrintGuard`); Tauri 2.11 does
  not expose the WebView2 switches, so nothing is set on the Rust side.
- `ACC-12`'s live board is Operations' (`home.tsx`); Foundation's default board is gated too but unused while the
  slot is filled.
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
`npm run demo`. Judge by your own paths; report builders' failures to the coordinator. After a schema change:
`npm run db:types`, `node scripts/db/model-proof.mjs` (the tape in `src-tauri/proof/`), the table and trigger counts
in `src-tauri/src/db.rs` (`migrations_apply_on_the_shipped_engine`), the numbers in CLAUDE.md, then `npm run db:verify`
and `cargo test --lib --offline`.
