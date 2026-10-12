# People: handover

Owner of features 21, 25, 37, 38: centre employees, cleaning workers, his worker form, hiring and training, hours, pay, and the suspended-or-penalised check. Paths: `src/features/people/**`, pages `employees/`, `employee-attendance/`, `workers/`, `hiring/`, `hours-pay/`. Updated at the start of round 1; to be updated again at its end.

## What exists

- **His worker form as data** (`forms/worker-form.ts`): rows W-001 to W-070 in his order, with his words and options, tested against `docs/checker/data/01-worker.json` and against the Arabic messages. `forms/worker-screen.ts` groups the rows into the screen's cards (tested for order; only health and score are restricted).
- **The printed form** (`sheets/`): four A4 pages (registration 1–2, internal regulations 3–4), blank or filled, and each half alone. Routes `workers/print*` and `workers/:id/print*`.
- **Pure rules with tests** (`rules/`): dates, the hiring score, pay (monthly, daily, hourly, per task; overtime; CNAS; IRG from a table), leave, documents to follow, the sanction match.
- **Validators** (`validators/`): `staff-codes.ts` is the one file that names People's codes; `worker.ts` is the registration screen's zod schema.
- **Services** (`services/`): `registerWorker` (one transaction: access, the sanction check, the number, the rows, the log), `checkSanction`, `consumeDecision`.
- **Screens**: registration (`workers/new`), a sample worker page (`workers/:id`, invented data), the print pages.

## Conventions

- Services are `(ex, ctx, input)`, screens call `action(…)` or `query(…)`. Refusals are English sentences under `Errors`, translated in three languages.
- Codes are stored, never labels. Lists shared with other owners are re-exported from `@/lib/options`; People's own lists stay in `staff-codes.ts`. Labels live in the message files and are listed in `code-labels.ts`.
- Arabic is his words wherever he has one; a woman's role uses her words.
- Dates are `LocalDate` (`localDate()`), money is centimes, durations are minutes, ticks are JSON arrays (`[]` when none).
- `StaffConfidential` (health answers, hiring score, signed scan) is read only through `readRestricted`. Its values never reach the log, a `draftPayload` or another owner.
- Worker numbers come from `nextNumber("STAFF_WORKER", { suffix: "H" | "F" })`.
- A save sends only changed columns (`changedColumns`).
- Sheets are pure, sized in mm and pt, and never print over his letterhead or footer pictures.
- Tests sit beside the code (`*.test.ts`) on `createTestDatabase()`. `rows.insert("StaffMember")` needs an explicit `numberSeq`.

## Rulings given to People

- Round 0:
  - His ovals and emoji are drawn as shapes. One staff table holds both kinds.
  - Operations owns worker absences. Article 16 (periodic evaluation) is People's.
  - Each hiring criterion is out of ten. A total may be typed alone.
  - A daily wage covers the standard day. Minutes beyond it are paid at the hourly equivalent plus 50 %. Whole extra days beyond the legal week get the premium only. Both thresholds are settings.
  - Overtime on a per-task wage is typed.
  - Sanction matching: a national id or phone match is always a match. A name alone is a possible match the clerk confirms. The same name with another birth date is no match.
- Printing: nothing prints over his letterhead or footer. Noto Naskh stands in for his faces; Foundation calibrates its sizes. Once that lands, recalibrate the worker form against the kit and the Checker's page reading.
- Round 0b, accepted:
  - The decision date is the form's «حررت ... بتاريخ» when given.
  - Status history: CANDIDATE, then the decided status from a later decision date.
  - A pay-terms row only when the basis and the rate are both given.
  - The emergency phone is never matched against sanctions.
  - A manager's yes covers its own sanction, context and kind only, once.
- Addresses offer wilaya 04 only, until Foundation's shared commune and zone picker exists.

## Open items (round 1)

1. `<SanctionGate>` and the manager's decisions (on the spot or pending), mountable by Clients.
2. Setting and lifting a sanction on a worker, an employee or a client.
3. The workers list, the worker file, editing, photo and scan uploads, printing from the stored worker.
4. Centre employees: list, new, file.
5. `demo.ts`.
6. Recalibrate the sheet after Foundation's font round.

## Needs from others

- **Foundation:**
  - `registerAlert` for the `sanction.pending` tile;
  - `linkAccountToStaff` (an employee's login);
  - `requestManagerApproval` (the manager answering inside another user's session);
  - the shared `<CommunePicker>` and `<ZonePicker>`;
  - `IrgTable` exported from the settings;
  - the `rows.insert` numbering pitfall.
- **Clients:**
  - mount `<SanctionGate>` with context `CLIENT_FILE`;
  - read a client's state with `getSanctionStates`;
  - set a client's sanction through `setSanction`.
