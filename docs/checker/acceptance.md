# Acceptance script

Kept by the Checker, for the coordinator to run at the end. It proves the developer's definition of "done", step by step. This is a document: it holds no test and no code.

**The definition.** With seeded data, one job runs end to end in each of the four divisions (request, inspection, quote, contract, schedule, printed mission order, attendance, sign-off, invoice, payment, and it shows in income and the reports); a worker can be registered and the form printed; a stock hand-out is recorded; the contract-end alert and the payment-due alert fire; the suspended-or-penalised check fires and waits for the manager's yes or no.

**State of this file.** Services, routes and sheets are named as they were on disk on 2026-10-12 at 22:20, while four rounds were still being written. A step is **exists** when its service, its screen and its sheet are there, **part** when one of the three is not, **missing** when the step cannot be done. Run `python3 -I docs/checker/tools/validate_table.py` and the gates first; then go down the steps. Paths are under `src/features/`; routes are under `/dashboard`.

**Seeded data.** `npm run demo` builds `.harness/demo/inmaa-demo.db`: seven accounts (password `inmaa-demo`), the centre's identity, three zones, ten staff, six files (`clients.housingRequest`, `housingContract`, `orgContract`, `buildingContract`, `complexContract`, `money.pastContract`), 266 visits, two invoices, one payment and receipt, 21 stock items and one hand-out. To look at a step without the desktop window: `npm run shot -- --demo --route …` and `npm run pdf -- --demo --route … --png`.

## A. One job, end to end

Do it once per division, on a new file, signed in as the role named.

| # | Step | Service (file › function) | Screen and route | Sheet | State |
|---|---|---|---|---|---|
| A1 | **Request.** Register the file on his form; a returning client is found and filled in; the client is checked against the suspended and penalised | `clients/services/files.ts` › `registerFile` (later edits: `saveFileForm`); `clients/services/returning.ts` › `findReturningClients`, `getReturningFill`; People's `checkSanction` through `<SanctionGate>` | طلبات الخدمة › الملفات › new file: `/files/new`; the form again at `/files/:id/form`; the hub at `/files/:id` | His form: `/files/:id/form/print` (`clients/sheets/file-form-sheet.tsx`); blank: `/files/empty-forms/:kind/print` | exists |
| A2 | **Inspection.** The first visit is planned, done and written up | none writes `FirstVisit` (`files.ts` › `stageFactsOf` only reads it). The stage moves to «الزيارة» by `files.ts` › `moveFileStage` once «تاريخ الزيارة» is on the form | `/files/:id/inspection` is a placeholder. The stage strip on the hub works | none (scope: an inspection sheet, feature 3) | **missing**: the record, its screen and its sheet (Clients). The stage alone can be passed |
| A3 | **Quote.** Cost and price, the quote issued, printed, accepted | none writes `CostStudy` or `Quote`. The stage moves to «عرض سعر» by `moveFileStage` once «المبلغ الإجمالي» is on the form | `/files/:id/financial-study` and `/files/:id/quote` are placeholders | none (scope: a quote, feature 5) | **missing** (Clients). On-demand files stop here: `clients/rules/stage-moves.ts` › `stageMove` refuses «متعاقد» until a quote is accepted |
| A4 | **Contract.** The file becomes «متعاقد»: the form locks, the parties are kept as signed | `files.ts` › `moveFileStage` to `CONTRACTED`, which emits `file.contracted` | The stage strip on the hub `/files/:id` (`stage-strip.tsx`). `/files/:id/contract` (renewal, ending, clauses) and `/files/:id/residents` are placeholders | The contract form: `/files/:id/form/print`; for a building or a complex also `/files/:id/residents/print` | exists for the four contract forms; blocked for the two request forms by A3 |
| A5 | **Schedule.** Visits are created from the form's days and hours, dues from its payment terms; the task list; the team | Operations `events.ts` on `file.contracted` › `operations/services/programme.ts` › `generateFileVisits` (from the screen: `previewVisitGeneration`, `generateVisits`); Money `events.ts` › `money/services/dues.ts` › `syncDues`; tasks: `operations/services/file-tasks.ts`; team: `operations/services/assignment.ts` › `assignVisitWorker`, `confirmVisit` | A file's visits `/files/:id/visits`; tasks `/files/:id/tasks`; the week `/work-program`; the team card on the visit page `/visits/:id` | none | exists |
| A6 | **Printed mission order.** The order of a visit goes to paper; the print is counted and the tick list frozen | `operations/services/mission-order.ts` › `getMissionOrder`, `recordOrderPrinted` | `/visits/:id/print` (from the day board `/visits`, the visit page, or a file's visits) | `operations/sheets/mission-order-sheet.tsx` | exists |
| A7 | **Attendance.** Arrival is reported by phone; arrival and departure of each worker are typed from the returned order | `operations/services/visit-entry.ts` › `reportArrival`, `saveReturnedOrder`; the overview: `operations/services/worker-attendance.ts` › `listAttendanceOverview` | «الوصول» on the day board `/visits` and on الرئيسية; the returned order on `/visits/:id`; عمال النظافة › الحضور والغياب `/worker-attendance` | the attendance block of the mission order | exists |
| A8 | **Sign-off.** Tick list, completion, the client's sign-off and his 1-to-5 rating are typed in; the visit is done | `visit-entry.ts` › `saveReturnedOrder`, which emits `visit.signedOff`; a dissatisfied sign-off opens a complaint (`operations/services/complaints.ts` › `openComplaintFromSignoff`); the last visit of an on-demand job: `operations/services/extra-visits.ts` › `onDemandJobFinished` | The returned order on `/visits/:id` | the sign-off slip, last page of the mission order | exists |
| A9 | **Invoice.** What is due is found, the invoice issued with its number, its legal fields and its visit statement | `money/services/invoices.ts` › `listInvoiceCandidates`, `prepareInvoice`, `issueInvoice` (refusals: `INVOICE_BLOCKERS`) | المصاريف › الفواتير: `/invoices`, `/invoices/new` | `/invoices/:id/print` (`money/sheets/invoice-sheet.tsx`), `/invoices/:id/print-statement` (`visit-statement-sheet.tsx`) | exists. To see at the run: an organisation's first invoice needs its RC, and the client card `/clients` where it belongs is a placeholder (Clients) |
| A10 | **Payment.** The payment is recorded against the invoice; a cash payment gets its receipt with stamp duty | `money/services/payments.ts` › `recordPayment` (receipts for a collector: `issueReceiptBatch`); debts and the reminder: `money/services/debts.ts` › `listOpenDues`, `getPaymentReminder` | المصاريف › التسديد والديون: `/payments` (`money/components/record-payment-dialog.tsx`). The file's part `/files/:id/payments` is a placeholder | `/payments/receipts/:id/print` (`cash-receipt-sheet.tsx`); `/payments/reminders/:fileId/print` (`payment-reminder-sheet.tsx`) | exists; the file's part is **missing** (Money) |
| A11 | **Income and reports.** The paid amount shows under its division | `money/services/reports.ts` › `getIncomeData` | `/income` exists; `/reports` is a placeholder | none | **part**: income exists, the reports screen is **missing** (Money) |

### How the script differs per division

| Division | Forms | Path |
|---|---|---|
| المنازل | request `HOUSING_REQUEST` (on demand), contract `HOUSING_CONTRACT` | **On demand:** A1 on the request form, A2, A3 with the quote accepted, A4, then the job's visit or visits (A5 to A8), where the last sign-off finishes the job, and one invoice for the job (A9 to A11). Stops at A3 today. **Contract:** A1 on the contract form, A2 and A3 passed from the form's own date and amount, A4 to A11, with one invoice per period |
| المؤسسات | request `ORG_REQUEST` (on demand), contract `ORG_CONTRACT` | As المنازل. The invoice carries both parties' RC, NIS and NIF, and VAT at 19% or the IFU mention by the centre's tax mode (Settings › عام) |
| العمارات | contract `BUILDING_CONTRACT` only | No on-demand path and no quote to accept: A1, the stage passed through «الزيارة» and «عرض سعر» from the form, A4 to A11. The contract prints with «قائمة القاطنين»; the number ends in `/BLC`; the mission order carries the floors table |
| التجمعات السكنية | contract `COMPLEX_CONTRACT` only | The building script on the complexes copy of the form; the number has no suffix |

## B. A worker is registered and the form printed

| # | Step | Service | Screen and route | Sheet | State |
|---|---|---|---|---|---|
| B1 | Register a worker on his form, signed in as the HR officer | `people/services/workers.ts` › `registerWorker` (the check: `people/services/staff-shared.ts` › `passSanctionCheck`) | عمال النظافة › العمال › new: `/workers/new`; the file: `/workers/:id` | none | exists |
| B2 | Print the filled form: the page asks why, the reason is logged | `people/services/worker-reads.ts` › `workerFormForPrint` | `/workers/:id/print`, `/workers/:id/print-registration`, `/workers/:id/print-regulations` | `people/sheets/worker-registration.tsx`, `worker-regulations.tsx` | exists |
| B3 | Print the blank form | none | `/workers/print` | the same sheets, empty | exists |

## C. A stock hand-out is recorded

| # | Step | Service | Screen and route | Sheet | State |
|---|---|---|---|---|---|
| C1 | Hand out equipment and materials to a worker for a contract or a visit; the stock goes down | `stock/services/handouts.ts` › `createHandOut` (movement: `stock/services/movements.ts` › `addMovement`) | المخزون › التسليم: `/handouts`, `/handouts/new`. The file's part `/files/:id/handouts` is a placeholder | `/handouts/:id/print` (`stock/sheets/handout-slip-sheet.tsx`) | exists; the file's part is **missing** (Money and stock) |
| C2 | Take it back: what returns, in what state, what is short | `handouts.ts` › `recordHandOutReturn` | `/handouts` (`return-dialog.tsx`) | none | exists |

## D. The two alerts fire

| # | Step | Service | Screen and route | State |
|---|---|---|---|---|
| D1 | A contract inside its lead time shows on the home screen and opens the files list filtered to it | `money/alerts.ts`, key `contract.ending`, lead `alerts.contractEndLeadDays`; the tiles: `core/services/alerts.ts` › `evaluateAlertsQuery` | الرئيسية `/home`, then `/files` | exists. Money's demo data names `money.pastContract`; confirm at the run that it lights the tile, or run with `--now` close to a contract's end date |
| D2 | A contract past its end date ends by itself when the day starts | `clients/daily.ts` › `clients/services/files.ts` › `endExpiredContracts`, which emits `file.ended` | none (the day-start job) | exists |
| D3 | A payment due inside its lead time, and one overdue, each show on the home screen and open the dues list | `money/alerts.ts`, keys `payment.dueSoon` and `payment.overdue`, lead `alerts.paymentDueLeadDays`; the dues: `money/services/dues.ts` › `syncDues` | `/home`, then `/payments?view=dues&state=DUE_SOON` or `OVERDUE` | exists. Money's demo data names `money.invoiceOutstanding`; confirm at the run which of the two tiles it lights |

## E. The suspended-or-penalised check fires and waits

| # | Step | Service | Screen and route | State |
|---|---|---|---|---|
| E1 | Somebody is «موقف» or «معاقب» | `people/services/sanctions.ts` › `setSanction` | «توقيف أو معاقبة» on a file: `/workers/:id`, `/employees/:id` | exists. Seeded: `people.workerSuspended` |
| E2 | Registering the same person again (a worker, an employee, or a client on a file) is stopped: «هل نسمح له أم لا؟» | `sanctions.ts` › `checkSanction`; the question: `people/services/sanction-decisions.ts` › `requestDecision`; the gate: `people/components/sanction-gate.tsx` | `/workers/new`, `/employees/new`, `/files/new` | exists |
| E3 | The question waits: a tile on the home screen and a line in the manager's list | `people/alerts.ts`, key `sanction.pending`; `sanction-decisions.ts` › `listDecisions` | `/home`, `/workers/sanctions` | exists |
| E4 | The manager, signed in himself, answers yes or no | `sanction-decisions.ts` › `answerDecision` | `/workers/sanctions` | exists |
| E5 | On a yes the registration is saved and the yes is used once; on a no it is refused | `sanctions.ts` › `consumeDecision`, inside `registerWorker`, `registerEmployee` or `registerFile` | the form again, opened from the answer | exists |

The same path is walked by `src/testing/scenarios/sign-in-and-the-managers-answer.test.ts`.

## Missing, by owner

| Owner | Missing | Blocks |
|---|---|---|
| Clients and contracts | A2: the first-visit record, its screen `/files/:id/inspection` and its sheet | the inspection step in all four divisions (the stage can still be passed from the form) |
| Clients and contracts | A3: the cost study and the quote: services, the screens `/files/:id/financial-study` and `/files/:id/quote`, the quote sheet | the quote step everywhere, and **the whole on-demand path** in المنازل and المؤسسات |
| Clients and contracts | `/files/:id/contract`, `/files/:id/residents`, the client card `/clients` | renewal and early ending from a screen; an organisation's identifiers for its first invoice (A9) |
| Money and stock | A11: `/reports` | "shows in the reports" |
| Money and stock | `/files/:id/payments`, `/files/:id/handouts` (the hub's parts) | nothing on the path: the same work is done from `/payments` and `/handouts` |
| Operations | nothing on the path | (`/supervisors`, `/quality` are placeholders, outside the definition) |
| People | nothing on the path | (`/hiring`, `/employee-attendance` are placeholders, outside the definition) |
| Foundation | nothing on the path | |
