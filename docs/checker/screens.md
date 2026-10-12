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

## Differences

Kind: **defect** (differs from the academy, to fix), **question** (needs a ruling). Seen: time, language and size of the shot that shows it best.

| ID | Screen | What differs | Kind | Owner | Seen |
|---|---|---|---|---|---|
| S-01 | Day board `/dashboard/visits` | Rows are 182 px high (academy: 81). «الخدمة» and «العمال» are so narrow that their text wraps onto four or five lines, while «الحالة» keeps a wide empty column. In French the rows reach 273 px. | defect | Operations | 22:04, ar and fr, 1440×900 |
| S-02 | Day board `/dashboard/visits` | The table is wider than its box and scrolls sideways: by 57 px in Arabic and 183 px in French at 1024×640, by 76 px in French at 1440×900; the row buttons are cut off. The academy's attendance table fits at both sizes. | defect | Operations | 22:05, ar and fr, 1024×640 |
| S-03 | Day board `/dashboard/visits` | At 1024×640 four rows stand above the table (day switch, counts, search, scroll arrows) and less than one visit is in view; the academy's attendance overview shows four rows at that size. | defect | Operations | 22:05, ar, 1024×640 |
| S-04 | Visit page `/dashboard/visits/:id` | The form's foot buttons are size `lg`, `outline` and `success`; the academy's form foot is the default size, `outline` and `default`. | question (see S-12) | Operations | 22:05, all modes |
| S-05 | Visit page, mission order page | The record's print action stands in the heading row, `info`, default size. On the academy's record pages the record's action («طباعة بطاقة QR») is on the strip under the heading, `outline`, small. | question | Operations | 22:05 |
| S-06 | A file's visits `/dashboard/files/:id/visits` | In French at 1024×640 the table is 44 px wider than its box. | defect, minor | Operations | 22:09, fr, 1024×640 |
| S-07 | Workers list `/dashboard/workers` | In French the rows wrap (92 to 103 px at 1440×900) and at 1024×640 the table is 104 px wider than its box. Arabic fits. | defect, minor | People | 21:56, fr |
| S-08 | Worker's file, employee's file | The record's actions («طباعة الاستمارة», `info`) and the form's way out («غادر») stand in the heading row. The academy's employee file has its action on the strip under the heading and «إلغاء» at the foot beside Save. | question | People | 21:57 |
| S-09 | Worker's file, employee's file | Save is `success`; People's own new pages and the academy's employee file use `default`. | question (see S-12) | People | 21:57 |
| S-10 | Registration `/dashboard/workers/new` | The first card (number, sex, date) has no title; every card of the academy's form has one. | defect, minor | People | 21:59 |
| S-11 | Suspended and penalised `/dashboard/workers/sanctions` | A woman (8/F) is written «عامل(ة) نظافة»; the workers list writes «عاملة نظافة» (`workerRoleAr(role, sex)`). The page is cards where the academy screen it names is a table: content, not counted. | defect, wording | People | 20:52, ar |
| S-12 | Every form | Three treatments of Save: `default` (People's new pages, as the academy's forms), `success` (People's files), `success` and `lg` (Operations' visit page). The academy's button notes give `success` to "save, confirm, finish" and its own forms use `default`. One rule is needed. | question | Foundation | 21:55 to 22:06 |
| S-13 | Every tab page | The heading is the section's name on all its tabs («طلبات الخدمة» on «الزيارات», «عمال وعاملات النظافة» on «العمال»); the academy heads each tab page with the view's own name («حضور الموظفين»). The lit tab is what tells the views apart here. | question | Foundation | 20:49 |
| S-14 | Tab pages and detail pages | The line under the heading: the academy has one on its tab pages and none on its record pages; here the tab pages (workers, employees, visits, a file's visits) have none and the record pages have one. It is hidden on both window sizes shot and shows only on a taller window. | defect, minor | People, Operations | 21:55 |

`docs/checker-table.md` carries one more: W-010 on the registration screen (the residence is one list of the 29 communes of أم البواقي, where his form has two blanks, commune and wilaya).

## Not compared yet

`/dashboard/home` (the day board there is Operations' part on Foundation's page), hiring, hours and pay, the two attendance screens, the work programme, quality, supervisors, and everything of Clients and of Money and stock: their rounds are not finished.
