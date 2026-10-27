# Acceptance script

Kept by the Checker, for the coordinator to run at the end. It proves the developer's definition of "done", step by step. This is a document: it holds no test and no code.

**The definition.** With seeded data, one job runs end to end in each of the four divisions (request, inspection, quote, contract, schedule, printed mission order, attendance, sign-off, invoice, payment, and it shows in income and the reports); a worker can be registered and the form printed; a stock hand-out is recorded; the contract-end alert and the payment-due alert fire; the suspended-or-penalised check fires and waits for the manager's yes or no.

**State of this file.** Services, routes and sheets are named as they were on disk on 2026-10-12 at 22:20, and the State column as the scenario tests found them at 22:49, while four rounds were still being written. A step is **exists** when its service, its screen and its sheet are there, **part** when one of the three is not, **missing** when the step cannot be done. Run `python3 -I docs/checker/tools/validate_table.py` and the gates first; then go down the steps. Paths are under `src/features/`; routes are under `/dashboard`.

**Seeded data.** `npm run demo` builds `.harness/demo/inmaa-demo.db`: seven accounts (password `inmaa-demo`), the centre's identity, three zones, ten staff, six files (`clients.housingRequest`, `housingContract`, `orgContract`, `buildingContract`, `complexContract`, `money.pastContract`), 266 visits, two invoices, one payment and receipt, 21 stock items and one hand-out. To look at a step without the desktop window: `npm run shot -- --demo --route …` and `npm run pdf -- --demo --route … --png`.

## The scenario tests

`src/testing/scenarios/acceptance/` (the Checker's) walks this script through the owners' exported services, each step as the role that does it, with the clock moved as a month would. Run it with `npx vitest run src/testing/scenarios/acceptance`. Measured on 2026-10-17 at 18:29: 6 files, 28 tests passed, no `todo`, none failing. Every long test has a 180 s timeout, for a machine six teammates load.

| File | Walks | Result |
|---|---|---|
| `contract-path.test.ts` | A1, A4 to A11 on the contract form of each of the four divisions, then `verifyChains` and the log; the organisation's invoice without its trade register number; reception and a building's residents list | 7 passed: the four divisions, the organisation's identifiers saved and logged, its invoice refused without them, reception registering a building's and a complex's contract with its residents list and unable to read it back |
| `on-demand-path.test.ts` | A1 to A11 on the request form of المنازل (cash) and of المؤسسات (bank transfer): first visit, cost study, quote approved, issued and accepted, the job's visits, the job closed by its last sign-off (`JOB_DONE`), invoice, payment, income, `verifyChains` | 2 passed |
| `workers-stock-alerts-sanctions.test.ts` | B1, B2, C1, C2, D1 to D3, E1 to E5 | 7 passed |
| `payslip.test.ts` | feature 38: the payslip's arithmetic against the settings' rates, and its print logged as a disclosure | 3 passed |
| `money-paper.test.ts` | A9 and A10 on paper: the stamp-duty scale of the build notes on eleven amounts, the demo's cash invoice and receipt, an organisation's month invoiced in VAT mode (19%, prices including VAT) and paid in cash | 3 passed |
| `final-review.test.ts` | The paths the final code review found untested: a contract with a first deep clean (quoted with its INITIAL_JOB and PERIODIC lines, signed on the monthly amount, the INITIAL visit planned once, seated, ordered and signed off, the clean invoiced once beside the first month, paid, in income); a contract ended early (later visits and months cancelled, the last month cut to its visits, what was paid ahead kept as credit or placed on the late month, the reminder asking only for the late month); a complaint settled with a discount (the discount line on the next invoice, once); pay (no candidate or refused worker paid, a readmitted worker paid from her return, a payslip's columns adding up to its net) | 5 passed |
| `service-lists.test.ts` | The developer's request of 2026-10-22: his two service lists edited in Settings › الخدمات (a service added for homes and organisations, one renamed, one moved, one removed), then the housing request form, the organisation and building forms, a new request ticking the added service and refused the removed one, and a contract signed before the edit keeping the removed service at its place, on screen and in the sheet's columns. The same edits printed on the demo data: `npm run pdf -- --demo --seed <edits.sql> --routes <sheets.txt> --png` | 1 passed |

A **tested** in the State column below means a test of that folder goes through the step's service and passed at that time. The screens and the sheets are not what these tests look at: they are the print audits' and the screen audits'.

## A. One job, end to end

Do it once per division, on a new file, signed in as the role named.

| # | Step | Service (file › function) | Screen and route | Sheet | State |
|---|---|---|---|---|---|
| A1 | **Request.** Register the file on his form; a returning client is found and filled in; the client is checked against the suspended and penalised | `clients/services/files.ts` › `registerFile` (later edits: `saveFileForm`); `clients/services/returning.ts` › `findReturningClients`, `getReturningFill`; People's `checkSanction` through `<SanctionGate>` | طلبات الخدمة › الملفات › new file: `/files/new`; the form again at `/files/:id/form`; the hub at `/files/:id` | His form: `/files/:id/form/print` (`clients/sheets/file-form-sheet.tsx`); blank: `/files/empty-forms/:kind/print` | exists, **tested** on the four contract forms and the two request forms. A building's or a complex's form, with its residents list, is refused to reception (`residents.read`): the administration registers it |
| A2 | **Inspection.** The first visit is planned, done and written up | `clients/services/first-visits.ts` › `saveFirstVisit` (planning it moves the file to «الزيارة»; typing it in from the sheet dates the form's visit) | `/files/:id/inspection` | `/files/:id/inspection/:visitId/print` (`clients/sheets/inspection-sheet.tsx`) | exists, **tested** on the two request forms (2026-10-14 14:33); the sheet is not audited yet |
| A3 | **Quote.** Cost and price, the quote issued, printed, accepted | `clients/services/cost-study.ts` › `saveCostStudy` (the manager: `cost.read`); `clients/services/quotes.ts` › `saveQuote`, `submitQuote`, `decideQuote` (the manager: `quote.approve`), `issueQuote`, `recordQuoteResult` (`ACCEPTED` with `contract` takes the file to «متعاقد») | `/files/:id/financial-study`, `/files/:id/quote`, `/files/quotes` | `/files/:id/quote/:quoteId/print` (`quote-sheet.tsx`) | exists, **tested** on the two request forms (2026-10-14 14:33); the sheet is not audited yet. On the contract forms the stage is still passed from the form's own amount |
| A4 | **Contract.** The file becomes «متعاقد»: the form locks, the parties are kept as signed | `files.ts` › `moveFileStage` to `CONTRACTED`, which emits `file.contracted` | The stage strip on the hub `/files/:id` (`stage-strip.tsx`). `/files/:id/contract` (renewal, ending, clauses) and `/files/:id/residents` are placeholders | The contract form: `/files/:id/form/print`; for a building or a complex also `/files/:id/residents/print` | exists, **tested** for the four contract forms (`moveFileStage`) and the two request forms (by the accepted quote) |
| A5 | **Schedule.** Visits are created from the form's days and hours, dues from its payment terms; the task list; the team | Operations `events.ts` on `file.contracted` › `operations/services/programme.ts` › `generateFileVisits` (from the screen: `previewVisitGeneration`, `generateVisits`); Money `events.ts` › `money/services/dues.ts` › `syncDues`; tasks: `operations/services/file-tasks.ts`; team: `operations/services/assignment.ts` › `assignVisitWorker`, `confirmVisit` | A file's visits `/files/:id/visits`; tasks `/files/:id/tasks`; the week `/work-program`; the team card on the visit page `/visits/:id` | none | exists, **tested** in the four divisions: visits and dues appear from `file.contracted`, and every seat of every visit of the month is filled from People's workers |
| A6 | **Printed mission order.** The order of a visit goes to paper; the print is counted and the tick list frozen | `operations/services/mission-order.ts` › `getMissionOrder`, `recordOrderPrinted` | `/visits/:id/print` (from the day board `/visits`, the visit page, or a file's visits) | `operations/sheets/mission-order-sheet.tsx` | exists, **tested** (the print is logged as a disclosure) |
| A7 | **Attendance.** Arrival is reported by phone; arrival and departure of each worker are typed from the returned order | `operations/services/visit-entry.ts` › `reportArrival`, `saveReturnedOrder`; the overview: `operations/services/worker-attendance.ts` › `listAttendanceOverview` | «الوصول» on the day board `/visits` and on الرئيسية; the returned order on `/visits/:id`; عمال النظافة › الحضور والغياب `/worker-attendance` | the attendance block of the mission order | exists, **tested** through `saveReturnedOrder` (`reportArrival` is not walked) |
| A8 | **Sign-off.** Tick list, completion, the client's sign-off and his 1-to-5 rating are typed in; the visit is done | `visit-entry.ts` › `saveReturnedOrder`, which emits `visit.signedOff`; a dissatisfied sign-off opens a complaint (`operations/services/complaints.ts` › `openComplaintFromSignoff`); the last visit of an on-demand job: `operations/services/extra-visits.ts` › `onDemandJobFinished` | The returned order on `/visits/:id` | the sign-off slip, last page of the mission order | exists, **tested**: every visit of the month ends `DONE` |
| A9 | **Invoice.** What is due is found, the invoice issued with its number, its legal fields and its visit statement | `money/services/invoices.ts` › `listInvoiceCandidates`, `prepareInvoice`, `issueInvoice` (refusals: `INVOICE_BLOCKERS`) | المصاريف › الفواتير: `/invoices`, `/invoices/new` | `/invoices/:id/print` (`money/sheets/invoice-sheet.tsx`), `/invoices/:id/print-statement` (`visit-statement-sheet.tsx`) | exists, **tested** in the four divisions and on both on-demand jobs. An organisation's RC, NIS and NIF are typed first with `clients/services/clients.ts` › `saveClientIdentifiers` (the client card `/clients/:id`), **tested**; without them `issueInvoice` refuses, **tested** |
| A10 | **Payment.** The payment is recorded against the invoice; a cash payment gets its receipt with stamp duty | `money/services/payments.ts` › `recordPayment` (receipts for a collector: `issueReceiptBatch`); debts and the reminder: `money/services/debts.ts` › `listOpenDues`, `getPaymentReminder` | المصاريف › التسديد والديون: `/payments` (`money/components/record-payment-dialog.tsx`). The file's part `/files/:id/payments` is a placeholder | `/payments/receipts/:id/print` (`cash-receipt-sheet.tsx`); `/payments/reminders/:fileId/print` (`payment-reminder-sheet.tsx`) | exists, **tested**: a cash payment, its receipt and its stamp duty; the file's part is **missing** (Money) |
| A11 | **Income and reports.** The paid amount shows under its division | `money/services/reports.ts` › `getIncomeData` | `/income`, `/reports` (Money's rounds 1 and 2, done 2026-10-14) | none | income exists and is **tested** (the payment under its division, contract and on-demand); the reports screen exists, not yet walked by a test nor audited |

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
| B1 | Register a worker on his form, signed in as the HR officer | `people/services/workers.ts` › `registerWorker` (the check: `people/services/staff-shared.ts` › `passSanctionCheck`) | عمال النظافة › العمال › new: `/workers/new`; the file: `/workers/:id` | none | exists, **tested**. The HR officer leaves «قرار الإدارة» empty: recording it needs `hiring.decide` |
| B2 | Print the filled form: the page asks why, the reason is logged | `people/services/worker-reads.ts` › `workerFormForPrint` | `/workers/:id/print`, `/workers/:id/print-registration`, `/workers/:id/print-regulations` | `people/sheets/worker-registration.tsx`, `worker-regulations.tsx` | exists, **tested**: refused without a reason, logged with it |
| B3 | Print the blank form | none | `/workers/print` | the same sheets, empty | exists |

## C. A stock hand-out is recorded

| # | Step | Service | Screen and route | Sheet | State |
|---|---|---|---|---|---|
| C1 | Hand out equipment and materials to a worker for a contract or a visit; the stock goes down | `stock/services/handouts.ts` › `createHandOut` (movement: `stock/services/movements.ts` › `addMovement`) | المخزون › التسليم: `/handouts`, `/handouts/new`. The file's part `/files/:id/handouts` is a placeholder | `/handouts/:id/print` (`stock/sheets/handout-slip-sheet.tsx`) | exists, **tested**: stock down by what went out; the file's part is **missing** (Money and stock) |
| C2 | Take it back: what returns, in what state, what is short | `handouts.ts` › `recordHandOutReturn` | `/handouts` (`return-dialog.tsx`) | none | exists, **tested**: the tool comes back and its stock with it |

## D. The two alerts fire

| # | Step | Service | Screen and route | State |
|---|---|---|---|---|
| D1 | A contract inside its lead time shows on the home screen and opens the files list filtered to it | `money/alerts.ts`, key `contract.ending`, lead `alerts.contractEndLeadDays`; the tiles: `core/services/alerts.ts` › `evaluateAlertsQuery` | الرئيسية `/home`, then `/files` | exists, **tested** on the demo data: the tile counts 1 on 12 October and 2 on 28 October, when the home contract ending on 12 November comes inside its lead time |
| D2 | A contract past its end date ends by itself when the day starts | `clients/daily.ts` › `clients/services/files.ts` › `endExpiredContracts`, which emits `file.ended` | none (the day-start job) | exists, **tested**: `runDayStart` on 13 November ends that contract with `EXPIRED`, once, and leaves none of its visits open |
| D3 | A payment due inside its lead time, and one overdue, each show on the home screen and open the dues list | `money/alerts.ts`, keys `payment.dueSoon` and `payment.overdue`, lead `alerts.paymentDueLeadDays`; the dues: `money/services/dues.ts` › `syncDues` | `/home`, then `/payments?view=dues&state=DUE_SOON` or `OVERDUE` | exists, **tested** on the demo data: both tiles count above zero on 28 October, read as the accountant |

## E. The suspended-or-penalised check fires and waits

| # | Step | Service | Screen and route | State |
|---|---|---|---|---|
| E1 | Somebody is «موقف» or «معاقب» | `people/services/sanctions.ts` › `setSanction` | «توقيف أو معاقبة» on a file: `/workers/:id`, `/employees/:id` | exists, **tested** |
| E2 | Registering the same person again (a worker, an employee, or a client on a file) is stopped: «هل نسمح له أم لا؟» | `sanctions.ts` › `checkSanction`; the question: `people/services/sanction-decisions.ts` › `requestDecision`; the gate: `people/components/sanction-gate.tsx` | `/workers/new`, `/employees/new`, `/files/new` | exists, **tested** for a worker, an employee and a client on a file |
| E3 | The question waits: a tile on the home screen and a line in the manager's list | `people/alerts.ts`, key `sanction.pending`; `sanction-decisions.ts` › `listDecisions` | `/home`, `/workers/sanctions` | exists, **tested** through `listDecisions` (the tile is not read) |
| E4 | The manager, signed in himself, answers yes or no | `sanction-decisions.ts` › `answerDecision` | `/workers/sanctions` | exists, **tested**: yes and no, the yes logged as `APPROVE` with its reason |
| E5 | On a yes the registration is saved and the yes is used once; on a no it is refused | `sanctions.ts` › `consumeDecision`, inside `registerWorker`, `registerEmployee` or `registerFile` | the form again, opened from the answer | exists, **tested**: the yes is marked used and opens the door to nobody else; a no keeps refusing |

The same path is walked, with real sign-ins, by `src/testing/scenarios/sign-in-and-the-managers-answer.test.ts`.

## Missing, by owner

| Owner | Missing | Blocks |
|---|---|---|
| Clients and contracts | nothing on the path since 2026-10-14: the first visit, the quote and the client's identifiers exist and are tested | none |
| Money and stock | nothing on the path since 2026-10-14 (`/reports`, `/files/:id/payments` and `/files/:id/handouts` exist; their audit is the next part) | none |
| Operations | nothing on the path | none |
| People | nothing on the path | none |
| Foundation | nothing on the path | |
