# Money and stock: handover

Features 19, 20, 22, 30, 31, 32, 34, 35, 39, 41, 48; the division expense and income lines; hand-outs per job; the contract-end and payment-due alerts. Folders `src/features/money/**`, `src/features/stock/**`; pages `expenses/`, `income/`, `invoices/`, `payments/`, `reports/`, `inventory/`, `handouts/`, `purchases/`, `maintenance/`, `files/[id]/handouts/`, `files/[id]/payments/`. Stock's screens are in money's route list.

## What exists (end of round 3)

**Services** (all tested on `createTestDatabase()`):

| Service                                   | What it does                                                                                                                                                                                                                                                      |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `money/services/dues.ts`                  | `syncDues` builds and keeps a file's dues from its terms (events below); `listFileDues`, `getFilePaymentSummary` (the hub tile, «حالة الدفع»)                                                                                                                     |
| `money/services/invoices.ts`              | `listInvoiceCandidates`, `prepareInvoice` (lines, totals, visit statement, blockers), `issueInvoice` (legal number, chain, digest), `voidInvoice` (a `VOIDED` event), `listInvoices`, `getInvoiceSheet`, `recordInvoicePrinted`                                   |
| `money/services/payments.ts`              | `recordPayment` (allocation oldest first, stamp duty on cash, receipt), `voidPayment`, `listPayments`, `listPayableFiles`, `issueReceiptBatch` + `getReceiptBatch` (numbered blanks for a collector), `listCollectors`, `getReceiptSheet`, `recordReceiptPrinted` |
| `money/services/debts.ts`                 | `listOpenDues` (the debt list), `getFileMoney` (a file's part «التسديد»), `getPaymentReminder` + `recordReminderPrinted`                                                                                                                                          |
| `money/services/reports.ts`               | `getIncomeData` (income screen), `getPeriodReport` (result per division, indicators, forecast, per file)                                                                                                                                                          |
| `money/services/expenses.ts`              | list, create, update, soft delete (manual rows only)                                                                                                                                                                                                              |
| `money/services/wages.ts`                 | `postPayoutExpenses` / `removePayoutExpenses`: People's payouts in the expenses (RULINGS A1)                                                                                                                                                                      |
| `stock/services/items.ts`, `movements.ts` | the inventory; every quantity moves through the ledger                                                                                                                                                                                                            |
| `stock/services/handouts.ts`              | create (against a file, a visit and a named worker), return (lost or damaged → `handout.returnedShort`), cancel, list, slip, `getHandOutsForVisit` (Operations' mission order), the form's choices (with the store's pieces)                                      |
| `stock/services/purchases.ts`             | suppliers, purchases (stock in, pieces numbered, average cost, one expense per kind)                                                                                                                                                                              |
| `stock/services/counts.ts`                | counts and their adjustments (no screen yet)                                                                                                                                                                                                                      |
| `stock/services/maintenance.ts`           | the pieces, their schedule, maintenance records (the cost becomes an expense on «عام»)                                                                                                                                                                            |

Round 3 added:

| Service                            | What it does                                                                                                                                                                                  |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `money/services/reconciliation.ts` | «المطابقة اليومية»: a collector's day (its receipts USED, VOIDED or MISSING, the cash expected), `declareReceipt`, `closeReconciliation` (final; one correction), `countUnreconciledReceipts` |
| `money/services/credit.ts`         | INV-2: `rebalanceFile` after an invoice or its void, `settleCredit` before a payment, `fileCredit`                                                                                            |
| `money/services/profitability.ts`  | #30: `getFileProfitability` (estimate against actual, `cost.read`, CONSULT logged once a day)                                                                                                 |
| `money/services/exports.ts`        | #48: `buildAccountantExport` (four CSV files, `ExportBatch`, DISCLOSE logged)                                                                                                                 |
| `stock/services/counts.ts`         | `listCounts` beside open, type, close                                                                                                                                                         |
| `stock/seeds.ts`                   | the 29 seeded items (fixed ids `stock-item-<code>`, inserts what is missing)                                                                                                                  |

**Events** (`money/events.ts`): `file.contracted`, `file.termsChanged`, `file.ended`, `visit.signedOff`, `visit.statusChanged` → `syncDues`; `payout.recorded` → `postPayoutExpenses`; `payout.voided` → `removePayoutExpenses`.

**Alerts**: `money/alerts.ts` (`contract.ending`, `payment.overdue`, `payment.dueSoon`, `receipts.unreconciled`), `stock/alerts.ts` (`stock.low`, `maintenance.due`).

**Screens**: المصاريف حسب القسم, المداخيل حسب القسم, الفواتير (list, `invoices/new`), التسديد والديون (payments, debts, payment dialog, blank receipts), التقارير والمؤشرات; جرد المخزون (item dialog), التسليم (list, `handouts/new`, return dialog), المشتريات (list, `purchases/new`), الصيانة; a file's parts التسديد (with «ربحية العقد» for `cost.read`) and التسليم. Round 3: the third view of التسديد والديون, «المطابقة اليومية», and a collector's day (`payments/reconciliation`), where a blank receipt's payment is typed from his copy; «الجرد» (`inventory/counts`, `inventory/counts/:id`); the forecast's renewals and «ملفات المحاسب» on the reports.

**Sheets**, all from stored rows: the invoice and its visit statement, the cash receipt (and a block of blank ones), the payment reminder, the hand-out slip.

**Demo** (`money/demo.ts`, `stock/demo.ts`). On Monday 12 October 2026 each tile is lit by a named record:

| Tile              | Record                                                                            |
| ----------------- | --------------------------------------------------------------------------------- |
| `contract.ending` | `money.pastContract` (ends 31 October)                                            |
| `payment.overdue` | `money.dueOverdue` (15 September, invoiced as `money.invoiceOutstanding`, unpaid) |
| `payment.dueSoon` | `money.dueSoon` (15 October)                                                      |
| `stock.low`       | `stock.itemLow`, and the other sample items below their minimum                   |
| `maintenance.due` | `stock.unitMaintenanceDue` (next service 15 October)                              |

`money.invoicePaid` is paid in cash (`money.paymentCash`, receipt `money.receiptPaid`) and shows in the income and the reports under المنازل. `money/demo.test.ts` checks all of this.

The block of blank receipts handed to `people.workerLeader` this morning (`money.receiptBlock`) lights `receipts.unreconciled` from the next day (`--now 2026-10-13`). The demo's store is the 29 seeded items: the office sets his four minimums, counts the materials on 1 October, buys on 5 October.

## The accountant's files (#48)

CSV, UTF-8 with a byte-order mark, `;` between columns, Windows line ends; amounts `12000,00` (comma before two decimals, no thousands mark), dates `DD/MM/YYYY`, codes in his words. From «التقارير والمؤشرات» for `export.run`, over the period on screen. Every file is an `ExportBatch` row (kind, period, rows, SHA-256) and a DISCLOSE entry.

| File                       | Columns                                                                                                                                                                                                                                |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sales journal (`INVOICES`) | رقم الفاتورة; تاريخ الفاتورة; العميل; NIF العميل; RC العميل; رقم الملف; القسم; طريقة السداد; المجموع خارج الرسم; الرسم على القيمة المضافة; المبلغ المستحق; حق الطابع; الصافي للدفع; الحالة (صادرة / ملغاة); تاريخ الإلغاء; سبب الإلغاء |
| Cash receipts (`RECEIPTS`) | رقم السند; تاريخ السند; المحصِّل; رقم الملف; العميل; مسدد أتعاب; المبلغ; حق الطابع; المجموع المقبوض; الحالة (مستعمل / فارغ / ملغى / مفقود); السبب                                                                                      |
| Payments (`PAYMENTS`)      | تاريخ الدفع; رقم الملف; العميل; القسم; طريقة الدفع; رقم المرجع; المبلغ; حق الطابع; المجموع المقبوض; رقم السند; الفواتير; الحالة (صحيح / ملغى)                                                                                          |
| Expenses (`EXPENSES`)      | التاريخ; القسم; البند; المبلغ; طريقة الدفع; المستفيد; المصدر (يدوي / شراء / صيانة / أجور); ملاحظة                                                                                                                                      |

## The invoicing audit (scratchpad/audit/for-money.md)

| Finding | State                                                                                                                                                                                                                                                                                                                   |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| INV-2   | Fixed: `credit.ts`. An invoice or a void that brings a due below what was paid moves the excess to the next open dues, oldest first; the rest is the file's credit, shown on its part, the debt list and the reminder, and placed first at the next payment. `voidPayment` reverses only the allocations still in force |
| INV-3   | Fixed: `SELLER_INCOMPLETE` also asks for the centre's article number and address                                                                                                                                                                                                                                        |
| INV-4   | Fixed: an organisation's invoice waits for «السجل التجاري» (`BUYER_TRADE_REGISTER_UNANSWERED`), its RC when نعم, its NIF and NIS always (`BUYER_NO_TAX_IDS`)                                                                                                                                                            |
| INV-6   | Fixed: a missed-visit deduction is so many visits at a negative unit price when it divides into whole centimes, else one lump-sum line («جزافي»), the count in its words                                                                                                                                                |
| INV-7   | Fixed: the city is frozen in `sellerSnapshot.city`; a reprint prints it                                                                                                                                                                                                                                                 |
| INV-8   | Fixed: a billing address prints alone; the site's commune and wilaya go only with the site's address                                                                                                                                                                                                                    |
| INV-X1  | Fixed: `buyerSnapshot.siteAddress` and `.fileNumber` frozen at issue; the statement prints them                                                                                                                                                                                                                         |
| INV-X2  | Fixed: `Payment.clientName` and `.fileNumber` (Foundation's columns) are filled when the payment is recorded; the receipt prints them                                                                                                                                                                                   |

## The Checker's screen and sheet audit

- S-28: the forecast table on the reports fits in French at 1024×640 (shorter French column titles).
- The visit statement keeps its last three rows, its counts and its signatures together (`KeepTogether`); the rows before them run on as they come, the title row repeated on each page.
- Decree 05-468 under VAT (the coordinator's ruling): each line shows its unit price and amount before tax. A price typed with its tax in it is brought back line by line (`shareBeforeTax`): the totals are computed on what was typed, so the total with tax is the agreed one to the centime; each line takes its share of the total before tax, the rounding left over goes to the largest line, and a line that no longer multiplies out becomes one lump sum. `Invoice.pricesIncludeVat` says whether the lines carry the tax: under VAT it is now 0 (the database's check ties it to the lines), and the price agreed with its tax is the file's `amountIncludesVat` and the invoice's total with tax.

## The screen-column audit (N2-06 to N2-18, F-30b, F-41) and feature 47

- التسليم as his page draws it: the side «المعدات · المواد» (`?kind=`), then «نوع الخدمة» «الكل · عند الطلب · عقد» (`?service=`), then the four divisions with «الكل» (`?division=`), all four under either service type; a worker's own kit shows only under «الكل». `listHandOuts` filters.
- The reports carry «ربحية العقود» (for `cost.read`), the analytics by service type, zone and client, and the cash flow of the period (payments as received, stamp duty and tax in, like «المحصَّل»; expenses as paid, the tax handed over among them as «ضرائب»); a print page `/dashboard/reports/print` (the sheet `period-report-sheet.tsx`, client letterhead, its print a DISCLOSE).
- Hours are written `h:mm` everywhere (S-33), by `rules/hours.ts` `hoursText()` inside `<Ltr>` / `<Num>`: the reports, their print, the profitability card, the visit statement.
- A branch filter on the reports and their print (`?branch=`), drawn when the centre has several; the services take `branchId`. People's payroll in the forecast stays the whole centre's.

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

- Not built: renewals of contracts paid visit by visit in the forecast (their next visits are not planned).
- «ربحية العقد» is drawn on the file's part التسديد; the hub can draw it too (`FileProfitabilityCard`, below).

## What I need from others

- Foundation: the export kind `RECEIPTS` in OPTION-CODES `EXPORT_KIND` (the ruling's four files; the column is not checked); drop lines 101–102 of `src/lib/chain/canonical.ts`.
- Clients: draw `<FileProfitabilityCard fileId={…} />` (`src/features/money/components/file-profitability-card.tsx`) on the file hub if the hub is where #30 belongs; it draws nothing for a reader without `cost.read`.
- Operations: `listVisitsForBilling` and `listVisitWorkers` as exported reads (I read `Visit`, `VisitReport`, `VisitWorker` directly until then).
