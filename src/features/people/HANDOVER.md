# People: handover

Owner of features 21, 25, 37, 38: centre employees, cleaning workers, his worker form, hiring and training, hours, pay, and the suspended-or-penalised check. Paths: `src/features/people/**`, pages `employees/`, `employee-attendance/`, `workers/`, `hiring/`, `hours-pay/`. Updated at the end of round 4.

## Round 4, done

- **ID cards (scope R9):** `services/cards.ts` (`staffCardsForPrint`, `recordCardPrint`, one DISCLOSE line per card), `sheets/id-cards.tsx` (ISO ID-1, 85.6 × 54 mm, eight to an A4 page with cutting marks; photo or the empty frame, name surname first, number, role in his words, the centre), `components/staff-cards-screen.tsx`. Pages: `workers/:id/print-card`, `employees/:id/print-card`, and `workers/print-cards?ids=` for the workers chosen in the list. A person who left gets no card.
- **One file per document:** `setStaffDocumentFile` in `services/documents.ts`; the worker's documents card attaches, copies and removes each scan, stored restricted under `DOCUMENT_FILE_CAPABILITY` (`staff.health.read` until Foundation names `staff.documents.read`). The worker's file reads `fileUrl` per document.
- **Not this round:** the phone helper (Foundation's move has not landed); the labour-rules findings (not received); one yes for several sanctions (needs a column, see "Needs").

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

## Decisions taken in round 3 (to confirm)

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
3. A person matching two sanctions in force cannot be allowed by one yes.
4. File consultations: switch to Foundation's once-a-day helper when it lands.
5. The payslip's employer number prints from `centre.cnasEmployerNumber`, empty until Foundation's card has it.
6. `formatPhone` moves to `src/lib/text` (Foundation): re-export it from `components/format.ts` when it lands.

## Needs from others

- **Money:**
  - handle `payout.recorded` and `payout.voided` in its `events.ts`: `postPayoutExpense` reads `getPayoutForExpense(ex, ctx, { staffPayoutId })`;
  - call `addDebtEntry` for equipment lost or damaged (`handOutReturnId`).
- **Foundation:**
  - `staff.documents.read` (HR_OFFICER) for the scans of a staff member's documents; until then they use `staff.health.read`;
  - `<MediaUploadField>` has no restricted mode (its preview and its copy cannot reach a restricted file), so the document scans use the signed scan's pattern: a file button, a restricted copy, a remove;
  - for the ruling "one yes covers every sanction matched": a column `SanctionDecision.matchedSanctionIds` (JSON array), so a request names them all and the yes covers them;
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
