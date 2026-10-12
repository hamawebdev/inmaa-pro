# Foundation: handover

For a teammate who continues Foundation's work. Read CLAUDE.md first (its last section is Foundation's and is the
manual for builders), then this page. Updated at the end of every round. **Last update: start of F3** (after
commit 2cece0d).

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
- Git: teammates run no git command that writes; the coordinator commits.

## What the builders depend on (do not break without telling the coordinator)

The service shape `(ex, ctx, input)` and `action`/`query`; `createTestDatabase` and its options; the demo convention
(`seedDemo` in `demo.ts`, names, owner order); `src/lib/options` names; `SHEET_BODY`, `SheetTable head`,
`SHEET_FONT`; numbering, log, settings and access functions; the events in `src/lib/events/index.ts`; the generated
types. Contracts between owners: `docs/data-model/CONTRACTS.md`.

## Open items

- F3 (this round): alerts and the home screen, the day-start job, sign-in and roles, Settings in four tabs, backup
  and guarded restore, desktop notifications, then the small items (commune and zone pickers, `rows.insert` numbering
  collision, a lint rule for TanStack Table, the money format helper, the hash-chain mention).
- Arabic Typesetting's stand-in scale (62%) is an estimate: measure it with the print sample's calibration panel on a
  PC that has his fonts.
- Each builder folder's `uploads.ts` is no longer read (F2); their owners may delete them.

## How to check everything

`cargo check --offline` and `cargo test --lib --offline` in `src-tauri/`; then `npx tsc --noEmit`, `npm run lint`,
`npm test`, `npm run build`, `npm run format:check`, `npm run csp:check` (all routes), `npm run db:verify`,
`npm run demo`. Judge by your own paths; report builders' failures to the coordinator.
