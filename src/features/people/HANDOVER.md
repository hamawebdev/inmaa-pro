# People: handover

Owner of features 21, 25, 37, 38: centre employees, cleaning workers, his worker form, hiring and training, hours, pay, and the suspended-or-penalised check. Paths: `src/features/people/**`, pages `employees/`, `employee-attendance/`, `workers/`, `hiring/`, `hours-pay/`. Updated at the end of round 1.

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
  - `staff-exports.ts`: `listSchedulableWorkers` and `getStaffSummary`, for the other owners.
  - `staff-shared.ts`: what workers and employees share.
- **Components** (`components/`): the sanction gate, the sanction card and chip, the reason dialog, form fields.
- **Screens**:
  - workers: list, new, file, print, and «الموقوفون والمعاقبون» (`workers/sanctions`);
  - employees: list, new, file.
- **Demo data** (`demo.ts`): eight workers, one suspended, and two employees.

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
- Addresses offer wilaya 04 only, until Foundation's shared picker exists.

## Decisions taken in round 1 (to confirm)

- One record per identity number and kind. Somebody coming back is readmitted on the same file. Readmission is checked against the person's own sanction.
- A change to a file is checked only when it touches the identity, and never against the person's own sanction.
- A person has one sanction at a time. A later one waits for the first to end or be lifted.
- An employee is in post from registration, and has no zone.
- The manager's answer is typed by the manager's own account. Answering inside another user's session waits for `requestManagerApproval`.
- Opening a file is logged on every load, not once a day.
- "This worker does not exist." is Operations' sentence (`WorkerNotFound`); People reuses it and does not define it again.

## Open items

1. Hiring and training (interviews, training days, skills), hours and pay, employee attendance: not started.
2. `setWorkerZone`, `canCollectCash`, `listEmployees` as a picker, `getHourlyLabourCost` and the pay exports of CONTRACTS section 3: not written. (`listSchedulableWorkers` and `getStaffSummary` are.)
3. Violations, and a sanction created from one.
4. A file per document on the worker's file (`StaffDocument.fileUrl`).
5. A person matching two sanctions in force cannot be allowed by one yes.

## Needs from others

- **Foundation:**
  - `registerAlert`, for the `sanction.pending` tile;
  - `linkAccountToStaff`, so that an employee's file can link its account;
  - `requestManagerApproval`;
  - a consult logged once a day per user and record;
  - the shared `<CommunePicker>` and `<ZonePicker>`;
  - `--before` on the harness's `pdf`, for a sheet behind a question;
  - `IrgTable` exported from the settings.
- **Clients:**
  - pass `useSanctionGate` before saving a client's file, with context `CLIENT_FILE`;
  - read a client's state with `getSanctionStates`, show it with `<SanctionChip>` or `<SanctionCard>`;
  - set a client's sanction with `setSanction`.
- **Operations:**
  - handle `staff.unavailable` (LEFT, SANCTION_SET, SANCTION_LIFTED);
  - replace the stand-ins `readWorkers` and `readStaffNames` with `listSchedulableWorkers` and `getStaffSummary`.
