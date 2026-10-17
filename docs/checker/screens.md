# Screens against the academy

Kept by the Checker. One row per difference found between a screen of this program and the academy screen its page names. Rows are closed by their owner and checked again here.

## What was compared, and when

Shot on 2026-10-12 with the harness, this program on the demo data (`--demo`, signed in as the manager) and the academy's scratch copy on its demo seed with the direction provider mounted (the state of `.harness/baseline/ar-direction-fixed/`). First pass 20:48 to 20:57 (1440×900: Arabic light, Arabic dark, French light), second pass 21:55 to 22:11 (the same, and 1024×640 in Arabic and French). The screens were still being edited: a row describes what was on disk at its time.

| Screen | Route | Academy screen it names | Academy route shot |
|---|---|---|---|
| Workers list | `/dashboard/workers` | employees list; table of the attendance overview | `/dashboard/employees`, `/dashboard/employee-attendance` |
| Worker's file | `/dashboard/workers/:id` | employee file, teacher file | `/dashboard/employees/emp-01`, `/dashboard/teachers/tch-01` |
| Registration | `/dashboard/workers/new` | new employee | `/dashboard/employees/new` |
| Suspended and penalised | `/dashboard/workers/sanctions` | absences detail of the attendance family | `/dashboard/employee-absences`, `/dashboard/employee-absences/emp-02` |
| Employees list, new, file | `/dashboard/employees`, `/new`, `/:id` | employees list, new employee, employee file | as above |
| Day board | `/dashboard/visits` | attendance overview | `/dashboard/employee-attendance` |
| Visit page | `/dashboard/visits/:id` | group page; new employee form | `/dashboard/groups/grp-01`, `/dashboard/employees/new` |
| Mission order to print | `/dashboard/visits/:id/print` | a card route (print button above what prints) | none shot |
| A file's visits | `/dashboard/files/:id/visits` | attendance overview | `/dashboard/employee-attendance` |

Measured on every shot (computed styles read from the page): the page box and its padding, the heading and its plate, the back action, the tab strip, buttons with their variant and size, tables (head, cell, row height, sideways overflow), chips, cards, inputs, the type sizes in use, direction, language and theme.

## What matches

On the eleven routes of the second pass (every screen above but the suspended and penalised, seen at 1440×900 only), at both sizes, in light and dark, in Arabic and French:

- the wrapper (`SectionScreen` on a tab, `DetailScreen` with its back action below a list), the page box and its padding;
- the heading (37.8 px at 1440×900, 30 px at 1024×640, as the academy's) in the section's hue, and the 71 px plate with the hue at 15% and its border at 35%; workers 55, employees 300, requests 250, each with its dark value;
- the tab strip, mirrored in Arabic as in `ar-direction-fixed`;
- tables on the newer generation's shell: head 17.64 px bold, cells 20.16 px, rows 81 px (72 px on the small window), search field 56 px high;
- `StatusChip` at 17.64 px and 30 px high; cards with a 21.6 px radius and 25.2 px titles; inputs and lists 56 px high;
- page and surface colours, identical token for token to the academy's in light and in dark;
- `dir` and `lang` (`rtl`/`ar`, `ltr`/`fr`), with French headings on every route and French labels on the shots looked at (the day board and the workers list).

Intended differences, not listed below: the lists follow the academy's newer table and chips where its own employees list is of the older generation (rule 2); native date fields and file buttons are left as the academy has them (CLAUDE.md), so «Choose File» and `mm/dd/yyyy` show in an Arabic window there too.

## Rulings

The coordinator's, of 2026-10-12, after checking the reference for each. Part 2 audits against them.

- **R1, Save** (S-04, S-09, S-12). `variant="success"`, default size, at the form's foot inside `PageActions`, with Cancel `outline` beside it; never `lg`. The academy's `button.tsx` gives `success` to "Commit: save, confirm, finish" and its settings and attendance family use it; its older forms use `default`, and rule 2 says the newer generation.
- **R2, headings** (S-13). A tab page is headed with its own view's name, the tab's label, as in the academy. The first tab of a section keeps the section heading of his notes.
- **R3, actions** (S-05, S-08). The heading row's `actions` slot is the academy's own (`ScreenHeader`: "buttons that belong to the screen as a whole"; its student overview uses it on a `DetailScreen`), so a record's print action stays there, `info`. A form's Cancel goes to the foot beside Save.
- **R4.** S-14 stays a defect; People, Operations and Foundation are each looking at where the line comes from.

## Differences

Kind: **defect** (differs from the academy or from a ruling, to fix), **question** (needs a ruling), **intended** (a ruling covers it; kept for the record). Seen: time, language and size of the shot that shows it best.

| ID | Screen | What differs | Kind | Owner | Seen |
|---|---|---|---|---|---|
| S-01 | Day board `/dashboard/visits` | Rows are 182 px high (academy: 81). «الخدمة» and «العمال» are so narrow that their text wraps onto four or five lines, while «الحالة» keeps a wide empty column. In French the rows reach 273 px. | **closed 2026-10-13 18:04: rows 87 to 88 px at 1440×900 and 71 to 72 px at 1024×640, one line per cell with the long ones cut by an ellipsis, in Arabic and French** | Operations | 22:04, ar and fr, 1440×900 |
| S-02 | Day board `/dashboard/visits` | The table is wider than its box and scrolls sideways: by 57 px in Arabic and 183 px in French at 1024×640, by 76 px in French at 1440×900; the row buttons are cut off. The academy's attendance table fits at both sizes. | **closed 2026-10-13 18:04: the table fits its box at both sizes in Arabic and French (no scroll arrows)** | Operations | 22:05, ar and fr, 1024×640 |
| S-03 | Day board `/dashboard/visits` | At 1024×640 four rows stand above the table (day switch, counts, search, scroll arrows) and less than one visit is in view; the academy's attendance overview shows four rows at that size. **closed 2026-10-17 03:00: at 1024×640 the counts stand in the heading row and the day's three visits are all in view, with room below** | closed | Operations | 22:05, ar, 1024×640 |
| S-04 | Visit page `/dashboard/visits/:id` | The form's foot buttons, in `PageActions`, are size `lg`. By R1 they are the default size; `outline` for Cancel and `success` for Save are right (`visit-entry-form.tsx`). | **closed 2026-10-13 18:09: the foot of the visit page is `outline` and `success` at the default size, in `PageActions`** | Operations | 22:05, all modes |
| S-05 | Visit page, mission order page | The record's print action stands in the heading row, `info`, default size. On the academy's record pages the record's action («طباعة بطاقة QR») is on the strip under the heading, `outline`, small. | intended (R3) | Operations | 22:05 |
| S-06 | A file's visits `/dashboard/files/:id/visits` | In French at 1024×640 the table is 44 px wider than its box. | **closed 2026-10-13 18:08: a file's visits fit at 1024×640 in French** | Operations | 22:09, fr, 1024×640 |
| S-07 | Workers list `/dashboard/workers` | In French the rows wrap (92 to 103 px at 1440×900) and at 1024×640 the table is 104 px wider than its box. Arabic fits. **Still open 2026-10-17 03:00: in French the rows still wrap to 103 px at 1440×900, and at 1024×640 the table is still wider than its box.** | defect, minor | People | 21:56, fr |
| S-08 | Worker's file, employee's file | The record's actions stand in the heading row: «طباعة الاستمارة» (`info`) and «غادر», which records that the person has left (the Checker first took it for the form's way out). By R3 they stay there. What remains: the file's form has no Cancel at its foot; Save stands alone (`worker-form.tsx`, `employee-form.tsx` show Cancel on the new page only). **closed 2026-10-17 03:00: the worker's file ends with Save (`success`) and Cancel (`outline`) in `PageActions`** | closed | People | 21:57 |
| S-09 | Registration, new employee, and both files | Save is `default` on the two new pages and `success` on the two files, and the foot is a plain row, not `PageActions`. By R1: `success` on all four, in `PageActions`. **closed 2026-10-17 03:00: registration, the new employee and both files save with `success` beside Cancel, in `PageActions`** | closed | People | 21:57 |
| S-10 | Registration `/dashboard/workers/new` | The first card (number, sex, date) has no title; every card of the academy's form has one. | **closed 2026-10-14 08:09: the first card is titled «التسجيل»** | People | 21:59 |
| S-11 | Suspended and penalised `/dashboard/workers/sanctions` | A woman (8/F) is written «عامل(ة) نظافة»; the workers list writes «عاملة نظافة» (`workerRoleAr(role, sex)`). The page is cards where the academy screen it names is a table: content, not counted. **closed 2026-10-17 03:00: a woman is written «عاملة نظافة» (8/F)** | closed | People | 20:52, ar |
| S-12 | Every form | Three treatments of Save: `default` (People's new pages, as the academy's forms), `success` (People's files), `success` and `lg` (Operations' visit page). The academy's button notes give `success` to "save, confirm, finish" and its own forms use `default`. Ruled: R1. What is left to change is in S-04 and S-09. **ruled by the coordinator: Save is `success`, default size, in `PageActions`; closed 2026-10-17 03:00 with S-08 and S-09 (Operations' S-04 was closed before)** | closed | Foundation | 21:55 to 22:06 |
| S-13 | Every tab page | The heading is the section's name on all its tabs («طلبات الخدمة» on «الزيارات», «عمال وعاملات النظافة» on «العمال»); the academy heads each tab page with the view's own name («حضور الموظفين»). By R2 a tab that is not its section's first is headed with its own label: of the screens audited, the day board («الزيارات», second tab of «طلبات الخدمة») must change; the workers and employees lists are first tabs and keep their headings. Every other tab page is checked against R2 in part 2. | **closed for Operations 2026-10-13 18:04: the day board is headed «الزيارات» («Visites»); the work programme and attendance are headed with their own tabs' labels** **closed for every owner 2026-10-17 03:00: each tab page seen since is headed with its own tab's label, and each section's first tab keeps the section heading (People's hiring, attendance and programme; Money's income, invoices, payments, reports, purchases, hand-outs, maintenance; Clients' clients; the stock's first tab)** | Operations for the day board; each page's owner, with Foundation's `Nav` labels | 20:49 |
| S-14 | Tab pages and detail pages | The line under the heading: the academy has one on its tab pages and none on its record pages; here the tab pages (workers, employees, visits, a file's visits) have none and the record pages have one. It is hidden on both window sizes shot and shows only on a taller window. **closed 2026-10-17 03:00: the tab pages carry their line (shown on a tall window) and the record pages none** | closed | People, Operations, Foundation | 21:55 |
| S-15 | Home `/dashboard/home` | «اليوم» lays its eight tiles four to a row; the academy's home lays its stat tiles three to a row, as the alert tiles below do here. **ruled by the coordinator: the home tiles stand three to a row; closed 2026-10-17 03:00, «اليوم» three to a row at both sizes** | closed | Foundation (the page), Operations (the slot) | 22:17, ar, 1440×900 |
| S-16 | Home `/dashboard/home` | The day board on the home is the one of `/dashboard/visits`: S-01 to S-03 apply to it. It changed during the shots: rows 182 px at 22:17; from 22:18 rows 88 px, with the table 129 px wider than its box at 1440×900 and 3 px at 1024×640. To be shot again once Operations has closed S-01 and S-02. | **closed 2026-10-13 18:06: the home's day board fits at both sizes** | Operations | 22:17 to 22:18 |
| S-17 | Sign-in window | With the demo's seven accounts the list is longer than the window: the page is 1047 px in a 900 px window and 837 px in a 640 px one, where about three names show, and nothing says it goes on. The academy's lock window fits (653 px at 640). **ruled by the coordinator: the sign-in list scrolls inside its box; closed 2026-10-17 03:00, the seven accounts in a framed list that scrolls, the page within the window at 640** | closed | Foundation | 22:19, ar and fr, both sizes |
| S-18 | Attendance `/dashboard/worker-attendance`, «تسجيلات الحضور» | The table is wider than its box (scroll arrows) at 1024×640 in Arabic and French and at 1440×900 in French, where its rows are 117 px high. The academy's attendance table fits at both sizes. **closed 2026-10-17 03:00: the attendance table fits in Arabic and French at both sizes, rows 82 and 71 px** | closed | Operations | 2026-10-13 18:14 |
| S-19 | Attendance, 1024×640 | Two tab strips, the day switch, the counts, the search and the scroll arrows stand above the table: no worker's row is in view. The academy's attendance overview shows four. **closed 2026-10-17 03:00: at 1024×640 three workers stand in view and a fourth begins** | closed | Operations | 2026-10-13 18:14 |
| S-20 | Work programme `/dashboard/work-program` | Where visits overlap in one day, their blocks share the day's column and are cut so narrow that nothing in them can be read («…0», «…3», Wednesday 14 October). The academy's calendar could not be compared block for block: its demo seed has no rooms, so it shows its empty state. **closed 2026-10-17 03:00: every block shows its time and site, and a crowded day carries its «+n» chip (13 and 14 October)** | closed | Operations | 2026-10-13 18:10 |
| S-21 | File › المهام, «إضافة مهمة» dialog | The dialog commits with `add`; by R1 a dialog's commit is `success`, as the academy's «إضافة غياب» and this program's «تسجيل غياب» and «تعويض عامل». Its catalogue is 1624 px taller than the dialog and its tick boxes are barely visible on the dialog's surface. **closed 2026-10-17 03:00: the dialog commits with `success` and its catalogue scrolls inside it; the faint tick boxes are the academy's own checkbox (the same border tokens), so not a difference** | closed | Operations | 2026-10-13 19:06 |
| S-22 | Pay run `/dashboard/hours-pay/runs/:id` (the employees' September run) | In French at 1024×640 the table is wider than its box (scroll arrows). Arabic fits at both sizes. **closed 2026-10-16 23:37: the pay run fits its box in French at 1024×640** | closed | People | 2026-10-13 23:32 |
| S-23 | «منح تسبيق» and «تصحيح الساعات» dialogs | Both commit with `default`; by the ruling on S-21 committing a dialog is `success`. Both fit the window at both sizes. **closed 2026-10-16 23:38: both dialogs commit with `success`** | closed | People | 2026-10-13 23:26 to 23:29 |
| S-24 | An employee's month `/dashboard/employee-attendance/:id` | Rows are 92 px high at 1440×900 and 84 px at 1024×640, where the academy's are 81 and 71: each day's entry and exit chips carry their own edit and delete buttons. **closed 2026-10-16 23:38: rows 81 and 64 to 71 px** | closed | People | 2026-10-14 08:08 |
| S-25 | Hiring, «المترشحون» `/dashboard/hiring` | The table is wider than its box at 1024×640 in Arabic and French and at 1440×900 in French (scroll arrows), and its rows are 102 px high at 1440×900 where the academy's are 81. **closed 2026-10-16 23:38 to 23:39: rows 81 and 71 px; the table fits in Arabic and French at both sizes** | closed | People | 2026-10-14 14:36 to 14:39 |
| S-26 | Hiring, «المخالفات» `?view=violations` | Rows are 97 px high at 1440×900 and 77 px at 1024×640, where the academy's are 81 and 71. The table fits. **closed 2026-10-16 23:39: rows 81 and 64 to 72 px** | closed | People | 2026-10-14 14:42 |
| S-27 | «برمجة يوم تدريب», «تسجيل مخالفة», «تقييم دوري» dialogs | All three commit with `default`; by the ruling on S-21 committing a dialog is `success`. All three fit the window at both sizes and scroll inside. **closed 2026-10-16 23:39 to 23:40: the three dialogs commit with `success`** | closed | People | 2026-10-14 14:41 to 14:47 |
| S-28 | Reports `/dashboard/reports` | In French at 1024×640 a table of the page is wider than its box (its scroll arrows show), with this month or a year chosen. The known fault is fixed: the result cards show the whole amount and a loss keeps its minus sign («-231.370,00 دج», Arabic and French, 1024×640). **closed 2026-10-17 03:00: the tables fit in French at 1024×640** | closed | Money and stock | 2026-10-16 22:57 |
| S-29 | Clients `/dashboard/clients` | Rows are 87 px high at 1440×900 and 71 at 1024×640, where the academy's students list it names is 82 and 65; in French at 1024×640 the table is wider than its box, where the academy's fits. **closed 2026-10-17 03:00: rows 81 and 71 px, and the table fits in French at 1024×640** | closed | Clients and contracts | 2026-10-16 23:04 to 23:06 |
| S-30 | Files list `/dashboard/files` | At 1024×640 the table is wider than its box in Arabic and in French (its scroll arrows show); rows are 87 px high at 1440×900, where the attendance family it names is 81. **closed 2026-10-17 03:00: rows 81 and 71 px, and the table fits in Arabic and French at 1024×640** | closed | Clients and contracts | 2026-10-16 23:36 to 23:37 |
| S-31 | A file's hub `/dashboard/files/:id`, as reception | The hub offers reception every part of the file, among them «الدراسة المالية» (needs `cost.read`), «التسديد» and «التسليم» (sections reception holds no level on): each only opens on a refusal. CLAUDE.md: leave out what the reader could only be refused. The hub filters `FILE_PARTS`, which carries no section or capability per part. **closed 2026-10-17 03:00: reception is offered the form, first visit, quote, contract, tasks, visits and payments (opened by `payment.record`), no longer the financial study, the hand-outs or the residents; `FILE_PARTS` names what opens each part** | closed | Clients and contracts (the hub), with Foundation (`src/navigation/file-parts.ts`) | 2026-10-16 23:45 to 23:46 |
| S-32 | ID card `/dashboard/workers/:id/print-card`, `/dashboard/employees/:id/print-card`, `/dashboard/workers/print-cards?ids=` | The academy's card (`src/components/card-template.tsx`) carries the academy's logo in its header band (`AdminLogoMark`, the initials when no logo is set); ours has only the centre's names in a grey band. The logo belongs on it. The setting `centre.logoUrl` exists without an upload field; his letterhead holds the emblem. Everything else follows scope R9 (the academy's card without its QR, ISO ID-1, eight to a page with cutting marks). **closed 2026-10-17 02:58: the card's band carries the centre's emblem before his name** | closed | People (the card), Foundation (a logo to use) | 2026-10-16 23:36 to 23:41 |

`docs/checker-table.md` carries one more: W-010 on the registration screen (the residence is one list of the 29 communes of أم البواقي, where his form has two blanks, commune and wilaya).

## Operations' round 2 (fourth pass, 2026-10-13 18:04 to 19:08)

Shot on the demo data rebuilt at 18:03, as the manager, in Arabic light, Arabic dark and French light at 1440×900 and in Arabic and French at 1024×640; dialogs opened by a click before the shot. The academy's counterparts on its demo seed with the direction provider mounted. Operations' round 3 was being written during the pass: a row says what was on disk at its time.

| Screen | Route | Academy screen it names | Result |
|---|---|---|---|
| Day board, a file's visits, the home's board | `/dashboard/visits`, `/dashboard/files/:id/visits`, `/dashboard/home` | attendance overview | S-01, S-02, S-06, S-13, S-16 closed; S-03 open |
| Work programme | `/dashboard/work-program` | scheduling calendar (empty on the academy's seed) | Same heading, tab strip, week switch and status chips as the newer generation; S-20 |
| Attendance, both views, «تسجيل غياب» | `/dashboard/worker-attendance`, `?view=absences` | attendance family, «إضافة غياب» | The dialog fits both windows and scrolls inside, `outline` and `success` at the foot (R1); S-18, S-19 |
| File › المهام and «إضافة مهمة» | `/dashboard/files/:id/tasks` | programs list of the classes section | Detail screen, back action, cards and row menus as the academy's; S-21 |
| Team card, «تعويض عامل» | `/dashboard/visits/:id` | group page | Names surname first, `outline` small row buttons, the dialog fits with `outline` and `success`; the picker «إضافة عامل» was not shot: the demo's visits had their teams complete |

## People's round 2 (fifth pass, 2026-10-13 23:21 to 2026-10-14 08:12)

Shot on the demo data as the manager, in Arabic light, Arabic dark and French light at 1440×900 and in Arabic and French at 1024×640; the two dialogs opened by a click. The machine slept between 23:38 and 08:04: the hours-and-pay shots are of the evening, the employee attendance shots of the morning.

| Screen | Route | Academy screen it names | Result |
|---|---|---|---|
| Hours and pay, three views | `/dashboard/hours-pay`, `?view=pay`, `?view=advances` | the attendance family; finance's payouts and debts | Two tab strips, the month switch, `StatCard` tiles and the newer table at the academy's row heights (81 and 71 px); every table fits. Heading «الساعات والأجور», its tab's label (R2) |
| «منح تسبيق», «تصحيح الساعات» | dialogs | «إضافة غياب» | Fit at both sizes; S-23 |
| A worker's month | `/dashboard/hours-pay/workers/:id` | a person's check history | Fits; rows 64 px at 1024×640 |
| A pay run | `/dashboard/hours-pay/runs/:id` | a group's page | Fits but for S-22 |
| A payslip | `/dashboard/hours-pay/payslips/:id` | a payout's page in finance | Fits; heading «كشف الراتب · حداد مراد», surname first |
| A person's ledger | `/dashboard/hours-pay/people/:id` | an employee's debt ledger | Fits in four modes; the French 1024×640 shot did not come back from Chrome (not checked) |
| Employee attendance, three views | `/dashboard/employee-attendance`, `?view=absences`, `?view=leave` | the academy's employee attendance family | Second strip «الحضور · الغيابات · العطل», the newer table at the academy's heights, every table fits |
| An employee's month | `/dashboard/employee-attendance/:id` | check history and absence detail | S-24 |

## People's round 4, Money's round 3, and part 1's leftovers (eighth pass, 2026-10-16 23:36 to 23:49)

Shot as the manager (the hub also as reception) from the Checker's own database built like the demo (`scratchpad/checker/printdb/`), because the shared demo could not be built for a few minutes while `Payment` gained two columns. S-22 to S-27 are closed.

| Screen | Route | Academy screen it names | Result |
|---|---|---|---|
| ID card, one and eight to a page | `/dashboard/workers/:id/print-card`, `/dashboard/employees/:id/print-card`, `/dashboard/workers/print-cards?ids=` | the employee's card (`employees/[id]/card`) | S-32. On paper: one A4 page, nothing over the letterhead, black on white except the grey word «الصورة» in an empty frame (as the academy's muted label), ar = en |
| Document scans | the worker's and the employee's file | employee file | Each document takes its scan, saved restricted to `staff.documents.read` |
| Daily reconciliation, view and day page | `/dashboard/payments?view=reconciliation`, `/dashboard/payments/reconciliation?date=&kind=` | an employee's payouts | Match; Save is `success` |
| Stock counts and one count | `/dashboard/inventory/counts`, `/dashboard/inventory/counts/:id` | attendance days list | Match |
| Reports' exports | `/dashboard/reports` | finance analytics | Four `export` buttons; the file is produced after the save dialog and logged as a disclosure (`src/features/money/services/exports.test.ts`) |
| Profitability on the file hub | `/dashboard/files/:id` | (hub) | Shown to the manager, absent for reception; it needs `cost.read` and logs one consultation a day (`src/features/money/services/profitability.test.ts`) |
| Files list, file hub | `/dashboard/files`, `/dashboard/files/:id` | attendance family; student overview | S-30, S-31; the hub otherwise matches |
| A new purchase | `/dashboard/purchases/new` | new employee | Matches; Save is `success` |

## Money and stock, rounds 1 and 2; Clients, rounds 1 and 2 (seventh pass, 2026-10-16 18:06 to 23:10)

Shot on the demo data as the manager in four modes (Arabic light and dark at 1440×900, Arabic and French light at 1024×640), the dialogs at 1024×640. Shots taken between 18:13 and 18:18 were spoilt by the data disk turning read-only and were taken again from 22:54. The academy's expenses, finance and students lists were shot for their row heights (23:08 and 23:12).

| Screen | Route | Academy screen it names | Result |
|---|---|---|---|
| Expenses, with «تسجيل مصروف» | `/dashboard/expenses`, `?new=1` | finance analytics; expenses | Matches: rows 81 and 64 to 72 px, as the academy's expenses (64 at 1024×640); the dialog fits and commits with `success` |
| Income | `/dashboard/income` | finance analytics | Matches |
| Invoices; issuing one | `/dashboard/invoices`, `/dashboard/invoices/new` | finance analytics; a student's payment | Matches; nothing wider than its box |
| Payments, debts, reconciliation; «تسجيل دفعة» | `/dashboard/payments`, `?view=dues`, `?view=reconciliation` | finance analytics; outstanding debts | Matches; the dialog fits and commits with `success` |
| Reports | `/dashboard/reports` | finance analytics | S-28. The cards' fault is fixed |
| Inventory, «إضافة صنف إلى المخزون» | `/dashboard/inventory`, `?kind=MATERIAL`, `?new=1` | employees list | Matches; the dialog commits with `success` |
| Hand-outs, a new one, the return dialog | `/dashboard/handouts`, `/dashboard/handouts/new` | expenses list; new employee | Matches; Save is `success` in `PageActions`; the return dialog commits with `success` |
| Purchases, maintenance | `/dashboard/purchases`, `/dashboard/maintenance` | expenses list; employees list | Match |
| A file's payments and hand-outs | `/dashboard/files/:id/payments`, `/dashboard/files/:id/handouts` | a student's payments | Match |
| A file's form, first visit, financial study, quote, contract, residents | `/dashboard/files/:id/form` … `/residents` | employee edit; student pages; student payments; group's students | Match. The quote screen now writes its dates in words («12 أكتوبر 2026»): the ISO dates are gone |
| Clients and a client's card | `/dashboard/clients`, `/dashboard/clients/:id` | students list; student overview | S-29 for the list; the card matches (the notice that an organisation needs its RC, NIF and NIS before its first invoice) |
| A new file, with «قديم» | `/dashboard/files/new` | new employee | Matches; «قديم» opens «عميل قديم», which fits at both sizes |

## People's round 3 (sixth pass, 2026-10-14 14:36 to 14:49)

Shot on the demo data as the manager, in the five modes of the earlier passes; the dialogs opened by the heading's `add` button.

| Screen | Route | Academy screen it names | Result |
|---|---|---|---|
| Hiring and training, four views | `/dashboard/hiring`, `?view=training`, `?view=violations`, `?view=evaluations` | the attendance family (second strip, table, an `add` button in the heading) | Heading «التوظيف والتدريب» (R2), the second strip, `add` in the heading; training and evaluations at the academy's row heights and fitting; S-25, S-26. The Arabic dark shot of the candidates did not settle: another owner's page (`supervisors/page.tsx`) failed to load at that moment |
| Its three dialogs | from the heading's `add` | «إضافة غياب» | S-27 |
| The worker's file, lower cards | `/dashboard/workers/:id` | employee file | Documents and recurring pay items in cards; nothing wider than its box |

## The name rule (surname, then first name)

Audited 2026-10-13. Foundation's helper is `staffName` (`src/lib/text/names.ts`).

- **Operations: fixed during the audit.** At 18:04 to 18:09 the day board, the mission order (team and supervisor), the supervisor's day sheet (team, supervisor, team phones) and the call list wrote «رضا حمدي», first name first. By 18:58 every writer in Operations' code used `staffName`, and the order and the day sheet printed at 18:59 write «قاسمي نوال», «حداد مراد». Left: two sample files split a sample's name to build it (`day-board/samples.ts`, `visit-entry/samples.ts`); they write nothing in the wrong order.
- **Foundation: open.** The demo accounts are named first name first («سعاد بن عمر», «مراد حداد», …) where the employee each stands for is «بن عمر سعاد», «حداد مراد». The account's name is what the sign-in window lists, what the log records as the user, and what a receipt prints as cashier when the account has no employee linked (`money/services/payments.ts`).
- **People, Clients, Money and stock: none found.** People uses `staffName` and its sheets `fullName(lastName, firstName)`; Money and Stock write `lastName firstName`; Clients' clients are one name as typed.

## Foundation's screens (third pass, 22:17 to 22:23)

Shot as the manager in Arabic light, Arabic dark and French light at 1440×900, and in Arabic and French at 1024×640; the home also as the accountant, reception and the supervisor, and Settings as the accountant.

| Screen | Route | Academy screen | Result |
|---|---|---|---|
| Home | `/dashboard/home` | its home, `/dashboard/academy` | Same heading, plate, line under the heading, section headings and stat tiles (number at 45.36 px, plate in the hue of the tile's section). Rows S-15 and S-16. By role: the accountant's bar has six items (no «الموظفون», no «الإعدادات») and his alerts leave out the backup tile |
| Sign-in window | the program signed out (`--signed-out`), on the demo data and on a new database | its lock window, `lock.html` with an expired licence | Same box (645 px wide, same padding), lock mark, heading 37.8 px, field 56 px high at 25.2 px, label 20.16 px bold, and the full-width `default` button of size `lg`: the academy's lock window has `lg` there, so R1 does not reach it. Row S-17 |
| Settings › عام | `/dashboard/settings` | its settings, `/dashboard/settings` | Same 1068 px column of cards, each with its own `success` Save at the default size (R1), the same segmented choices for language and theme; the tab strip is this program's. As the accountant the section answers «هذا القسم غير متاح لحسابك». No row |

R2 holds on the three: the home has one view, and «عام» is the first tab of its section.

## Not compared yet

The other three Settings tabs, hiring, hours and pay, the two attendance screens, the work programme, quality, supervisors, and everything of Clients and of Money and stock: their rounds are not finished.
