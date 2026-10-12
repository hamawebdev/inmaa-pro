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

Maintained by Foundation. The shell is the academy app's, copied here under a new name (`Inmaa Pro`, `com.hamawebdev.inmaa-pro`, `inmaa.db`), with this program's sections and a placeholder page on every route. React 19, React Router (hash router), TanStack Query, Kysely over SQLite through Tauri commands, Tailwind 4, shadcn/ui, `use-intl`.

### Commands

Run from the project root. `node_modules` is a copy of the reference's: **never run `npm install`**, there is no network to install from. If you need a package that is not there, say so in your report.

| To do this | Run |
|---|---|
| Type-check | `npx tsc --noEmit` (read only the errors in your paths) |
| Lint your paths | `npx eslint src/features/people src/pages/dashboard/workers` (`npm run lint` for everything; 17 warnings from the academy shell are known, errors are not) |
| Run your tests | `npx vitest run src/features/people` (`npm test` for everything) |
| Format your paths | `npx prettier --write src/features/people src/pages/dashboard/workers`; width 120; `npm run format:check` is a gate |
| See a screen | `npm run shot -- --route /dashboard/workers --locale ar --theme dark --both-sizes` |
| Print a sheet to PDF | `npm run pdf -- --route /dashboard/files/1/form --png` |
| Everything about the two above | `scripts/harness/README.md` |

Left to Foundation and the Checker, because they write shared output or take minutes: `npm run build` (writes `dist/`), `npm run csp:check` (the built app under the content security policy), `npm run db:types`, `npm run db:verify`, and in `src-tauri/`: `cargo check --offline`, `cargo test --lib --offline` (this one rewrites `src/lib/bindings.ts`).

Nobody but the coordinator runs `npm run tauri dev` or a built binary: it opens a window on the developer's screen. Nothing is ever built, installed or run inside `/mnt/data/academy-system-desktop`.

### Where things go

| What | Where |
|---|---|
| A screen | `src/pages/dashboard/<first path segment>/page.tsx`; its own parts in `_components/` beside it; detail pages in sub-folders (`new/page.tsx`, `[id]/page.tsx`) |
| Routes | `src/features/<owner>/routes.tsx` (core, people, clients, operations, money; stock's screens are in money's list) |
| Services (reads and writes) | `src/features/<folder>/services/*.ts` |
| Validators and code lists | `src/features/<folder>/validators/*.ts` |
| Messages | `src/features/<folder>/messages/{en,ar,fr}.json` (core, people, clients, operations, money, stock) |
| Stored codes that need labels | `src/features/<folder>/code-labels.ts` |
| Kinds of uploaded file | `src/features/<folder>/uploads.ts` |
| Ctrl+K "new …" entries | `src/features/<folder>/quick-actions.ts` |
| Tests | beside the code, `*.test.ts` (not `.test.tsx`: it is not picked up) |
| Sections, tabs, hues, the ten parts of a file | `src/navigation/` (Foundation; ask for a change) |
| Printed sheets | `src/features/<folder>/sheets/*.tsx`, shown by a page whose path ends in `/print` |
| Shared components | `src/components/`; shadcn primitives in `src/components/ui/`; the print kit in `src/components/print/` (Foundation) |
| Schema, migrations, generated types | `src-tauri/migrations/`, `prisma/schema.prisma`, `src/lib/db/` (Foundation) |

The folder names `services/`, `validators/` and `messages/` are not a matter of taste: tests find your files by them.

### A page

Every tab and every part of a file already has a page with a `<PagePlaceholder>` in it. Building a screen means replacing that element.

- Keep the wrapper. A tab's page is `<SectionScreen section="workers" title={tNav("WorkersHeading")}>`: the heading, the tab strip and the lit bar item all follow from the route. Add `actions={<Button asChild variant="add">…</Button>}` for the screen's main button.
- A page below a list (a new record, one record, a part of a file) is `<DetailScreen section=… title=… back={{ href, label }}>`. It has a back action and no tab strip.
- Read data with `useQuery({ queryKey: pathKey("/dashboard/workers"), queryFn })`; a second query on the same screen uses `[...pathKey("/dashboard/workers"), "name"]`. Nothing refetches by itself: a service ends with `revalidatePath("/dashboard/workers")` and that is what refreshes the screen.
- Match the academy's newer generation: `SectionScreen`, `DetailScreen`, `ScreenHeader`, `ScreenTabs`, `StatCard`, `StatusChip`, and `DataTable` with `TableSearch` and `TablePager` (`src/components/data-table-shell.tsx`). Name the closest academy screen in a comment at the top of the page. The academy's own pages are not in this repository: read them in the reference, and look at `.harness/baseline/`.
- Arabic is the default and reads right to left. Use logical classes (`ps-`, `pe-`, `ms-`, `me-`, `start-`, `end-`, `text-start`), never `left`/`right`. Compare an Arabic screen with `.harness/baseline/ar-direction-fixed/`: this program mounts the direction provider the academy forgot, so tab strips and everything inside tabs mirror here.
- Put a phone number, a date or time written in digits, a number with its unit, a registration number or a code inside `<Ltr>` (`src/components/ltr.tsx`), on screen and on paper. Without it Arabic shows `0661 20 31 42` as `42 31 20 0661`.
- Colours come from tokens (`text-success`, `bg-section-workers/10`, `SECTION_ACCENT`), never from the raw palette (`text-green-600`). A chart goes through `ChartContainer`. Confirm with `useConfirm()`, never `confirm()`.
- Native date fields and file buttons stay as the academy has them.

### A route

Add it to your own list: `{ path: "workers/:id", element: <WorkerPage /> }`. The path is relative to `/dashboard`, is written as a plain string, and its first segment must be one of yours. `src/navigation/routes.test.ts` fails otherwise. A new tab or section is a change to `src/navigation/sections.ts`: ask Foundation.

A file's pages are `files/:id/<part>`. The list of parts is `src/navigation/file-parts.ts`; the hub page links to every part from it, so the three owners never edit each other's files.

### A service and a validator

**Wait for the data model before writing services.** Today the database has two provisional tables (`User`, `Setting`). The data model arrives with the tables, the generated types and the way a service is written so that a test can run it against a real database. What will not change:

- A service is a plain async function in `src/features/<folder>/services/`. It returns data, or `{ success: true }` / `{ success: false, error: "An English sentence." }`, and ends a write with `revalidatePath()`.
- A validator is a zod schema in `src/features/<folder>/validators/`, with its codes as `as const` arrays and its messages as English sentences.
- Every English sentence a service or a validator can produce must be a value under `Errors` in your `messages/en.json`, with its Arabic and French. `useErrorMessage()` finds the translation by the English sentence; `src/i18n/errors.test.ts` fails on a sentence with no entry.
- The database stores codes (`"FULL_DAY"`), never labels. Label them in your messages, show them with `useCodeLabel("Namespace")`, and list the pair in your `code-labels.ts` so the test can check all three languages.
- You do not write migrations or edit `src/lib/db/`. Ask for the table, column or code.

### A message

Write the key in your folder's `en.json`, then the same key in `ar.json` and `fr.json`. English is the reference the tests compare against; Arabic is what the centre reads, in the client's own words (scope sections 2, 7 and 9). Use namespaces of your own (`Workers`, `WorkerForm`). `Errors` is the one namespace every folder adds to. No key may be defined by two folders, and `Nav` (bar, tabs, headings, parts of a file) is Foundation's. `src/i18n/messages.test.ts` checks each folder: same keys in three languages, same `{arguments}`, nothing empty.

### A file the user attaches

Name the kind of record and the kind of file in your `uploads.ts`, save with `saveManagedUpload()` (`src/server/uploads.ts`), put `<MediaUploadField>` in the form. An image is shown in the page with `useUploadSrc()`. A PDF is not opened: the user saves a copy with the field's button (`saveUploadCopy()`), because nothing in this program leaves its window.

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

### The database, for now

- **Provisional.** `src-tauri/migrations/0001_init.sql` and `0002_seed.sql` hold only what the shell reads. The data model replaces them.
- **Until the first installer leaves the developer's machine, migrations may be rewritten and every development database is disposable.** sqlx remembers a checksum of each migration it applied, so after a migration is edited an old development database stops the program at start; delete the file (`~/.local/share/com.hamawebdev.inmaa-pro/inmaa.db` on Linux) and start again. After the first installer is delivered, migrations are forward-only: a new numbered file, never an edit.
- The harness builds a fresh database for every run, so screenshots are never affected.
- SQL is proven on the engine that ships by a Rust test (`cargo test --lib`, `migrations_apply_on_the_shipped_engine`). Node's SQLite, which the JavaScript tests and the harness use, is a newer release.

### Still the academy's, and provisional

- No sign-in and no roles: `src/server/tenant.ts` returns one constant user, and the academy's manager password and section lock are what protect a section.
- The home screen and three of the four Settings tabs are placeholders.
- Licence: a 7-day trial that counts real time, on this machine too. In a debug build, `INMAA_LICENSE_RESET=1` starts it again. The developer makes an unlock code with `cargo run --quiet --bin unlock-code -- <DEVICE-ID>` in `src-tauri/`.
