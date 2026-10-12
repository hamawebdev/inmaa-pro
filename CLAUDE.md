# مركز إنماء برو management program

A desktop program that runs a cleaning centre in Algeria (مركز إنماء برو, أم البواقي): centre employees, cleaning workers, service requests and contracts in four divisions, visits, quality, money and stock. One PC, fully offline, Tauri.

You are one teammate of six. You do not see the coordinator's conversation with the developer. Everything you need is in this file, in `docs/scope.md`, and in the inputs listed below.

## Read before you do anything

1. `docs/scope.md`: the approved scope. Navigation, screens, every numbered feature with its verdict and owner, the legal rules, the conflicts found in the client's documents, and the assumptions in force. If this file and the scope disagree, tell the coordinator.
2. The inputs, all **read-only**:
   - The agreed plan: `plan/src/plan-ar.md` (features 1 to 49, questions س1 to س26) and the developer's build notes `plan/src/notes-en.md`. Feature and question numbers never change; the client and the developer refer to things by them.
   - The client's documents in `client docs/`: his first nine (`1.md` to `9.md`), six Word forms (`-01- تسجيل عامل نظافة.docx`, `-01- عقد - عمارة.docx`, `-01- مؤسسة - طلب.docx`, `-02- مؤسسة - عقد.docx`, `-03- سكن - طلب.docx`, `-04- سكن - عقد.docx`; `-01-.docx` is a copy of the worker form), and two photos of handwritten notes.
   - The reference academy app: `/mnt/data/academy-system-desktop`.
3. `docs/reference-notes/`: six reports on how the reference works (shell, design, data, security and print, tooling, screens). They save you time; check the reference itself when a detail matters.

**Before your first task, confirm you can read the reference.** Open `/mnt/data/academy-system-desktop/package.json` and `/mnt/data/academy-system-desktop/src/navigation/sections.ts`, and put the version number and the `SectionId` union at the top of your first report. If you cannot read them, stop and say so.

## The developer's rules

1. **Offline.** Nothing may need a connection at run time: no fetch, no remote fonts, scripts or images, no updater, no links that open a browser, no messaging. A feature the plan gave to workers' phones is built as its office form: printed for the worker or supervisor, typed in afterwards by the office. A feature that exists only with a network is not built (scope section 4).
2. **Exact design as the academy app.** Layout, navigation, colours, type, components, light and dark, languages and right-to-left, lock and activation, backup, printing. Reuse its shell and components; do not redraw them. Only the business changes. Where the academy has two visual generations, match the newer one: its home screen, attendance family and settings (`SectionScreen`, `DetailScreen`, `ScreenHeader`, `ScreenTabs`, `StatCard`, `StatusChip`, `DataTable` with `TableSearch` and `TablePager`). Every new screen names its closest academy screen and follows it.
3. **Arabic is the default language, worded as in the client's forms.** Use his words for labels and options, exactly, wherever he has a word (scope sections 2, 7 and 9 list the agreed wording and the two corrections). French and English stay: every text exists in all three.
4. **His six forms.** Every field on them exists on a screen with the same options, in the same order. Each form or contract prints in the layout of his Word file, on A4, with his letterhead, ready to sign and stamp. Printed forms are always Arabic.
5. **The Algerian legal rules** in scope section 5 apply.
6. **New documents win.** Where the plan and the client's six forms or notes disagree, the forms and notes win.
7. **Read-only places.** Never write, build, install or run a git command that writes in `/mnt/data/academy-system-desktop`. Never change anything in `client docs/` or `plan/`.
8. **Git.** This folder is a local repository with no remote. Never push, never add a remote. Teammates run no git command that writes (no add, commit, stash, reset, checkout, restore, clean); the coordinator commits.

## The team

| Teammate | Goal | Numbered features |
|---|---|---|
| Foundation | The academy shell running here with this program's sections; the data model for the whole scope; what every part shares: sign-in and roles, numbering, statuses, settings, the access and change log, backup, the alert tiles, the print sheet, the home screen | 23, 24, 33, 47 |
| People | Centre employees and cleaning workers: the worker registration form, hiring and training, hours, pay, and the suspended-or-penalised check | 21, 25, 37, 38 |
| Clients and contracts | Client and site files for the four divisions, the request pipeline, the first visit, pricing, quotes and contracts, the returning-client fill-in, his printed forms | 1, 2, 3, 4, 5, 6, 26, 29, 40 |
| Operations | Scheduling and workload, absence and replacement, the day board, mission orders, attendance, task lists, problem reports, sign-off and rating, supervisor inspections, complaints | 7 to 18, 27, 36, 46 |
| Money and stock | Invoices, payments and debts, cash receipts, expenses and income per division, profit, reports and indicators, stock and equipment, the contract-end and payment-due alerts | 19, 20, 22, 30, 31, 32, 34, 35, 39, 41, 48 |
| Checker | Builds no feature. Keeps `docs/checker-table.md`: every numbered feature, every form field and every line of his notes, each mapped to a screen or marked "not possible offline". Compares each screen with the academy. Runs build, lint and tests. Reports mismatches for their owner | none |

Features 28, 42, 43, 44, 45 and 49 are not built.

## Who owns which files

Every file has one owner. Edit only your own. If you need a change in someone else's file, do not make it: describe it in your report and the coordinator passes it on.

| Path | Owner |
|---|---|
| `src-tauri/**`, `prisma/**`, `scripts/**`, `public/**`, `index.html`, `lock.html`, config files at the root | Foundation |
| `src/components/**`, `src/lib/**`, `src/navigation/**`, `src/i18n/**`, `src/hooks/**`, `src/stores/**`, `src/server/**`, `src/config/**`, `src/assets/**`, `src/index.css`, `src/routes.tsx`, `src/main.tsx`, `src/lock/**` | Foundation |
| `src/features/core/**`, `src/pages/dashboard/home/**`, `src/pages/dashboard/settings/**`, `src/pages/dashboard/layout.tsx`, `src/pages/not-found.tsx`, `src/pages/route-error.tsx` | Foundation |
| `src/features/people/**`; pages `employees/`, `employee-attendance/`, `workers/`, `hiring/`, `hours-pay/` | People |
| `src/features/clients/**`; pages `files/` (except the four sub-folders that Operations and Money own), `clients/`, `rep-visits/` | Clients and contracts |
| `src/features/operations/**`; pages `supervisors/`, `work-program/`, `worker-attendance/`, `visits/`, `quality/`, `files/[id]/tasks/`, `files/[id]/visits/` | Operations |
| `src/features/money/**`, `src/features/stock/**`; pages `expenses/`, `income/`, `invoices/`, `payments/`, `reports/`, `inventory/`, `handouts/`, `purchases/`, `maintenance/`, `files/[id]/handouts/`, `files/[id]/payments/` | Money and stock |
| `docs/checker-table.md`, `docs/checker/**` | Checker |
| Anything not listed | Foundation |
| `CLAUDE.md`, `docs/scope.md` | Coordinator (Foundation maintains the last section of this file) |

Pages live under `src/pages/dashboard/<first path segment>/`. Each feature folder holds that owner's services, validators, printed sheets, alert rules, seed data, message files and tests. Route lists and message files are split per owner so that two teammates never edit the same file.

The schema belongs to Foundation. Builders do not write migrations or edit generated types. If you need a table, a column or an option code, say exactly what in your report.

## Working in a shared folder

Several teammates work in this folder at the same time.

- Other people's half-written files may be on disk. Judge your work by your own files: type-check the project and read only the errors in your paths, lint your own paths, run your own tests. If someone else's error blocks you, report it; do not fix it.
- Do not reformat, rename or move files you do not own.
- Do not start long-lived servers and leave them running. Stop what you start.
- Do not delete anything you did not create in this task.

## How to report

End every task with a report to the coordinator: what you built (screens, services, sheets), what you checked and how (commands and results, pasted briefly), what is not done, what you need from another owner, and anything in the client's documents that you had to interpret. Say plainly when something does not work. Do not describe unbuilt things as built.

## How this codebase works

Maintained by Foundation. The shell is the academy app's, copied here under a new name (`Inmaa Pro`, `com.hamawebdev.inmaa-pro`, `inmaa.db`), with this program's sections and a placeholder page on every route. React 19, React Router (hash router), TanStack Query, Kysely over SQLite through Tauri commands, Tailwind 4, shadcn/ui, `use-intl`. The database is the data model's (`docs/data-model/`): 106 tables, and every rule the model promises is enforced by SQLite itself.

### Commands

Run from the project root. `node_modules` is a copy of the reference's: **never run `npm install`**, there is no network to install from. If you need a package that is not there, say so in your report.

| To do this | Run |
|---|---|
| Type-check | `npx tsc --noEmit` (read only the errors in your paths) |
| Lint your paths | `npx eslint src/features/people src/pages/dashboard/workers` (`npm run lint` for everything; 17 warnings from the academy shell are known, errors are not) |
| Run your tests | `npx vitest run src/features/people` (`npm test` for everything) |
| Run one test file | `npx vitest run src/features/people/services/worker.test.ts` |
| Format your paths | `npx prettier --write src/features/people src/pages/dashboard/workers`; width 120; `npm run format:check` is a gate |
| See a screen | `npm run shot -- --route /dashboard/workers --locale ar --theme dark --both-sizes` |
| Print a sheet to PDF | `npm run pdf -- --route /dashboard/files/1/form --png` |
| Everything about the two above | `scripts/harness/README.md` |

Left to Foundation and the Checker, because they write shared output or take minutes: `npm run build` (writes `dist/`), `npm run csp:check` (the built app under the content security policy), `npm run db:types`, `npm run db:verify` (also checks `docs/data-model` against the schema and the code: `npm run db:docs`), and in `src-tauri/`: `cargo check --offline`, `cargo test --lib --offline` (this one rewrites `src/lib/bindings.ts`).

Nobody but the coordinator runs `npm run tauri dev` or a built binary: it opens a window on the developer's screen. Nothing is ever built, installed or run inside `/mnt/data/academy-system-desktop`.

### Where things go

| What | Where |
|---|---|
| A screen | `src/pages/dashboard/<first path segment>/page.tsx`; its own parts in `_components/` beside it; detail pages in sub-folders (`new/page.tsx`, `[id]/page.tsx`) |
| Routes | `src/features/<owner>/routes.tsx` (core, people, clients, operations, money; stock's screens are in money's list) |
| Services (reads and writes) | `src/features/<folder>/services/*.ts`, each with its `*.test.ts` beside it |
| Handlers of other owners' events | `src/features/<folder>/events.ts` |
| Validators and code lists | `src/features/<folder>/validators/*.ts` |
| Messages | `src/features/<folder>/messages/{en,ar,fr}.json` (core, people, clients, operations, money, stock) |
| Stored codes that need labels | `src/features/<folder>/code-labels.ts` |
| Ctrl+K "new …" entries | `src/features/<folder>/quick-actions.ts` |
| Tests | beside the code, `*.test.ts` (not `.test.tsx`: it is not picked up) |
| Sections, tabs, hues, the ten parts of a file | `src/navigation/` (Foundation; ask for a change) |
| Printed sheets | `src/features/<folder>/sheets/*.tsx`, shown by a page whose path ends in `/print` |
| Shared components | `src/components/`; shadcn primitives in `src/components/ui/`; the print kit in `src/components/print/` (Foundation) |
| The data model: tables, who writes what, option codes, events | `docs/data-model/` (Foundation) |
| Schema, migrations, generated types | `prisma/schema.prisma`, `prisma/triggers.sql`, `src-tauri/migrations/`, `src/lib/db/` (Foundation; generated) |
| What every service calls | `src/lib/` (Foundation): `service`, `numbering`, `log`, `settings`, `access`, `events`, `attachments`, `restricted`, `chain`, `clock`, `units`, `text`, `geo` |
| A test database and test rows | `src/testing/` (Foundation; imported by tests only) |

The folder names `services/`, `validators/` and `messages/` are not a matter of taste: tests find your files by them.

### A page

Every tab and every part of a file already has a page with a `<PagePlaceholder>` in it. Building a screen means replacing that element.

- Keep the wrapper. A tab's page is `<SectionScreen section="workers" title={tNav("WorkersHeading")}>`: the heading, the tab strip and the lit bar item all follow from the route. Add `actions={<Button asChild variant="add">…</Button>}` for the screen's main button.
- A page below a list (a new record, one record, a part of a file) is `<DetailScreen section=… title=… back={{ href, label }}>`. It has a back action and no tab strip.
- Read data with `useQuery({ queryKey: pathKey("/dashboard/workers"), queryFn })`; a second query on the same screen uses `[...pathKey("/dashboard/workers"), "name"]`. Nothing refetches by itself: the action that saved names the paths it refreshes (`action(saveWorker, { revalidate: ["/dashboard/workers"] })`), and that is what refreshes the screen.
- Match the academy's newer generation: `SectionScreen`, `DetailScreen`, `ScreenHeader`, `ScreenTabs`, `StatCard`, `StatusChip`, and `DataTable` with `TableSearch` and `TablePager` (`src/components/data-table-shell.tsx`). Name the closest academy screen in a comment at the top of the page. The academy's own pages are not in this repository: read them in the reference, and look at `.harness/baseline/`.
- Arabic is the default and reads right to left. Use logical classes (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `text-start`), never `left`/`right`. Compare an Arabic screen with `.harness/baseline/ar-direction-fixed/`: this program mounts the direction provider the academy forgot, so tab strips and everything inside tabs mirror here.
- Put a phone number, a date or time written in digits, a number with its unit, a registration number or a code inside `<Ltr>` (`src/components/ltr.tsx`), on screen and on paper. Without it Arabic shows `0661 20 31 42` as `42 31 20 0661`.
- Colours come from tokens (`text-success`, `bg-section-workers/10`, `SECTION_ACCENT`), never from the raw palette (`text-green-600`). A chart goes through `ChartContainer`. Confirm with `useConfirm()`, never `confirm()`.
- Native date fields and file buttons stay as the academy has them.

### A route

Add it to your own list: `{ path: "workers/:id", element: <WorkerPage /> }`. The path is relative to `/dashboard`, is written as a plain string, and its first segment must be one of yours. `src/navigation/routes.test.ts` fails otherwise. A new tab or section is a change to `src/navigation/sections.ts`: ask Foundation.

A file's pages are `files/:id/<part>`. The list of parts is `src/navigation/file-parts.ts`; the hub page links to every part from it, so the three owners never edit each other's files.

### The data model

- `docs/data-model/DESIGN.md` is how the model works (conventions, numbering, the chains, the log, files, settings, roles, alerts); `CONTRACTS.md` says which owner writes each table (section 2), which functions other owners call (section 3) and which events cross owners (section 4); `OPTION-CODES.md` lists every stored code; `RULINGS.md` the coordinator's rulings; `BUILD-NOTES.md` the scenarios the model must pass (section 6). Section 19 of DESIGN.md lists what changed while building it.
- **One writer per table.** Your tables are under your name in CONTRACTS.md section 2. Another owner's rows are written by calling that owner's exported function with your `ex`; they are read through its read functions, or by a read-only join on the columns section 2 names.
- How values are stored: money in whole centimes (`Money`), durations in whole minutes (`Minutes`), quantities in thousandths (`Qty`), rates in basis points (`BasisPoints`); a calendar date as text `YYYY-MM-DD` (`LocalDate`) and a clock time as `HH:MM` (`LocalTime`), both checked by the database; an instant as ISO UTC text; yes or no as 0 or 1. Conversions in `src/lib/units`. Every table is STRICT: a fraction in a whole-number column is refused.
- Types: `src/lib/db/schema.ts` is what the database holds (`Selectable<DB["Site"]>`, `Insertable<DB["Site"]>`); `src/lib/db/models.ts` has `SiteRow`, with instants as `Date` and yes/no as `boolean` (`hydrate`). Both are generated: never edit them.
- A new table, column or option code is asked of Foundation in your report, with its exact name. No option code has been renamed since the model was handed out.

### A service

A service is a plain async function over `(ex, ctx, input)`, in `src/features/<folder>/services/`:

```ts
import { requireSection } from "@/lib/access/session";
import { logChange } from "@/lib/log";
import { action } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";

export async function renameSite(ex: Executor, ctx: ServiceContext, input: { siteId: string; commonName: string }) {
  requireSection(ctx, "REQUESTS", "WRITE");
  const before = await ex.selectFrom("Site").selectAll().where("id", "=", input.siteId).executeTakeFirst();
  if (!before) throw new ServiceError("This site does not exist.");
  const { set, changes } = changedColumns(before, { commonName: input.commonName.trim() });
  if (!changes) return { id: before.id };
  await ex.updateTable("Site").set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId }).where("id", "=", before.id).execute();
  await logChange(ex, ctx, { owner: "CLIENTS", action: "UPDATE", entity: "Site", entityId: before.id, changes });
  return { id: before.id };
}

// The last lines of the file: what the screens import.
export const renameSiteAction = action(renameSite, { revalidate: ["/dashboard/files"] });
```

- `ex` is the caller's executor, the open transaction. Every query uses it. A service never imports `db`, never opens a transaction of its own, and never calls another owner's *action*: it calls that owner's *service* with its own `ex`. So one user action is one transaction across owners, and a test can run it.
- `ctx` is who acts and when: `userId` (null when the program acts by itself), `userName`, `roleId`, `staffMemberId`, `branchId`, `sections`, `capabilities`; `now` (the instant, as stored), `today` (`LocalDate`), `nowTime` (`LocalTime`), `toInstant(date, time)`, `toLocal(instant)`. One action has one instant. Never read `new Date()`, the system time zone or SQLite's `date('now')`.
- To refuse, `throw new ServiceError("An English sentence.")`; the sentence goes under `Errors` in your `messages/en.json`, with its Arabic and French (`src/i18n/errors.test.ts` checks every one). A fault in the code, never shown to the user, is `throw new Error("people: what went wrong")`: lower-case folder name, a colon. The user then reads "Something went wrong. Nothing was saved."
- `action(service, { revalidate })` (`src/lib/service/action.ts`) is what a screen calls. It runs the service in one transaction as whoever is signed in, refreshes the paths named (or `revalidate: (data, input) => [...]`), and never throws: it answers `{ success: true, data }` or `{ success: false, error }`. `error` is your sentence, or the sentence for the database's own refusal (a trigger, a unique index, a check), or the one for anything unexpected; all have their translations. Show it with `toast.error(errorMessage(result.error, t("SaveFailed")))`.
- `query(service)` turns a reading service into a `queryFn`: no transaction, and it throws for TanStack Query to show. A read that must write (a CONSULT line in the log) is an `action`. `transact((ex, ctx) => …)` runs several services as one transaction and throws.
- **A save sends only the columns that changed.** A trigger written `BEFORE UPDATE OF column` fires when the column is *named*, changed or not: a form that saves its whole row is refused on a closed payslip, a decided sanction, the cached totals `PaymentDue.paidAmount` and `StockItem.onHandQty`. Build the `set` with `changedColumns(before, patch)`, as above; it also gives the log its `changes`.
- A service never calls a Tauri command or plugin itself: the test suite runs under Node, where there is none. A file is written before the action (below); the anchor and the backup are Foundation's.
- The worked example: `src/features/core/services/places.ts` and its test.

### Testing a service

```ts
import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { renameSite } from "./site";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

it("renames a site and logs the change", async () => {
  const site = await test.rows.insert("Site", { commonName: "عمارة 12" });
  await test.transact((ex, ctx) => renameSite(ex, ctx, { siteId: site.id, commonName: "عمارة النور" }));

  const saved = await test.db.selectFrom("Site").select("commonName").where("id", "=", site.id).executeTakeFirstOrThrow();
  expect(saved.commonName).toBe("عمارة النور");
  const entry = await test.db.selectFrom("AuditLog").selectAll().orderBy("chainSeq", "desc").limit(1).executeTakeFirstOrThrow();
  expect(entry).toMatchObject({ operation: "CHANGE", entity: "Site", entityId: site.id, localDate: "2026-10-12" });
});
```

- `createTestDatabase()` is a database in memory built from the real migrations and seeds, first run done, the manager signed in, the clock standing at Monday 12 October 2026, 09:00 (`TEST_NOW`), the anchor in memory, and every folder's `events.ts` registered. Make one per test.
- `test.transact(work, session?)` runs as the manager, or as `await test.sessionFor("ACCOUNTANT")`: an account of that role with its seeded grants. `test.run.action(service, options)` is the screens' wrapper on this database; `test.revalidated` lists what it refreshed.
- `test.clock.advance({ days: 3 })` and `test.clock.set(instant)` move time between steps.
- `test.rows.insert("Visit", { status: "DONE" })` writes a row by hand, every required column filled and its parents created. It arranges a test; a scenario goes through the services, because a raw insert skips their rules. `test.raw` is the connection itself, for proving that the database refuses something.
- `test.snapshot()` copies the database; `openTestDatabase(copy, { anchor: test.anchor, clock: test.clock })` opens it as a restored backup. `fileAnchorStore(file)` (`src/testing/anchor-file.ts`) keeps the anchor in a file, for a test that closes the program and opens it again.
- A whole path through the tables, from registration to a paid invoice: `src/testing/scenarios/contract-to-paid-invoice.test.ts`.

### A validator

- A validator is a zod schema in `src/features/<folder>/validators/`, with its codes as `as const` arrays and its messages as English sentences under `Errors`.
- The database stores codes (`"FULL_DAY"`), never labels. Label them in your messages, show them with `useCodeLabel("Namespace")`, and list the pair in your `code-labels.ts` so the test can check all three languages.

### What every service calls

- **Numbers** (`src/lib/numbering`), in the transaction that writes the document: `nextNumber(ex, ctx, "QUOTE", { date })` gives `{ seq, year, display }` for `numberSeq`, `numberYear`, `number`; the year is the document's own date's. A file: `nextNumber(ex, ctx, fileSequenceKey(formKind), { date })` (`31/BLC` on a building contract). A block: `nextNumbers(ex, ctx, "VISIT", { date, count })`. A number typed from paper: `claimNumber(ex, ctx, key, { value, date, reason, isFree })`. A rolled-back transaction gives its numbers back. Invoices and receipts: `peekLegalNumber(ex, ctx, "INVOICE", { date })` gives the number the insert must carry and the earliest date allowed; the insert of the document moves the counter, and the database refuses any other number or date. Call `assertClockSane(ex, ctx)` (`src/lib/clock/sanity.ts`) before issuing one. Formats: DESIGN.md section 6.
- **The log** (`src/lib/log`), in the same transaction as the change, one entry per operation on personal data (DESIGN.md section 9): `logCollect` (a row holding personal data created), `logConsult` (restricted data read, a person's file opened), `logChange` (with `changes: { field: [old, new] }`), `logDisclose` (a sheet naming a person printed, an export), `logErase` (a soft delete, a removed file), `logSecurity`. Each takes `{ owner, action, entity, entityId, entityLabel, subject: { kind, id, label }, changes, context, reason }`; the date, time and user come from `ctx`. The acts in `ACTIONS_NEEDING_A_TYPED_REASON` (void, cancel, soft delete, override, a number from paper, a sanction, an approval…) are refused without the reason the user typed. Health answers, the hiring score, password hashes and costs never reach `changes`. Nobody else writes `AuditLog`.
- **Settings** (`src/lib/settings`): `getSetting(ex, "stamp.minimum")` is the typed value or its default; `getSettings(ex, [...])` reads several; `setSetting(ex, ctx, key, value)` writes and logs. Keys and defaults: `src/lib/settings/catalogue.ts` (DESIGN.md section 11). Read a setting in the action that uses it; never keep it.
- **Who may do what** (`src/lib/access`): `requireSection(ctx, "MONEY", "WRITE")`, `requireCapability(ctx, "quote.approve")`, or `can(ctx, "cost.read")` to decide what a screen shows. The manager and the program itself hold everything. Roles, sections, capabilities and their default holders: `src/lib/access/catalogue.ts` (DESIGN.md section 12). Until the sign-in screen exists (F3) the program signs in the manager account made at first run, so every check passes on screen; test the refusals with `test.sessionFor(role)`.
- **Events between owners** (`src/lib/events`, CONTRACTS.md section 4): when something you own changes in a way another owner must follow, `await emit(ex, ctx, "file.contracted", { fileId })` in your transaction. To follow another owner's event, export `registerEvents` from your own `src/features/<folder>/events.ts`:

  ```ts
  import type { OnEvent } from "@/lib/events";

  export function registerEvents(on: OnEvent) {
    on("file.contracted", async (ex, ctx, { fileId }) => {
      await generateVisits(ex, ctx, { fileId }); // your own service, given the emitter's ex
    });
  }
  ```

  Handlers run at once, in the contract's order, inside the emitter's transaction: one that throws undoes the whole action, so throw only for what the user can fix on the spot. Payloads are typed in `src/lib/events/index.ts`; a new event or a changed payload is a change to the contract: ask Foundation.
- **Places** (`src/features/core/services/places.ts`): `ensureCommune(ex, ctx, { wilayaCode, nameAr })` and `ensureZoneForCommune(ex, ctx, { communeId })` when a site or a residence is saved; `listCommunes`, `listZones` for pickers. The 69 wilayas: `src/lib/geo/wilayas.ts`. Every `...Key` column is written with `normaliseName()` or `phoneKeys()` (`src/lib/text/normalise.ts`), so that two spellings of one name find each other.
- **Restricted data** (`src/lib/restricted`): `StaffConfidential` is read only through `readRestricted(ex, ctx, { capability: "staff.health.read", entity: "StaffConfidential", id })`, which checks, logs, then returns that capability's columns only. Another restricted read (the residents list, a cost study) is `requireCapability`, then `logConsult`, then the select.
- **Invoices, receipts, payments and the log are hash-chained** (`src/lib/chain`, DESIGN.md section 8). Rows of `AuditLog`, `Invoice`, `InvoiceLine`, `InvoiceVisit`, `Payment`, `PaymentAllocation`, `Receipt` and `LegalEvent` are written only by `appendChained(ex, ctx, table, row)`, every column given (an empty one as `null`, yes or no as 0 or 1, an instant as its ISO text), and never updated or deleted: a void is a `LegalEvent`. An invoice's lines and visit rows follow it in the same transaction, and the invoice carries `contentDigest: await invoiceContentDigest({ lines, visits })`, computed before anything is written. `verifyChains(ex)` checks it all. The anchor kept outside the database is Foundation's.

### A message

Write the key in your folder's `en.json`, then the same key in `ar.json` and `fr.json`. English is the reference the tests compare against; Arabic is what the centre reads, in the client's own words (scope sections 2, 7 and 9). Use namespaces of your own (`Workers`, `WorkerForm`). `Errors` is the one namespace every folder adds to. No key may be defined by two folders, and `Nav` (bar, tabs, headings, parts of a file) is Foundation's. `src/i18n/messages.test.ts` checks each folder: same keys in three languages, same `{arguments}`, nothing empty.

### A file the user attaches

A file belongs to a table and a column: `entity` is the table, `field` is the column that holds its address (`"photoUrl"`), or `"photos"` for the set of photos of a `FirstVisit`, a `Visit` or an `Inspection`. There is no list to keep: the schema's `...Url` columns are the places a file can go.

- In the screen, before calling the action: `const url = await saveManagedUpload({ entity: "StaffMember", field: "photoUrl", file, rule: PHOTO_UPLOAD_RULE })` (`src/server/uploads.ts`). Writing bytes cannot be rolled back, so it never runs inside a service.
- In the service: `await linkUpload(ex, ctx, url, rowId)`, and the address in your own column. Replacing or removing a file: `removeUpload(ex, ctx, { url, owner })`; the bytes stay, the log keeps an ERASE. Your folder's `uploads.ts` is no longer read.
- A file only some may open is saved with `restrictedCapability` (the signed worker form always is: `"staff.health.read"`). It is stored where the window cannot load it; `openRestrictedUpload()` checks the capability and logs every opening.
- A photo at a client's site needs the site's `photoConsent` and `photo: { siteId, takenByEmployeeId }` (article 8 of his worker form).
- `<MediaUploadField>` in the form. An ordinary image is shown with `useUploadSrc()`. A PDF is not opened: the user saves a copy with the field's button (`saveUploadCopy()`), because nothing in this program leaves its window.

### A printed sheet

Everything that goes to paper is drawn on the A4 sheet in `src/components/print/`. Do not print a screen the way the academy does (`window.print()` on the live page): its headings, links and dark background end up on paper.

- The sheet is a component in `src/features/<folder>/sheets/`, built from the kit: `PrintSheet`, `TickBox` (ticked or empty, box before or after the label), `DottedBlank`, `SheetTable` with `SheetRow` and `SheetCell` (column widths in millimetres), `PageBreak`, `KeepTogether`. `src/features/core/sheets/sample-sheet.tsx` uses every one of them; copy from it.
- It is shown by a page below the record it prints, on a path that ends in `/print` (or `/print-<name>` when a record has several sheets). That page is a `DetailScreen` with `<PrintButton />` in its `actions` and the sheet as its content. The preview on screen and the printing are the sheet's own work. The sample is at `/dashboard/settings/print-sample`.
- `<PrintSheet letterhead="worker" | "client" margins={…}>`. His two letterhead placements and his two margin sets are constants (`SHEET_MARGINS`, from the Checker's layout files); `SHEET_MARGINS_CLEAR_OF_LETTERHEAD` is for a sheet of our own that can run onto further pages by itself. The facts to print his six forms from are the Checker's: `docs/checker/forms/` and `docs/checker/data/*.json`.
- Inside a sheet, sizes are millimetres and points in `style`. No Tailwind classes and no rem units: the app's type scale follows the window, and paper must not. His three faces are `SHEET_FONT.traditional`, `.sakkal` and `.typesetting`; each falls back to the bundled Arabic font where his is not installed, which is the case on this machine.
- A sheet is always Arabic and right to left, white paper and black ink, whatever the interface language and theme. Its text is written in the sheet, in his words, not in the message files. Digits read left to right go inside `<Ltr>`.
- A sheet is rendered twice (the preview, and the copy that prints), so it must be a pure picture of its data: no state, no effects.
- `<PageBreak />` must be a direct child of `<PrintSheet>`.
- Look at what will reach paper: `npm run pdf -- --route /dashboard/…/print --png`, then open the PNG of each page. It prints with the print dialog's defaults (no "Background graphics"); shading inside a sheet survives that.

### Offline, enforced

Rule 1 is checked by tools, not left to care:

- ESLint refuses, in `src/`: `fetch`, `XMLHttpRequest`, `WebSocket`, `window.open`, a web address in a string, `target="_blank"`, and `tel:` / `mailto:` links.
- The content security policy (`src-tauri/tauri.conf.json`) refuses anything not bundled with the program, and the windows refuse to navigate anywhere else (`src-tauri/src/lib.rs`).
- `src/lib/offline.test.ts` fails if a network plugin, crate or capability is added.
- The policy is not applied by `tauri dev` or by the harness's normal mode. `npm run csp:check` is where it is seen working, on the built `dist/`.

### The database

- The sources are `prisma/schema.prisma` and `prisma/triggers.sql`. `npm run db:types` writes the two migrations (`0001_init.sql`: 106 tables, 205 indexes, 118 triggers; `0002_seed.sql`: the seven roles and their default grants, the main branch, the communes of أم البواقي, names still to be checked) and the types. `npm run db:verify` fails when anything generated, or the database the migrations make, differs from the sources; it also runs the model's proof (157 attempts to break its rules) and the document check.
- First run (`src/features/core/services/first-run.ts`) writes what only the machine knows: the database's id, the start of the eight chains, the first log entries, the manager account. Settings have their defaults in code; a counter row appears at 0 the first time a number is taken.
- One SQLite connection that is never recycled, with `foreign_keys` and `recursive_triggers` on (`src-tauri/src/db.rs`). The window may send one statement at a time, starting with select, with, insert, update, delete, begin, commit or rollback; the schema changes through migrations only. Tests and the harness open their database the same way.
- **Until the first installer leaves the developer's machine, migrations may be rewritten and every development database is disposable.** sqlx remembers a checksum of each migration it applied, so after a migration is edited an old development database stops the program at start; delete the file (`~/.local/share/com.hamawebdev.inmaa-pro/inmaa.db` on Linux) and start again. After the first installer is delivered, migrations are forward-only: a new numbered file, never an edit, and a new column on a chained table adds a hash version.
- The harness builds a fresh database for every run, so screenshots are never affected.
- SQL is proven on the engine that ships by Rust tests (`cargo test --lib`): `migrations_apply_on_the_shipped_engine`, and `the_model_proof_holds_on_the_shipped_engine`, which replays every statement of the proof on sqlx's SQLite 3.46. Node's SQLite, which the JavaScript tests and the harness use, is a newer release.

### Still provisional

- Sign-in: the program signs in the manager account at start, without a password, and the academy's manager password and section lock (now kept on that account and in the setting `shell.lockedSections`) are what protect a section. Sign-in, roles by section, the four Settings tabs, the log screen, the daily backup and the guarded restore come in F3.
- Demo data: the harness's `--seed` takes SQL files only. A runner for each owner's demo data, written in its own folder, comes with F2b.
- The home screen and three of the four Settings tabs are placeholders.
- Licence: a 7-day trial that counts real time, on this machine too. In a debug build, `INMAA_LICENSE_RESET=1` starts it again. The developer makes an unlock code with `cargo run --quiet --bin unlock-code -- <DEVICE-ID>` in `src-tauri/`.
