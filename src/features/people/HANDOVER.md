# People: handover

Owner of features 21, 25, 37, 38: centre employees, cleaning workers, his worker form, hiring and training, hours, pay, and the suspended-or-penalised check. Paths: `src/features/people/**`, pages `employees/`, `employee-attendance/`, `workers/`, `hiring/`, `hours-pay/`. Updated at the end of round 2.

## Round 2, done

- **Hours (21):** `services/hours.ts`. A worker's minutes per week and month from Operations' typed orders (`VisitWorker`) and absences, with lateness, the orders not typed in, and People's corrections (`HoursAdjustment`).
- **Pay (38):** `services/pay-runs.ts`, `services/payouts.ts`, `rules/payslip.ts`, `sheets/payslip.tsx`. A month is prepared as a draft, computed again at will, corrected payslip by payslip, closed (numbered, frozen by the database), voided with a reason. Payouts (advance, wage, other) and the ledger of debts. Each payout emits `payout.recorded` or `payout.voided`.
- **Employees' attendance:** `services/employee-attendance.ts`. Times in and out, absences, leave with its decision and balance; everything recorded can be changed or taken off with a reason.
- **Exports of CONTRACTS section 3:** `setWorkerZone`, `canCollectCash`, `getHourlyLabourCost` (`staff-exports.ts`); `addDebtEntry`, `getPayoutForExpense`, `getClosedPayroll`, `getPaidMinutes` (`payouts.ts`).
- **Alerts and day start:** `alerts.ts` (`sanction.pending`, `document.expiry`, `trial.ending`, `staffContract.ending`), `daily.ts` (a dated sanction that ended is announced).
- **The Checker's rows:** the worker form's table positions; «بلدية/ولاية إقامة» as two fields (`components/residence-fields.tsx`); the workers list in French; the first card's title; a sanctioned woman's wording; Save in `PageActions` as `success`; the line under the heading on tab pages only; tab pages headed by their tab.
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
- **Alerts** (`alerts.ts`) and **the day-start job** (`daily.ts`).
- **Components** (`components/`): the sanction gate, card and chip; the reason dialog; the entry dialog (`useEntryDialog`, a short form in a dialog); `ListTable` and `SimpleTable`; `MonthSwitch`; the figures (`Amount`, `Duration`, `DayDate`, `Days`); the residence fields; form fields.
- **Screens**:
  - workers: list, new, file, print, and «الموقوفون والمعاقبون» (`workers/sanctions`);
  - employees: list, new, file;
  - «الساعات والأجور» (`hours-pay`): three views (hours, pay, advances and debts); a worker's month (`workers/:id`); a run (`runs/:id`); a payslip and its print (`payslips/:id`, `/print`); a person's ledger and payments (`people/:id`);
  - «الحضور والغياب» of employees (`employee-attendance`): three views (attendance, absences, leave) and one employee's month (`:id`).
- **Demo data** (`demo.ts`): eight workers, one suspended, two employees; the employees' checks since 1 September, an absence, two leaves; September's pay closed for the employees and drafted for the workers; an advance.

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

## Decisions taken in round 2 (to confirm)

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
- The residence commune is picked in wilaya 04 and typed in any other, kept by `ensureCommune`.

## Decisions taken in round 1 (accepted)

- One record per identity number and kind. Somebody coming back is readmitted on the same file. Readmission is checked against the person's own sanction.
- A change to a file is checked only when it touches the identity, and never against the person's own sanction.
- A person has one sanction at a time. A later one waits for the first to end or be lifted.
- An employee is in post from registration, and has no zone.
- The manager's answer is typed by the manager's own account, signed in as himself.
- Opening a file is logged on every load, until Foundation's once-a-day helper lands (ruling 29).
- "This worker does not exist." is Operations' sentence (`WorkerNotFound`); People reuses it and does not define it again.

## Open items

1. Hiring and training (interviews, training days, skills): not started. The tab is a placeholder.
2. Violations (article 17), a sanction created from one (`createViolationFromSource`), the periodic evaluation (article 16).
3. Recurring allowances and deductions (`StaffPayItem`) are read by a run, but no screen writes them yet.
4. Weekly pay runs: only monthly runs are built. A weekly payment is an advance.
5. A file per document on the worker's file (`StaffDocument.fileUrl`).
6. A person matching two sanctions in force cannot be allowed by one yes.
7. File consultations: switch to Foundation's once-a-day helper when it lands.
8. The payslip's employer number prints from `centre.cnasEmployerNumber`, empty in the demo data.

## Needs from others

- **Money:**
  - handle `payout.recorded` and `payout.voided` in its `events.ts`: `postPayoutExpense` reads `getPayoutForExpense(ex, ctx, { staffPayoutId })`;
  - call `addDebtEntry` for equipment lost or damaged (`handOutReturnId`).
- **Foundation:**
  - the IRG scale in Settings (`pay.irgTable`), on قواعد العمل;
  - `centre.cnasEmployerNumber` on the centre's card and in the demo identity;
  - the consult logged once a day per user and record;
  - a shared `<CommunePicker>`, if other owners need the two residence fields;
  - `--before` on the harness's `pdf`, for a sheet behind a question;
  - `linkAccountToStaff`, so that an employee's file can link its account.
- **Operations:**
  - `getWorkerHours` is not written: People reads `VisitWorker`, `Visit` and `File` itself, as CONTRACTS section 2 allows;
  - handle `staff.unavailable` (LEFT, SANCTION_SET, SANCTION_LIFTED);
  - replace the stand-ins `readWorkers` and `readStaffNames` with `listSchedulableWorkers` and `getStaffSummary`.
- **Clients:**
  - pass `useSanctionGate` before saving a client's file, with context `CLIENT_FILE`;
  - read a client's state with `getSanctionStates`, show it with `<SanctionChip>` or `<SanctionCard>`;
  - set a client's sanction with `setSanction`.
