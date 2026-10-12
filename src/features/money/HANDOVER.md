# Money and stock: handover

Features 19, 20, 22, 30, 31, 32, 34, 35, 39, 41, 48; the division expense and income lines; hand-outs per job; the contract-end and payment-due alerts. Folders `src/features/money/**`, `src/features/stock/**`; pages `expenses/`, `income/`, `invoices/`, `payments/`, `reports/`, `inventory/`, `handouts/`, `purchases/`, `maintenance/`, `files/[id]/handouts/`, `files/[id]/payments/`. Stock's screens are in money's route list.

## What exists (start of round 1)

- **Rules** (`money/rules/`, pure, tested): centimes and shares, dates, stamp duty (bands, whole or progressive), invoice totals (VAT or IFU, missed visits), the amount in words (Arabic, French), the due schedule (A7), income by division (collected, before tax), profitability, forecast, alerts (contract end, payment due, ages), the period of a money screen, quantities. `stock/rules/`: low stock, maintenance due, the inventory chip.
- **Sheets** (`money/sheets/`, `stock/sheets/`), drawn from sample objects: the invoice, its visit statement, the cash receipt (filled and blank), the payment reminder, the hand-out slip.
- **Screens** from sample objects with a "sample data" notice: «المداخيل حسب القسم», «المصاريف حسب القسم» with the expense dialog, «جرد المخزون».
- **Validators**: expense, period; the option codes of both folders.

## Conventions I follow

- Money in centimes, quantities in thousandths, dates `YYYY-MM-DD`, everything integer. One helper writes money, everywhere: `formatMoney` (dot for thousands, comma for decimals, always two decimals, «195.650,00 دج»).
- The database stores codes; labels in `MoneyCodes.*`, `StockCodes.*`, or `Options.*` for the shared lists (`src/lib/options`, re-exported from my option codes).
- A service is `(ex, ctx, input)` in `services/`, tested on `createTestDatabase()`; it refuses with an English sentence under `Errors`; the screens call `action(...)` and `query(...)`.
- Chained rows (invoice, lines, visit rows, payment, allocations, receipt, legal events) only through `appendChained`, every column given; the invoice number through `peekLegalNumber` after `assertClockSane`; the content digest before anything is written. Nothing is updated or deleted there: a void is a `LegalEvent`.
- The cached totals `PaymentDue.paidAmount` and `StockItem.onHandQty` are never sent in an update: allocations and movements move them.
- Every screen names its closest academy screen and uses the newer generation; Arabic first, `<Ltr>` around digits; sheets are Arabic, A4, inside `SHEET_BODY`, never over the letterhead.

## Rulings I was given

- Stamp duty: on the whole amount; 300,00 DA itself taxed; no ceiling; no rounding beyond the 100 DA bands; base is the total with tax; charged per cash payment. The amount in words is the net to pay. The IFU wording is mine, editable. The seller's NIN prints only when set; the article number prints for both parties; a household client shows name and address only.
- 19% VAT, no credit notes, receipt contents and retention: defaults, on the accountant's list.
- One hash chain, Foundation's (`src/lib/chain`). My `rules/hash-chain.ts` goes when my services write; tamper tests point at `src/lib/chain`.
- Printed sheets: nothing over the letterhead or footer pictures. The fallback font is Noto Naskh Arabic; no size tuning for the old sans.
- Round 0b interpretations accepted: equipment first; his column headers; "at or below" the minimum; his expense categories; «عام» for expenses only; outstanding as of today; «طريقة الدفع» for expenses; «خارج الرسم».
- Money format: one format everywhere, the academy's («195.650,00 دج»), on screen and on paper, through one helper.

## Open items

- Payouts to staff (`payout.recorded`, `postPayoutExpense`) wait for People's payout service and `getPayoutForExpense`.
- Receipt batches for collectors and the daily cash reconciliation (#32) are not built.
- Profitability (#30), forecast (#41), indicators and exports (#34, #48) are rules only.

## What I need from others

- Foundation: whether `formatMoney` should live in `src/lib`; the low-stock and payment tiles (next round); drop the line in `src/lib/chain/canonical.ts` that names my `hash-chain.ts`.
- Operations: `listVisitsForBilling` and `listVisitWorkers` as exported reads (I read `Visit`, `VisitReport`, `VisitWorker` directly until then); demo visits signed off.
- People: demo workers (a hand-out needs a named worker).
