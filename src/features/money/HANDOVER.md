# Money and stock: handover

Features 19, 20, 22, 30, 31, 32, 34, 35, 39, 41, 48; the division expense and income lines; hand-outs per job; the contract-end and payment-due alerts. Folders `src/features/money/**`, `src/features/stock/**`; pages `expenses/`, `income/`, `invoices/`, `payments/`, `reports/`, `inventory/`, `handouts/`, `purchases/`, `maintenance/`, `files/[id]/handouts/`, `files/[id]/payments/`. Stock's screens are in money's route list.

## What exists (end of round 2)

**Services** (all tested on `createTestDatabase()`):

| Service | What it does |
|---|---|
| `money/services/dues.ts` | `syncDues` builds and keeps a file's dues from its terms (events below); `listFileDues`, `getFilePaymentSummary` (the hub tile, «حالة الدفع») |
| `money/services/invoices.ts` | `listInvoiceCandidates`, `prepareInvoice` (lines, totals, visit statement, blockers), `issueInvoice` (legal number, chain, digest), `voidInvoice` (a `VOIDED` event), `listInvoices`, `getInvoiceSheet`, `recordInvoicePrinted` |
| `money/services/payments.ts` | `recordPayment` (allocation oldest first, stamp duty on cash, receipt), `voidPayment`, `listPayments`, `listPayableFiles`, `issueReceiptBatch` + `getReceiptBatch` (numbered blanks for a collector), `listCollectors`, `getReceiptSheet`, `recordReceiptPrinted` |
| `money/services/debts.ts` | `listOpenDues` (the debt list), `getFileMoney` (a file's part «التسديد»), `getPaymentReminder` + `recordReminderPrinted` |
| `money/services/reports.ts` | `getIncomeData` (income screen), `getPeriodReport` (result per division, indicators, forecast, per file) |
| `money/services/expenses.ts` | list, create, update, soft delete (manual rows only) |
| `money/services/wages.ts` | `postPayoutExpenses` / `removePayoutExpenses`: People's payouts in the expenses (RULINGS A1) |
| `stock/services/items.ts`, `movements.ts` | the inventory; every quantity moves through the ledger |
| `stock/services/handouts.ts` | create (against a file, a visit and a named worker), return (lost or damaged → `handout.returnedShort`), cancel, list, slip, `getHandOutsForVisit` (Operations' mission order), the form's choices (with the store's pieces) |
| `stock/services/purchases.ts` | suppliers, purchases (stock in, pieces numbered, average cost, one expense per kind) |
| `stock/services/counts.ts` | counts and their adjustments (no screen yet) |
| `stock/services/maintenance.ts` | the pieces, their schedule, maintenance records (the cost becomes an expense on «عام») |

**Events** (`money/events.ts`): `file.contracted`, `file.termsChanged`, `file.ended`, `visit.signedOff`, `visit.statusChanged` → `syncDues`; `payout.recorded` → `postPayoutExpenses`; `payout.voided` → `removePayoutExpenses`.

**Alerts**: `money/alerts.ts` (`contract.ending`, `payment.overdue`, `payment.dueSoon`), `stock/alerts.ts` (`stock.low`, `maintenance.due`).

**Screens**: المصاريف حسب القسم, المداخيل حسب القسم, الفواتير (list, `invoices/new`), التسديد والديون (payments, debts, payment dialog, blank receipts), التقارير والمؤشرات; جرد المخزون (item dialog), التسليم (list, `handouts/new`, return dialog), المشتريات (list, `purchases/new`), الصيانة; a file's parts التسديد and التسليم.

**Sheets**, all from stored rows: the invoice and its visit statement, the cash receipt (and a block of blank ones), the payment reminder, the hand-out slip.

**Demo** (`money/demo.ts`, `stock/demo.ts`). On Monday 12 October 2026 each tile is lit by a named record:

| Tile | Record |
|---|---|
| `contract.ending` | `money.pastContract` (ends 31 October) |
| `payment.overdue` | `money.dueOverdue` (15 September, invoiced as `money.invoiceOutstanding`, unpaid) |
| `payment.dueSoon` | `money.dueSoon` (15 October) |
| `stock.low` | `stock.itemLow`, and the other sample items below their minimum |
| `maintenance.due` | `stock.unitMaintenanceDue` (next service 15 October) |

`money.invoicePaid` is paid in cash (`money.paymentCash`, receipt `money.receiptPaid`) and shows in the income and the reports under المنازل. `money/demo.test.ts` checks all of this.

## Conventions I follow

- Money in centimes, quantities in thousandths, dates `YYYY-MM-DD`, everything integer. Money is written by Foundation's `formatMoney` / `useMoneyText` (re-exported from `rules/centimes.ts` and `components/use-money-text.ts`).
- The database stores codes; labels in `MoneyCodes.*`, `StockCodes.*`, or `Options.*` for the shared lists.
- Writes refuse in their service: `requireSection(ctx, "MONEY" | "STOCK", "WRITE")` and the capability (`invoice.issue`, `invoice.void`, `payment.void`, `stock.manage`). Payments are gated by `payment.record` alone, so reception records them from the file's part. Screens leave out what the reader could only be refused (`useSectionLevel`, `useCan`).
- Chained rows only through `appendChained`; `PaymentDue.paidAmount` and `StockItem.onHandQty` are never named in an update.
- A tab page is headed with its tab's label (the first tab keeps the section heading); Save is `success` at the foot in `PageActions`, cancel `outline` beside it; tables fit at 1024×640 in French (long cells truncate, one labelled row action, the others icons).

## Rulings I was given

- Stamp duty: on the whole amount, base the total with tax, per cash payment, no ceiling. The amount in words is the net to pay.
- One hash chain, Foundation's. My `rules/hash-chain.ts` is gone.
- Printed sheets: nothing over the letterhead or footer; Noto Naskh Arabic stands in.
- Round 0b interpretations accepted (equipment first; his column headers; "at or below" the minimum; his expense categories; «عام» for expenses only; outstanding as of today; «طريقة الدفع» for expenses; «خارج الرسم»).
- Money format: «195.650,00 دج» everywhere, through one helper.
- Wages in expenses (RULINGS A1): posted on the payout's day, split by the payslip's minutes; the payout that completes a payslip posts its contributions and IRG.

## Interpretations (to confirm)

- An invoice is issued from dues that are ready: a period once it has ended and its visits are closed and signed off; a visit once billed; a job once its visits are done. No draft table: the screen shows `prepareInvoice`, issuing recomputes it.
- The model's two payment keys are both registered (`payment.dueSoon`, `payment.overdue`) where the brief said `payment.due`.
- A cash receipt is dated the day it is written (today), whatever day the money was received.
- A purchase's expense is split by kind: one MATERIALS and one EQUIPMENT expense.
- A maintenance cost goes on «عام»; contributions and IRG posted with a completed payslip carry no payment method (owed, not yet paid).
- The forecast counts the expenses marked monthly, the last closed pay run and the average of the other expenses of the last three months; renewals are not counted yet.
- The reports keep «عام» as its own line: the common expenses are not spread over the divisions.

## Open items

- Not built: the daily cash reconciliation of receipts (#32 `receipts.unreconciled`), the stock count screen (service exists), per-contract profitability with labour cost (#30, rule exists, needs `cost.read` and People's hours), the accountant's export (#48, format not named), renewals in the forecast.
- A collector's payment typed against a blank receipt (`receiptId` in `recordPayment`) has no screen yet.

## What I need from others

- Foundation: drop lines 101–102 of `src/lib/chain/canonical.ts` (they name my removed `hash-chain.ts`).
- Clients: the files list should read `?ids=` (the `contract.ending` tile opens `/dashboard/files?ids=…` when several contracts end).
- Operations: `listVisitsForBilling` and `listVisitWorkers` as exported reads (I read `Visit`, `VisitReport`, `VisitWorker` directly until then).
