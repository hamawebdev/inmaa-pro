# Contracts between owners (revision 2)

F Foundation, P People, C Clients and contracts, O Operations, M Money and stock.

## 1. The rules

1. **One writer per table.** Only the owner's services insert, update or delete its rows. When another owner needs a row written, it calls a function the owner exports, and that function writes. There is no exception left: workers' leave is decided by People through Operations' functions, and the lists edited on Foundation's settings pages are written by their owners' own editors.
2. **Reading across owners** goes through the exported read functions of section 3 wherever one exists. They hide columns the reader must not see (the restricted table, prices on the order) and keep the reader stable when the table changes. A direct read-only join on another owner's table is allowed in list and report queries, on the columns named in section 2.
3. **Every exported function has the shape `(ex, ctx, input)`.** `ex` is the caller's Kysely executor, so one user action is one transaction across owners and a test can drive it on a real SQLite file. `ctx = { userId | null, roleId, staffMemberId | null, branchId, today, nowTime, now, toInstant, toLocal }` (as built, also `userName`, `sections`, `capabilities`, `touchedChains`: `src/lib/service/context.ts`) is Foundation's: who acts and what time it is. `userId` is null when the program acts by itself (day-start job). Functions never open their own transaction when given one, never read the session or the clock from anywhere else, and never query the root connection (inside a transaction that waits for ever).
4. **Events are function calls, not messages.** Foundation exports a small registry: `on(eventName, handler)` at start-up, `emit(ex, ctx, event)` inside the emitter's transaction. Handlers run at once, in the fixed order of section 4, in that transaction; a handler that throws rolls the whole action back. So a handler must never throw for a reason the user cannot fix on the spot (a zone with no supervisor leaves a key empty; it does not fail the typed order). Payloads carry ids and dates only; a handler reads what it needs.
5. **Money never appears in what Operations prints**, and the health answers and the hiring score never leave People.
6. Three Foundation services are called by everybody and are the only writers of their tables: numbering (`Sequence`), the log (`AuditLog`), uploads (`Upload`).
7. **Definitions every owner uses.** A file is *live* when `stage = 'CONTRACTED' AND closedAt IS NULL`. It is *ended* when `stage = 'CONTRACT_ENDED'`, and then `endedDate` is never empty; Operations and Money cut on `endedDate`. It is *closed* when `closedAt` is set. A contract is *renewed* when another file's `renewalOfFileId` points at it and that file is «متعاقد»; a «قديم» copy (`copiedFromFileId`) is never a renewal. A visit cancelled with reason `PROGRAMME_CHANGED` does not exist for any count, statement or indicator.

## 2. Every table: who writes it, who reads it

### Foundation

| Table | Writes | Reads |
|---|---|---|
| `Branch` | F | all (default branch for new documents, filters, reports) |
| `Role`, `RoleGrant` | F | all, through the session (`requireCapability`, `requireSection`) |
| `User` | F (People links an employee through `linkAccountToStaff`) | all (names for "who did it") |
| `Setting` | F | all, through `getSetting` |
| `Sequence`, `SequenceGap` | F, through the numbering functions called by every owner; the legal counters through the triggers of `Invoice` and `Receipt` | F; M (the chain check on the reports tab) |
| `ChainHead` | the chain triggers, fed by F's `appendChained` | F; M |
| `AuditLog` | F, through the `log...` calls made by every owner | F (Settings › السجل) only |
| `Upload` | F, through `saveManagedUpload`, `linkUpload`, `removeUpload`, called by every owner | all, through `listUploads`; restricted files only through `readRestricted` |
| `Commune` | F (`ensureCommune`, `ensureZoneForCommune`, `remapCommune`, called by C and P) | P, C (address pickers); O, M (zone of a place) |
| `Zone` | F | P (worker's zone), C (site's zone), O (supervisors, teams, vehicles, visits), M (analytics by zone) |
| `BackupRun` | F | F |
| `CatalogueService`, `CatalogueServiceDivision` | F (Settings › الخدمات, `saveServiceCatalogue`) | C (the service rows of his forms, through `listServiceCatalogue`), O (task and board labels, through `serviceLabels`) |

### People

| Table | Writes | Reads |
|---|---|---|
| `StaffMember` | P | F (`User.staffMemberId`); C (file owner, inspector, sales rep); O (workers and supervisors, through `listSchedulableWorkers`); M (collector, hand-out recipient, hourly cost) |
| `StaffConfidential` | P | nobody else. P itself only through `readRestricted` |
| `StaffEvent` | P | nobody else (O and M get "active on a date" and the labour cost of a date from P's functions) |
| `HiringInterview`, `HiringDecision`, `StaffDocument`, `PeriodicEvaluation` | P | nobody else |
| `TrainingModule`, `TrainingSession`, `TrainingAttendance`, `Skill` | P | O (skills and training days, through `listSchedulableWorkers`) |
| `Violation` | P (O hands one over through `createViolationFromSource`) | O (link back from a complaint), M |
| `Sanction` | P (C sets a client's through `setSanction`) | C, O, M, through `getSanctionStates` |
| `SanctionDecision` | P | C (`File.sanctionDecisionId`); O through `decisionCovers` |
| `SanctionDecisionMatch` | P, with the request: every sanction it matched (F4; one yes covers them all) | C and O, through `decisionCovers` |
| `EmployeeLeave`, `EmployeeCheckRecord`, `EmployeeAbsence`, `HoursAdjustment`, `StaffPayItem` | P | M (paid hours, through `getPaidMinutes`) |
| `PayRun`, `Payslip`, `PayslipItem`, `PayslipSeat`, `StaffPayout` | P | M (wages in expenses and in the forecast, through `getPayoutForExpense` and `getClosedPayroll`) |
| `StaffDebtEntry` | P (M adds a line through `addDebtEntry`) | M |

### Clients and contracts

| Table | Writes | Reads |
|---|---|---|
| `Client` | C | P (identity for the check); O (board, call list, complaints); M (buyer block of an invoice, payer) |
| `Contact` | C | O (the person on site, through `getSiteForOrder`) |
| `Site` | C, including the whole office-only block | O (address, directions, access rules, the work-profile block, zone); M (zone for analytics, equipment stored there) |
| `Resident` | C | nobody else; never printed on an order |
| `File` | C | O (schedule fields: days, period, times, dates, workers, access, guard, bearers without amounts); M (the billing terms); P (division, for hours per division) |
| `FileDescription` | C | O (to generate `FileArea`) |
| `FileService` | C | O (seeds `FileTask`, the board's «الخدمة» column); M (income by service) |
| `FileStageEvent` | C | nobody else |
| `FirstVisit` | C | M (estimated minutes per visit, through `getFileEstimate`) |
| `CostStudy` | C | M (estimate side of profitability), behind `cost.read` |
| `Quote`, `QuoteLine`, `QuoteFollowUp` | C | M (the accepted quote's totals per line kind, through `getFileBillingTerms`) |
| `ClauseTemplate` | C | nobody else |
| `RepVisit` | C | nobody else |

### Operations

| Table | Writes | Reads |
|---|---|---|
| `FileArea`, `FileTask`, `FileProgramme`, `FileSlot`, `FileAssignment` | O | C (hub tiles); M (planned visits per period, through `countPlannedVisits`) |
| `Visit` | O | P (hours, orders not typed in); C (last and next service, leads); M (statement, dues per visit, hand-out target, forecast) |
| `VisitWorker` | O | P (#21: times, late minutes, worked minutes; `PayslipSeat` points at it); M (actual hours for profitability and revenue per worker) |
| `VisitChecklistItem`, `VisitCall` | O | nobody else |
| `VisitReport` | O | M (completion, sign-off, for the statement and for "billable"); C (rating, "wants another service"); P (ratings per worker) |
| `ProblemReport` | O | P (source of a violation, injuries); M (shortage reports); C (extra-service leads) |
| `WorkerAbsence` | O only. P books through `recordWorkerAbsence`, decides through `decideWorkerLeave`, cancels through `cancelWorkerAbsence`, and sets the pay treatment through `setAbsencePayTreatment` | P (pay, leave balance), through `listWorkerAbsences` |
| `RuleOverride` | O | P (seats on the rest day, for compensatory rest) |
| `Team`, `TeamMember`, `Vehicle` | O | M (`Expense.vehicleId` picker) |
| `SupervisorAssignment` | O | P (shows a worker's supervisor) |
| `InspectionCriterion`, `Inspection`, `InspectionScore`, `InspectionWorkerNote`, `CorrectiveTask` | O | P (figures for the article 16 evaluation; source of a violation) |
| `Complaint` | O | C (client card); P (figures, source of a violation); M (settlements of kind DISCOUNT) |

### Money and stock

| Table | Writes | Reads |
|---|---|---|
| `PaymentDue`, `DueFollowUp` | M | C (through `getFilePaymentSummary`, `getClientPaymentStates`) |
| `InvoiceDraft`, `Invoice`, `InvoiceLine`, `InvoiceVisit`, `VisitBilling` | M | F (chain check); nobody else |
| `Payment`, `PaymentAllocation`, `Receipt`, `LegalEvent`, `ReceiptBatch`, `CashReconciliation`, `CashReconciliationLine` | M | F (chain check); nobody else |
| `Expense`, `ExportBatch` | M (a payout to staff reaches it through `postPayoutExpense`) | nobody else |
| `StockItem`, `EquipmentUnit`, `StockMovement`, `InventoryCount`, `InventoryCountLine`, `Supplier`, `PurchaseRequest`, `PurchaseRequestLine`, `Purchase`, `PurchaseLine`, `MaintenanceRecord` | M | nobody else |
| `HandOut`, `HandOutLine`, `HandOutReturn` | M | O (the order's "materials and equipment handed over", through `getHandOutsForVisit`); P (`getEquipmentIncidents`); C (hub tile) |

## 3. What each owner exports

Names are proposals; the plain-words column is the contract. Every function takes `(ex, ctx, ...)`; only what follows is shown.

### Foundation exports

| Name | Inputs | Outputs, in plain words |
|---|---|---|
| `nextNumber(key, { date, suffix? })`, `nextNumbers(key, { date, count })` | a SEQUENCE_KEY, the document's date | `{ seq, year, display }`, or a block of them. Increments the counter in the caller's transaction; not for INVOICE and RECEIPT |
| `claimNumber(key, { value, year? })` | a number typed from paper | checks it is free and raises the counter to at least that value; logs NUMBER_CLAIM. Not for the legal keys |
| `peekLegalNumber(key, { date })` | INVOICE or RECEIPT | the number the next document must carry; the insert moves the counter |
| `appendChained(table, row)` | a class A table and the full row without chain columns | inserts it with `hashV`, `chainSeq`, `prevHash`, `hash`; returns them. Throws on a missing column, a float, a boolean or a `Date` |
| `verifyChains(options?)` | optionally a list of tables | per table: rows checked, first broken row or none, head against `ChainHead` and against the anchor; invoice digests; gaps in the two legal sequences; the two cached totals |
| `assertClockSane()` | | throws, or asks the manager, when the clock went back or jumped forward (`system.clockJumpDays`) against the work recorded before the present session (DESIGN section 8, F4); called before a legal document is issued. `confirmClockJump(ex, ctx, { reason? })` is the manager's word on the date |
| `logCollect`, `logConsult`, `logChange`, `logDisclose`, `logErase`, `logSecurity` `(entry)` | entity, id, label, subject, reason, changes, context | one `AuditLog` row, chained; restricted values replaced by `"§"` |
| `logConsultOnce(ex, ctx, entry)` | a person's file page | one CONSULT entry per user, record and day (ruling 29); answers null when today's exists. Restricted data is logged at every read |
| `readRestricted({ capability, entity, id, part?, reason })` | | checks the capability, logs the consultation, returns the row (one column group of `StaffConfidential`) or the bytes of a restricted upload |
| `requireCapability(ctx, key)`, `requireSection(ctx, section, level)`, `can(ctx, key)`, `sectionLevel(ctx, section)` | | read the session snapshot loaded at sign-in, never the database; the first two throw when not allowed. On a screen: `useSession()`, `useCan(key)`, `useSectionLevel(section)` (`src/hooks/use-session.ts`) |
| The manager's answer | | not a function (F3 ruling): the manager signs in himself and answers under his own name; the service checks his capability as any other. `requestManagerApproval` is not built |
| `getSetting(key)`, `setSetting(key, value)` | | the typed value or its default; both take the executor |
| `saveManagedUpload(file, { entity, field, kind?, caption?, takenByEmployeeId?, restrictedCapability? })` | **called before the transaction** | writes the bytes and the `Upload` row; returns the managed `url` |
| `linkUpload(url, ownerId)`, `removeUpload(url, reason)`, `listUploads({ entity, ownerId, field? })` | inside the transaction | ties the file to its row; takes it off; the photo set of a row. A copy saved outside the program (`saveUploadCopy(url, title, { owner, subject, reason? })`) is a DISCLOSE first (`recordUploadCopy`, F4) |
| `linkAccountToStaff(ex, ctx, { userId, staffMemberId })` (`src/features/core/services/users.ts`; `linkAccountToStaffAction`) | People's employee file, and Settings › المستخدمون والصلاحيات | sets `User.staffMemberId` (A2: an employee's login), or unlinks with `staffMemberId: null`; needs `users.manage`; refuses a worker and an employee who already has an account |
| `registerAlerts(register)`, exported from `src/features/<folder>/alerts.ts` | `register({ key, section, severity, name, icon, leadSetting?, capability?, route, count(ex, ctx, { days }) })` | the home tile and its list link (DESIGN.md section 13); the one-a-day notification follows in F3b |
| `on(event, handler)`, `emit(event)` | | the event registry of section 4 |
| `registerDaily(daily)`, exported from `src/features/<folder>/daily.ts` | `daily(name, (ex, ctx, { today, since }) => …)` | runs each owner's handlers in one transaction, once per local day, at start-up or when the date changes while the program is open, with `ctx.userId` null (DESIGN.md section 13) |
| `registerSeeds(seed)`, exported from `src/features/<folder>/seeds.ts` | `seed(name, (ex, ctx) => …)` | the owner's starting rows: run by first run in owner order, in its transaction, as the program, and again by the day-start job in the owner's day transaction; each step idempotent (fixed ids, insert what is missing, never overwrite an edit) |
| `ensureCommune({ wilayaCode, nameAr })` | a commune the office typed | the row, created when it is new; called inside the caller's own save, which checks its rights. The picker's own «إضافة بلدية» goes through `addCommune`, which needs `settings.rules` or WRITE on REQUESTS, WORKERS or EMPLOYEES (F4, ACC-4) |
| `<CommunePicker>`, `<ZonePicker>` (`src/components/`) | a place on a screen: `{ wilayaCode, communeId }`; a zone id | the wilaya of 69 then its commune, with an add action; the active zones |
| `ensureZoneForCommune(communeId)` | called by C when a site is saved and by P when a worker's residence is saved | the zone id of that commune, creating a zone named after it when none exists (A9) |
| `remapCommune(communeId, zoneId)` | Settings › قواعد العمل | changes the commune's zone and emits `zone.remapped` |
| `listServiceCatalogue()`, `useServiceCatalogue()` | | his two service lists: every service, removed ones included, with its three names and its place in each division. C resolves its forms' service rows from it (`resolveDefinition`) |
| `serviceLabels(list)` | PROVIDED or PROGRAMMED | each code's Arabic name, removed services included: O's task labels, C's scheduling export |
| `saveServiceCatalogue({ list, services })` | Settings › الخدمات | the whole edited list: services added, renamed, removed or restored, their divisions and places. SETTINGS WRITE and `settings.rules`; one CHANGE entry per change |
| `normaliseName(text)`, `phoneKey(text)` | | the search keys used by «قديم», list search and the sanction check |
| Settings slots | `registerSettingsPanel({ tab, title, component })` | each owner mounts its own editor on Foundation's settings pages: P training days and skills; O inspection criteria; C clause text. Foundation never writes those tables |
| Pickers and fields | | `<BranchSelect>`, `<ZonePicker>`, `<WilayaPicker>`, `<CommunePicker>` (with "add"), the code-list tick group, yes/no, date, time, phone, money and period fields. Dates, times, periods and every choice from a list are the program's own pickers (`src/components/pickers/`, `ui/select.tsx`): a change applies only when its «تأكيد» is pressed, and no browser or system picker opens (the developer, 2026-10-22) |
| Units and words | | centimes, minutes, thousandths and basis-point helpers; Saturday-week helpers; amount in words in Arabic and French |
| Home and hub slots | | the home page mounts O's tiles and day board and every owner's alert tiles |

### People exports

| Name | Inputs | Outputs, in plain words |
|---|---|---|
| **`checkSanction({ context, subjectKind, subjectId?, identity, decisionId? })`** | what is being registered and the identity as typed (name, Latin name, birth date, phones, ID number; for a body: tax numbers, organisation name key) | `CLEAR`, `POSSIBLE` (weak name match, ask the clerk), `BLOCKED`, `ALLOWED` (a yes exists for this attempt) or `REFUSED`, with the matching sanctions |
| `<SanctionGate>` | wraps a save button | runs the check, shows the prompt «هل نسمح له أم لا؟», takes the manager's answer on the spot or files the pending request (never with restricted fields in `draftPayload`), and hands back a `decisionId` |
| `consumeDecision(decisionId, { entityKind, entityId })` | inside the caller's save transaction | marks the yes as used by that one registration; throws if it was used already (the database refuses it too) |
| `decisionCovers(decisionId, sanctionId)` | a file's `sanctionDecisionId` and a sanction now active on its client | true when the manager's yes for that file was given about that sanction: its orders then print without a release per visit |
| `getSanctionStates(kind, ids)` | WORKER, EMPLOYEE or CLIENT and ids | per id: none, or `{ state, reason, since, until, sanctionId }` on `ctx.today`. The one way to read «متوقف / معاقب» |
| `setSanction(input)`, `liftSanction(sanctionId, reason)` | subject, state, reason, start date, optional end date | writes or lifts the `Sanction` row; needs `sanction.set`; logs; emits `sanction.changed`, and `staff.unavailable` for a worker |
| `<SanctionChip>` | subject | the state as a chip |
| `listSchedulableWorkers({ date?, zoneId? })` | | per worker: id, number, Arabic and Latin name, sex, phone, zone, residence commune, role, reserve flag, weekly capacity in minutes, available days, abilities, skills, engagement status, training done, the dates she is in a training session, active on that date (from `StaffEvent`), sanction state, authorised to collect. Never anything of `StaffConfidential` |
| `getStaffSummary(ids)` | | name, number, kind, position or role, phone, active: for labels in other owners' lists |
| `listEmployees({ position? })`, `<EmployeePicker>`, `<WorkerPicker>` | optional JOB_POSITION | employees for inspector, file owner, sales rep, supervisor, collector, storekeeper |
| `setWorkerZone(workerId, zoneId)` | | changes `StaffMember.zoneId` from O's supervisors screen |
| `createViolationFromSource({ workerId, date, sourceKind, sourceId, description, article? })` | a complaint, inspection, visit or problem report of O | a `Violation` with status OPEN and no action, for HR or the manager to decide; returns its id |
| `addDebtEntry({ staffId, date, direction, reason, amount, note, handOutReturnId? })` | | one ledger line with its sequence and balance |
| `canCollectCash(staffId, date)` | | whether a worker is authorised (F1 article 12), since when, and the note naming the document |
| `getHourlyLabourCost(staffId, date)` | | centimes per hour from the pay terms in force that day (`StaffEvent`), or nothing (M then uses `costing.hourlyLabourCost`) |
| `getClosedPayroll({ from, to })` | | per closed run and person: period, gross, net, employee and employer contributions, paid so far, minutes per division. For M's forecast and profitability |
| `getPayoutForExpense(staffPayoutId)` | | date, amount, method, kind, the payslip and run it pays, that payslip's minutes per division, and whether this payout completes it (then also the contributions of that payslip) |
| `getPaidMinutes({ workerId?, from, to })` | | paid minutes, for M's use-of-time indicator |

### Clients and contracts exports

| Name | Inputs | Outputs, in plain words |
|---|---|---|
| `getFileForScheduling(fileId)` | | ids of the client and the site, numbers, division, service type, stage, `sanctionDecisionId`, client name, «الصفة» or manager name, and phones, the schedule fields exactly (request kinds, duration and unit, contract kind and duration, visits per week, days, period, from, to, start, end, arrival, departure, workers), who provides materials and transport **without amounts**, access, guard, the security-instructions tick, storage, waste, the description counts (with the site's `buildingsCount`), the service ticks with codes and labels, a short service label for the board |
| `getSiteForOrder(siteId, fileId)` | | name, address, commune, wilaya, zone, landmark, directions, coordinates (the optional QR is `geo:<lat>,<lng>` from `Site.latitude` and `Site.longitude`; the map link is text for the screen, never printed or encoded), allowed days and hours, the whole work-profile block (forbidden places, do not touch, valuables, instructions, protective kit, meeting point, same-worker rule, women only, required abilities, photo consent), the security text **only when that file ticks «تعليمات أمنية: نعم»**, and **the person on site**: the site's receiver columns when filled, else the site's coordinator contact, else the client's name, «الصفة» or manager and first phone |
| `getFileBillingTerms(fileId)` | | numbers, division, service type, client, site, branch; amount, basis, `amountIncludesVat`, frequency, first due date, methods, payer and phone, place, the two bearers and amounts, `expensesIncluded`; dates, workers, arrival, departure, contract kind and duration; storage of equipment and its place; stage, `endedDate`, `endKind`, closing, renewal decision, the renewing file if any and whether it is «متعاقد»; and the accepted quote's totals per line kind (INITIAL_JOB, PERIODIC, EXTRA) |
| `getFileEstimate(fileId)` | | estimated minutes per visit and workers: `CostStudy.perVisitMin`, else the latest done first visit's. The one estimate Money uses |
| `getAcceptedQuote(fileId)` | | the one quote with result ACCEPTED, or none |
| `getClientForInvoice(clientId, fileId)` | | name, legal form, trade register yes or no, RC, NIS, NIF, article number, phones; the address: `billingAddress`, else the file's site address with its commune and wilaya; and what is missing before a first invoice (a missing address blocks the issue) |
| **`closeFile(fileId, { reason, note, endedDate? })`** | a CLOSE_REASON | sets `closedAt` and the reason. When the file was CONTRACTED it also sets CONTRACT_ENDED, `endedDate` and `endKind` (JOB_DONE for a finished job), writes the stage event and emits `file.ended`. A refused quote leaves the stage (A5) and emits nothing |
| `endContract(fileId, { endKind, endedDate, note })` | | an early ending; emits `file.ended` |
| `renewFile(fileId)` | | creates the successor (`renewalOfFileId`), sets `renewalDecision = WILL_RENEW` on the old one and emits `file.renewed`. **It ends nothing**: the old contract runs to its `endDate`, where the day-start job ends it with RENEWED |
| `listFiles` filter `ids` | a list of file ids and a caption | the files list shows exactly those rows: M's contract-ending tile opens it this way, with «تجديد العقد» as row action |
| `<FilePicker>`, `<ClientPicker>`, `<SitePicker>` | | pickers for hand-outs, payments, complaints, manual visits |
| File hub and client card slots | | the hub shows one link card per part; the summaries come from `getFileVisitSummary` (O), `getFilePaymentSummary` and `getFileHandOutSummary` (M). The client card and the clients list call `getClientServiceSummaries` (O), `getClientPaymentStates` (M), `getSanctionStates` (P) |

### Operations exports

| Name | Inputs | Outputs, in plain words |
|---|---|---|
| **`previewVisitGeneration(fileId)`** | | writes nothing: count, first and last date, visits per weekday, and what breaks (overlaps, weeks over capacity, night flags, days outside the site's allowed days and hours, slots against «عدد الزيارات») |
| **`generateVisits(fileId, { from?, to? })`** | | creates the slots from the form if there are none, then every missing visit, keyed by `slotDate`. Never duplicates; never touches a visit that is printed, in progress, done, postponed, cancelled or edited by hand. Returns the same summary |
| `updateFutureVisits(fileId)` | after the terms or slots changed | moves or adds future untouched visits; a visit whose slot is gone is cancelled with reason `PROGRAMME_CHANGED` (visits are never deleted); clears `FileProgramme.formChangedAt` |
| `copyFileSetup(fromFileId, toFileId)` | the handler of `file.renewed` | copies areas (parents remapped), tasks (areas remapped), slots (validity cleared), open assignments and the `FileProgramme` row to the renewing file |
| `cancelFutureVisits(fileId, { afterDate, reason })` | normally `CONTRACT_ENDED` | cancels open visits of origin CONTRACT dated after that day; returns how many. A MAKEUP or REDO visit already placed is left |
| **`getClientServiceSummaries(clientIds)`**, `getSiteServiceSummary`, `getFileVisitSummary` | | last visit, next visit, counts by status, average rating, last sign-off; for the file also "visits generated or not" |
| `listServiceLeads({ clientId? })` | | "wants another service", "wants a repeat" and extra-service reports that no file names yet in `File.sourceVisitId` |
| `listVisitsForBilling({ fileId, from, to })` | | per visit: id, date, day, origin, source visit, status, status reason, planned start, duration and headcount, completion, sign-off (state, who, date), each worker's arrival and departure, worked minutes, workers count, `billable`, `clientAtFault`, replaced or not, order typed in or not |
| `listVisitWorkers(visitId)` | | the seats of a visit, for M's hand-out recipient picker |
| `countPlannedVisits(fileId, from, to)`, `listPlannedVisits({ from, to })` | | visits of origin CONTRACT and ON_DEMAND; a MAKEUP counts in place of its source; REDO, INITIAL and EXTRA do not count |
| `getDayCounts(date)` | | done, postponed, cancelled, complaints, absences, replacements, orders not returned |
| `listComplaintCredits(fileId)` | | complaints settled by DISCOUNT with their amount (M knows which are already on an invoice line) |
| `getWorkerHours({ workerId?, from, to })` | | per worker and seat: seat id, date, file, division, planned start and minutes, the four times, late minutes and reason, worked minutes, seat status, order typed in or not; and per week the designated rest date. **Minutes only**: People computes the excess over 40 hours and the rest-day minutes |
| `countOrdersNotReturned({ from, to })` | | for P's hours screen and M's end-of-day report |
| `listWorkerAbsences({ workerId?, from, to })` | | date range, times, minutes, category, leave type, days, paid, justified, status, split group |
| `recordWorkerAbsence(input)` | P books a leave, or O records an absence: worker, dates, times, category, leave type, days, paid, status | writes the row (cut at month ends), returns `{ absenceId, seatsHit }`; opens the replacement suggestions for the seats it hits only when the status is RECORDED or APPROVED |
| `decideWorkerLeave(absenceId, { status })`, `cancelWorkerAbsence(absenceId, reason)`, `setAbsencePayTreatment(absenceId, { paid, justified, days, leaveType })` | HR's acts on a worker's leave or no-show | write the row for People; approving opens the seats, cancelling gives them back |
| `getWorkerQualityFigures(workerId, from, to)` | | inspection results, client ratings, complaints, problem reports: for the article 16 evaluation |
| `getWorkerSupervisor(workerId, date)` | | the employee who supervises her that day |
| `closeHandedProblem(problemReportId, { actionTaken })` | called by the owner a problem was handed to | closes the report, so the handed-over lists empty |
| `<DayBoard>`, `<TodayTiles>` | | mounted by F's home page |
| `<VisitPicker fileId>`, `<VehiclePicker>`, `<TeamPicker>` | | for M's hand-out and expense forms |

### Money and stock exports

| Name | Inputs | Outputs, in plain words |
|---|---|---|
| **`syncDues(fileId)`** | called after terms, dates, visits or an ending change | idempotent: brings the dues that are neither invoiced nor paid in line with the file's terms (A7), updating in place, adding what is missing, cancelling extras; never deletes. After an ending it cancels only uninvoiced, unallocated dues whose period or visit lies after `endedDate`, and never for JOB_DONE. Builds the INITIAL_JOB due from the accepted quote and an EXTRA due from `VisitBilling.amount` |
| **`getClientPaymentStates(clientIds)`**, `getFilePaymentState(fileId)` | | PAID, PARTIAL or UNPAID, total due, paid, remaining, overdue amount and days, next due date |
| `getFilePaymentSummary(fileId)` | | amount, paid, remaining, next due: the hub tile «التسديد» |
| `getFileHandOutSummary(fileId)`, `getEquipmentOutForFile(fileId)` | | what was handed out, what is still out, and what is stored at the file's **site**: the hub tile «التسليم», and the recovery list when a contract ends without renewal |
| `getHandOutsForVisit(visitId)` | | item, quantity, unit, condition at hand-over, per worker: the hand-outs that name the visit, those of its file that name no visit, and the equipment kept at the site. Printed on the mission order |
| `getFileProfitability(fileId, period)` | behind `cost.read` | revenue, estimated and actual hours and costs, margin, flags (#30) |
| `getEquipmentIncidents(workerId)` | | lost or damaged on return, for P's violations block |
| `postPayoutExpense(staffPayoutId)`, `removePayoutExpense(staffPayoutId, reason)` | the handlers of `payout.recorded` and `payout.voided` | write, or soft-delete, the read-only `Expense` rows of that payout (source PAYROLL): WAGES per division on the day paid, and CONTRIBUTIONS when the payout completes its payslip |
| `<ItemPicker>`, `<SupplierPicker>` | | |

## 4. Events that cross owners

Order of handlers is fixed as listed.

| Event (payload) | Emitted by, when | Who reacts, and how |
|---|---|---|
| `file.contracted` (fileId) | C, in the transaction that moves a file to «متعاقد» (a contract whose required fields are filled, or an on-demand file whose quote was accepted). C writes `partySnapshot` and `amountIncludesVat` first | 1. **O** creates the `FileProgramme` row with the default inspection plan, then `generateVisits`: slots from «أيام التنفيذ», then every visit between the two dates; returns the summary that C shows (C's confirm dialog showed `previewVisitGeneration` before). When the accepted quote has an INITIAL_JOB line, O's visits page offers one visit of origin INITIAL. 2. **M** `syncDues` |
| `file.termsChanged` (fileId) | C, when the days, times, dates, workers, the financial terms or the service ticks of a contracted file are saved | 1. **O** sets `FileProgramme.formChangedAt` and offers «تحديث الزيارات القادمة» (it does not regenerate by itself). 2. **M** `syncDues` |
| `file.renewed` (fromFileId, toFileId) | C, in `renewFile` | **O** `copyFileSetup`. Nothing ends and nothing is cancelled: the renewing file raises `file.contracted` when it is signed, and the old one `file.ended` on its end date |
| `file.ended` (fileId, endKind, endedDate) | C: by the day-start job at `endDate` for contracts only (RENEWED or EXPIRED); on an early ending; through `closeFile(JOB_DONE)` | 1. **O** `cancelFutureVisits` after `endedDate` and sets `FileProgramme.inspectionIsActive` to 0. 2. **M** `syncDues`; unless the kind is RENEWED it lists the equipment still at the site for recovery |
| `site.changed` (siteId, zoneChanged, profileChanged) | C, when a site's commune, zone or office block is saved | **O** re-stamps `zoneId` and `supervisorEmployeeId` on the site's future unprinted visits, and sets `planChangedAt` on printed ones |
| `zone.remapped` (communeId, fromZoneId, toZoneId) | F, in `remapCommune` | 1. **C** moves the sites of that commune that were in the old zone, and emits `site.changed` for each. A worker's zone is typed, so P does nothing |
| `visit.signedOff` (visitId) | O, when a returned order is saved as COMPLETE (the visit becomes منفذة or مشكلة) | 1. **M** `syncDues` for a per-visit file. 2. **O itself**: a sign-off NOT_ACCEPTED opens a complaint; `needsExtraVisit` proposes an extra visit. 3. If it was the last open visit of an on-demand file, the visit is DONE, and no REDO visit or complaint is open on the file, O calls **C** `closeFile(fileId, JOB_DONE)`. P reads hours on demand and does not react |
| `visit.statusChanged` (visitId) | O, when a visit is postponed, cancelled or reopened | **M** `syncDues` for a per-visit file |
| `absence.recorded` (absenceId) | O, when an absence or a booked leave is saved, decided or cancelled | nobody writes; P's hours screen invalidates |
| `staff.unavailable` (workerId, fromDate, toDate?, cause: LEFT, SANCTION_SET, SANCTION_LIFTED, reason: the reason typed for the leaving or the sanction, which O writes on the ERASE entries of what it removes; F4, LOG-X1) | P: when a worker's status becomes LEFT or REFUSED, and when a worker's sanction is set or lifted | 1. **O**: for LEFT and SANCTION_SET, her ASSIGNED seats in that range become REMOVED (reason WORKER_LEFT or SANCTION) and their visits return to AWAITING_CONFIRMATION; for LEFT it also closes her `FileAssignment`, `TeamMember` and `SupervisorAssignment` rows. SANCTION_LIFTED only puts her back in the pickers. 2. **M**, for LEFT: lists the equipment with her and her unreturned receipt batches |
| `sanction.changed` (sanctionId) | P, when a sanction is set or lifted on any of the three kinds | nobody writes. **C**: the chip on the card and the two ticks on the printed sheet. **O**: a sanctioned client's orders print only when `decisionCovers` says the file's own decision was about that sanction, or after a release per visit (`order.releaseSanctioned`) |
| `invoice.issued`, `invoice.voided` (invoiceId) | M | nobody writes. C's hub tile and client card refresh |
| `payment.recorded`, `payment.voided` (paymentId) | M | the same refresh |
| `payrun.closed`, `payrun.voided` (payRunId) | P | nobody writes: M's forecast invalidates. A run is voided only after its payouts are |
| `payout.recorded`, `payout.voided` (staffPayoutId) | P, for every payout to a person, advance or wage | **M** `postPayoutExpense`, or `removePayoutExpense` |
| `handout.returnedShort` (handOutReturnId) | M, when a return records lost or damaged equipment | nobody writes at once. P's violations block shows it through `getEquipmentIncidents`; the manager may then add a debt line (`addDebtEntry`) |
| `complaint.settled` (complaintId) | O, when a complaint is settled with a DISCOUNT | nobody writes at once: M's next invoice run proposes the discount line from `listComplaintCredits` |
| `problem.handedOver` (problemReportId, to) | O, when a problem report is handed to STOCK, CLIENTS or PEOPLE | the named owner shows it in a list and closes it through `closeHandedProblem`; an injury may become a `Violation` only through HR; an extra-service lead becomes a file with source SERVICE_LEAD |

## 5. The end-to-end run, call by call

1. C: "new file". `<SanctionGate>` runs `checkSanction` on the client (typed, or picked with «قديم»). Clear, or the manager says yes: C saves `Client` (F `nextNumber`, or `claimNumber` for a number from paper), `Site` (F `ensureCommune`, `ensureZoneForCommune`), `File` (F `nextNumber`), the description, the service ticks, the first stage event, and `consumeDecision` when there was a yes. One transaction.
2. C: first visit, cost study, quote (`nextNumber`), approval (`quote.approve`), result ACCEPTED: the file takes the quote's amount and basis.
3. C moves the file to «متعاقد» and emits `file.contracted`: O generates slots and visits, M builds the dues.
4. O: team, order printed (F `logDisclose`; M `getHandOutsForVisit` for the materials block). M: a hand-out against the file and the visit.
5. O: the returned order is typed in, one Save: `VisitWorker` times, checklist, `VisitReport`. O emits `visit.signedOff`.
6. M: the invoice run reads `listVisitsForBilling`, issues (`assertClockSane`, `peekLegalNumber`, `appendChained`), then a payment with its receipt. Income shows in the file's division for the date received.
7. P: hours from `getWorkerHours`, a pay run closed (numbered, payslips and their seats frozen), a payout recorded: `payout.recorded`, and M writes the wage expense on the day paid.
8. C (day-start job): at `endDate` a contract goes to «انتهاء التعاقد» and emits `file.ended`; M's tile had warned 30 days before and keeps it in red until it is renewed or closed. An on-demand job ends at step 5, when its last visit is signed off.
