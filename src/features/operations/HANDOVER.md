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

## Round 3 (done, 16 October)

Built: visit lifecycle (`visit-status.ts`), extra-visit proposals and their dismissal, «تحديث الزيارات القادمة»
(calls Money's `syncDues`), names surname first, phones grouped, S-03, the 30 inspection criteria (`seeds.ts`),
`alerts.ts`, `home.tsx`, the quality tab (inspections with the sheet printed from the stored inspection, corrective
tasks, complaints with their page, problem reports, ratings), الموظفون › المشرفون (`supervisors/`), `daily.ts`,
`getWorkerQualityFigures` (`worker-quality.ts`), «تسجيل مخالفة» (`worker-violations.ts`, People's
`createViolationFromSource`), the site's QR (`geo:`) on the order (`feature.siteQrOnOrder`), `listVisitWorkers`
(`visit-workers.ts`, for Money). Screens: S-18/S-19 (counts beside the heading from `xl` only), S-20 (lanes capped by
the column's width, «+n» day list, hours on their own line), S-21 (success commit, search, inner scroll).

Audit (`scratchpad/audit/for-operations.md`): ACC-1 (`getOrderHold`, `releaseSanctionedOrder`, notice on the print
page; `decisionCovers` not exported by People yet, so every order of a sanctioned client needs the release), ACC-2
(`staff.write` for deciding, cancelling, paying a leave), ACC-7, ACC-X1 (programme under WORKERS), ACC-11, ACC-Y1
(typed times locked without `visit.correctTimes`), LAB-2 (generation judges every standing seat, `seatsHeld`), LAB-3
(`seatsDropped` on the update), LAB-4 (rotation: `rotateRestDay` on by default for six visits a week; RESTING seats in
turn; the team card replaces them with REST_ROTATION), LAB-9, LAB-10 (`seatsLeftOpen`), LAB-11 and LAB-X1
(`placedStart`, `edgeSeatsByWorker`, `seatsForRules`), LAB-12, LOG-12, LOG-14 (a removed tick closes its report with
the typed reason; the no-show undone is a CANCEL), LOG-Y1. LOG-X1 and LOG-14's soft delete followed after the round (below).

Import rule: `VISITS_PATH` now lives in `services/paths.ts` (programme.ts re-exports it): `programme.ts` imports
`assignment.ts`, which may not import `programme.ts` back.

## After round 3 (16 October)

- LOG-X1: each future `FileAssignment` erased because a worker left is an ERASE entry with `staff.unavailable`'s
  `reason` (`staff-changes.ts`).
- LOG-14: a tick taken off a re-typed order soft-deletes its report (`deletedAt`, `deletedByUserId`, ERASE with the
  typed reason); every read of `ProblemReport` filters `deletedAt IS NULL`.
- ACC-1: an order prints without a release when People's `decisionCovers` says the file's own yes named the
  client's sanction (`OrderHold.covered`).
- Demo: «مقر شركة النخيل», six visits a week 15:00–17:00, rotation on (`{operations.sixVisitFile}`); its client is
  suspended from today: `{operations.orderReleased}` released, `{operations.orderHeld}` held.

## Open items

- `listVisitsForBilling` is not exported yet; Money reads `Visit`, `VisitReport`, `VisitWorker` itself.
- `getWorkerHours` (CONTRACTS section 3) is not exported; People reads the seats itself.
- `programme-changes.ts` and `staff-changes.ts` repeat a few private helpers of `programme.ts`; the complaint code
  lists live in `complaints.ts` and belong in `option-codes.ts`.
- The programme update judges each seated worker at the new hours against her week as it stands (the other visits
  moved in the same update still at their old hours).
- The office has no switch for `rotateRestDay` yet: it is set at creation (on from six visits a week).
- Clients' `getFileForScheduling` and `getSiteForOrder` exist; `upstream.ts` still uses its own stand-ins except for
  the order's QR.
