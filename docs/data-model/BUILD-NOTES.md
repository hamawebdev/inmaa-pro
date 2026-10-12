# Build notes for Foundation (data model, revision 2)

What to build from `schema.prisma`, `triggers.sql`, `OPTION-CODES.md`, `DESIGN.md` and `CONTRACTS.md`, in what order, and what must pass before the four builders start.

What already exists beside these notes and can be reused as it is:
- `tools/build-ddl.mjs`: a working generator. It parses the schema with the reference generator's regexes, writes `generated/0001_init.preview.sql` (106 STRICT tables, 205 indexes, 45 table checks plus a GLOB check on every date and time column, 118 triggers) and loads it into `node:sqlite`.
- `tools/model-proof.mjs`: 157 attempts to break the database rules, all refused or accepted as they should be (`generated/model-proof.txt`). Port its cases into the test suite.
- `check-schema.mjs`: the naming rules and the documents against each other.

What does not exist: any service, the Rust side, the production hash function, the scenario tests of section 6. Nothing was run on the engine that ships.

## 1. The connection, before anything else

These are not optional. Three of them cannot be seen failing in a test on `node:sqlite`.

1. **One connection that is never recycled.** `SqlitePoolOptions::new().max_connections(1).min_connections(1).max_lifetime(None).idle_timeout(None)`. With sqlx's defaults the connection is closed after thirty minutes, between two statements; BEGIN and COMMIT are separate IPC calls, so the statements before the mark roll back and those after it commit one by one.
2. **Pragmas as connect options**, not statements: `foreign_keys(true)`, `.pragma("recursive_triggers", "ON")`, WAL, `synchronous = NORMAL`, busy timeout. A `PRAGMA` sent once is lost on reconnect, and without `recursive_triggers` an `INSERT OR REPLACE` rewrites an issued invoice without firing its delete trigger.
3. **`TauriDriver.init()` sends `ROLLBACK`** and ignores "no transaction is active", so a reloaded webview never inherits an open BEGIN.
4. **`db_execute` and `db_select` accept one statement** whose first keyword is one of `select`, `with`, `insert`, `update`, `delete`, `begin`, `commit`, `rollback`. Everything else (DROP, ALTER, CREATE, PRAGMA, ATTACH, VACUUM) is for migrations only.
5. **The harness and the tests open their database with the same two pragmas.**
6. The bundled SQLite must be 3.37 or later for STRICT (sqlx 0.8 bundles 3.46). Partial indexes, expression indexes, `RETURNING`, upsert and `json_each` are all used.

## 2. From the schema to the database

1. Extend `scripts/generate-db-types.mjs` (or adopt `tools/build-ddl.mjs`) so that one run writes: `src/lib/db/schema.ts`, `models.ts`, `column-meta.ts` (with the tag of every column: date, time, money, min, qty, bp, udeg, code list), `chain-columns.ts` (`CHAIN_COLUMNS[table][hashV]`: names and storage types of every column but `hash`, for the eight chained tables), and `src-tauri/migrations/0001_init.sql`.
2. The DDL rules, all implemented in `tools/build-ddl.mjs`:
   - `String` TEXT, `Int` INTEGER, `Boolean` INTEGER, `DateTime` TEXT; NOT NULL unless `?`; `DEFAULT` only where the schema writes `@default`; every table `STRICT`.
   - a `CHECK (col IS NULL OR col GLOB ...)` on every `@date` column (`[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]`) and every `@time` column (`[0-2][0-9]:[0-5][0-9]`).
   - a foreign key for every relation line with its delete rule, and for every column named `userId` or ending in `UserId` (to `User`, RESTRICT).
   - `@@unique` as a table constraint, `@@index` as an index; `/// @check`, `/// @uniqueWhere`, `/// @index` with the model's column names quoted; `/// @trigger` lines through the templates of section 3; then `triggers.sql` appended unchanged.
3. `db:verify` (new): apply the migrations folder (not a hard-coded list) to a temporary database, then compare `PRAGMA table_info`, `foreign_key_list`, `index_list` and the triggers in `sqlite_master` with the parsed schema, and fail on any difference. Add the Rust test `migrations_apply_on_the_shipped_engine` for the real engine.
4. sqlx stores a checksum of each applied migration. Until the first installer leaves the developer's machine `0001_init.sql` may be regenerated (delete the development database). After it, the schema changes only through a new numbered migration, and a new column on a chained table adds a `hashV`.
5. Brand the generated types: `Money`, `Minutes`, `Qty`, `BasisPoints`, `LocalDate`, `LocalTime`; conversions in `src/lib/units`. `hydrate` must leave `@date` and `@time` strings alone and keep a null Boolean null.

## 3. The triggers to write

118 in all. 92 come from six templates; 26 are named and written out in `triggers.sql`.

### The templates (X is the table)

```sql
-- appendOnly                                              (and the first two of chained)
CREATE TRIGGER "X_no_update" BEFORE UPDATE ON "X" BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY:X:update'); END;
CREATE TRIGGER "X_no_delete" BEFORE DELETE ON "X" BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY:X:delete'); END;

-- noDelete
CREATE TRIGGER "X_no_delete" BEFORE DELETE ON "X" BEGIN SELECT RAISE(ABORT, 'NO_DELETE:X'); END;

-- chained
CREATE TRIGGER "X_chain_insert" BEFORE INSERT ON "X"
WHEN NEW."chainSeq" IS NOT (SELECT "lastSeq" + 1 FROM "ChainHead" WHERE "id" = 'X')
  OR NEW."prevHash" IS NOT (SELECT "lastHash" FROM "ChainHead" WHERE "id" = 'X')
  OR length(NEW."hash") <> 64
BEGIN SELECT RAISE(ABORT, 'CHAIN:X:out_of_sequence'); END;
CREATE TRIGGER "X_chain_advance" AFTER INSERT ON "X"
BEGIN UPDATE "ChainHead" SET "lastSeq" = NEW."chainSeq", "lastHash" = NEW."hash", "updatedAt" = NEW."createdAt" WHERE "id" = 'X'; END;

-- legalNumber(K)
CREATE TRIGGER "X_number" BEFORE INSERT ON "X"
WHEN NEW."numberSeq" IS NOT (SELECT "lastValue" + 1 FROM "Sequence" WHERE "key" = 'K' AND "year" = NEW."numberYear")
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEQUENCE:X:number'); END;
CREATE TRIGGER "X_date" BEFORE INSERT ON "X"
WHEN substr(NEW."issueDate", 1, 4) IS NOT CAST(NEW."numberYear" AS TEXT)
  OR NEW."issueDate" < COALESCE((SELECT MAX("lastDate") FROM "Sequence" WHERE "key" = 'K'), '')
  OR NEW."issueDate" > date(NEW."createdAt", '+1 day')
BEGIN SELECT RAISE(ABORT, 'LEGAL_SEQUENCE:X:date'); END;
CREATE TRIGGER "X_number_advance" AFTER INSERT ON "X"
BEGIN UPDATE "Sequence" SET "lastValue" = NEW."numberSeq", "lastDate" = NEW."issueDate", "updatedAt" = NEW."createdAt" WHERE "key" = 'K' AND "year" = NEW."numberYear"; END;

-- headOnly(P, fk)
CREATE TRIGGER "X_head_only" BEFORE INSERT ON "X"
WHEN (SELECT "chainSeq" FROM "P" WHERE "id" = NEW."fk") IS NOT (SELECT "lastSeq" FROM "ChainHead" WHERE "id" = 'P')
  OR NEW."createdAt" IS NOT (SELECT "createdAt" FROM "P" WHERE "id" = NEW."fk")
BEGIN SELECT RAISE(ABORT, 'APPEND_ONLY:X:closed_parent'); END;

-- frozenWithRun(payRunId) [except a, b]            RUN(R, cond) = EXISTS (SELECT 1 FROM "PayRun" r WHERE r."id" = R."payRunId" AND r."status" cond)
-- frozenWithRun(payslipId->payRunId)               RUN(R, cond) = EXISTS (SELECT 1 FROM "Payslip" p JOIN "PayRun" r ON r."id" = p."payRunId"
--                                                                         WHERE p."id" = R."payslipId" AND r."status" cond)
CREATE TRIGGER "X_frozen_insert" BEFORE INSERT ON "X" WHEN NOT RUN(NEW, = 'DRAFT')
BEGIN SELECT RAISE(ABORT, 'FROZEN:X:insert'); END;
CREATE TRIGGER "X_frozen_update" BEFORE UPDATE [OF every column but a, b] ON "X" WHEN RUN(OLD, <> 'DRAFT')
BEGIN SELECT RAISE(ABORT, 'FROZEN:X:update'); END;
CREATE TRIGGER "X_frozen_delete" BEFORE DELETE ON "X" WHEN RUN(OLD, <> 'DRAFT')
BEGIN SELECT RAISE(ABORT, 'FROZEN:X:delete'); END;
```

`IS NOT` is deliberate everywhere: with `<>` a missing head or counter row would compare to NULL and let the insert through. An insert needs a parent whose run is DRAFT; an update or a delete is refused when a parent exists and its run is not DRAFT, so that the cascade from a deleted draft payslip to its lines passes (the parent is already gone when the lines go). The exact text of every trigger, as generated, is in `generated/0001_init.preview.sql`.

### Which table gets which template

| Template | Tables |
|---|---|
| chained (8) | `AuditLog`, `Invoice`, `InvoiceLine`, `InvoiceVisit`, `Payment`, `PaymentAllocation`, `Receipt`, `LegalEvent` |
| legalNumber | `Invoice` (INVOICE), `Receipt` (RECEIPT) |
| headOnly(Invoice, invoiceId) | `InvoiceLine`, `InvoiceVisit` |
| appendOnly (11) | `SequenceGap`, `StaffEvent`, `StaffDebtEntry`, `FileStageEvent`, `CashReconciliation`, `CashReconciliationLine`, `ExportBatch`, `StockMovement`, `HandOutLine`, `HandOutReturn`, `PurchaseLine` |
| noDelete (21) | `Branch`, `User`, `Sequence`, `ChainHead`, `Upload`, `Commune`, `Zone`, `HiringDecision`, `Violation`, `Sanction`, `SanctionDecision`, `StaffPayout`, `File`, `Quote`, `Visit`, `RuleOverride`, `Inspection`, `Complaint`, `HandOut`, `PurchaseRequest`, `Purchase` |
| frozenWithRun | `Payslip` (all columns but `paidAmount`, `paidDate`, `wageMethod`, `note`, `updatedAt`, `updatedByUserId`), `PayslipItem`, `PayslipSeat` |

### The named triggers (`triggers.sql`)

| Trigger | Refuses, or does |
|---|---|
| `Role_system_no_delete` | deleting the system role |
| `User_last_manager` | deactivating or demoting the last active manager |
| `Setting_database_id_update`, `Setting_database_id_delete` | changing the database id |
| `Sequence_seed` | a counter row that does not start at 0 |
| `Sequence_monotonic` | a counter, or its date floor, going back; a changed key or year |
| `Sequence_legal_step` | any move of INVOICE or RECEIPT except plus one with its document present, or a jump covered exactly by a `SequenceGap` |
| `ChainHead_step`, `ChainHead_seed` | a head that does not move by one; a head not seeded at 0 with a 64-character hash |
| `SanctionDecision_answer_once`, `SanctionDecision_answer_frozen`, `SanctionDecision_consume_once` | a second answer; a rewritten answer; a yes consumed twice or a no consumed |
| `PayRun_no_delete`, `PayRun_status_forward`, `PayRun_frozen` | deleting, reopening or rewriting a run that left DRAFT |
| `PayslipSeat_once` | paying a seat under a second run that is not VOID |
| `StaffDebtEntry_seq` | a ledger line out of sequence, not positive, or with a balance that does not follow |
| `File_site_match_insert`, `File_site_match_update`, `Site_file_match_update` | a file on a site of another client or division |
| `Payment_receipt_free` | a payment on a receipt that was voided or reported missing |
| `LegalEvent_receipt_in_use` | voiding a receipt whose payment is still live |
| `PaymentAllocation_paid`, `PaymentDue_paid_guard` | keeps `PaymentDue.paidAmount`; refuses any other value |
| `StockMovement_on_hand`, `StockItem_on_hand_guard` | keeps `StockItem.onHandQty`; refuses any other value |

The service layer maps the code before the first colon of each message (`APPEND_ONLY`, `NO_DELETE`, `CHAIN`, `LEGAL_SEQUENCE`, `SEQUENCE`, `FROZEN`, `PAID_TWICE`, `LEDGER`, `MISMATCH`, `RECEIPT`, `CACHE`, `LAST_MANAGER`) to an English sentence under `Errors`, as `db-errors.ts` does for constraint violations.

## 4. The order in which to create the tables

SQLite accepts a foreign key to a table created later, so any order loads. For a readable migration, create by owner, and inside each owner parents first. `generated/creation-order.txt` gives the full dependency tiers; in short:

1. **Foundation**: `Role`, `RoleGrant`, `Branch`, `User`, `Setting`, `Sequence`, `ChainHead`, `AuditLog`, `SequenceGap`, `Zone`, `Commune`, `BackupRun`, `Upload`.
2. **People**: `StaffMember`, then `StaffConfidential`, `StaffEvent`, `HiringInterview`, `HiringDecision`, `StaffDocument`, `TrainingModule`, `TrainingSession`, `TrainingAttendance`, `Skill`, `PeriodicEvaluation`, `EmployeeLeave`, `EmployeeCheckRecord`, `EmployeeAbsence`, `HoursAdjustment`, `StaffPayItem`, `PayRun`, `Payslip`, `PayslipItem`, `StaffPayout`.
3. **Clients**: `Client`, `Site`, `Contact`, `Resident`, `RepVisit`, `File`, `FileDescription`, `FileService`, `FileStageEvent`, `FirstVisit`, `CostStudy`, `Quote`, `QuoteLine`, `QuoteFollowUp`, `ClauseTemplate`.
4. **People, second part** (they point at Clients' or Operations' rows): `Sanction`, `SanctionDecision`.
5. **Operations**: `FileArea`, `FileTask`, `FileProgramme`, `FileSlot`, `Team`, `TeamMember`, `Vehicle`, `FileAssignment`, `SupervisorAssignment`, `WorkerAbsence`, `Visit`, `VisitWorker`, `VisitChecklistItem`, `VisitReport`, `VisitCall`, `RuleOverride`, `InspectionCriterion`, `Inspection`, `InspectionScore`, `InspectionWorkerNote`, `Complaint`, `ProblemReport`, `CorrectiveTask`.
6. **People, third part**: `PayslipSeat`, `Violation`.
7. **Money**: `Invoice`, `InvoiceDraft`, `PaymentDue`, `DueFollowUp`, `InvoiceLine`, `InvoiceVisit`, `VisitBilling`, `ReceiptBatch`, `Receipt`, `Payment`, `PaymentAllocation`, `LegalEvent`, `CashReconciliation`, `CashReconciliationLine`, `ExportBatch`.
8. **Stock**: `Supplier`, `StockItem`, `EquipmentUnit`, `InventoryCount`, `InventoryCountLine`, `HandOut`, `HandOutLine`, `HandOutReturn`, `PurchaseRequest`, `PurchaseRequestLine`, `Purchase`, `PurchaseLine`, `MaintenanceRecord`, `StockMovement`, `Expense`.
9. **People, last**: `StaffDebtEntry` (it points at `HandOutReturn`).
10. All indexes, then the template triggers, then `triggers.sql`.

Nullable keys that point forward in this order, or close a circle, and are therefore empty at insert and set by a later UPDATE: `User.staffMemberId`, `Upload.takenByEmployeeId`, `File.sanctionDecisionId`, `File.sourceVisitId`, `Sanction.violationId`, `ProblemReport.correctiveTaskId`, `Complaint.correctiveTaskId`, `Visit.rescheduledToVisitId`.

## 5. Seeds

Three kinds. **Migration seeds** are rows every installation needs and that hold no secret: `0002_seed.sql`. **First-run steps** need a value only known on the machine: a TypeScript function run once, in one transaction, guarded by `system.firstRunDone`. **Owner seeds** live in each feature folder (`seed data`) and are applied by Foundation's seed runner; they are listed here so that nobody waits for another owner.

### Migration seeds (Foundation)

| What | Rows |
|---|---|
| `Role` | `MANAGER` (`isSystem` 1), `HR_OFFICER`, `ADMINISTRATION`, `SUPERVISOR`, `RECEPTION_SALES`, `OPERATIONS`, `ACCOUNTANT`, with the labels of list ROLE |
| `RoleGrant` | the section matrix and the capability holders of `DESIGN.md` section 12: one SECTION row per cell that is R or W, one CAPABILITY row per default holder. None for MANAGER; never `backup.restore` |
| `Branch` | `branch-main`, `isDefault` 1 |
| `Setting` | none: every key has its default in code. Only values someone changed are rows |
| Wilayas | not rows: the constants file `src/lib/geo/wilayas.ts`, list below |
| `Commune` | the communes of wilaya 04, `isSeeded` 1, no zone yet (a zone is created the first time a site or a worker there is saved) |

### First-run steps (Foundation), in this order, one transaction

1. `system.databaseId` = a new UUID.
2. Eight `ChainHead` rows (`AuditLog`, `Invoice`, `InvoiceLine`, `InvoiceVisit`, `Payment`, `PaymentAllocation`, `Receipt`, `LegalEvent`), `lastSeq` 0, `lastHash` = the genesis hash of `DESIGN.md` section 8.
3. **The first manager account**: the first-run screen asks for a name and a password; the row is created with role `MANAGER`, `staffMemberId` empty (it exists before any employee), and its recovery code is shown once. No account and no password ship in a migration. The harness and the tests create `manager` with a fixed password.
4. The centre's identity: `centre.nameAr` and `centre.city` are pre-filled from his letterhead; RC, NIS, NIF, article number, address, phone, bank and CCP are asked and may be left empty until the first invoice, which refuses to issue without RC, NIS and NIF.
5. `tax.mode` (VAT or IFU): asked, no default.
6. `backup.targetDir`: asked.
7. Numbering: for each ordinary key the office may give the last number used on paper (`numbering.startAt`); for INVOICE and RECEIPT, if some were issued on paper this year, one `SequenceGap` of kind OPENING per key and the counter moved after it. `Sequence` rows are otherwise created at 0 by the first `nextNumber` of a key and year.
8. The first `AuditLog` entry (SECURITY, the first run), then the first anchor write, then `system.firstRunDone`.

### Owner seeds

| Owner | What | Source |
|---|---|---|
| all | the option catalogues: one constants module per list of `OPTION-CODES.md`, with its `code-labels.ts` entry and the three languages; shared lists in `src/lib/options` | `OPTION-CODES.md` |
| P | `TrainingModule`: eight rows (`DAY_1` .. `DAY_7`, `CONDUCT`); `Skill`: empty | D1 |
| O | `InspectionCriterion`: 30 rows (seven each for HOUSING and ORGANISATION, eight each for BUILDING and COMPLEX); the task catalogue and the departure lines are constants, not rows | D1, D9 |
| C | `ClauseTemplate`: empty (his contract sheets carry no clauses) | scope F2 |
| M | `StockItem`: 29 rows (14 materials, 9 equipment, 6 protective kit), all editable; `Supplier`: empty | D1, D6, D8, D9 |

### The wilayas (code, Arabic, French)

69 since ruling 6 (RULINGS.md item 6): the 58 below, then 59 to 69 as the ruling lists them. The list is `src/lib/geo/wilayas.ts`.

01 أدرار Adrar · 02 الشلف Chlef · 03 الأغواط Laghouat · 04 أم البواقي Oum El Bouaghi · 05 باتنة Batna · 06 بجاية Béjaïa · 07 بسكرة Biskra · 08 بشار Béchar · 09 البليدة Blida · 10 البويرة Bouira · 11 تمنراست Tamanrasset · 12 تبسة Tébessa · 13 تلمسان Tlemcen · 14 تيارت Tiaret · 15 تيزي وزو Tizi Ouzou · 16 الجزائر Alger · 17 الجلفة Djelfa · 18 جيجل Jijel · 19 سطيف Sétif · 20 سعيدة Saïda · 21 سكيكدة Skikda · 22 سيدي بلعباس Sidi Bel Abbès · 23 عنابة Annaba · 24 قالمة Guelma · 25 قسنطينة Constantine · 26 المدية Médéa · 27 مستغانم Mostaganem · 28 المسيلة M'Sila · 29 معسكر Mascara · 30 ورقلة Ouargla · 31 وهران Oran · 32 البيض El Bayadh · 33 إليزي Illizi · 34 برج بوعريريج Bordj Bou Arréridj · 35 بومرداس Boumerdès · 36 الطارف El Tarf · 37 تندوف Tindouf · 38 تيسمسيلت Tissemsilt · 39 الوادي El Oued · 40 خنشلة Khenchela · 41 سوق أهراس Souk Ahras · 42 تيبازة Tipaza · 43 ميلة Mila · 44 عين الدفلى Aïn Defla · 45 النعامة Naâma · 46 عين تموشنت Aïn Témouchent · 47 غرداية Ghardaïa · 48 غليزان Relizane · 49 تيميمون Timimoun · 50 برج باجي مختار Bordj Badji Mokhtar · 51 أولاد جلال Ouled Djellal · 52 بني عباس Béni Abbès · 53 عين صالح In Salah · 54 عين قزام In Guezzam · 55 تقرت Touggourt · 56 جانت Djanet · 57 المغير El M'Ghair · 58 المنيعة El Meniaa.

### The communes of the wilaya of أم البواقي (seed of `Commune`)

Written from memory, 29 names: **check them against an official list before the first installer** (`RULINGS-NEEDED.md` item 43). The office can add a missing one from any address field, so an error here costs a correction, not a blocked screen.

أم البواقي Oum El Bouaghi · عين البيضاء Aïn Beïda · عين مليلة Aïn M'lila · عين فكرون Aïn Fakroun · مسكيانة Meskiana · عين كرشة Aïn Kercha · عين ببوش Aïn Babouche · سيقوس Sigus · سوق نعمان Souk Naamane · قصر الصباحي Ksar Sbahi · فكيرينة Fkirina · بريش Berriche · الضلعة Dhalaa · الجازية El Djazia · بحير الشرقي Behir Chergui · العامرية El Amiria · البلالة El Belala · أولاد حملة Ouled Hamla · هنشير تومغني Hanchir Toumghani · عين الديس Aïn Diss · الزرق Zorg · الفجوج بوغرارة سعودي El Fedjoudj Boughrara Saoudi · أولاد زواي Ouled Zouaï · بئر الشهداء Bir Chouhada · وادي نيني Oued Nini · الرحية Rahia · عين الزيتون Aïn Zitoun · أولاد قاسم Ouled Gacem · الحرملية El Harmilia.

### The harness seed (development and screenshots only)

One job per division, so that every screen has rows and the end-to-end run of section 6 can be shown: one housing request, one organisation contract, one building contract with residents, one complex contract with `buildingsCount`; two supervisors, six workers (one man, five women; one reserve; one suspended), one client «متوقف»; stock for a hand-out; settings `tax.mode` IFU. Built by calling the owners' services, never by raw inserts, so the seed is itself a test of the contracts.

## 6. Scenario tests the model must pass

Each is a test that drives exported functions `(ex, ctx, input)` on a temporary SQLite file created from the migrations, with a fixed clock and an in-memory anchor. The database-level cases of sections B and C already pass in `tools/model-proof.mjs`.

### A. The end-to-end run, once per division

| # | Scenario | Must hold |
|---|---|---|
| A1 | **Housing, on demand (F5).** New client (check CLEAR), site in a new commune, file, description, ticks; quote issued, approved, accepted; «متعاقد»; visits from the dates and days; order printed; hand-out to a named worker; returned order typed; last visit signed off | commune and zone rows created; number from `FILE_HOUSING_REQUEST`; `file.contracted` created the visits and one SINGLE due; the sign-off closed the file (CONTRACT_ENDED, `endKind` JOB_DONE, `endedDate`, `closedAt`); the due is still listed and `payment.dueSoon` fires; invoice, cash payment with receipt and stamp; income shows under المنازل on the day received; the stage history has every step |
| A2 | **Organisation, contract (F4).** Monthly payment, three visits a week, six months; a quote with an INITIAL_JOB line | visits only on the ticked days between the two dates; one due per month plus one INITIAL_JOB due; the first invoice refuses to issue until the client's RC, NIS, NIF and the centre's are filled; an invoice run bills the month with its visit statement; a transfer needs a reference and carries no stamp |
| A3 | **Building, contract (F2).** Number with `/BLC`; residents list; six visits a week with the rest day rotating; contract reaches its end date | the residents page is logged when opened; each worker has one RESTING seat a week; at `endDate` the day-start job ends the file as EXPIRED with `closedAt` empty, cancels later visits, and `contract.ending` keeps it listed; closing it with NOT_RENEWED removes it |
| A4 | **Complex, contract (copy of F2).** Renewed thirty days before its end, with «قديم» used on the same site for a one-off request in between | the one-off file (`copiedFromFileId`) does not remove the contract from `contract.ending`; `renewFile` creates the successor and ends nothing; areas, tasks, slots, team and inspection plan are on the new file; on the end date the old file ends as RENEWED and no visit or due of its last weeks was cancelled; equipment stored at the site is still listed on the new file |
| A5 | **Each division's income line.** Payments of A1 to A4 | the four tiles of «المداخيل حسب القسم» equal the payments' amounts by `division` and `receivedDate`; the end-of-day report counts the orders not yet returned |

### B. Append-only and the chains

1. UPDATE, DELETE and `INSERT OR REPLACE` are refused on each of the eight chained and eleven append-only tables.
2. A row with a wrong `chainSeq` or `prevHash` is refused; the head follows each insert; the head cannot be rewound or deleted.
3. `verifyChains` passes on a database built by the scenarios; it fails, naming the first broken row, after one byte of one row is changed with the triggers dropped.
4. A column that is empty verifies (the canonical form writes `null`); `appendChained` throws on a float, a boolean, a `Date`, a missing column.
5. A line cannot be added to an older invoice, nor to the newest one at another instant; `verifyChains` recomputes every `contentDigest`.
6. A migration that adds a column to a chained table leaves old rows verifiable (`hashV` 1) and new rows under `hashV` 2.
7. Restore of an older copy: the anchor shows "behind"; after the manager's confirmation a `SequenceGap` covers the lost numbers, the next invoice takes the next number after them and cannot be dated before them, the log has the RESTORE entry, the PRE_RESTORE copy is protected. Across 1 January the old year's top is still known.
8. An anchor from another `databaseId`, and a database with no anchor, each ask the manager.
9. The two caches equal their sums after every scenario; a direct write of either is refused.

### C. Numbering

1. Invoices of a year are 1, 2, 3 with no hole after: a failed issue (rolled back), a void, a restore, a year change. Receipts the same, including a batch pre-printed for a collector.
2. The legal counter cannot be moved by hand; a number cannot be skipped or reused; an invoice cannot be dated before the last one, in another year than its number, or later than the day after it is written.
3. `assertClockSane` refuses a clock behind the last log entry and asks on a jump of more than `system.clockJumpDays`.
4. A file number per form kind, never restarted; `31/BLC` on a building contract and `31` on an organisation contract coexist; a number typed from paper is refused when taken and raises the counter; the next automatic number follows it.
5. A worker's number is `{n}/F` or `{n}/H`; correcting the sex rewrites it and logs it.
6. Quotes, visits, complaints, inspections, violations, hand-outs, counts and purchases restart each year by the document's own date; a new quote version keeps its number.
7. A deleted draft pay run leaves no hole: runs and payslips are numbered at close.
8. `nextNumbers` gives a year of visits one unbroken block; a rolled-back generation gives the numbers back.

### D. Working time (scope section 5)

| # | Scenario | Must hold |
|---|---|---|
| D1 | A worker's week reaches 40 h 30 | a warning, no block |
| D2 | A week would reach 48 h 30 | refused without a `RuleOverride` (`WEEK_OVER_48H`, with `valueMin` and the manager) |
| D3 | First start 06:00, last end 19:00 on one day | flag `DAY_SPAN_12H` |
| D4 | A woman on a visit 20:00 to 23:00; a man on the same visit | she is flagged `NIGHT_WOMAN` and needs an override with its derogation reference; he is not |
| D5 | Planned 23:00, arrived 00:15, left 03:00 | `lateMin` 75, `workedMin` 165: times read in order, arrival anchored to the planned start |
| D6 | A six-visit contract with `rotateRestDay` | every member has one RESTING seat a week, a different day in turn; she is not offered as her own replacement; People sees the rest date |
| D7 | Half-day absence, morning | only the morning seats are hit; `absenceMin` is half of `work.dayMin` |
| D8 | A worker leaves, or is suspended, with seats next month | her seats are REMOVED and the visits «بانتظار التأكيد»; lifting the suspension puts her back in the pickers only |
| D9 | The generator run twice; a visit moved by hand, then run again; a slot dropped | no duplicate; the moved visit stays; the dropped slot's visits are cancelled as `PROGRAMME_CHANGED` and counted nowhere |
| D10 | Overtime | a Saturday-to-Friday week of 44 h in the run that holds its Friday: 4 h at +50% (`pay.overtimePremium`) |

### E. Stamp duty and invoice totals (settings at their defaults)

| Cash amount (DA) | Stamp (DA) | Why |
|---|---|---|
| 299.99 | 0 | below `stamp.exemptBelow` |
| 300.00 | 5.00 | 1% is 3.00, raised to `stamp.minimum` |
| 30 000.00 | 300.00 | first band, 1.00 per 100 |
| 45 000.00 | 675.00 | second band on the whole amount (`stamp.mode` WHOLE), 1.50 per 100 |
| 150 000.00 | 3 000.00 | third band, 2.00 per 100 |
| 45 000.00 with `stamp.mode` PROGRESSIVE | 525.00 | 300.00 on the first 30 000.00, 225.00 on the rest |
| 45 000.00 by transfer | 0 | not cash: the database refuses stamp duty on it |

Also: the stamp is on the payment and printed on its receipt and on the invoice; the due of a 45 000.00 invoice is settled by 45 000.00 and nothing stays open; a partial cash payment carries the stamp of the part paid; IFU prints the mention and no VAT; VAT at 19% from a tax-included price rounds half up to the centime and `totalTTC = totalHT + vatAmount` holds; the amount in words is right in Arabic and French for 0.50, 1.00, 1 000.00, 45 675.00 and 1 000 000.00.

### F. The other rules worth a scenario

1. **Sanction check.** A suspended worker re-registered under the same national number: BLOCKED; the manager says yes; the registration consumes it; a second registration with the same yes is refused. A client «معاقب» picked with «قديم»: the same. A weak name match asks the clerk. A no can never be consumed. The pending request holds no health tick.
2. **Restricted data.** A role without `staff.health.read` cannot read the health group, the signed form scan or a medical certificate; each successful read writes a CONSULT entry; no restricted value, password hash or cost appears in `AuditLog.changes`.
3. **Payroll.** A run closed: payslips, lines and seats frozen; an order typed afterwards is paid by the next run as arrears; a time corrected afterwards is listed as a difference; a second run for the same period is refused until the first is voided; an advance and a wage payout each post their expense on the day paid; voiding a payout removes its expense and writes a REVERSAL in the ledger.
4. **Leave.** 2.5 days a month from `leaveOpeningDate`; a leave from 28 October to 5 November is two rows and falls on two payslips; an employee's approved leave is not also an absence.
5. **Payments.** Void of a cash payment: reversal allocations, the payment's event, the receipt's; the due is open again; a lost receipt blank is MISSING and cannot be used; one closing per collector and day.
6. **Stock.** A hand-out against a job to a named worker lowers `onHandQty`; a return with one lost unit lists it for People; a cancelled hand-out restores the quantity; low stock fires at the minimum; a cancelled purchase replays the average cost.
7. **Both of his alerts.** A contract thirty days from its end; a due seven days ahead: each shows on its tile with the payer's name and phone, and is announced once that day.
8. **The log.** Every scenario above leaves, for each personal record it touched, entries with operation, reason, date, time and user; a print is a DISCLOSE; a backup is a DISCLOSE; nothing can be deleted from it.
9. **Offline and the shell.** The whole suite runs under Node with no Tauri import: the hash, the anchor and uploads are behind interfaces.
