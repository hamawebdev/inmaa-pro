# Foundation: handover

For a teammate who continues Foundation's work. Read CLAUDE.md first (its last section is Foundation's and is the
manual for builders), then this page. Updated at the end of every round. **Last update: end of F3, items 1 to 3**
(after commit 94258b6; F3's own files are not committed yet: the coordinator commits).

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
| Money format (F3) | `formatMoney`, `formatMoneyAr`, `useMoneyText()`: «195.650,00 دج» | `src/lib/units`, `src/hooks/use-money-text.ts` |
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
- F3: the manager answers sanction decisions while signed in. I read it as: no dialog takes his password inside
  another user's session, `requestManagerApproval` is not built (DESIGN.md sections 12 and 19 say so).
- F3: the low-stock tile opens `/dashboard/inventory?kind=MATERIAL&state=TO_BUY` (or `EQUIPMENT`): an alert's `count`
  may answer `{ count, route }`.
- Git: teammates run no git command that writes; the coordinator commits.

## What the builders depend on (do not break without telling the coordinator)

The service shape `(ex, ctx, input)` and `action`/`query`; `createTestDatabase` and its options; the demo convention
(`seedDemo` in `demo.ts`, names, owner order); `src/lib/options` names; `SHEET_BODY`, `SheetTable head`,
`SHEET_FONT`; numbering, log, settings and access functions; the events in `src/lib/events/index.ts`; the generated
types. Contracts between owners: `docs/data-model/CONTRACTS.md`. Since F3 also: the file names `alerts.ts`,
`daily.ts` and `home.tsx` in a feature folder (found by name); `useSession`, `useCan`, `useSectionLevel`,
`useCentreClock`, `useMoneyText`; the harness's `--user` names and the demo password; the sign-in window's
`data-signin…` attributes, which the harness drives.

## Open items

- **F3b, in the coordinator's order:** (4) Settings in four tabs: every setting of DESIGN.md section 11 with a form,
  identity and tax identifiers, accounts and role grants (the services `createAccount` and `giveAccountPassword`
  exist; switching an account off, editing grants and `linkAccountToStaff` do not), the log screen with its logged
  export; (5) the daily backup to a chosen folder and the guarded restore, with the screen that asks the manager when
  `startupAnchor()` is not "normal"; (6) desktop notifications for new alerts (`system.alertsNotified`,
  `ALERTS_QUERY_KEY`); (7) the commune picker with its add action and the zone picker.
- `backup.stale` is seen only by a role that opens Settings and holds `backup.run`: by default the manager alone
  (ADMINISTRATION holds the capability but not the section). Settle with item 5.
- Sign-in has no lockout and no idle lock: failures are counted and logged. Nobody asked for either.
- A new installation's manager is «المدير» / `manager`: renaming an account is part of the users tab.
- When Money removes `src/features/money/rules/hash-chain.ts`, drop its mention in `src/lib/chain/canonical.ts`.
- Arabic Typesetting's stand-in scale (62%) is an estimate: measure it with the print sample's calibration panel on a
  PC that has his fonts.
- Each builder folder's `uploads.ts` is no longer read (F2); their owners may delete them.

## How to check everything

`cargo check --offline` and `cargo test --lib --offline` in `src-tauri/`; then `npx tsc --noEmit`, `npm run lint`,
`npm test`, `npm run build`, `npm run format:check`, `npm run csp:check` (all routes), `npm run db:verify`,
`npm run demo`. Judge by your own paths; report builders' failures to the coordinator.
