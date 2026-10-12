# Rulings needed (data model, revision 2)

48 items, most consequential first inside each part. Each gives **the default now built in** and what changes if the ruling goes the other way. The twelve rulings the coordinator gave on the first draft are built in and are no longer listed (one staff table; work profile on the site; invoices insert-only with a separate draft; one chain per table, hashed in TypeScript, anchored outside; counters jump after a restore; no REAL column; workers' leave in `WorkerAbsence`; sets as JSON; wilaya list and commune table; `Visit.billable` with Money's override and one payment method per invoice; visits generated at «متعاقد» and expiry by the day-start job; fewer tables).

Who can settle it: **Co** the coordinator, **Dev** the developer, **Client** the client or his accountant. P People, C Clients, O Operations, M Money, F Foundation.

## A. Decide before the builders start: these change tables or contracts

**1. Wages in expenses: when, and which amounts.** (Co)
The first draft posted gross wages when a pay run closed. Money's review asks for the same basis on both sides: income is counted on the day money comes in.
- Default: an expense is money out. Every payout to a person (advance or wage) posts a WAGES expense on the day it is paid, split by the payslip's minutes per division (an advance goes to COMMON); the payout that completes a payslip also posts its CONTRIBUTIONS (employee CNAS, IRG withheld, employer CNAS). Closing a run posts nothing. `Expense.staffPayoutId` ties each row to its payout.
- If wages should be counted when earned: post once at closing, per division, from `Payslip.divisionMin`; drop the two payout events; a month's profit then no longer matches the cash that left.
- If contributions should appear only when the centre really pays CNAS and tax: the second posting goes, and the accountant types those payments.

**2. A renewal is a new file.** (Co)
- Default: `renewFile` creates a new file (`File.renewalOfFileId`) with its own sheet, dates, amount, visits and dues; the old contract runs to its `endDate`, where the day-start job ends it as RENEWED. Operations copies the programme (areas, tasks, slots, team, inspection plan) to the new file. Equipment stored at the place is tied to the site, so nothing moves.
- If one file should live across renewals: add a contract-period table to C, a period key on slots, visits and dues, and drop the copy. C's "always a new sheet to sign" then no longer maps one sheet to one file.

**3. A first deep clean followed by a periodic contract, on one sheet.** (Co)
A quote may carry an INITIAL_JOB line beside the PERIODIC ones, but his contract sheet has one «المبلغ إجمالي». Two reviews disagreed (a due on the same file; or a second, on-demand file).
- Default: one file. The contract's amount is the periodic part; Money builds one extra due of kind INITIAL_JOB from the accepted quote; Operations offers one visit of origin INITIAL, which is not billed per visit.
- If a second file: no INITIAL_JOB due and no INITIAL origin; accepting the quote opens an on-demand file with its own sheet and number.

**4. Numbers that already exist on paper.** (Client, Dev)
- Default: a client's «رقم الملف» and a file's «رقم التسجيل» can be typed (capability `file.setNumber`), and each ordinary counter can start from `numbering.startAt`. Invoices and receipts start at 1 for the year; if the centre already issued some on paper this year, the manager declares them once at first run (a `SequenceGap` of kind OPENING) and the program goes on after them.
- If the paper numbers are abandoned: remove the capability; nothing else changes.

**5. The tables merged in this revision.** (Co, to confirm; each can be undone alone)
119 models became 106, with no field lost:
- `LegalEvent` replaces three event tables; a receipt is "used" when a payment points at it, and the payment row carries what the receipt says. If Money prefers the receipt's content on its own row: bring back the receipt-event table with its payload columns (one more chain).
- `StaffConfidential` replaces the health and score tables (two capabilities, two column groups). If two tables are preferred: split it again; nothing else moves.
- Photo sets are rows of Foundation's `Upload` (no photo table for C or O). If photo tables are preferred: two tables come back and `Upload` loses four columns.
- `File.clauses`, `CostStudy.lines`, `FirstVisit.spaces` are JSON. If rows are preferred: three tables come back.
- `FileDescription` (one for three), `FileProgramme` (work-profile switches and inspection plan), `SupervisorAssignment` (zone or worker), `RoleGrant` (section levels and capabilities), `StaffMember.skillCodes` (was a join table), setting `system.alertsNotified` (was a table).

**6. The wilaya list: 58, or the longer list.** (Dev) **Settled: 69 (RULINGS.md item 6).**
The coordinator ruled 58. Two reviewers believe wilayas were added in late 2025; neither verified it, and I cannot here.
- Default: 58, as ruled. The list is a data file and no constraint names the range, so a longer list is a change of that file only.

**7. A client's «متوقف / معاقب» lives only in People's `Sanction` rows.** (Co)
- Default: `Client` has no sanction column; C reads `getSanctionStates` and writes through `setSanction`. A dated suspension ends by itself.
- If columns on `Client` are wanted: four columns kept in step with `Sanction` by P's service.

**8. Two assumptions are validator rules, not database constraints.** (Co)
- "Buildings and complexes are contract only" (scope A1; his stock tree and the building form's «تنظيف بعد البناء» point the other way).
- "A pay run is monthly" (`pay.runPeriods`; People's review: a weekly payment is an advance settled on the monthly payslip).
- If either should be a CHECK: one line in the schema; lifting it later means rebuilding the table.

**9. Contacts keep their five flags.** (Co)
A review asked to drop three (`signsHandover`, `receivesInvoice`, `holdsKey`) as duplicates of site columns. They are fields Clients asked for, so they stay; what was missing is the rule.
- Default: the person on site of an order is the site's receiver columns, else the site's one coordinator contact, else the client.
- If dropped: three columns go; nothing reads them today.

**10. A worker's zone and supervisor: who writes.** (Co)
- Default: `StaffMember.zoneId` is P's column (default: the zone of her residence commune); O's supervisors screen changes it through `setWorkerZone`. The supervisor is O's (`SupervisorAssignment`, else the zone's).
- If O should own the worker's zone: a dated table of O, and P reads it.

**11. A worker who leaves or is sanctioned loses her future seats at once.** (Co)
- Default: P emits `staff.unavailable`; O sets her future seats REMOVED and returns those visits to «بانتظار التأكيد». Lifting a sanction only puts her back in the pickers.
- If the office should decide seat by seat: the handler only flags the visits.

**12. A sanctioned client with visits already planned.** (Co)
- Default: visits stay. Orders print when the manager's yes for that file was about that sanction (`decisionCovers`); otherwise each order needs a release (`order.releaseSanctioned`).
- If the visits should be cancelled instead: `cancelFutureVisits` with reason CLIENT_SUSPENDED on `sanction.changed`.

**13. Leave and absence.** (Co, Client's accountant)
- A leave that crosses a month end is cut into one row per month (`splitGroupId`). Alternative: keep one row and share its days by the calendar at pay time.
- Two classifications on a worker's absence: `category` always; `leaveType` only for LEAVE, never SICK there. Alternative: one merged list of twelve.
- Employees: leave in `EmployeeLeave`, absences in `EmployeeAbsence`; approving a leave writes no absence row.
- A half day needs its two times (which half), defaulting to a period of `work.period.*`.

**14. Which minutes count when a typed order has no work times.** (Co)
- Default: `VisitWorker.workedMin` is end minus start of work, else departure minus arrival, else empty; P counts the planned minutes for an empty one on a done visit and flags the line. O never invents minutes.

**15. Closing an on-demand file.** (Co)
- Default: when its last visit is DONE and no redo visit or complaint is open, O calls `closeFile(JOB_DONE)` in the same transaction; its due stays until paid.
- If C should decide by hand: O only raises a flag on the hub.

**16. Paid once: the seats a payslip paid.** (Co)
- Default: `PayslipSeat` records each seat a run paid; an order typed after the run closed is paid by the next run as arrears; a time corrected afterwards is listed as a difference.
- If a closed month should be reopened instead: no such table, and "frozen" loses its meaning.

## B. Settled by default: object, or accept

**17. Codes two builders wrote differently.** (Co) Kept: People's worker roles (`CLEANER`, `SENIOR_WORKER`, `TEAM_LEADER`); `WORKER_OWN` for the transport means; Operations' `TRAIN_WORKER` and `CHANGE_WORKER`; `WEEKLY` / `MONTHLY`; Operations' protective-kit codes with stock items named `PPE_` + code; every code in upper snake case; Operations' wording on the visit statement; catalogue codes without dots; job positions `RECEPTION_SALES` and `OPERATIONS` as the login roles, plus `STOREKEEPER`.

**18. The file's amount.** (Co) C's codes `PER_PAYMENT_PERIOD` / `WHOLE_CONTRACT`, required at «متعاقد» for contracts with the first preselected; `File.expensesIncluded` default true; whether the price includes VAT is frozen on the quote, on the file at «متعاقد» (`File.amountIncludesVat`) and on the invoice.

**19. One name per idea.** (Co) `numberSeq` / `number` on every numbered table, `note`, `sortOrder` against `seq`, minutes ending in `Min`. One request refused: `Sanction.state` keeps its name (it is the scope's "state", not a life-cycle).

**20. Columns and tables no builder asked for.** (Co, to accept or strike)
`StaffEvent`, `PayslipSeat`, `Commune`, `SequenceGap`, `BackupRun`, `InvoiceDraft`; the `hashV` column of the eight chained tables; `AuditLog.subjectKind`, `ownerCode`, `approvedByUserId`; `Upload.restrictedCapability`, `purgedAt`; `anonymisedAt` on four tables; `Branch.city`; `File.formKind`, `partySnapshot`, `amountIncludesVat`, `sourceVisitId`; `Client.nameKey`, `phoneKeys`, `managerNameKey`, `legalForm`; `Site.commonNameKey`, `mapLink`; `Quote.issuedDate`, `costTotal`, `marginBp`; `StaffMember.birthDatePresumed`, `issuedByEmployeeId`, `leaveOpeningDate`; `StaffDocument.isCurrent`, `isRestricted`, `version`; `Violation.status`; `PeriodicEvaluation.scaleMax`, `figuresSnapshot`; `Payslip.divisionMin`, `restDayMin`, `ordersNotTypedCount`; `Visit.slotDate`, `checklistFrozenAt`, `orderReleasedAt`; `VisitWorker.presenceProof`, `dayOrder`; `RuleOverride.derogationRef`, `ruleDate`; `FileTask.serviceCode`; `PaymentDue.paidAmount`, `draftId`; `StockItem.onHandQty`; `Payment.amountWordsAr`, `receiptReason`; `VisitBilling.amount`; `Expense.vehicleId`, `spentByName`, `staffPayoutId`; `EquipmentUnit.locationSiteId`; the cancel columns of `HandOut` and `Purchase`; `branchId` on three stock tables.

**21. Left out on purpose.** (Co)
Every `version` and `adminId` column; a status column on invoices; a period key on slots and visits (item 2); a client-credit table, a lead table, a vehicle-maintenance table, a manager-approval table, a replacement table; a Friday option on client forms, a difficulty scale, letter classes; every value the builders marked "derived", except the two cached totals.

**22. Smaller cross-owner defaults.** (Co)
- A complaint settled by a discount: no credit table; M's next run proposes the line, and `InvoiceLine.complaintId` marks it used.
- Lost or damaged equipment: nothing is written by itself; the manager adds the debt line.
- Vehicles: costs are ordinary expenses (`Expense.vehicleId`); their two expiry dates raise no alert; the maintenance table is for equipment only.
- The first visit does not show on the supervisor's day sheet.
- Leads: no table; a file opened from a returned sheet carries `File.sourceVisitId`.
- A supervisor who is also a cleaning worker is two staff rows; the sanction check matches them by identity.
- A worker on trial or with training unfinished: O warns, does not block.
- The manager's approval inside another session leaves no row of its own, only the log and the row that needed it.
- M's contract-ending list opens C's files list with M's ids; the profitability card is on M's «التسديد» page.
- `branchId` is required on sixteen tables, with one seeded branch.

**23. Lists whose wording is still the owner's to write.** (owners)
About forty code lists have codes and no Arabic (marked "—" in `OPTION-CODES.md`): most status, source and reason lists of P, C, O and M; `PAY_ITEM_TYPE` and `PAYSLIP_ITEM_SOURCE` are placeholders; the new codes of this revision (`SERVICE_LEAD`, `PROGRAMME_CHANGED`, `RESTING`, `MISSING`, `STOREKEEPER`, the violation statuses). None blocks the schema.

## C. For the developer

**24. The database was proven on Node's SQLite, not on the engine that ships.** (Dev) `tools/build-ddl.mjs` loads all 106 tables and 118 triggers, and `tools/model-proof.mjs` passes 157 checks, on `node:sqlite`. The Rust test on sqlx's bundled SQLite is Foundation's first job. The checks prove database rules only: no service exists yet.

**25. The single connection must never be recycled.** (Dev) sqlx's pool defaults close a connection after thirty minutes, which tears a transaction made of separate BEGIN and COMMIT calls. Default: pool options and connect-time pragmas as in `BUILD-NOTES.md` section 1. Not optional.

**26. Any SQL can be sent from the webview.** (Dev) Default: `db_execute` and `db_select` accept one statement, from an allow-list (select, with, insert, update, delete, begin, commit, rollback); migrations alone change the schema. Triggers stop mistakes; the chain and its anchor show tampering; neither stops someone who can drop a trigger.

**27. The clock guards.** (Dev) An invoice or receipt may not be dated later than the day after it is written; before issuing, the clock may not be behind the last log entry, and a forward jump of more than `system.clockJumpDays` (3) asks the manager. If the PC's clock is unreliable, widen the setting; removing the guard lets one typo block the sequence until that date.

**28. A second PC of the same company.** (Dev) Default: `numbering.legalSeries` is empty. Two PCs issuing invoices would print the same numbers unless each has a series.

**29. How far the log records consultations.** (Dev) Default: always for restricted data; once per user, record and day for a person's file page; never for lists.

**30. Erasure against ten-year keeping.** (Dev, Client) Default: nothing is erased or anonymised; `anonymisedAt` and `Upload.purgedAt` exist so that an erasure action can be added without a migration. A refused candidate's health answers are therefore kept ten years.

**31. Printing a filled worker form discloses the health answers.** (Dev) Default: capability `staff.printFilledForm`, typed reason, logged; everyone else prints the blank form.

**32. Roles.** (Dev, Client: س5 is open) Seven seeded roles and the default matrix of `DESIGN.md` section 12. A different split changes seed rows only.

## D. For the client or his accountant

**33. Is «متوقف» on the client forms the blocking state?** In his older forms it meant a client who paused. Default: it blocks, with `sanction.blockingStates` to switch it off per kind. A paused client would need a place of its own.

**34. «رقم التسجيل» and «رقم الملف».** Default: one file counter per form kind, never restarted, suffix `BLC` on the building contract and none elsewhere; one counter for all clients; workers `{n}/H` or `{n}/F`, employees `{n}`; yearly documents `{n}/{yyyy}`.

**35. «طريقة السداد»: several ticks?** Default: a set on the file, one method chosen on each invoice.

**36. Stamp duty.** Default: on the whole tax-included amount, from 300.00 DA, no ceiling, not rounded, booked on each cash payment and printed on its receipt. All settings (`stamp.mode`, `stamp.bands`, `stamp.exemptBelow`, `stamp.maximum`, `stamp.roundUpToDinar`).

**37. Tax.** VAT or IFU is asked at first run (`tax.mode`); in VAT mode «المبلغ إجمالي» is read as tax included (`tax.pricesIncludeVat`). Does he have a NIN to print (`centre.nin`, optional)?

**38. Pay.** CNAS 9% and 26% are "to confirm"; the IRG scale is not seeded (`pay.irgTable`, shape in `DESIGN.md`); the leave year starting 1 July, the 30-day cap and the rest-day premium of +50% (`pay.restDayPremium`) have no source in his documents.

**39. Defaults with no source.** Lead times for document expiry (30 days), trial end (7), staff contract end (30), stale backup (3); trial length (30 days); quote validity (15 days); evaluation every 3 months on 1 to 5; office hours 07:30 to 17:00 and the two periods. All are settings.

**40. Credit notes, refunds, certified invoicing software.** Default: none; a wrong invoice is voided and issued again; an excess payment stays as the file's credit.

**41. Residents.** Third-party data with an unexplained «تاريخ التسجيل». Default: on the site, the date left empty when the paper is empty, consultation and print logged, never on an order, never billed.

**42. Friday and closed days.** Default: client forms offer six days; a Friday slot only by hand; public holidays are an optional list that only marks the preview.

**43. The communes seeded.** The 29 communes of the wilaya of أم البواقي in `BUILD-NOTES.md` section 5 were written from memory and must be checked against an official list before the first installer. **Settled 2026-10-12: checked by the coordinator; «الرحية» corrected to «الراحية»; official codes carried in the ids.**

**44. When «على عاتق صاحبها» is ticked, is the amount beside it kept?** Default: stored as information; Money ignores it.

**45. Protective kit and the word for the centre's car.** Default: the order prints «سيارة المؤسسة» as his old form does (Operations would write «سيارة المركز»).

## E. Notes, no ruling needed unless you object

**46.** `Visit_day` allows one hand-added on-demand visit per file and day with no slot; a second one that day is an EXTRA visit.
**47.** `UPDATE OF` triggers fire on a column named in the SET list even when unchanged: a save that sends a whole row with a stale cached total, or a frozen payslip column, is refused. Builders must send only what changed (`DESIGN.md` section 5).
**48.** Two pairs of Operations' rows point at each other (problem report and corrective task; complaint and corrective task). Kept as its builder asked; they are filled in two steps.
