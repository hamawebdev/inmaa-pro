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

Foundation maintains this section once the shell has landed. Until then, see `docs/reference-notes/`.
