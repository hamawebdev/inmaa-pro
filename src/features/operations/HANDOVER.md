# Operations: handover

Owner of features 7–18, 27, 36, 46: scheduling and workload, absence and replacement, the day board, mission
orders, attendance, task lists, problem reports, sign-off and rating, supervisor inspections, complaints. No
worker phone: a phone feature is a printed office form typed in afterwards. Read `CLAUDE.md`, `docs/scope.md`,
`docs/data-model/CONTRACTS.md` (sections 2–4: my tables, my exports, the events) before changing anything.

## What exists (rounds 0 to 2)

| Where                                       | What                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `validators/`                               | `option-codes.ts` (my lists; shared ones re-exported from `@/lib/options`), `returned-order.ts`, `file-task.ts`                                                                                                                                                                                                                                                                                                   |
| `rules/`                                    | pure functions with tests: calendar, visit dates, visit tasks, working time, replacement ranking, arrival flag, inspection score, complaint counter                                                                                                                                                                                                                                                               |
| `catalog/`                                  | the task catalogue per division, the inspection criteria                                                                                                                                                                                                                                                                                                                                                          |
| `events.ts`                                 | `file.contracted`, `file.ended`, `file.termsChanged`, `file.renewed`, `site.changed`, `staff.unavailable`, `visit.signedOff` (complaint from «غير راضٍ»; closes a finished on-demand job through Clients' `closeFile` unless an extra visit is still proposed)                                                                                                                                                    |
| `services/upstream.ts`                      | People's `listSchedulableWorkers` / `getStaffSummary` (as `readWorkers`, `staffSummaries`); stand-ins `readFileForScheduling`, `readSiteForOrder` until Clients exports `getFileForScheduling`, `getSiteForOrder`                                                                                                                                                                                                 |
| `services/programme.ts`                     | `generateFileVisits`, `generateVisits`, `previewVisitGeneration`, `cancelFutureVisits`, `ensureProgramme`                                                                                                                                                                                                                                                                                                         |
| `services/programme-changes.ts`             | `updateFutureVisits` (+ preview), `copyFileSetup`, `markFormChanged`                                                                                                                                                                                                                                                                                                                                              |
| `services/staff-changes.ts`                 | `applySiteChange`, `applyStaffUnavailable`                                                                                                                                                                                                                                                                                                                                                                        |
| `services/tasks.ts`, `file-tasks.ts`        | a visit's tick lines (computed, then frozen at first print or first typing); the file's tasks and places editor                                                                                                                                                                                                                                                                                                   |
| `services/board.ts`                         | `listDayBoard`, `listFileVisits`                                                                                                                                                                                                                                                                                                                                                                                  |
| `services/mission-order.ts`                 | `getMissionOrder` (hand-outs from Money's `getHandOutsForVisit`), `recordOrderPrinted`                                                                                                                                                                                                                                                                                                                            |
| `services/visit-entry.ts`                   | `getVisitEntry`, `saveReturnedOrder`, `reportArrival`                                                                                                                                                                                                                                                                                                                                                             |
| `services/assignment.ts`                    | `listSeatCandidates`, `assignVisitWorker`, `removeVisitWorker`, `confirmVisit`, `settleVisitTeam`, the shared rule helpers (`judgeSeat`, `writeOverrides`…)                                                                                                                                                                                                                                                       |
| `services/absences.ts`                      | `recordWorkerAbsence`, `decideWorkerLeave`, `cancelWorkerAbsence`, `setAbsencePayTreatment`, `listWorkerAbsences`, `suggestReplacements`, `replaceSeat`                                                                                                                                                                                                                                                           |
| `services/week-programme.ts`                | `getWeekProgramme`, `moveVisit`                                                                                                                                                                                                                                                                                                                                                                                   |
| `services/worker-attendance.ts`             | `listAttendanceOverview`, `listWorkerAttendanceHistory`                                                                                                                                                                                                                                                                                                                                                           |
| `services/complaints.ts`, `extra-visits.ts` | `openComplaint`, `openComplaintFromSignoff`, `recordFirstResponse`, `getComplaintCounter`; `listExtraVisitProposals`, `planExtraVisit`, `onDemandJobFinished`                                                                                                                                                                                                                                                     |
| `services/supervisors.ts`                   | `assignZoneSupervisor` (ends the one before, re-stamps the zone's visits to come)                                                                                                                                                                                                                                                                                                                                 |
| `services/day-sheets.ts`                    | `getSupervisorDaySheet`, `getCallList`, `recordDaySheetPrinted`                                                                                                                                                                                                                                                                                                                                                   |
| `sheets/`                                   | mission order, inspection sheet, supervisor day sheet, call list, set in the bundled Naskh; `samples.ts` feeds the blank sheets and tests                                                                                                                                                                                                                                                                         |
| `components/`                               | `day-board/`, `visit-entry/` (returned order form), `visit-team/` (team card, seat picker, replacement dialog), chips                                                                                                                                                                                                                                                                                             |
| `demo.ts`                                   | zone supervisors, teams, two orders returned and signed off, today's first order printed and arrived. Names: `supervisor`, `fileWithVisits`, `visitReturned`, `visitReturnedWithNotes`, `visitInProgress`, `visitToday`, `visitTomorrow`                                                                                                                                                                          |
| pages                                       | `visits/` (board), `visits/[id]` (team card + returned order), `visits/[id]/print`, `visits/calls/[date]/print`, `supervisors/[id]/day/[date]/print`, `files/[id]/visits`, `files/[id]/tasks`, `work-program/` (weekly calendar, drag to move), `worker-attendance/` (records, absences, record an absence); `quality/` and `supervisors/` are still placeholders; `quality/inspections/[id]/print` is blank-only |

Blank sheets: `visits/blank-<division>/print`, `visits/calls/blank/print`, `supervisors/blank/day/<date>/print`,
`quality/inspections/blank-<division>/print`.

## Conventions I follow

- Services `(ex, ctx, input)`, each tested on `createTestDatabase()`; `action`/`query` wrappers at the foot of the
  file. A save sends only changed columns. Refusals are English sentences under `Errors` in three languages.
  Handlers never throw for what the user cannot fix (no dates → no visits and a warning).
- Never nest `test.transact` (or any transaction) inside another: one connection, it waits for ever.
- Messages are merged with a script, never by hand, when several people write at once (same keys in three files).
- A visit is keyed by its slot and `slotDate`; generation only adds what is missing. Numbers are per calendar
  year of the visit's date. A moved visit keeps its `slotDate` and gets `isManuallyEdited`.
- Status rule (`settleVisitTeam`): a contract visit with every seat filled is «مؤكدة»; a seat opening returns it
  to «بانتظار التأكيد»; an on-demand visit waits for `confirmVisit`. A team or time change after the order was
  printed sets `planChangedAt`.
- Working-time rules: REFUSED refuses; NEEDS_MANAGER needs `schedule.overrideRule` and a typed reason
  (`RuleOverride` row, OVERRIDE log), night work by a woman also the inspector's derogation reference.
- The log: one entry per user action; a corrected typed time needs `visit.correctTimes` and a reason; printing an
  order, a day sheet or a call list is a DISCLOSE recorded through `<PrintButton onPrint>` before the dialog.
- Read-only users (`useSectionLevel("REQUESTS") !== "WRITE"`) see no write button; every write is refused by its
  service too.
- Screens: a tab page is headed with its tab's name (`tNav("Visits")`); Save is `variant="success"` at the default
  size inside `PageActions`, Cancel `outline`; a table fits its box at 1440×900 and 1024×640 in the three
  languages, one line per cell (cap and `truncate`), row buttons icon-only below `2xl`. `<Ltr>` for numbers and
  times, `<bdi>` for typed names, dates through `intlLocaleFor(locale)`, no «» in Arabic text of mine.
- Sheets: the print kit only, nothing over his letterhead or footer; check each page PNG
  (`npm run pdf -- --demo --route "/dashboard/visits/{operations.visitReturned}/print" --png`). A dialog is shot
  with `--before "<js that clicks and waits>"`.

## Rulings I was given

- Round 0: the site's work profile is Clients' office block on `Site`; `WorkerAbsence` is mine, People books
  through my exports; the vehicle register is mine.
- Round 0b / 1: «لا» before «نعم» on the problem question; partial completion still records the visit done; the
  weaker presence proof; past visits of a late contract show as not returned; «مؤكدة» only with every seat
  filled; future ON_DEMAND visits are cancelled too when a file ends; a no-show becomes an absence for People to
  treat; «لم تكتمل» makes the visit «مشكلة»; a changed plan is a replacement notice on the call list.
- Checker's audit (docs/checker/screens.md): the rules under "Screens" above; the heading row's `actions` slot
  keeps the print action.

## Round 3 status (in progress)

Done: visit lifecycle (`services/visit-status.ts`: postpone with make-up visit, cancel, reopen; menu on the visit
page), extra-visit proposals with dismissal (`dismissExtraVisitProposal`, card on File › الزيارات), «تحديث
الزيارات القادمة» dialog (update calls Money's `syncDues`), generation leaves suspended or departed members' seats
open, names surname first (`staffName`), phones grouped (`phoneText`), S-03 (counts in the visits tab's heading
row; 3.8 rows in view at 1024×640, the academy's attendance list 3.7), the 30 inspection criteria seeded
(`seeds.ts`), `alerts.ts` (eight tiles), `home.tsx` (`homeSlots`), the visits tab's lists `?list=not-returned` and
`?list=awaiting`, the quality services (`inspections.ts`, `corrective-tasks.ts`, `complaints.ts`,
`problem-reports.ts`, `ratings.ts`), the demo (inspections, complaints, a proposal waiting, a postponed visit, a
seat short today). Helpers at work: the quality screens (inspections and corrective; complaints, problems and
ratings) and the Checker's S-18 to S-21. Left: الموظفون › المشرفون (only `assignZoneSupervisor` exists), the
day-start job (`markMissedInspections`, `planInspections`), final shots and checks.

## Open items

- Round 3 (next): quality screens (supervisor inspections with the sheet printed from a stored inspection,
  complaints with the counter, ratings), supervisors and zones (screen on `assignZoneSupervisor`, worker's own
  supervisor), alert tiles in `alerts.ts` (no arrival reported, orders not returned, complaints past their
  target), `homeSlots` in `home.tsx` (today's tiles three to a row:
  `grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3 tall:gap-6`).
- No screen yet for: extra-visit proposals (`listExtraVisitProposals`, `planExtraVisit`), «تحديث الزيارات
  القادمة» (`updateFutureVisits` with its preview) on File › الزيارات, postponing or cancelling one visit.
- Visits an update adds are announced by no event: Money's dues for a per-visit file follow only the cancelled
  ones (`visit.statusChanged`). Needs a ruling: call Money's `syncDues`, or a new event.
- `generateFileVisits` seats the standing team without reading sanctions (People's list now carries them).
- `programme-changes.ts` and `staff-changes.ts` repeat a few private helpers of `programme.ts`; the complaint
  code lists live in `complaints.ts` and belong in `option-codes.ts`.
- In Naskh the blank mission order is three pages (the third is the tear-off slip alone); a filled one is two.
- The day board shows three visits at 1024×640 (the academy's attendance list shows four: it has one row of
  controls fewer).
- Clients' `getFileForScheduling` and `getSiteForOrder` are not exported yet (`upstream.ts`).
