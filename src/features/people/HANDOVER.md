# People: handover

Owner of features 21, 25, 37, 38: centre employees, cleaning workers, his worker form, hiring and training, hours, pay, and the suspended-or-penalised check. Paths: `src/features/people/**`, pages `employees/`, `employee-attendance/`, `workers/`, `hiring/`, `hours-pay/`. Updated after the final review (PEO-01 to PEO-13).

## Final review, done

The thirteen findings of `scratchpad/final-review/for-people.md`, each proved by a test named by its id in `services/final-review.test.ts`:

- PEO-01: a run pays only people in post (on trial or accepted), for the days in post, read from the dated STATUS history (`inPostOn`): never a candidate or a refused worker; a worker readmitted is paid from the day she is in post again; a monthly wage is the share of days in post; leave is earned for those days; terms cleared on the file are no terms. A worker who left is still paid her seats of days in post typed late.
- PEO-02: a run takes only its branch's people; the earlier-draft check is per branch.
- PEO-03: `closePayRun` computes the draft again and closes only if nothing moved («compute it again and check it» otherwise). A check, an absence, a leave, or an hours correction dated in a month a closed run of the person's kind and branch paid is refused, payslip or not (`services/closed-days.ts`); cancelling a leave leaves its paid month's part as it was.
- PEO-04: a late seat on a day another run paid is no new day; what it adds past the standard day is counted on the whole day.
- PEO-05: a worker refused (on the hiring screen or on her file) emits `staff.unavailable`, cause LEFT, from the decision's day, reason «قرار الإدارة: رفض المعني النهائي» and the note (`announceRefusal`, `staff-shared.ts`).
- PEO-06: the manager's yes holds only for the identity and the record the question named (`sameAttemptIdentity`, `rules/sanction-match.ts`): same names, birth date, identity number, phones and tax numbers; a client's file may add the numbers its record holds.
- PEO-07: on the printed payslip an absence (or a correction downwards) is a minus in «المستحق»; «المقتطع» is CNAS, IRG, the debts taken back and the deductions (`sheets/payslip-columns.ts`).
- PEO-08: a pay-terms change takes an effective date (the forms ask it once the terms change; today when empty; not before the start, not in a closed month: `payTermsDate`); a run reads, of the rows in force by its month's end, the one written last; a payslip takes a signed correction of its base with its reason («تصحيح الأجر الأساسي: …»).
- PEO-09: the payslip's recurring deductions can be typed for the month (`recurringDeductions`); a negative net is flagged on the payslip.
- PEO-10: «قرار الإدارة» is refused on a refused worker, on the hiring screen and on her file: she comes back by readmission.
- PEO-11: a draft payslip prints «مسودة» across it, a voided one «ملغى», neither with the lines to sign; the payslip prints from any state.
- PEO-12: an ID card prints only for someone on trial or accepted; the list and the file offer it only then.
- PEO-13: what a payslip takes back is printed line by line of the ledger, oldest first: «تسديد التسبيقات», «اقتطاع: مخالفة رقم …», «تعويض ضرر», «تعويض ضياع», «تسديد ديون أخرى» (`outstandingDebts`, `payouts.ts`).

- Money's MON-10 and MON-13 shown where the office decides (`services/worker-equipment.ts`, `workers/_components/worker-equipment.tsx`): the worker's violations block lists the equipment she lost or damaged on its return and the charge's state, its amount to pay readers only (`getEquipmentIncidents`); the leaving dialog lists the equipment and the blocks of receipts she still holds (`getWorkerHoldings`).

## Round 4, done

- **ID cards (scope R9):** `services/cards.ts` (`staffCardsForPrint`, `recordCardPrint`, one DISCLOSE line per card), `sheets/id-cards.tsx` (ISO ID-1, 85.6 × 54 mm, eight to an A4 page with cutting marks; photo or the empty frame, name surname first, number, role in his words, the centre), `components/staff-cards-screen.tsx`. Pages: `workers/:id/print-card`, `employees/:id/print-card`, and `workers/print-cards?ids=` for the workers chosen in the list. A person who left gets no card.
- **One file per document:** `setStaffDocumentFile` in `services/documents.ts`; the worker's documents card attaches, copies and removes each scan, stored and opened restricted under `DOCUMENT_FILE_CAPABILITY`, which is `staff.documents.read`. The worker's file reads `fileUrl` per document.
- **The Checker's S-22 to S-27:** dialogs commit in `success` (`entry-dialog`, `reason-dialog`); the employees' run, the candidates and the violations lists fit their box at 1024 and 1440 px in Arabic and French, rows 81/71 px; a time's edit and delete are on its chip; a row's other actions in `RowMenu`.
- **`phoneText`:** `components/format.ts` re-exports Foundation's helper (`formatPhone` stays as an alias).
- **After round 4:** the scans are under `staff.documents.read`; a request for the manager's decision writes one `SanctionDecisionMatch` row per sanction matched, the log entry lists them (`sanctionIds`), and his yes covers them all; `decisionCovers(ex, ctx, { decisionId, sanctionId })` exported; every `staff.unavailable` carries the reason of its act (the leaving reason, the sanction's reason, the lift's reason, or the sanction's own reason when it reached its end date).
- **The verified audit findings (`scratchpad/audit/for-people.md`), all fixed and tested:**
  - LAB-1: a wage per task's overtime and rest-day premiums are typed on the payslip (`overtime`, `restDayPremium`), flagged until then, and the run refuses to close before.
  - LAB-5: a late seat's week, already closed, is priced again in the next run: the overtime and rest-day work it adds are paid as arrears.
  - LAB-6: `rules/leave.ts` `leaveAccount`: what a reference year earns is taken the year after and carried, never lost at 1 July; the count begins after `leaveOpeningDate`; the employee's file has the two opening fields; the screens show the year being earned and the balance to take.
  - LAB-7: only annual leave debits the balance.
  - LAB-8: a worker's absence pays its working days only, not the weekly rest day.
  - LAB-14: a done visit's seat with no typed times is paid its planned minutes, counted on the payslip (`plannedSeats`).
  - ACC-6: a leave is recorded approved only by a holder of `attendance.employee.edit`, else as requested; the tick shows to holders only.
  - ACC-9: hours corrections need `pay.write`. ACC-13: «قرار الإدارة» needs `hiring.decide` and the workers' section read. ACC-10: the file pages and forms need the section written as well as `staff.write`.
  - LOG-8: a file logs one consultation per user, record and day (`logConsultOnce`). LOG-9: a typed time is logged. LOG-16: only a file saved restricted for its place can be linked as the signed form or a document's scan.

## Round 3, done

- **Hiring (37):** `services/hiring.ts`: interviews (`scheduleInterview`, `recordInterviewOutcome`), the administration's decision with the trial (`decideHiring`, `hiring.decide`), `listCandidates`. The ten points per criterion stay the confidential part of his form, on the worker's file; the hiring list links to it.
- **Training (37):** `services/training.ts`: sessions of his eight days (`planTrainingSession` by module code), attendance (`setTrainingAttendance`), `cancelTrainingSession`, completion computed (`trainingCompletedDate`), skills (`addSkill`, `setWorkerSkills`). The eight rows are People's seed (`seeds.ts`, `registerSeeds`), run by Foundation's registry.
- **Violations (article 17):** `services/violations.ts`: `recordViolation`, `createViolationFromSource` (for Operations), `decideViolation` (a deduction is a ledger line, a suspension or a penalty a sanction, the end of registration a leaving), `cancelViolation`, `listViolations`.
- **Periodic evaluation (article 16):** `services/evaluations.ts`: `recordEvaluation` (seven criteria on `evaluation.scaleMax`, the period's hours kept with it), `deleteEvaluation`, `listEvaluations`, `listEvaluationsDue` (`evaluation.periodMonths`).
- **Documents:** `services/documents.ts`: `renewStaffDocument`, a new current row, the old one kept.
- **Recurring allowances and deductions:** `services/pay-items.ts` and its card on a person's pay page.
- **Residence ruling:** once a wilaya other than 04 is chosen, its commune is required, on screen and in the service.
- **Alerts and day start:** `violation.open` tile; the day-start job completes a worker's training when her last day has come.
- **Screens:** «التوظيف والتدريب» (`hiring`), four views on `?view=`: candidates, training (sessions and skills), violations, evaluations. A worker's file gains the violations and evaluations card and a renew button per document.

## Round 2, done

- **Hours (21):** `services/hours.ts`. A worker's minutes per week and month from Operations' typed orders (`VisitWorker`) and absences, with lateness, the orders not typed in, and People's corrections (`HoursAdjustment`).
- **Pay (38):** `services/pay-runs.ts`, `services/payouts.ts`, `rules/payslip.ts`, `sheets/payslip.tsx`. A month is prepared as a draft, computed again at will, corrected payslip by payslip, closed (numbered, frozen by the database), voided with a reason. Payouts (advance, wage, other) and the ledger of debts. Each payout emits `payout.recorded` or `payout.voided`.
- **Employees' attendance:** `services/employee-attendance.ts`. Times in and out, absences, leave with its decision and balance; everything recorded can be changed or taken off with a reason.
- **Exports of CONTRACTS section 3:** `setWorkerZone`, `canCollectCash`, `getHourlyLabourCost` (`staff-exports.ts`); `addDebtEntry`, `getPayoutForExpense`, `getClosedPayroll`, `getPaidMinutes` (`payouts.ts`).
- **Alerts and day start:** `alerts.ts` (`sanction.pending`, `document.expiry`, `trial.ending`, `staffContract.ending`), `daily.ts` (a dated sanction that ended is announced).
- **The Checker's rows:** the worker form's table positions; «بلدية/ولاية إقامة» as Foundation's `CommunePicker`, the wilaya then the commune (`components/residence-fields.tsx`); staff names surname first through `staffName`; the workers list in French; the first card's title; a sanctioned woman's wording; Save in `PageActions` as `success`; the line under the heading on tab pages only; tab pages headed by their tab.
- **Not this round:** hiring and training (37), violations (article 17), the periodic evaluation (article 16).

## What exists

- **His worker form as data** (`forms/`): rows W-001 to W-070 in his order, tested against the Checker's JSON and the Arabic labels; the screen's cards; the screen's values, to and from a stored worker.
- **The printed form** (`sheets/`): four A4 pages, blank or filled, each half alone, in the print kit's body and fonts. The filled form prints from the stored worker.
- **Pure rules with tests** (`rules/`): dates, the hiring score, pay, leave, documents to follow, the sanction match.
- **Validators** (`validators/`): `staff-codes.ts` names People's codes; `worker.ts` and `employee.ts` are the two screens' schemas.
- **Services** (`services/`), each with its tests:
  - `workers.ts`: register, change, leaving, readmission.
  - `worker-reads.ts`: the list, the file, the restricted answers on demand, the filled form for printing.
  - `worker-files.ts`: the photo and the signed scan.
  - `employees.ts`: register, change, leaving, readmission, the list, the file.
  - `sanctions.ts`: the check, setting and lifting a sanction, reading a state.
  - `sanction-decisions.ts`: the manager's yes or no.
  - `staff-exports.ts`: what the other owners call about a person (list, summary, zone, cash, labour cost).
  - `staff-shared.ts`: what workers and employees share, the residence commune included.
  - `hours.ts`: a worker's hours of a period, and corrections.
  - `employee-attendance.ts`: checks, absences, leave.
  - `pay-runs.ts`: the monthly run and its payslips.
  - `payouts.ts`: payouts, the ledger, and what Money reads.
  - `pay-items.ts`: recurring allowances and deductions.
  - `hiring.ts`, `training.ts`, `violations.ts`, `evaluations.ts`, `documents.ts`: round 3.
- **Seeds** (`seeds.ts`): his eight training days, through Foundation's registry.
- **Alerts** (`alerts.ts`) and **the day-start job** (`daily.ts`).
- **Components** (`components/`): the sanction gate, card and chip; the reason dialog; the entry dialog (`useEntryDialog`, a short form in a dialog); `ListTable` and `SimpleTable`; `MonthSwitch`; the figures (`Amount`, `Duration`, `DayDate`, `Days`); the residence field (Foundation's picker bound to the form); form fields.
- **Screens**:
  - workers: list, new, file, print, and «الموقوفون والمعاقبون» (`workers/sanctions`);
  - employees: list, new, file;
  - «الساعات والأجور» (`hours-pay`): three views (hours, pay, advances and debts); a worker's month (`workers/:id`); a run (`runs/:id`); a payslip and its print (`payslips/:id`, `/print`); a person's ledger and payments (`people/:id`);
  - «الحضور والغياب» of employees (`employee-attendance`): three views (attendance, absences, leave) and one employee's month (`:id`);
  - «التوظيف والتدريب» (`hiring`): candidates, training, violations, evaluations. The entries of all four are one hook, `components/conduct-entries.tsx`, shared with the worker's file.
- **Demo data** (`demo.ts`): eight workers, one suspended, two employees; an interview, four training days, a skill, two violations (one decided), an evaluation, a transport allowance; the employees' checks since 1 September, an absence, two leaves; September's pay closed for the employees and drafted for the workers; an advance.

## Conventions

- Services are `(ex, ctx, input)`; screens call `action(…)` or `query(…)`. Refusals are English sentences under `Errors`, in three languages.
- Codes are stored, never labels. Lists shared with other owners come from `@/lib/options` and are labelled by `Options.*`; People's own lists are in `staff-codes.ts`, labelled in People's messages and listed in `code-labels.ts`.
- Arabic is his words wherever he has one.
- Dates are `LocalDate`, money is centimes, durations are minutes, ticks are JSON arrays.
- `StaffConfidential` is read only through `readRestricted`. Its row carries the person's own id. Its values never reach the log, a draft or another owner.
- A registered worker's restricted cards stay closed until asked for, and a closed card is not saved.
- Opening a person's file and printing a filled form are actions, because they write the log. They refresh nothing.
- A reason the log must keep is typed in `useReasonDialog`.
- Every registration passes `useSanctionGate` on screen, and the service checks again.
- A save sends only changed columns (`changedColumns`).
- Sheets are pure, sized in mm and pt, inside `SHEET_BODY.worker`. A typed value stays on one line where a second would grow the page.
- Tests sit beside the code on `createTestDatabase()`. `rows.insert("StaffMember")` needs an explicit `numberSeq`.
- A person's name is `staffName` (`@/lib/text/names`): surname, then first name, on every screen, sheet and export. `listSchedulableWorkers` hands a ready `name`.
- Pay is guarded by `requirePay(ctx, level)`: the workers' section read, plus `pay.read` or `pay.write`. It serves workers' and employees' runs alike.
- A tab page is a `SectionScreen` headed by its tab's `Nav` label (the first tab keeps the section heading), with one line of description. A record page is a `DetailScreen` without a description. A form ends in `PageActions`: cancel `outline`, save `success`.
- An amount on screen is `<Amount>`: digits left to right, the currency word after them as the language reads.
- A second strip of views under the section's tabs is a `ScreenTabs` driven by `?view=`; the month is `?month=YYYY-MM`.

## Rulings given to People

- Round 0:
  - His ovals and emoji are drawn as shapes. One staff table holds both kinds.
  - Operations owns worker absences. Article 16 is People's.
  - Each hiring criterion is out of ten. A total may be typed alone.
  - A daily wage covers the standard day. Minutes beyond it are paid at the hourly equivalent plus 50 %. Whole extra days beyond the legal week get the premium only.
  - Overtime on a per-task wage is typed.
  - Sanction matching: a national id or phone match is always a match. A name alone is a possible match the clerk confirms. The same name with another birth date is no match.
- Printing: nothing prints over his letterhead or footer. Noto Naskh stands in for his faces, scaled by the kit.
- Round 0b, accepted:
  - The decision date is the form's «حررت ... بتاريخ» when given.
  - Status history: CANDIDATE, then the decided status from a later decision date.
  - A pay-terms row only when the basis and the rate are both given.
  - The emergency phone is never matched against sanctions.
  - A manager's yes covers its own sanction, context and kind only, once.
- Round 1's six decisions are accepted (the list below).
- Ruling 29: a person's file logs a consultation once per user, record and day. Until Foundation's helper lands, every load is logged.
- The manager answers signed in as himself: `requestManagerApproval` will not come.
- From the Checker's screen audit: Save is `success` at the foot in `PageActions`, cancel `outline` beside it; a record's actions stay in the heading; a tab page is headed by its tab; the CNAS tick is an office field, on screen only.

## Decisions taken after the final review (to confirm)

- PEO-05 reuses the cause LEFT: the event's causes have no REFUSED, and the ruling is «as one who leaves».
- PEO-03: closing refuses when computing again moves any payslip's money, rather than closing figures nobody looked at. Records dated in a closed month are refused rather than priced as arrears; the late seats of workers stay arrears, as designed.
- PEO-08: of the pay-terms rows in force by a month's end, the one written last wins (a correction dated back reaches the drafts it covers, and the file always shows what the last month pays). A change dated in a closed month is refused: that month is corrected on a later payslip, or its run voided.
- PEO-09: the office types the recurring deductions of a short month; nothing is carried to the ledger by itself.
- PEO-13: a ledger line made by undoing a repayment owes again what that repayment took back, under its first wording.

## Decisions taken in round 4 (to confirm)

- An ID card is printed only for someone in post (on trial or accepted, the coordinator's ruling on PEO-12), by a holder of `staff.write` reading the person's section; each card printed is one DISCLOSE line. Eight cards to an A4 page, without the letterhead.
- A document's scan is filed by a holder of `staff.write` who also holds `staff.health.read`, until `staff.documents.read` exists. A scan attached to a document never handed in creates its current row, handed in that day.
- A late seat's week is priced again from the minutes now typed: what the late seats add to its overtime is paid at +50%; for a daily wage, the minutes past the day of the late seats themselves are paid as before and only the rest is premium-only.
- Under Law 90-11 an employee who started this reference year has nothing to take until 1 July; leave taken before is shown as taken in advance (a negative balance).
- A worker's absence counts the rest day (`work.restDay`) out of pay; Operations' dialog still suggests leave days over every calendar day.

## Decisions taken in round 3 (accepted)

- A violation handed over by Operations arrives as minor unless Operations says otherwise; HR sets how serious when deciding.
- Deciding a violation is HR's (`staff.write`); a suspension or a penalty also needs `sanction.set`, so it is the manager's. A deduction is a ledger line of reason OTHER pointing at the violation. Only an open violation can be cancelled.
- Workers planned for a training day are written as attending; the office marks who was absent. A day still to come does not count. Completion is set and cleared by the training service only.
- An evaluation's figures are People's own hours of the period (days, lateness, absences, orders not typed): Operations' `getWorkerQualityFigures` is not written yet.
- A renewed document is a new current row; the old row stays, no longer current.
- The interview's ten points per criterion are typed on the worker's file (the confidential card), not in the interview dialog.

## Decisions taken in round 2 (accepted)

- A week (Saturday to Friday) belongs to the month it ends in: its overtime and its rest-day minutes are paid there, whole.
- A run pays the seats typed and not yet paid, up to the month's end. A seat typed after its month closed is paid by the next run, marked as arrears.
- An hourly, daily or per-task worker with nothing to pay has no payslip. A monthly wage always has one, in proportion to the days employed.
- An employee's hours come from the times in and out. Overtime is what a week holds past 40 hours of presence.
- Paid absence and paid leave are paid as worked on an hourly or daily wage. Unpaid absence is taken off a monthly wage at its hourly value.
- A payslip takes back what was owed at the month's end, never more than its net. The office may type another amount.
- With no IRG scale in Settings, each payslip's IRG is typed, and a run does not close until it is.
- A month closes only once it is over. A draft follows the rates in Settings until it closes.
- A closed run is voided only after its wages are. Voiding puts the repayments back on the ledger.
- An advance already repaid cannot be voided.
- Pay belongs to whoever reads the workers' section and holds `pay.read` or `pay.write`, for employees' runs too: the accountant has no employees' section.
- An approved leave is logged as a status change. A refusal or a cancellation needs a typed reason.
- A leave over two months is cut at the month's end. The rest day is not counted in its days.
- The residence is the wilaya (04 by default) then its commune, in Foundation's picker; a commune of another wilaya is added from the picker (`ensureCommune`). A wilaya without a commune is not kept: `StaffMember` has a column for the commune only.

## Decisions taken in round 1 (accepted)

- One record per identity number and kind. Somebody coming back is readmitted on the same file. Readmission is checked against the person's own sanction.
- A change to a file is checked only when it touches the identity, and never against the person's own sanction.
- A person has one sanction at a time. A later one waits for the first to end or be lifted.
- An employee is in post from registration, and has no zone.
- The manager's answer is typed by the manager's own account, signed in as himself.
- Opening a file is logged on every load, until Foundation's once-a-day helper lands (ruling 29).
- "This worker does not exist." is Operations' sentence (`WorkerNotFound`); People reuses it and does not define it again.

## Open items

1. Weekly pay runs: only monthly runs are built. A weekly payment is an advance.
2. A file per document on the worker's file (`StaffDocument.fileUrl`).
3. (done) A request names every sanction matched (`SanctionDecisionMatch`); one yes covers them all; `decisionCovers` answers Clients and Operations.
4. File consultations: switch to Foundation's once-a-day helper when it lands.
5. The payslip's employer number prints from `centre.cnasEmployerNumber`, empty until Foundation's card has it.

## Needs from others

- **Operations (PEO-03):** a worker's absence or leave dated in a month a closed run paid is never paid or taken off: `recordWorkerAbsence`, `setAbsencePayTreatment`, `cancelWorkerAbsence` and `decideWorkerLeave` should refuse it with `refuseClosedPayDay(ex, { staffId, from, to })` (`services/closed-days.ts`), as People's own records do.
- **Money:**
  - handle `payout.recorded` and `payout.voided` in its `events.ts`: `postPayoutExpense` reads `getPayoutForExpense(ex, ctx, { staffPayoutId })`;
  - call `addDebtEntry` for equipment lost or damaged (`handOutReturnId`).
- **Foundation:**
  - `<MediaUploadField>` has no restricted mode (its preview and its copy cannot reach a restricted file), so the document scans use the signed scan's pattern: a file button, a restricted copy, a remove;
  - the IRG scale in Settings (`pay.irgTable`), on قواعد العمل;
  - `centre.cnasEmployerNumber` on the centre's card and in the demo identity;
  - the consult logged once a day per user and record;
  - `--before` on the harness's `pdf`, for a sheet behind a question;
  - `linkAccountToStaff`, so that an employee's file can link its account.
- **Operations:**
  - `createViolationFromSource(ex, ctx, { workerId, date, sourceKind, sourceId, description, article?, severity? })` is ready for complaints, inspections, visits and problem reports;
  - `getWorkerQualityFigures` (CONTRACTS section 3) is not written: the evaluation keeps People's hours until it is;
  - `getWorkerHours` is not written: People reads `VisitWorker`, `Visit` and `File` itself, as CONTRACTS section 2 allows;
  - handle `staff.unavailable` (LEFT, SANCTION_SET, SANCTION_LIFTED);
  - replace the stand-ins `readWorkers` and `readStaffNames` with `listSchedulableWorkers` and `getStaffSummary`.
- **Clients:**
  - pass `useSanctionGate` before saving a client's file, with context `CLIENT_FILE`;
  - read a client's state with `getSanctionStates`, show it with `<SanctionChip>` or `<SanctionCard>`;
  - set a client's sanction with `setSanction`.
