# مركز إنماء برو management program

A desktop program that runs a cleaning centre in Algeria (مركز إنماء برو, أم البواقي): centre employees, cleaning workers, service requests and contracts in four divisions, visits, quality, money and stock. Two laptops (the director's and the assistant's), each with the whole program and database, kept in sync through an encrypted mailbox on Cloudflare (`docs/sync/DECISION.md`); otherwise offline. Tauri.

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

1. **Offline, except sync.** Nothing may need a connection at run time, and the program reaches one address only: the sync mailbox the director typed at set-up, over HTTPS, from the Rust side (`src-tauri/src/sync/http.rs`), never from the window (the developer, 2026-10-31; `docs/sync/DECISION.md` section 9). Otherwise: no fetch, no remote fonts, scripts or images, no updater, no links that open a browser, no messaging. Each laptop works alone without internet. A feature the plan gave to workers' phones is built as its office form: printed for the worker or supervisor, typed in afterwards by the office. A feature that exists only with a network is not built (scope section 4).
2. **Exact design as the academy app.** Layout, navigation, colours, type, components, light and dark, languages and right-to-left, backup, printing (the licence and its lock window were removed on 2026-10-31). Reuse its shell and components; do not redraw them. Only the business changes. Where the academy has two visual generations, match the newer one: its home screen, attendance family and settings (`SectionScreen`, `DetailScreen`, `ScreenHeader`, `ScreenTabs`, `StatCard`, `StatusChip`, `DataTable` with `TableSearch` and `TablePager`). Every new screen names its closest academy screen and follows it.
3. **Arabic is the default language, worded as in the client's forms.** Use his words for labels and options, exactly, wherever he has a word (scope sections 2, 7 and 9 list the agreed wording and the two corrections). French and English stay: every text exists in all three.
4. **His six forms.** Every field on them exists on a screen with the same options, in the same order. Each form or contract prints in the layout of his Word file, on A4, with his letterhead, ready to sign and stamp. Printed forms are always Arabic.
5. **The Algerian legal rules** in scope section 5 apply.
6. **New documents win.** Where the plan and the client's six forms or notes disagree, the forms and notes win.
7. **Read-only places.** Never write, build, install or run a git command that writes in `/mnt/data/academy-system-desktop`. Never change anything in `client docs/` or `plan/`.
8. **Git.** This folder is a local repository with a private GitHub remote (`origin`, added by the developer after the data disk failed on 2026-10-16). Teammates run no git command that writes or uses the network (no add, commit, stash, reset, checkout, restore, clean, fetch, pull, push, remote); the coordinator commits, and pushes only when the developer asks.

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
| `docs/checker-table.md`, `docs/checker/**`, `src/testing/scenarios/acceptance/**` (the end-to-end scenario tests of `docs/checker/acceptance.md`; they go through the owners' services and change none) | Checker |
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

## The demo videos

The developer has asked for videos of the program for the client, made with Recordly, with an Arabic voice-over. The session given that task is not one of the six teammates, and these rules replace the team's for it:

- It may build and run the program (`npm run tauri dev`, `npm run build`, a built binary, or the harness's browser), preferably on a display of its own so the developer's screen stays free. It stops everything it starts.
- It may use the network and install what it needs, outside this folder: the recorder, a display server, a text-to-speech voice. Rule 1 is about the program and does not change: nothing is added to the program, and `npm install` is still never run here.
- It writes nothing in this repository except what the existing commands generate (the demo database, `dist/`, `src-tauri/target/`). Its scripts, narration, voice, recordings, Recordly projects and exported videos live in `~/Videos/inmaa-pro-demo/`.
- It runs no git command that writes, and nothing inside `/mnt/data/academy-system-desktop`.

## How this codebase works

Maintained by Foundation. The shell is the academy app's, copied here under a new name (`Inmaa Pro`, `com.hamawebdev.inmaa-pro`, `inmaa.db`), with this program's sections and a placeholder page on every route. React 19, React Router (hash router), TanStack Query, Kysely over SQLite through Tauri commands, Tailwind 4, shadcn/ui, `use-intl`. The database is the data model's (`docs/data-model/`): 118 tables (109 shared between the two laptops), and every rule the model promises is enforced by SQLite itself.

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
| See it as another role | `npm run shot -- --demo --user accountant --route /dashboard/expenses` (`hr`, `admin`, `supervisor`, `reception`, `operations`, `accountant`; `manager` when left out) |
| Print a sheet to PDF | `npm run pdf -- --route /dashboard/files/1/form --png` |
| Print many sheets in one run | `npm run pdf -- --demo --routes sheets.txt --png` (one route a line; several people share this machine, and one run takes one place in the harness's queue) |
| Build the demo data | `npm run demo`; then `--demo` on `shot` and `pdf` opens it (see "Demo data" below) |
| Everything about the two above | `scripts/harness/README.md` |

Left to Foundation and the Checker, because they write shared output or take minutes: `npm run build` (writes `dist/`), `npm run csp:check` (the built app under the content security policy), `npm run db:types`, `npm run db:verify` (also checks `docs/data-model` against the schema and the code: `npm run db:docs`), and in `src-tauri/`: `cargo check --offline`, `cargo test --lib --offline` (this one rewrites `src/lib/bindings.ts`).

Nobody but the coordinator and the demo-video session ("The demo videos" above) runs `npm run tauri dev` or a built binary: it opens a window on the developer's screen. Nothing is ever built, installed or run inside `/mnt/data/academy-system-desktop`.

### Where things go

| What | Where |
|---|---|
| A screen | `src/pages/dashboard/<first path segment>/page.tsx`; its own parts in `_components/` beside it; detail pages in sub-folders (`new/page.tsx`, `[id]/page.tsx`) |
| Routes | `src/features/<owner>/routes.tsx` (core, people, clients, operations, money; stock's screens are in money's list) |
| Services (reads and writes) | `src/features/<folder>/services/*.ts`, each with its `*.test.ts` beside it |
| Handlers of other owners' events | `src/features/<folder>/events.ts` |
| Alerts for the home screen | `src/features/<folder>/alerts.ts` |
| What the folder does when a day starts | `src/features/<folder>/daily.ts` |
| The rows a real installation starts with (owner seeds) | `src/features/<folder>/seeds.ts` |
| Demo data | `src/features/<folder>/demo.ts` |
| Validators and code lists | `src/features/<folder>/validators/*.ts`; a list more than one owner uses is in `src/lib/options` (Foundation) |
| Messages | `src/features/<folder>/messages/{en,ar,fr}.json` (core, people, clients, operations, money, stock) |
| Stored codes that need labels | `src/features/<folder>/code-labels.ts` |
| Ctrl+K "new …" entries | `src/features/<folder>/quick-actions.ts` |
| Tests | beside the code, `*.test.ts` (not `.test.tsx`: it is not picked up) |
| Sections, tabs, hues, the ten parts of a file | `src/navigation/` (Foundation; ask for a change) |
| Printed sheets | `src/features/<folder>/sheets/*.tsx`, shown by a page whose path ends in `/print` |
| Shared components | `src/components/`; shadcn primitives in `src/components/ui/`; the print kit in `src/components/print/` (Foundation) |
| The data model: tables, who writes what, option codes, events | `docs/data-model/` (Foundation) |
| Schema, migrations, generated types | `prisma/schema.prisma`, `prisma/triggers.sql`, `src-tauri/migrations/`, `src/lib/db/` (Foundation; generated) |
| What every service calls | `src/lib/` (Foundation): `service`, `numbering`, `log`, `settings`, `access`, `events`, `alerts`, `daily`, `seeds`, `attachments`, `restricted`, `chain`, `clock`, `units`, `text`, `geo` |
| A test database and test rows | `src/testing/` (Foundation; imported by tests only) |

The folder names `services/`, `validators/` and `messages/` are not a matter of taste: tests find your files by them.

### A page

Every tab and every part of a file already has a page with a `<PagePlaceholder>` in it. Building a screen means replacing that element.

- Keep the wrapper. A tab's page is `<SectionScreen section="workers" title={…} description={…}>`: the tab strip and the lit bar item follow from the route. Add `actions={<Button asChild variant="add">…</Button>}` for the screen's main button.
- **The heading of a tab page is the tab's own name**, as in the academy: `title={tNav("Hiring")}`, the tab's `labelKey` in `src/navigation/sections.ts`. The first tab of a section is the exception: it keeps the section's heading from his notes (`title={tNav("WorkersHeading")}`: «عمال وعاملات النظافة», «المصاريف والمداخيل»…).
- **The line under the heading** (`description`) is for tab pages: one sentence saying what the tab is for, shown only on a tall window. A page below a list (`DetailScreen`) passes none. That is the academy's way round.
- A page below a list (a new record, one record, a part of a file) is `<DetailScreen section=… title=… back={{ href, label }}>`. It has a back action and no tab strip.
- **Save, one rule for every form:** `<Button type="submit" variant="success">` at the default size, at the form's foot inside `<PageActions>` (`src/components/screen.tsx`), with the way back (`variant="outline"`) beside it. Never `size="lg"`. A dialog's form keeps `DialogFooter`.
- Read data with `useQuery({ queryKey: pathKey("/dashboard/workers"), queryFn })`; a second query on the same screen uses `[...pathKey("/dashboard/workers"), "name"]`. Nothing refetches by itself: the action that saved names the paths it refreshes (`action(saveWorker, { revalidate: ["/dashboard/workers"] })`), and that is what refreshes the screen.
- Match the academy's newer generation: `SectionScreen`, `DetailScreen`, `ScreenHeader`, `ScreenTabs`, `StatCard`, `StatusChip`, and `DataTable` with `TableSearch` and `TablePager` (`src/components/data-table-shell.tsx`). Name the closest academy screen in a comment at the top of the page. The academy's own pages are not in this repository: read them in the reference, and look at `.harness/baseline/`.
- Arabic is the default and reads right to left. Use logical classes (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `text-start`), never `left`/`right`. Compare an Arabic screen with `.harness/baseline/ar-direction-fixed/`: this program mounts the direction provider the academy forgot, so tab strips and everything inside tabs mirror here. Two more intended differences from the reference: a ticked checkbox and a chosen radio item take their filled look here (`data-[state=checked]:`, which Radix sets; the academy's `data-checked:` never matched, so its ticks barely showed).
- Put a phone number, a date or time written in digits, a number with its unit, a registration number or a code inside `<Ltr>` (`src/components/ltr.tsx`), on screen and on paper. Without it Arabic shows `0661 20 31 42` as `42 31 20 0661`.
- Colours come from tokens (`text-success`, `bg-section-workers/10`, `SECTION_ACCENT`), never from the raw palette (`text-green-600`). A chart goes through `ChartContainer`. Confirm with `useConfirm()`, never `confirm()`.
- `StatusChip` has seven tones: `success`, `warning`, `danger`, `info`, `pending`, `neutral` and `progress`. `progress` (violet, a play mark) is for what is under way now: «جارية».
- An amount is written one way everywhere, «195.650,00 دج»: `useMoneyText()` (`src/hooks/use-money-text.ts`) on a screen, `formatMoneyAr()` or `formatMoney()` (`src/lib/units`) on a sheet. Amounts are whole centimes. A duration is written in hours and minutes, «318:00», «7:05», never a decimal: `formatHoursMinutes(minutes)` (`src/lib/units`), inside `<Ltr>`.
- A calendar date on a screen is written «12 أكتوبر 2026», «12 oct. 2026»: `useDateText()` (`src/hooks/use-date-text.ts`: `long`, `short`, `month`, and `ofInstant` for a stored instant on the centre's calendar). A sheet keeps his «12/10/2026». A count in a sentence goes through use-intl's plural forms (`{count, plural, one {…} two {…} few {…} many {…} other {…}}`): Arabic has all five.
- What a screen shows by role: `useCan("cost.read")` and `useSectionLevel("WORKERS") === "WRITE"` (`src/hooks/use-session.ts`) leave out a button the reader could only be refused by. The service checks again. `useCentreClock()` gives the centre's date and time to a screen.
- **Branches** (feature 47: one database, a branch field, filters and reports). Each account belongs to a branch (Settings › المستخدمون والصلاحيات), and `ctx.branchId` is the signed-in account's: write it on every row that has a `branchId`. The branches themselves are a card in Settings › عام, the manager's. A list or a report filters by branch with `<BranchPicker id value onChange allowAll />` (`src/components/branch-picker.tsx`; null is «كل الفروع»), drawn only when `useBranches().several` (`src/hooks/use-branches.ts`): with one branch nothing is shown. Its service takes `branchId: string | null` and adds `.$if(input.branchId != null, (qb) => qb.where("x.branchId", "=", input.branchId!))`. Start the filter at null (the whole centre) or at `useSession()?.branchId`, as the screen needs.
- A place is typed with `<CommunePicker id value={{ wilayaCode, communeId }} onChange>` (`src/components/commune-picker.tsx`): the wilaya of 69, then its commune, with «إضافة بلدية» for one the list does not hold yet. A zone with `<ZonePicker id value onChange allowNone?>`. Save with `ensureZoneForCommune` where a zone follows from the place.
- **A worker's or an employee's name is written surname then first name**, as his form's label «اللقب و الاسم», on every screen and sheet: `staffName({ lastName, firstName })` (`src/lib/text/names.ts`). «حمدي رضا», never «رضا حمدي». An account goes by the name of the employee it is linked to, surname first, and its own display name is written surname first too (`accountName`, `src/lib/access/session.ts`): that is the `ctx.userName` the log and a receipt carry.
- **Every phone number on screen and on paper** is `<Ltr>{phoneText(phone)}</Ltr>` (`src/lib/text/phone.ts`): ten digits as `0661 20 31 42`, nine as `032 41 50 00`, anything else as stored.
- **No browser or system picker** (the developer, 2026-10-22). A date is `<DateField>`, a time `<TimeField>`, a period `<DateRangeField>`, a text with usual answers `<SuggestField>` (`@/components/pickers`), and every choice from a list is `Select` (`@/components/ui/select`, the program's own dropdown, with a search box above ten items). Each holds a draft and applies it only when its «تأكيد» is pressed (or Enter); «إلغاء», Escape or a click outside drop it. `onChange` takes the value (`YYYY-MM-DD`, `HH:MM`, `""` for none), not an event; give `clearable` where the value may be empty. ESLint and `src/components/pickers/no-native-pickers.test.ts` refuse `type="date"`, `type="time"`, `<select>`, `<datalist>` and the old `NativeSelect`. File buttons stay as the academy has them.

### A route

Add it to your own list: `{ path: "workers/:id", element: <WorkerPage /> }`. The path is relative to `/dashboard`, is written as a plain string, and its first segment must be one of yours. `src/navigation/routes.test.ts` fails otherwise. A new tab or section is a change to `src/navigation/sections.ts`: ask Foundation.

A file's pages are `files/:id/<part>`. The list of parts is `src/navigation/file-parts.ts`; the hub page links to every part from it, so the three owners never edit each other's files. Each part says what opens it (`opens`: a section level or a capability, any one enough), and `mayOpenFilePart(session, part)` tells the hub whether to list it: a reader is never offered a part he could only be refused.

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
- **Passing over days before an invoice or a receipt** (`src/testing/days.ts`). The clock guard measures the PC's date against the work recorded, never against a sign-in, and more than `system.clockJumpDays` (3) days after it asks the manager (DESIGN.md section 8, "The clock, as built"). A test that jumps weeks ahead and issues is refused, as the PC would be. Pass the days as the office does: `await workUntil(test, "2026-12-01T08:00:00.000Z")` (one logged operation on each day passed over, so the clock never jumps), or `await confirmDate(test, "2026-12-01T08:00:00.000Z")` (the manager confirms the date through the service after a closure: a CLOCK_WARNING). Never sign in or log a single entry at the far day to get past it: at the centre nothing is logged without a sign-in, and a sign-in on a jumped date makes its whole session not count.
- `test.rows.insert("Visit", { status: "DONE" })` writes a row by hand, every required column filled and its parents created. It arranges a test; a scenario goes through the services, because a raw insert skips their rules. `test.raw` is the connection itself, for proving that the database refuses something.
- `test.snapshot()` copies the database; `openTestDatabase(copy, { anchor: test.anchor, clock: test.clock })` opens it as a restored backup. `fileAnchorStore(file)` (`src/testing/anchor-file.ts`) keeps the anchor in a file, for a test that closes the program and opens it again.
- A whole path through the tables, from registration to a paid invoice: `src/testing/scenarios/contract-to-paid-invoice.test.ts`.

### Demo data

One database every screen can be looked at on, and that scenario tests can start from. Each owner writes its part with its own services, in `src/features/<folder>/demo.ts`:

```ts
import type { Executor, ServiceContext } from "@/lib/service/context";
import type { DemoNames, DemoTools } from "@/testing/demo";

export async function seedDemo(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const { id } = await registerFile(ex, ctx, { communeId: "commune-0402", … }); // your services, this ex
  return { housingFile: id };
}
```

- The runner calls the folders in owner order (core, people, clients, operations, money, stock), each in one transaction, as the manager, after first run, on a clock standing at Monday 12 October 2026, 09:00. A folder that fails stops the build and is named.
- `tools.names` holds what the folders before yours named (`tools.names.core.zoneAinBeida`); `tools.sessionOf("ACCOUNTANT")` is the session of the demo account of a role; `tools.at("2026-09-01T08:00:00.000Z", session?)` is a context at another instant, for history.
- Foundation's own demo data runs first: an account for each role (usernames `hr`, `admin`, `supervisor`, `reception`, `operations`, `accountant`; with `manager`, all seven sign in with the password `inmaa-demo`), the centre's identity (his name, city, phone and e-mail; demo registration numbers, address and bank, so an invoice can issue), tax mode IFU, and the zones of أم البواقي, عين البيضاء and عين مليلة.
- Ids made while a folder runs are the same on every build (`demo-clients-0007`), and what a folder returns names its records: `npm run pdf -- --demo --route "/dashboard/files/{clients.housingFile}/print"`.
- `npm run demo` writes `.harness/demo/inmaa-demo.db` and prints what each folder named. `--demo` on the harness opens it, and builds it again first if the migrations or a `demo.ts` changed; after you change a service your demo data uses, run `npm run demo`. `createTestDatabase({ demo: true })` builds the same data in a test (`demo: ["clients"]` for core's and yours only), and `test.demo.clients.housingFile` is your record.

### A validator

- A validator is a zod schema in `src/features/<folder>/validators/`, with its codes as `as const` arrays and its messages as English sentences under `Errors`.
- The database stores codes (`"FULL_DAY"`), never labels. Label them in your messages, show them with `useCodeLabel("Namespace")`, and list the pair in your `code-labels.ts` so the test can check all three languages.
- A list more than one owner uses is written once, in `src/lib/options`: division, service type, payment method and frequency, amount basis, weekday (and the client forms' Saturday to Thursday), yes/no, cleanliness, day period, bearer, duration unit, team access, file stage, sex, worker role (with a woman's words, `workerRoleAr(role, sex)`), ability, transport, absence and leave type, protective kit, corrective action and evaluation recommendation, forbidden places, site instructions. For each: the codes (`DIVISIONS`), his words for paper (`DIVISION_AR`), and the screen labels `useCodeLabel("Options.Division")` in three languages. Your copy becomes a re-export: `export { DIVISIONS, type Division } from "@/lib/options";`. A change to a shared list is asked of Foundation.
- **His two service lists are not code.** «الخدمات المقدمة» and «الخدمات المبرمجة» are the manager's rows (`CatalogueService`, `CatalogueServiceDivision`), edited in Settings › الخدمات: a service added (coded `ADDED_<n>`), renamed (Arabic, French and English, all three required), removed (no longer offered; a file that ticks it keeps it, on screen and on paper), given its divisions, moved within a division. Read them with `listServiceCatalogue(ex)` (`src/features/core/services/service-catalogue.ts`) or `useServiceCatalogue()` (its `label(list, code)` names a code in the reader's language, removed services included); an Arabic name for a task or an export is `serviceLabels(ex, list)`. A form's service rows are filled with `resolveDefinition(definition, catalogue, keep)` (`src/features/clients/forms/catalogue.ts`): the screen, the sheet and the save all take the resolved form. His lists as migration 0003 seeded them are `src/lib/options/service-catalogue-seed.ts`, and `catalogueFromSeed()` gives them to a test without a database.

### What every service calls

- **Numbers** (`src/lib/numbering`), in the transaction that writes the document: `nextNumber(ex, ctx, "QUOTE", { date })` gives `{ seq, year, display }` for `numberSeq`, `numberYear`, `number`; the year is the document's own date's. A file: `nextNumber(ex, ctx, fileSequenceKey(formKind), { date })` (`31/BLC` on a building contract). A block: `nextNumbers(ex, ctx, "VISIT", { date, count })`. A number typed from paper: `claimNumber(ex, ctx, key, { value, date, reason, isFree })`. A rolled-back transaction gives its numbers back. Invoices and receipts: `peekLegalNumber(ex, ctx, "INVOICE", { date })` gives the number the insert must carry and the earliest date allowed; the insert of the document moves the counter, and the database refuses any other number or date. Call `assertClockSane(ex, ctx)` (`src/lib/clock/sanity.ts`) before issuing one: it refuses a clock behind the work recorded and asks the manager about a jump forward (`ClockJumpError`; he confirms with `confirmedJump`). The same check runs at start-up, at sign-in and before each day's start. Formats: DESIGN.md section 6.
- **The log** (`src/lib/log`), in the same transaction as the change, one entry per operation on personal data (DESIGN.md section 9): `logCollect` (a row holding personal data created), `logConsult` (restricted data, at every read), `logConsultOnce` (a person's file page: once per user, record and day; it answers null when today's entry exists), `logChange` (with `changes: { field: [old, new] }`), `logDisclose` (a sheet naming a person printed, an export), `logErase` (a soft delete, a removed file), `logSecurity`. Each takes `{ owner, action, entity, entityId, entityLabel, subject: { kind, id, label }, changes, context, reason }`; the date, time and user come from `ctx`. The acts in `ACTIONS_NEEDING_A_TYPED_REASON` (void, cancel, soft delete, override, a number from paper, a sanction, an approval…) are refused without the reason the user typed. Health answers, the hiring score, password hashes and costs never reach `changes`. Nobody else writes `AuditLog`.
- **Settings** (`src/lib/settings`): `getSetting(ex, "stamp.minimum")` is the typed value or its default; `getSettings(ex, [...])` reads several; `setSetting(ex, ctx, key, value)` writes and logs. Keys and defaults: `src/lib/settings/catalogue.ts` (DESIGN.md section 11). Read a setting in the action that uses it; never keep it. Every setting a person sets has its form in Settings, described once in `src/features/core/validators/settings-form.ts` (the field's kind, its limits, its card): a new setting is asked of Foundation with its key, default and kind. The centre's costs (`COST_SETTING_KEYS`: labour cost, margin, reserve, administration share) are read and changed with `cost.read` only, each read logged (`readCostSettings`), and never written in the log's `changes`.
- **Who may do what** (`src/lib/access`): `requireSection(ctx, "MONEY", "WRITE")`, `requireCapability(ctx, "quote.approve")`, or `can(ctx, "cost.read")` to decide what a screen shows. The manager and the program itself hold everything. Roles, sections, capabilities and their default holders: `src/lib/access/catalogue.ts` (DESIGN.md section 12). The harness signs in as the manager unless `--user` names another account, so every check passes on screen by default; test the refusals with `test.sessionFor(role)`, and look at a screen as a role with `--demo --user`.
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

### Sign-in and roles

- Nobody is signed in when the program opens. The sign-in window (`src/components/security/sign-in-screen.tsx`, in the academy's lock window's style) is drawn instead of the program: no page is mounted behind it. A person picks his name and types his password; an account with no password yet chooses one there; a password the manager gave is replaced at once by its owner; the manager alone has a recovery code, shown once. «قفل الآن» on the bar signs out, and so does the idle lock after `security.idleLockMinutes` minutes without input (default 15; 0 is off): the router is unmounted, so a form in progress is lost. Never keep half-typed work anywhere that outlives the page. The services are `src/features/core/services/sign-in.ts`; DESIGN.md section 12 has the rules.
- **Roles by section.** The bar and the Ctrl+K list leave out a section the signed-in role holds no level on; the route gate answers any other way in with "not open to your account", and the page is never mounted. الرئيسية is everybody's. A role that only reads a section sees its pages: every write must be refused by its service (`requireSection(ctx, …, "WRITE")` or a capability), and the screen should leave the button out (`useSectionLevel`, `useCan`).
- **The manager answers under his own name.** There is no dialog that takes his password inside another user's session. What only he may do (`sanction.answer`, an approval, an override) he does signed in himself: the question waits in its owner's list and on its alert tile.
- Accounts are made, given a password, switched off and linked to a centre employee in Settings › المستخدمون والصلاحيات, where each role's level on every section and its capabilities are set too (`src/features/core/services/users.ts`: `createAccount`, `giveAccountPassword`, `setAccountActive`, `linkAccountToStaff(ex, ctx, { userId, staffMemberId })`, `saveRoleGrants`). A change of rights takes effect at the account's next sign-in. `users.manage` may be given to another role, but the manager's place stays his: only he gives or changes the MANAGER role, switches a manager's account, or gives or takes away a capability no role holds by default (`MANAGERS_OWN_CAPABILITIES`); nobody changes his own role or raises his own role's rights.
- **The PC's clock at sign-in.** Earlier than the work recorded: nobody signs in but the manager, who is shown the clock screen (`src/components/security/clock-screen.tsx`) to correct the date or, with his reason, say the recorded one was wrong. Several days later: everyone signs in; the manager is shown the clock screen and confirms the date; until then no invoice or receipt is issued and the day's own work waits. A database whose anchor could not even be compared opens on the anchor screen with «try again», for everybody.
- The harness signs in on every page it opens, as a person would (`scripts/harness/README.md`, "Signing in"). `--signed-out` shows the sign-in window; `--before <js>` reaches a step of it, or opens a dialog before a picture. One harness session keeps one running clock across its views, so nobody moves `--now` by hand between them; a `--now` days after the data's last work is confirmed by the harness as the manager would.

### An alert

An alert is a rule one owner knows and the home screen shows: a count, and the list to open. Export `registerAlerts` from your own `src/features/<folder>/alerts.ts`:

```ts
import { PackageMinus } from "lucide-react";

import type { RegisterAlert } from "@/lib/alerts";

export function registerAlerts(register: RegisterAlert) {
  register({
    key: "stock.low", // one of the 22 keys of DESIGN.md section 13
    section: "stock", // the bar section its list is in: the tile wears its hue, and a role that cannot open it does not see the tile
    severity: "warning", // "danger" | "warning" | "info": the order of the tiles
    name: "StockLow", // messages `Alerts.StockLow.Title` and `.Hint`, in your three files
    icon: PackageMinus,
    route: "/dashboard/inventory?kind=MATERIAL&state=TO_BUY", // your list, already filtered
    // leadSetting: "alerts.contractEndLeadDays",  → `days` below
    // capability: "cost.read",                    → only for readers who hold it
    count: async (ex, ctx, { days }) => countLowItems(ex, ctx), // a number, or { count, route } when the list depends on what was found
  });
}
```

A tile appears only when its count is above zero. `count` is a read: it runs outside a transaction, as the reader, every time the home screen opens. The worked example is `src/features/core/alerts.ts`.

An alert is also said once on the desktop, by a notification of the operating system (nothing leaves the PC): the first time in a day that it concerns something, and again that day only if it comes to concern more (`src/lib/alerts/announce.ts`). Nothing to do for it: registering the alert is enough, and its `Title` and `Hint` are the notification's words.

### The day-start job

What an owner must do because the date changed, not because somebody pressed something: a contract past its end date, a dated suspension ending, a document expiring. Export `registerDaily` from your own `src/features/<folder>/daily.ts`:

```ts
import type { RegisterDaily } from "@/lib/daily";

export function registerDaily(daily: RegisterDaily) {
  daily("end contracts past their date", async (ex, ctx, { today, since }) => {
    await endExpiredContracts(ex, ctx, { upTo: today }); // your own service, this ex
  });
}
```

The runner (`src/lib/daily`) calls each owner's handlers in one transaction, as the program (`ctx.userId` is null: `requireSection` and `requireCapability` pass), once per local day: when the program opens, and at midnight if it is open. `since` is the last day your handlers completed, or null the first time: catch up from there, the program may have been closed for a week. Write a handler so that running it twice changes nothing. One that throws rolls back its owner's whole day and is tried again within the hour; the other owners are not held up. In a test: `runDayStart(test.db, test.clock)`.

### Owner seeds

The rows a real installation starts with that are an owner's (BUILD-NOTES "Owner seeds": the training modules, the inspection criteria, the stock items). Export `registerSeeds` from your own `src/features/<folder>/seeds.ts`:

```ts
import type { RegisterSeed } from "@/lib/seeds";

export function registerSeeds(seed: RegisterSeed) {
  seed("the eight training modules", async (ex, ctx) => {
    await seedTrainingModules(ex, ctx); // fixed ids; inserts what is missing; never overwrites an edit
  });
}
```

First run calls every owner's steps in owner order (core, people, clients, operations, money, stock), in its transaction, as the program, after Foundation's own rows. The day-start job calls each owner's steps again, first in that owner's day transaction, so that a database made before a seed existed catches up. **A step runs many times: make it idempotent.** Fixed ids, insert only what is missing, never overwrite what the office edited. `createTestDatabase()` makes its database through first run, so every test starts with the seeds; `createTestDatabase({ seeds: false })` gives an empty one. The demo data is built on top of them: a `demo.ts` uses the seeded rows, it does not insert them again.

### The home screen

`src/pages/dashboard/home/page.tsx` has three places: today's tiles, the day board, and the alert tiles. The first two are Operations': `src/features/operations/home.tsx` exports `homeSlots: HomeSlots` (`{ today?, board? }`, components without props; `src/lib/home/slots.ts`). Until it does, Foundation's defaults beside the page draw them from Operations' own `DayBoard` and `boardCounts`. Tiles on the home screen stand three to a row, in the academy's classes: `grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3 tall:gap-6`.

### Backup and restore

- A backup is the database file, a folder of the stored files beside it, and a manifest saying what it holds (`<name>.json`). One is made by the program itself once a day, after the day-start job, into the folder the manager chose in Settings › عام (`inmaa-auto-YYYY-MM-DD.db`; the oldest beyond `backup.keepCount` are removed), and one by hand from the same card or from the lock menu (`backup.run`). A folder a cloud client synchronises is refused. Every copy is checked (`backup.run`, or `backup.restore` for the copy before a restore) and written in the log as a DISCLOSE before a byte is copied, then gets its row of `BackupRun`, `ok` or not.
- A restore is the manager's alone. It says first what the copy would cost (another centre's data, a state older than the last invoice), keeps a protected copy of what it replaces, asks for his reason, and restarts. At the next start, a database that does not agree with its anchor opens on the screen that asks the manager (`src/components/security/anchor-screen.tsx`); nobody works until he has answered.
- The services are `src/features/core/services/backups.ts` (tested), the copying is Rust's (`src-tauri/src/backup.rs`), and `src/server/backup.ts` joins them. A service of yours never copies a file.

### A message

Write the key in your folder's `en.json`, then the same key in `ar.json` and `fr.json`. English is the reference the tests compare against; Arabic is what the centre reads, in the client's own words (scope sections 2, 7 and 9). Use namespaces of your own (`Workers`, `WorkerForm`). `Errors` is the one namespace every folder adds to. No key may be defined by two folders, and `Nav` (bar, tabs, headings, parts of a file) is Foundation's. `src/i18n/messages.test.ts` checks each folder: same keys in three languages, same `{arguments}`, nothing empty.

### A file the user attaches

A file belongs to a table and a column: `entity` is the table, `field` is the column that holds its address (`"photoUrl"`), or `"photos"` for the set of photos of a `FirstVisit`, a `Visit` or an `Inspection`. There is no list to keep: the schema's `...Url` columns are the places a file can go.

- In the screen, before calling the action: `const url = await saveManagedUpload({ entity: "StaffMember", field: "photoUrl", file, rule: PHOTO_UPLOAD_RULE })` (`src/server/uploads.ts`). Writing bytes cannot be rolled back, so it never runs inside a service.
- In the service: `await linkUpload(ex, ctx, url, rowId)`, and the address in your own column. Replacing or removing a file: `removeUpload(ex, ctx, { url, owner })`; the bytes stay, the log keeps an ERASE. Your folder's `uploads.ts` is no longer read.
- A file only some may open is saved with `restrictedCapability` (the signed worker form always is: `"staff.health.read"`). It is stored where the window cannot load it; `openRestrictedUpload()` checks the capability and logs every opening.
- A photo at a client's site needs the site's `photoConsent` and `photo: { siteId, takenByEmployeeId }` (article 8 of his worker form).
- `<MediaUploadField>` in the form. An ordinary image is shown with `useUploadSrc()`. A PDF is not opened: the user saves a copy with the field's button (`saveUploadCopy()`), because nothing in this program leaves its window.
- **A copy saved outside is a disclosure.** `saveUploadCopy(url, title, { owner, subject, reason? })` writes a DISCLOSE (EXPORT, to the place chosen) before it copies, for every stored file but the program's own pictures, and checks a restricted file's capability. Name the person in `subject`; `<MediaUploadField copyLog={{ owner, subject }}>` does it for the field's button, and `mayCopy={false}` leaves the button out for a reader who may not open the file. A restricted file works in the field as it is (never previewed; saved with `restrictedCapability`). The signed worker form opens only with `staff.health.read`, and its copy also needs `staff.printFilledForm` and a reason the user typed, as its printing does.

### A printed sheet

Everything that goes to paper is drawn on the A4 sheet in `src/components/print/`. Do not print a screen the way the academy does (`window.print()` on the live page): its headings, links and dark background end up on paper.

- The sheet is a component in `src/features/<folder>/sheets/`, built from the kit: `PrintSheet`, `TickBox` (ticked or empty, box before or after the label), `DottedBlank`, `SheetTable` with `SheetRow` and `SheetCell` (column widths in millimetres), `PageBreak`, `KeepTogether`. `src/features/core/sheets/sample-sheet.tsx` uses every one of them; copy from it.
- It is shown by a page below the record it prints, on a path that ends in `/print` (or `/print-<name>` when a record has several sheets). That page is a `DetailScreen` with `<PrintButton />` in its `actions` and the sheet as its content. The preview on screen and the printing are the sheet's own work. The sample is at `/dashboard/settings/print-sample`.
- A print to record (a sheet naming a person is a disclosure, `logDisclose`; a print count; a list frozen): `<PrintButton onPrint={async () => { const result = await recordPrintAction(…); if (!result.success) toast.error(…); return result.success; }} />`. The hook runs before the print dialog; `false`, or a throw, stops the print. Printing goes through a `PrintButton` and nothing else: Ctrl+P presses the screen's button (the newest, when there are several) and does nothing on a screen without one, and the window's own context menu does not open (`installPrintGuard`, `src/components/print/print-flow.ts`). So never mount a sheet naming a person on a page that shows no button to its reader. A `beforeprint` listener is no longer needed.
- `<PrintSheet letterhead="worker" | "client">`. **Nothing prints over his letterhead or footer pictures** (the coordinator's ruling, for his own forms as for ours): the text goes in `SHEET_BODY[family]`, below the header picture and above the footer picture, with his side margins (worker 30.9 / 18.8 mm, client 27.6 / 16.7 mm, top / bottom). That is the default; a sheet may ask for more room with `margins`, never less: margins that reach a picture are pushed clear of it, with a warning in development. His Word margins (`SHEET_MARGINS`) are for reference only: they let text run under his footer. The facts to print his six forms from are the Checker's: `docs/checker/forms/` and `docs/checker/data/*.json`.
- `<SheetTable columns={…} head={<SheetRow>…</SheetRow>}>`: the `head` rows are printed again at the top of every page the table runs onto (a visit statement of two pages).
- Inside a sheet, sizes are millimetres and points in `style`. No Tailwind classes and no rem units: the app's type scale follows the window, and paper must not. His three faces are `SHEET_FONT.traditional`, `.sakkal` and `.typesetting`, at his sizes (`SHEET_FONT_STAND_IN` names the bundled stand-in, for a sheet that sets a face of its own). Where his face is not installed (this machine), Noto Naskh Arabic, bundled with the program, stands in, scaled so that a line takes about the room his face takes (`SHEET_FONT_SCALE`, found from his own labels in his own cell widths; the print sample shows them, and on a PC that has his fonts its calibration panel measures the true scale).
- A sheet is always Arabic and right to left, white paper and black ink, whatever the interface language and theme. Its text is written in the sheet, in his words, not in the message files. Digits read left to right go inside `<Ltr>`.
- A sheet is rendered twice (the preview, and the copy that prints), so it must be a pure picture of its data: no state, no effects.
- `<PageBreak />` must be a direct child of `<PrintSheet>`.
- The centre's logo (an ID card's header band): `useCentreLogo()` (`src/hooks/use-centre-logo.ts`) gives the logo stored in Settings › عام, or the emblem cut from his letterhead while none is stored (`CENTRE_EMBLEM_SRC`, `@/assets/letterhead/emblem`). The page reads it and passes `src` to the sheet.
- Look at what will reach paper: `npm run pdf -- --route /dashboard/…/print --png`, then open the PNG of each page. It prints with the print dialog's defaults (no "Background graphics"); shading inside a sheet survives that.

### Offline, enforced

Rule 1 is checked by tools, not left to care:

- The window connects nowhere. The one network path is the Rust command `sync_request`: HTTPS only, to the origin saved in the sync vault, paths under `/v1/`, no redirects (`src-tauri/src/sync/`).
- ESLint refuses, in `src/`: `fetch`, `XMLHttpRequest`, `WebSocket`, `window.open`, a web address in a string, `target="_blank"`, and `tel:` / `mailto:` links.
- The content security policy (`src-tauri/tauri.conf.json`) refuses anything not bundled with the program, and the windows refuse to navigate anywhere else (`src-tauri/src/lib.rs`).
- `src/lib/offline.test.ts` fails if a network plugin or capability is added, if any HTTP crate but `ureq` (rustls only) is added, or if `ureq` or a web address appears anywhere in the Rust sources but `src-tauri/src/sync/http.rs`.
- The policy is not applied by `tauri dev` or by the harness's normal mode. `npm run csp:check` is where it is seen working, on the built `dist/`.

### The database

- The sources are `prisma/schema.prisma` and `prisma/triggers.sql`. The migrations: `0001_init.sql` (107 tables, 207 indexes, 120 triggers) and `0002_seed.sql` (the seven roles and their default grants, the main branch, the 29 communes of أم البواقي, checked on 2026-10-12, each id carrying its official code: `commune-0401` … `commune-0429`) shipped with the first installer (0.1.0) and are **frozen**; `0003_service_catalogue.sql` adds his two service lists and seeds the 48 services of his forms, shipped with 1.0.0 and is frozen too. `npm run db:types` writes the types and each later migration that has not shipped yet (`LATER_MIGRATIONS` in `scripts/db/schema-tools.mjs` names the models each one creates). `npm run db:verify` fails when a frozen migration's text changed (`FROZEN_MIGRATIONS`, by sha256), when the folder holds another file, when anything generated, or the database the migrations make, differs from the sources; it also runs the model's proof (157 attempts to break its rules, on 0001) and the document check.
- First run (`src/features/core/services/first-run.ts`) writes what only the machine knows: the database's id, the start of the eight chains, the first log entries, the manager account. Settings have their defaults in code; a counter row appears at 0 the first time a number is taken.
- One SQLite connection that is never recycled, with `foreign_keys` and `recursive_triggers` on (`src-tauri/src/db.rs`). The window may send one statement at a time, starting with select, with, insert, update, delete, begin, commit or rollback; the schema changes through migrations only. Tests and the harness open their database the same way.
- **Installers have shipped: migrations are forward-only** (the developer, 2026-10-22). An installed copy holds data that must be kept, and sqlx refuses to start a database when the text of a migration it applied has changed. A change to the schema is a new numbered file, generated from the models `LATER_MIGRATIONS` gives it, never an edit; a new column on an existing table is an `ALTER` in a new file (teach the generator first), and a new column on a chained table adds a hash version. A change to the roles, their default grants or the communes, which 0002 seeded, is a new migration too. Once a migration ships, its hash joins `FROZEN_MIGRATIONS`. `cargo test --lib` proves that a database of the first installer upgrades in place (`a_database_of_the_first_installer_upgrades_in_place`), and a backup made before a migration is migrated forward when it is restored.
- The harness builds a fresh database for every run, so screenshots are never affected.
- SQL is proven on the engine that ships by Rust tests (`cargo test --lib`): `migrations_apply_on_the_shipped_engine`, and `the_model_proof_holds_on_the_shipped_engine`, which replays every statement of the proof on sqlx's SQLite 3.46. Node's SQLite, which the JavaScript tests and the harness use, is a newer release.

### Sync between the two laptops

The decision, every case and its outcome: `docs/sync/DECISION.md`; who built what and the contracts: `docs/sync/BUILD.md`; the tables and triggers: DESIGN.md section 20. In short:

- Every write transaction is stamped (`stampTransaction`, `src/lib/sync/session.ts`; `action`, `transact`, the day-start runner, first run, `test.transact` and `rows.insert` already do). Triggers copy every change of a shared table into `SyncOutbox`; while sync is set up, a write that was not stamped is refused (`SYNC_UNSTAMPED`). A new write path must go through `withStampedTransaction`.
- A shared table is every table not marked `/// @local` in the schema. Local: `Sequence`, `ChainHead`, `BackupRun`, the sync tables, `system.*` and `backup.*` settings, `User.failedSignInCount` and `lastSignInAt`, the two cached totals on update.
- Only the laptop that holds the books writes the seven legal chains, the legal gaps and the debt ledger, closes a cash day and runs the owners' day-start handlers (`requireBooks`, `src/lib/sync/books`). An action that must also work on the other laptop leaves that part for the books' laptop to finish after applying (see the dues rebalance and the pending debt lines).
- Ordinary numbers come from blocks agreed between the laptops once sync is set up (`src/lib/sync/blocks`); before set-up, numbering is 1.0.0's.
- The log has one chain per laptop (`AuditLog.chain`, hash version 2). The clock check reads this laptop's own chain.
- A row that two laptops could create independently for the same thing gets an id derived from what it is (`setting-<key>`, `zone-<communeId>`, `commune-<wilaya>-<hash>`).
- Two copies in a test: `createSyncPair()` (`src/testing/sync/pair.ts`); scenarios in `src/testing/scenarios/sync/`.

### Still provisional

- Settings › قواعد العمل holds every setting of DESIGN.md section 11 and the zones of communes. The lists that are tables of another owner (training days and skills, inspection criteria, clause text) have no editor there yet: each is its owner's, and a branch editor is not built.
- The letterhead pictures are the bundled ones: `letterhead.headerUrl` and `letterhead.footerUrl` have no upload field.
- The log screen names a record by its table (`StaffMember`) beside its label: the tables have no words of their own yet.
- Sync has not yet run against the deployed Cloudflare mailbox or on Windows: its tests run the mailbox's own code in memory (`src/testing/sync/memory-relay.ts`).
