# Operations: handover

Owner of features 7–18, 27, 36, 46: scheduling and workload, absence and replacement, the day board, mission
orders, attendance, task lists, problem reports, sign-off and rating, supervisor inspections, complaints. No
worker phone: a phone feature is a printed office form typed in afterwards. Read `CLAUDE.md`, `docs/scope.md`,
`docs/data-model/CONTRACTS.md` (sections 2–4: my tables, my exports, the events) before changing anything.

## What exists

| Where                          | What                                                                                                                                                                                                                                                                                              |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validators/option-codes.ts`   | every code list I store or show (visit statuses, seats, completions, sign-off, problem kinds, work rules, replacement tiers, presence proofs…)                                                                                                                                                    |
| `rules/`                       | pure functions with tests: calendar (Saturday weeks, weekdays), visit dates, visit tasks, working time (overlap, 12 h span, 48 h week, night for women, rest day, unavailable day, leave), replacement ranking, arrival flag, inspection score, complaint counter                                 |
| `catalog/`                     | the task catalogue per division and the inspection criteria                                                                                                                                                                                                                                       |
| `sheets/`                      | mission order (attendance with the contact's initials, checklist, floor table, worker's notes, tear-off sign-off and rating slip), inspection sheet, supervisor day sheet, client call list. Pure pictures of plain objects (`sheet-data.ts`), printable empty or filled; `samples.ts` fills them |
| `validators/returned-order.ts` | the zod schema of a returned order, `missingForComplete`, the weakest presence proof                                                                                                                                                                                                              |
| `components/visit-entry/`      | the visit page: one pass over the returned sheet, six cards and one Save, rule notes beside their fields                                                                                                                                                                                          |
| `components/day-board/`        | `DayBoard`: the day's visits by status, the "no arrival reported" flag, day switch, search, pager                                                                                                                                                                                                 |
| pages                          | `visits/` (board), `visits/[id]` (visit page), `visits/[id]/print`, `visits/calls/[date]/print`, `quality/inspections/[id]/print`, `supervisors/[id]/day/[date]/print`; the rest are placeholders                                                                                                 |

## Conventions I follow

- Services `(ex, ctx, input)` in `services/`, each with a test on `createTestDatabase()`; screens call the `action`.
  A save sends only changed columns (`changedColumns`). Refusals are English sentences under `Errors` in three
  languages; codes are labelled through `code-labels.ts`.
- Values: dates `YYYY-MM-DD`, times `HH:MM`, durations in whole minutes, instants ISO UTC (ruling, round 0).
- Every date shown on screen goes through `intlLocaleFor(locale)` (`ar-DZ`: «أوت», not «أغسطس»). Sheets print
  dates as digits `dd/mm/yyyy`, never month names.
- Numbers, times, codes in `<Ltr>`; names, addresses and other typed text in `<bdi>` (an Arabic name in a French
  row). No «» in Arabic screen or sheet text: the guillemets print the wrong way round in RTL.
- Sheets: Foundation's print kit only, Arabic, A4, nothing printed over his letterhead or footer (checked on every
  page PNG with `npm run pdf -- --route … --png`). Tune nothing for the fallback sans: Noto Naskh replaces it.
- Screens follow the academy's newer generation (`SectionScreen`, `DetailScreen`, `DataTable`…); compare Arabic
  with `.harness/baseline/ar-direction-fixed/`. Shots with `--now 2026-10-12T10:30:00`.

## Rulings I was given

- Round 0: the site's work profile is the site office block (Clients writes it, I read it; the two scheduling
  switches are mine). `WorkerAbsence` is mine, People books through my exports. Foundation mounts the day board
  and tiles through slots. The vehicle register is mine; worker evaluation is People's.
- Round 0 accepted: sheet style, sign-off wording, signer labels, page counts, rating wording, rule thresholds as
  settings (`work.*`, `complaint.targetMin`, `inspection.threshold`). The site label is `Site.commonName`.
- Round 0b accepted: «جارية» on the info tone until a seventh chip tone exists; «لا» before «نعم» on the problem
  question; partial completion still records the visit done; worked time from start to end of work as `4:25`;
  the weaker presence proof when arrival and departure were initialled on different lines; role labels from
  People's `WorkerForm.Roles` until Foundation's shared option lists carry them.

## Open items

- Seventh `StatusChip` tone, `DayBoard` on the home screen, a project rule for `react-hooks/incompatible-library`
  (one-line disable in `day-board.tsx` until then): Foundation's next round.
- Shared labels for requested-service codes and worker roles: coming in Foundation's shared option lists; then
  drop the use of People's namespace and give the board's service column its label.

## Round 1 (in progress): visits from the database

1. `events.ts`: `file.contracted` → programme row and visits; `file.ended` → cancel future visits.
2. Services with tests: board, mission order data, returned order, assigning workers, absences and replacements.
3. Board, visit page and sheets wired to the services (blank sheets kept).
4. `demo.ts` `seedDemo(ex, ctx)`: visits for the demo files, two returned and signed off.

Status and what is left: see the end of the round's report; this section is updated when the round ends.
