# Operations: handover

Owner of features 7–18, 27, 36, 46: scheduling and workload, absence and replacement, the day board, mission
orders, attendance, task lists, problem reports, sign-off and rating, supervisor inspections, complaints. No
worker phone: a phone feature is a printed office form typed in afterwards. Read `CLAUDE.md`, `docs/scope.md`,
`docs/data-model/CONTRACTS.md` (sections 2–4: my tables, my exports, the events) before changing anything.

## What exists

| Where                        | What                                                                                                                                                                                                                                                   |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `validators/option-codes.ts` | my own code lists; the shared ones are re-exports of `@/lib/options`                                                                                                                                                                                   |
| `rules/`                     | pure functions with tests: calendar, visit dates, visit tasks, working time, replacement ranking, arrival flag, inspection score, complaint counter                                                                                                    |
| `catalog/`                   | the task catalogue per division and the inspection criteria                                                                                                                                                                                            |
| `events.ts`                  | `file.contracted` → programme row, slots, tasks from «الخدمات المقدمة», every visit; `file.ended` → future visits cancelled, inspections stopped                                                                                                       |
| `services/upstream.ts`       | read-only stand-ins for Clients' `getFileForScheduling`, `getSiteForOrder` and People's `listSchedulableWorkers`, `getStaffSummary`: replace each by the owner's export when it lands                                                                  |
| `services/programme.ts`      | `generateFileVisits` (the engine), `generateVisits`, `previewVisitGeneration`, `cancelFutureVisits`, `ensureProgramme`                                                                                                                                 |
| `services/tasks.ts`          | `seedTasksFromServices`; a visit's tick lines: computed until frozen (`checklistOf`), frozen at first print or first typing (`freezeChecklist`)                                                                                                        |
| `services/board.ts`          | `listDayBoard`, `listFileVisits`                                                                                                                                                                                                                       |
| `services/mission-order.ts`  | `getMissionOrder` (the sheet's data from stored rows; the hand-outs block from Money's `getHandOutsForVisit`), `recordOrderPrinted` (freeze, count, DISCLOSE log)                                                                                      |
| `services/visit-entry.ts`    | `getVisitEntry`, `saveReturnedOrder` (one Save: seats, ticks, report, problems, status, `visit.signedOff`), `reportArrival`                                                                                                                            |
| `services/assignment.ts`     | `listSeatCandidates`, `assignVisitWorker` (working-time rules, manager override → `RuleOverride`), `removeVisitWorker`, `confirmVisit`, `settleVisitTeam`                                                                                              |
| `services/absences.ts`       | `recordWorkerAbsence`, `decideWorkerLeave`, `cancelWorkerAbsence`, `setAbsencePayTreatment`, `listWorkerAbsences` (People's exports), `suggestReplacements`, `replaceSeat`                                                                             |
| `services/day-sheets.ts`     | `getSupervisorDaySheet`, `getCallList`, `nextWorkingDay`, `recordDaySheetPrinted`                                                                                                                                                                      |
| `sheets/`                    | mission order, inspection sheet, supervisor day sheet, call list: pure pictures of plain objects (`sheet-data.ts`), set in the bundled Naskh; `samples.ts` now only feeds the blank sheets and the tests                                               |
| `components/`                | `visit-entry/` (the returned order form), `day-board/` (the board), chips, toggles, notes                                                                                                                                                              |
| `demo.ts`                    | `seedDemo`: teams where workers exist, two orders returned and signed off, today's first order printed and its arrival phoned in. Names: `fileWithVisits`, `visitReturned`, `visitReturnedWithNotes`, `visitInProgress`, `visitToday`, `visitTomorrow` |
| pages                        | `visits/` (board), `visits/[id]` (returned order), `visits/[id]/print`, `visits/calls/[date]/print`, `supervisors/[id]/day/[date]/print`, `files/[id]/visits` (programme and list), `quality/inspections/[id]/print` (blank only)                      |

Blank sheets: `visits/blank-<division>/print`, `visits/calls/blank/print`, `supervisors/blank/day/<date>/print`,
`quality/inspections/blank-<division>/print`.

## Conventions I follow

- Services `(ex, ctx, input)`, each tested on `createTestDatabase()`; screens call the `action`/`query` wrappers
  at the foot of each file. A save sends only changed columns. Refusals are English sentences under `Errors` in
  three languages. Handlers never throw for what the user cannot fix (no dates → no visits and a warning).
- Never nest `test.transact` (or any transaction) inside another: one connection, it waits for ever.
- A visit is keyed by its slot and `slotDate`; generation only adds what is missing. Visit numbers are taken per
  calendar year of the visit's date.
- Status rule (`settleVisitTeam`): a contract visit with every seat filled is «مؤكدة»; a seat opening returns it
  to «بانتظار التأكيد»; an on-demand visit waits for `confirmVisit`. A team change after the order was printed
  sets `planChangedAt`.
- The log: one entry per user action (sign-off and typed times with their changes; a correction of a typed time
  needs the user's reason and `visit.correctTimes`; an override needs `schedule.overrideRule` and a reason;
  printing an order, a day sheet or a call list is a DISCLOSE).
- Values: dates `YYYY-MM-DD`, times `HH:MM`, minutes, ISO instants. Worked minutes: end minus start of work, else
  departure minus arrival, else empty (RULINGS-NEEDED 14). Late minutes: arrival read on the day nearest the
  planned start.
- Every date on screen through `intlLocaleFor(locale)` (`ar-DZ`); sheets print dates as digits.
- `<Ltr>` for numbers, times, codes; `<bdi>` for typed names and addresses. No «» in Arabic text of mine.
- Sheets: the print kit only, nothing over his letterhead or footer; check each page PNG with
  `npm run pdf -- --demo --route "/dashboard/visits/{operations.visitReturned}/print" --png`.
- Printing is recorded from the page on the window's `beforeprint` event (the kit's `PrintButton` has no hook).

## Rulings I was given

- Round 0: the site's work profile is Clients' office block on `Site` (I read it); `WorkerAbsence` is mine and
  People books through my exports; Foundation mounts the board and tiles; the vehicle register is mine.
- Round 0b accepted: «جارية» on the info tone until a seventh chip tone exists; «لا» before «نعم» on the problem
  question; partial completion still records the visit done; the weaker presence proof.
- Round 1 start: shared lists from `@/lib/options` (done); sheets in Naskh (done); demo through
  `seedDemo(ex, ctx, tools)` (done).

## Open items

- Own reaction to `visit.signedOff` is not written: a complaint on «غير راضٍ», the proposal of an extra visit,
  and closing an on-demand file after its last visit (needs Clients' `closeFile`).
- `updateFutureVisits`, `copyFileSetup` (renewal), `site.changed` and `staff.unavailable` handlers: not written.
- No screen yet for: the seat picker and the replacement suggestions (services exist), recording an absence,
  File › المهام (tasks and areas editor), the weekly «برنامج العمل», inspections, complaints.
- A no-show typed on an order is recorded as an absence of category OTHER, via NO_SHOW, for the visit's hours;
  People sets its pay treatment.
- Foundation: seventh `StatusChip` tone; `DayBoard` on the home screen; an `onPrint` hook on `PrintButton`;
  `SHEET_FONT_STAND_IN` exported from the kit's index (I import it from `sheet-constants`).
- In Naskh the mission order runs to three pages for every division: the third is the tear-off slip alone.
