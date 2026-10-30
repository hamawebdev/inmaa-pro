# Data model: design notes (revision 2)

Companion to `schema.prisma` (106 models; the first draft had 119). What changed and why, finding by finding, is in `CHANGES.md`. What is still open is in `RULINGS-NEEDED.md`. How to build it is in `BUILD-NOTES.md`.

| Owner | Models |
|---|---|
| Foundation | 13 |
| People | 25 |
| Clients and contracts | 15 |
| Operations | 23 |
| Money and stock | 30 |

Working tools beside the schema, all run with plain `node` (22.5 or later) or `python3`:

| Tool | What it does | Result on this revision |
|---|---|---|
| `tools/revise.mjs`, `tools/patch-option-codes.py` | rebuild `schema.prisma` and `OPTION-CODES.md` from the first draft kept in `draft-1/` | 106 models written |
| `tools/build-ddl.mjs` | generates SQLite DDL from `schema.prisma` and `triggers.sql` and loads it into `node:sqlite` | 106 STRICT tables, 118 triggers (26 named, 92 from templates), every check and partial index compiles; output in `generated/0001_init.preview.sql` |
| `tools/model-proof.mjs` | tries to break the database rules on that DDL | 157 of 157 checks pass (`generated/model-proof.txt`) |
| `check-schema.mjs` | naming rules, and the documents against each other (codes, owners, settings, capabilities, events, triggers) | 0 problems |

What was proven is the database: tables, constraints, triggers. No service exists yet, so the scenario tests of `BUILD-NOTES.md` section 6 are still to write, and nothing here was run on the engine that ships (sqlx's bundled SQLite 3.46; `node:sqlite` is newer).

## 1. What follows the reference, and what does not

Kept: one Prisma-style file as the type source, quoted PascalCase tables, camelCase columns, TEXT primary keys, `createdAt` / `updatedAt` as ISO-8601 UTC text written by the application, booleans as INTEGER 0/1, enums as plain TEXT, soft delete by `deletedAt`, uploads as managed paths in `...Url` columns, a `Setting` key and value table.

Changed:

| Reference | Here | Why |
|---|---|---|
| Money is `REAL` dinars | `INTEGER` centimes | coordinator's decision |
| Every date is a `DateTime` instant | calendar dates and clock times are TEXT, never instants, with a GLOB check on each | coordinator's decision; Algeria is UTC+1, so a local midnight stored as UTC lands on the day before |
| The DDL is written by hand and nothing checks it against the type source | the DDL is generated from the type source; `db:verify` compares the live database with it | five places already disagreed in the first draft (review, foundation 5) |
| `@default(cuid())`, `@default(now())`, `@updatedAt` with no `DEFAULT` in the DDL | no default on `id`, `createdAt`, `updatedAt` | removes the `Generated<>` trap (`ref-data.md` section 3) |
| Ordinary tables | every table `STRICT` | a float can no longer land in a centime column |
| `version`, `adminId` on most tables | dropped | sync and multi-tenant leftovers, never read |
| `ON DELETE CASCADE` on money and ledger rows | `RESTRICT` everywhere except three children (section 14) | `ref-data.md` risk 7 |
| No user, no log, no numbering, no void | `User`, `Role`, `AuditLog`, `Sequence`, `ChainHead`, `LegalEvent` | scope R1 |
| No CHECK, no trigger | checks and triggers written in the schema as `/// @check`, `/// @trigger` lines | coordinator's decision |

The generator (`scripts/generate-db-types.mjs`) therefore gains: reading the tags and the `///` directives before it strips comments; treating a missing `@default` as required; emitting `DATE_COLUMNS` only for `DateTime`; emitting `CHAIN_COLUMNS` (section 8); and emitting `0001_init.sql`. `tools/build-ddl.mjs` is a working version of the last part.

## 2. Conventions

**Ids.** `id TEXT PRIMARY KEY NOT NULL`, a UUID from `newId()`. `Role.id` is the role code, `ChainHead.id` is the table name, seeded rows use fixed slugs (`branch-main`).

**Instants.** `DateTime` in the type source, TEXT `2026-10-11T22:15:00.000Z` in the database. Column names end in `At` (one exception kept from the academy: `EmployeeCheckRecord.timestamp`).

**Calendar dates.** `String` tagged `@date`, TEXT `YYYY-MM-DD`, local. Names end in `Date` or are `date`. They compare and sort as text.

**Clock times.** `String` tagged `@time`, TEXT `HH:MM`, 24 hours, local. Names end in `Time`. Two rules make night work safe:
- Clock times on one row are read in order: a time smaller than the one before it is on the next calendar day.
- On a seat, `arrivedTime` is on the day that puts it nearest to `Visit.plannedStartTime` (planned 23:00, arrived 00:15 is 75 minutes late, not early).

Everything computed from times is stored in minutes (`lateMin`, `workedMin`, `plannedDurationMin`): no SQL does arithmetic on `HH:MM`.

**"Local" and "today" come from one clock object, never from the machine.** The centre's offset is setting `system.utcOffsetMin` (60: Algeria has no daylight saving). Foundation's clock gives `today`, `nowTime`, `now`, `toInstant(date, time)` and `toLocal(instant)`; it is part of the `ctx` every service receives (section 16). No query uses SQLite's `date('now')`; no code reads the operating system's time zone. Tests pass a fixed clock.

**Money.** `Int` tagged `@money`, INTEGER centimes. A percentage rounds half up to the centime.

**Quantities: integers in a stated unit; no REAL column anywhere.**

| Tag | Unit | Used for |
|---|---|---|
| `@min` | minutes | every duration and every count of hours |
| `@qty` | thousandths of the unit named beside it | stock quantities, areas in m², days of leave and days worked, weeks, kilometres, invoice and quote line quantities |
| `@bp` | basis points | VAT rate, CNAS rates, margin, the percentage of a cost line |
| `@udeg` | micro-degrees | site latitude and longitude |

Minutes columns end in `Min`. One duration is not in minutes: `File.executionDurationValue` is `@qty` of `executionDurationUnit` (hours or days), because his form «مدة التنفيذ» gives no unit. Foundation's generator brands the four as distinct TypeScript types, with the conversions in `src/lib/units`.

**Booleans.** INTEGER 0/1. A yes/no pair printed as two boxes is a nullable Boolean: null means neither box is ticked.

**Standard columns.** Ordinary tables: `createdAt`, `updatedAt`, `createdByUserId`, `updatedByUserId`. Soft-deletable tables add `deletedAt`. Append-only tables: `createdAt` and `createdByUserId` only. Every column named `userId` or ending in `UserId` is a foreign key to `User`.

**One name per idea.**
- A numbered row has `numberSeq`, `numberYear` when its counter restarts yearly, and `number` (the display text). This holds for staff, clients, files, quotes, visits, invoices, receipts, payouts and equipment units alike.
- `sortOrder` is an order a person may change (display, print). `seq` is a line number the system assigns inside a document or a ledger and never changes.
- `note` is a free remark. `status` is a life-cycle. `state` is used once, on `Sanction`, for the scope's sanction state.

**Day of the week.** In sets ticked on a form: codes `SAT` .. `FRI`. In Operations' programme tables: the academy's integer, `0` السبت .. `6` الجمعة. The week runs Saturday to Friday.

**Wilaya and commune** (coordinator's ruling). A wilaya is a code of a fixed bundled list (`01`..`69`, ruling 6; `src/lib/geo/wilayas.ts`); the list is data, and no constraint names the range. A commune is a row of `Commune`, seeded with the communes of the wilaya of أم البواقي and grown by the office (`ensureCommune`). An address points at a commune row (`Site.communeId`, `StaffMember.residenceCommuneId`, `RepVisit.communeId`) and takes its wilaya from it. A birthplace is free text (`StaffMember.birthPlace`) with an optional `birthWilayaCode`. `Commune.zoneId` is the commune's zone: the default zone key (A9).

**Search keys.** `nameKey`, `nameLatinKey`, `managerNameKey`, `commonNameKey` and `phoneKeys` are derived on every save by Foundation's normaliser (tatweel and vowel marks removed, alef and hamza forms unified, final ya and alef maqsura unified, ta marbuta and ha unified, spaces collapsed). `phoneKeys` is `|digits|digits|`, so `LIKE '%|0659538183|%'` finds one number exactly.

## 3. Option codes and sets

- A code is TEXT, upper snake case, stable for ever. The catalogue is code, not a table: one constants module per list. Where sibling forms word or order a list differently, the form definition carries the per-form label and order (`OPTION-CODES.md`).
- Lists the office edits are tables: `Role`, `TrainingModule`, `Skill`, `InspectionCriterion`, `ClauseTemplate`, `StockItem`, `Zone`, `Commune`, and his two service lists, `CatalogueService` with `CatalogueServiceDivision` (the developer, 2026-10-22).
- **His two service lists are the manager's.** «الخدمات المقدمة» and «الخدمات المبرمجة» are rows, seeded by migration 0003 with the 48 services of his forms and edited in Settings › الخدمات: a service added (coded `ADDED_<n>`, never reused), renamed (in Arabic, French and English, all three required), removed (`isActive` 0: no longer offered; a file that ticks it keeps it, on screen and on paper), given its divisions, moved within a division. The order is per division (`CatalogueServiceDivision.sortOrder`), because his forms order the same services differently. A form definition no longer lists them: its service row says where the columns and the blank lines are, and `resolveDefinition` (src/features/clients/forms/catalogue.ts) fills it from the rows, plus the codes the file already ticks.
- **Several ticks** are a JSON array of codes in one TEXT column (`@codes`), in the form's order. Nothing ticked is `[]`; NULL means the field does not exist on that form.
- **Child rows instead of JSON**, because another owner filters or joins on the values in SQL: `FileService` (Operations seeds tasks from the ticks, Money groups income by them) and `FileSlot` (the join-able form of «أيام التنفيذ»; `File.executionDays` stays the JSON set the sheet prints).
- **Small documents nobody filters in SQL are JSON on their parent** (new in this revision, to keep the model small): `File.clauses`, `File.partySnapshot`, `CostStudy.lines`, `FirstVisit.spaces`, `Payslip.divisionMin`, the snapshots of `Invoice`. Each shape is written beside its column and has one zod schema in its owner's validators.
- Where a read filters on a JSON set (workers free on a weekday, a skill), it loads the candidates and filters in TypeScript, or uses `EXISTS (SELECT 1 FROM json_each(col) WHERE value = ?)`.
- Codes are validated by zod at the service edge. The database checks only the codes other owners' SQL depends on (section 15).

## 4. Soft delete

`deletedAt` is set, the row stays, every list query filters `deletedAt IS NULL`, and the delete is logged as an ERASE entry with its reason.

Soft-deletable (30 tables): `StaffMember`, `HiringInterview`, `StaffDocument`, `TrainingSession`, `PeriodicEvaluation`, `EmployeeLeave`, `EmployeeCheckRecord`, `EmployeeAbsence`, `HoursAdjustment`, `StaffPayItem`, `Client`, `Contact`, `Site`, `Resident`, `File`, `FirstVisit`, `Quote`, `ClauseTemplate`, `RepVisit`, `FileArea`, `FileTask`, `FileSlot`, `FileAssignment`, `Team`, `Vehicle`, `ProblemReport` (with `deletedByUserId`; F4, LOG-14: a re-typed order takes a report away), `Expense`, `StockItem`, `Supplier`, `PurchaseRequest`. (A zone is no longer soft-deleted: it is retired with its active flag, because a commune can only point at one zone.)

Soft delete is refused by the service when the row is referenced by a record that must stay: a `StaffMember` with a pay, sanction, decision or violation row; a `File` that reached «متعاقد» or has a visit, an issued quote, an invoice, a payment or a hand-out; a `Client` with a file; a `Quote` that was issued.

**Never deleted in any way** (each class is enforced by a trigger template, section 5):

| Class | Tables | What replaces deleting |
|---|---|---|
| A. Chained, append-only (8) | `AuditLog`, `Invoice`, `InvoiceLine`, `InvoiceVisit`, `Payment`, `PaymentAllocation`, `Receipt`, `LegalEvent` | a VOIDED event, a reversal row |
| B. Append-only, no chain (12) | `SequenceGap`, `StaffEvent`, `StaffDebtEntry`, `SanctionDecisionMatch`, `FileStageEvent`, `StockMovement`, `HandOutLine`, `HandOutReturn`, `PurchaseLine`, `CashReconciliation`, `CashReconciliationLine`, `ExportBatch` | a correcting or reversing row |
| C. Rows may change, never be deleted (23) | `Branch`, `User`, `Sequence`, `ChainHead`, `Upload`, `Commune`, `Zone`, `CatalogueService`, `CatalogueServiceDivision`, `HiringDecision`, `Violation`, `Sanction`, `SanctionDecision`, `StaffPayout`, `File`, `Quote`, `Visit`, `RuleOverride`, `Inspection`, `Complaint`, `HandOut`, `PurchaseRequest`, `Purchase`; and `Role` when `isSystem`, `PayRun` once it left DRAFT | deactivate, lift, void, cancel, soft delete |
| D. Frozen with their pay run | `Payslip`, `PayslipItem`, `PayslipSeat` | void the run |

## 5. The database rules

Every rule is written in `schema.prisma` above its model and turned into SQL by the generator. The exact SQL of the six templates is in `BUILD-NOTES.md` section 3; the 26 named triggers are in `triggers.sql`.

| Directive | What the database then refuses |
|---|---|
| `@check <sql>` | a row that breaks the expression |
| `@uniqueWhere`, `@index` | a second row in the same slot; or names a partial index an alert reads |
| `@trigger appendOnly` | UPDATE and DELETE |
| `@trigger chained` | UPDATE, DELETE, and an INSERT whose `chainSeq` is not the head plus one or whose `prevHash` is not the head's hash; the insert then advances `ChainHead` |
| `@trigger noDelete` | DELETE |
| `@trigger legalNumber(KEY)` | a number that is not the counter plus one; a date outside its number's year, before the last issued date, or later than the day after `createdAt`; the insert then advances the counter and its date floor |
| `@trigger headOnly(Parent, fk)` | a line for any parent but the one chained last, or written at another instant than its parent |
| `@trigger frozenWithRun(path)` | INSERT, UPDATE or DELETE once the pay run is not DRAFT (with an optional list of columns that stay free) |
| `@trigger named X` | see `triggers.sql` |

Two connection options are part of the model: `foreign_keys = ON` and `recursive_triggers = ON`. Without the second, `INSERT OR REPLACE` deletes the conflicting row without firing the delete trigger. Both must be **connect options** of the pool, not statements, and the one connection must never be recycled (`BUILD-NOTES.md` section 1): otherwise a transaction is torn in two after thirty minutes.

`UPDATE OF` fires when a column is named in the SET list, changed or not. Two consequences builders must know:
- a service that records a payslip's payment sets only `paidAmount`, `paidDate`, `wageMethod`, `note`, `updatedAt`, `updatedByUserId`;
- a service that saves a `StockItem` or a `PaymentDue` must not send `onHandQty` or `paidAmount` (a stale value is refused by the cache guards; the right value passes).

Triggers stop mistakes and casual edits. They do not stop someone who drops them: the webview can send any SQL (`ref-data.md` risk 1). That is what the chain and its outside anchor are for, and why `db_execute` and `db_select` accept one statement at a time from an allow-list (`BUILD-NOTES.md` section 1).

## 6. Sequences and numbering (#24, scope A6)

Foundation exports four functions (`src/lib/numbering`), all inside the caller's transaction:

| Function | Use |
|---|---|
| `nextNumber(ex, ctx, key, { date, suffix? })` | one number; a rolled-back transaction rolls the counter back |
| `nextNumbers(ex, ctx, key, { date, count })` | a block (a year of visits) in one statement |
| `claimNumber(ex, ctx, key, { value, date, reason, isFree? })` | a number typed from paper: the owner says whether it is free (`isFree`; its unique index has the last word), the counter is raised to at least that value; capability `file.setNumber`, logged with the typed reason (ordinary keys only) |
| `peekLegalNumber(ex, ctx, key, { date })` | INVOICE and RECEIPT: reads counter plus one, and `notBefore`, the date floor; **nothing increments a legal counter but the insert of the document** |

A counter row starts at 0. The first `nextNumber` of a key raises it to setting `numbering.startAt[key]` when one is given, so the centre can go on from its paper registers.

| Document | Key | Restarts | Display | Columns |
|---|---|---|---|---|
| Worker registration «رقم التسجيل» | `STAFF_WORKER` | never | `{n}/{H or F}`; the blank form keeps `/H/F` | `StaffMember.numberSeq`, `numberSuffix`, `number` |
| Employee registration | `STAFF_EMPLOYEE` | never | `{n}`, plus `/{suffix}` once he names one | same |
| Client «رقم الملف» | `CLIENT_DOSSIER` | never | `{n}`, or the text typed from paper | `Client.numberSeq` (null when typed), `number` (unique) |
| File «رقم التسجيل» | `FILE_HOUSING_REQUEST`, `FILE_HOUSING_CONTRACT`, `FILE_ORG_REQUEST`, `FILE_ORG_CONTRACT`, `FILE_BUILDING_CONTRACT`, `FILE_COMPLEX_CONTRACT` | never | `{n}/{suffix}`, or `{n}`. `BLC` on the building contract, empty on the other five until he names them | `File.numberSeq`, `numberSuffix`, `number`; unique on `(formKind, numberSeq)`; typed under capability `file.setNumber` |
| Quote | `QUOTE` | yearly | `{n:4}/{yyyy}`; a new version keeps the number | `Quote.numberSeq`, `numberYear`, `number`, `version` |
| Visit, printed as «رقم أمر المهمة» | `VISIT` | yearly | `{n:5}/{yyyy}` | `Visit.*` |
| **Invoice** | `INVOICE` | yearly | **`{series}{n:6}/{yyyy}`, fixed** | `Invoice.*` |
| **Cash receipt** | `RECEIPT` | yearly | **`{series}{n:6}/{yyyy}`, fixed** | `Receipt.*` |
| Complaint, supervisor inspection, violation | `COMPLAINT`, `INSPECTION`, `VIOLATION` | yearly | `{n:4}/{yyyy}` | `...numberSeq`, `numberYear`, `number` |
| Pay run, payslip | `PAY_RUN`, `PAYSLIP` | yearly | `{n:4}/{yyyy}`; **allocated when the run closes**, so a deleted draft leaves no hole | `PayRun.*`, `Payslip.*` (nullable until then) |
| Payout receipt | `PAYOUT` | yearly | `{n:4}/{yyyy}` | `StaffPayout.*` |
| Hand-out, count, purchase request, purchase | `HANDOUT`, `COUNT`, `PURCHASE_REQUEST`, `PURCHASE` | yearly | `{n:4}/{yyyy}` | same shape |
| Equipment unit | `EQUIPMENT_UNIT` | never | `{n:4}` | `EquipmentUnit.numberSeq`, `number` |

The year is the year of the document's own date, not of the clock. A never-restarting key uses `year = 0`. A worker's `numberSuffix` follows `sex`: correcting the sex rewrites `numberSuffix` and `number` (logged).

**The two legal sequences are outside the numbering settings.** Their format is a constant; `{series}` is setting `numbering.legalSeries`, empty unless a second PC of the same company must issue under its own series. The sequence is unbroken by construction: the document's BEFORE INSERT trigger demands counter plus one, its AFTER INSERT trigger moves the counter, and the counter's own trigger refuses any other move unless a `SequenceGap` row covers it exactly (restore of an older backup; numbers issued on paper that year before the program, kind OPENING). `Sequence.lastDate` is the date floor: it survives a restore, which `MAX(issueDate)` did not.

## 7. The legal documents: what is a row and what is derived

- **A draft is not an invoice.** `InvoiceDraft` is an ordinary, editable, deletable row holding the proposed header and lines as JSON; the dues it would invoice point at it (`PaymentDue.draftId`), so two drafts never take one due. Issuing reads the draft, peeks the number, inserts `Invoice`, its `InvoiceLine` and `InvoiceVisit` rows, updates the dues, deletes the draft: one transaction. `Invoice` never has an update.
- **Voided** is a `VOIDED` row in `LegalEvent`. The invoice, its lines and its number stay; `PaymentDue.invoiceId` is cleared so the due returns to "not invoiced"; the sheet prints «ملغاة» across the page.
- **The receivable never includes the stamp.** `PaymentDue.amount` is the expected amount until invoiced, then the due's share of the invoice's `totalTTC`. An invoice that bills several dues shares its TTC between them by its lines' `dueId`; the last due takes the remainder. `Payment.amount` excludes the stamp too, so a cash invoice of 45 000.00 is settled by 45 000.00 plus 675.00 of stamp, and nothing stays open.
- **Paid** on a due is `SUM(PaymentAllocation.amount)`, reversals included, cached in `PaymentDue.paidAmount` by a trigger. It is never filtered by events: voiding a payment writes one negative allocation per live one (`reversesAllocationId`, once each), then the payment's VOIDED event, and for cash the receipt's.
- **A receipt** is written once, blank or filled, when it is printed and takes its number. It is USED when a `Payment` points at it (`Payment.receiptId`, unique): the payment row is what the receipt says (payer, amount, stamp, total, the total in words, what it is for). A blank that was not used is VOIDED; a blank that was lost is MISSING; both are `LegalEvent` rows with a reason. A receipt in use cannot be voided before its payment, and a closed receipt cannot be used.
- **Stamp duty** is booked on each cash `Payment`; the invoice only prints it. The checks on `Invoice` and `Payment` refuse stamp duty on anything but cash.
- A cash payment at the office: `Receipt`, `Payment` (with `receiptId`), `PaymentAllocation` rows, in that order, one transaction.
- Due state, days late, payment state, invoice status and receipt status are computed. None is stored.

## 8. The hash chain

**Which rows.** Each class A table is its own chain, numbered by its own `chainSeq` from 1 with no gap, with its head in `ChainHead`. Eight chains: `AuditLog`, `Invoice`, `InvoiceLine`, `InvoiceVisit`, `Payment`, `PaymentAllocation`, `Receipt`, `LegalEvent`.

**What is hashed: a versioned column list, not "whatever the row holds".** Each chained row carries `hashV`. The generator emits `CHAIN_COLUMNS[table][hashV]`: the names and storage types of the columns that version covers (every column except `hash`). A later migration that adds a column adds version 2 and leaves old rows verifiable under version 1. No chained column has a DDL default.

**Canonical form.** `canonical(table, hashV, row)` is the JSON text of an object whose keys are that list in ascending ASCII order and whose values are exactly what SQLite stores: TEXT as a JSON string, INTEGER as decimal digits, NULL as `null` (an empty column is written `null`, never left out). No whitespace; non-ASCII as UTF-8, not escaped. `appendChained` throws on a column missing from the row, a non-integer number, a JavaScript boolean or a `Date`: the writer converts first. (The proof script reproduces the failure this prevents: hashing only the keys supplied breaks verification as soon as one column is empty.)

```
hash = hex( SHA-256( utf8( prevHash + "\n" + tableName + "\n" + canonical ) ) )          // 64 lower-case hex characters
genesis prevHash of table T = hex( SHA-256( utf8( "GENESIS\n" + databaseId + "\n" + T ) ) )
```

`databaseId` is a UUID written once into `Setting system.databaseId` (a trigger refuses any change) and seeded into the eight `ChainHead` rows by the same first-run step.

**An invoice commits to its content.** `Invoice.contentDigest` is the hex SHA-256 of the text `{"lines":[…],"visits":[…]}`, each element being the canonical form (above) of a line or visit row over the columns of **its hash version** without `id`, `invoiceId`, `chainSeq`, `prevHash`, `hash`, `createdAt` (`hashV` stays; a row not yet written takes the current version), in `seq` order, computed in memory before anything is inserted. Over the version's columns, not "the row": a later column added to `InvoiceLine` must leave older invoices' digests true (F2). The `headOnly` trigger refuses a line for an older invoice or written at another instant; `verifyChains` recomputes the digest, which catches the one case the trigger cannot (a line appended to the newest invoice in a forged same-instant insert).

**One function, in TypeScript, over a Kysely executor** (coordinator's ruling):

```
appendChained(ex, ctx, table, row) -> { hashV, chainSeq, prevHash, hash }
  1. read ChainHead[table]                    (same transaction)
  2. chainSeq = lastSeq + 1; prevHash = lastHash; hashV = current version
  3. hash as above                             (Web Crypto: present in the webview and in Node)
  4. insert the row                            (the triggers check 1 and 2 again and advance the head)
verifyChains(ex, { tables?, fromSeq? }) -> per table: rows checked, first broken seq or null, head against ChainHead, head against the anchor;
                                           every Invoice.contentDigest; for INVOICE and RECEIPT and each year: every number from 1 to lastValue present or covered by a SequenceGap;
                                           the two caches (PaymentDue.paidAmount, StockItem.onHandQty) against their sums
```

**The anchor: how a restored old backup is detected.** The chain proves the file is internally consistent. It cannot prove the file is the latest one, so the head is also kept **outside the database and outside the backup**.

- An `AnchorStore` interface with `read()` and `write(record)`. The desktop implementation is a Rust command that stores the record in the same operating-system locations as the licence vault, signed with the product secret. Tests use an in-memory implementation. Nothing in the model depends on the shell.
- The record: `{ v: 1, databaseId, writtenAt, heads: { <table>: { seq, hash } }, legal: { INVOICE: { "<year>": { lastValue, lastDate } }, RECEIPT: { ... } }, lastInvoice: { number, issueDate } }`. The legal counters are keyed **by year**, so a restore across 1 January still knows the old year's top.
- Written after every commit that issued or voided an invoice or a receipt or recorded or voided a payment; for the log, at most once a minute and when the program closes; and always just before a backup.
- Compared at start-up, before a backup, and after a restore:

| Database against anchor | Meaning | What happens |
|---|---|---|
| same `databaseId`, every head equal | normal | nothing |
| database ahead, and the anchored hash is found at the anchored seq | the anchor write was missed (crash, power cut) | verify the rows in between, re-anchor, no message |
| **database behind** | **an older copy was restored, or rows were removed** | the program opens on a warning for the manager: «هذه النسخة أقدم من آخر فاتورة: آخر فاتورة مسجلة {number} بتاريخ {date}، وهذه النسخة تتوقف عند {number}». He confirms with a typed reason or restores another copy |
| same seq, different hash, or the anchored hash is not at the anchored seq | a record was altered | danger warning; `verifyChains` shows the first broken row |
| other `databaseId`, or no anchor while the database holds chained rows | another machine's data, or a reinstalled system | warning; the manager confirms; a new anchor is written |

- On the manager's confirmation of a "behind" database, one transaction (coordinator's ruling): for INVOICE and RECEIPT and each year concerned, a `SequenceGap` row (kind RESTORE) for the numbers that were issued and are missing here, and the counter and its date floor moved past them, so **no number is ever issued twice**; an `AuditLog` entry, operation SECURITY, action RESTORE, with both sets of heads in `context`; a `BackupRun` row of kind RESTORE that names the PRE_RESTORE copy. Then the anchor is rewritten.
- A backup carries a manifest beside the `.db` file: `{ databaseId, schemaVersion, appVersion, createdAt, heads, legal, lastInvoice, sha256 of the .db }`. The restore dialog reads it before overwriting anything, which is where the scope's "warning when a backup predates the last invoice" is shown.
- Restore is for the manager only (capability `backup.restore`, which no role can be granted: a CHECK). A PRE_RESTORE backup of the current database is always made first and is protected from rotation (`BackupRun.isProtected`): it is the only place that still holds what the restore removed.
- **As built (F3b).** The daily copy is `inmaa-auto-YYYY-MM-DD.db` in the folder of setting `backup.targetDir`, with `<name>.json` (the manifest) and `<name>-uploads/` beside it; it is made by the program itself after the day-start job, once a day (a copy made by hand that day counts), and tried again within the hour when the folder is not there. Rotation removes the oldest `inmaa-auto-…` files beyond `backup.keepCount`, by name, and nothing else in the folder: a copy made by hand (`inmaa-backup-…`) and the copy kept before a restore (`inmaa-pre-restore-…`, in the same folder, or in the program's own data folder when none is chosen) are never removed. A folder a cloud client synchronises is refused when it is chosen and again before every copy (OneDrive's folders as Windows names them; the folder names of OneDrive, Dropbox, Google Drive, iCloud, MEGA, pCloud, Nextcloud and Box; their marker files): a backup there leaves the PC. A copy that fails is a `BackupRun` row with `ok` 0 and its reason. Every copy is a DISCLOSE entry (action BACKUP) naming where it goes, written with the check of `backup.run` (`backup.restore` for the copy before a restore) before a byte is copied (`beginBackup`, F4, audit LOG-3): a copy that fails half way keeps it, as something may have reached the target.
- **The restore, as built.** The manager picks a copy; `assessRestore` reads its manifest against this database and warns: another installation's data, a state that stops before the last invoice or receipt issued here, or no manifest at all. He types his reason. A PRE_RESTORE copy is made and recorded; without it nothing is replaced. The restore leaves a note beside the database (what was restored, where the PRE_RESTORE copy is, his reason), because the restored database cannot know it was restored; the program restarts. At that start, a database behind, altered, foreign or unanchored opens on the screen that asks the manager, for everybody: nothing is written until he answers (`answerAnchor`), and the day-start job and the daily copy wait too. A restore that lost nothing leaves the anchor in agreement: it is recorded (`recordCleanRestore`) the first time the manager signs in. A restore onto a reinstalled PC (the copy then compares as foreign or unanchored) is recorded the same way when the manager answers, beside the ANCHOR_REBASE entry, which carries his typed words in its reason (F4, audit LOG-4). A comparison that cannot be made at start (a read or the anchor command fails) is "unchecked": the same screen, with «try again», for everybody, never the program (F4, audit LOG-11). The log's head is anchored at most once a minute, again when that minute is up, and when the window closes (F4, audit LOG-10). The anchor is written only over an anchor the database continues ("normal" or "ahead"): while the database is in question or could not be compared, the runners hold no anchor, and `writeAnchor` refuses it all the same, so a sign-in, a lock, a backup or closing the window cannot make an older copy pass as normal at the next start. Only first run and the manager's answer write it regardless (`accept`) (final review FND-01). A restore takes only this program's database (a SQLite file that passes its quick check, with a database id and only migrations this build carries), stages it beside the live files, writes the note, closes the connection and renames it into place, putting everything back if a rename fails (FND-04).

**The clock.** A wrong system date is the one thing that can block the legal sequences (an invoice dated next year would forbid every invoice until then). Two guards: the `legalNumber` trigger refuses a date later than the day after `createdAt`; and `assertClockSane(ex, ctx)` runs before any legal document is issued: the clock may not be earlier than the last `AuditLog.occurredAt`, and a forward jump of more than `system.clockJumpDays` days asks the manager and logs CLOCK_WARNING.

**The clock, as built (F4, audit INV-1).** The PC's date is measured against the work recorded, never against a sign-in: a sign-in is written at the PC's own date, so measured against it a mistyped year looks like minutes. The reference (`checkClock`, src/lib/clock/sanity.ts) is the newest entry since the manager's latest word on the date (CLOCK_WARNING, itself a reference: what was written before it no longer counts), leaving out the comings and goings (SIGN_IN, SIGN_IN_FAILED, LOCK, PASSWORD_CHANGE), what the reader's present session wrote, and every session that began on a clock out of order: a sign-in that finds the clock out of order says so in its entry (its `context` has a `clock` member), and nothing written from it to the next sign-in counts. The check runs at start-up as the program (the day-start job and the daily copy wait while the clock is in question), before each day's own work, at every sign-in, and before every invoice and receipt. A clock behind the reference: nobody signs in but the manager, who is shown the clock screen; he corrects the PC's date, or, if the recorded date was the wrong one, says so with his typed reason (CLOCK_WARNING, direction BEHIND; the legal floor of the database still refuses an invoice dated before the last). A clock more than `system.clockJumpDays` days ahead: everyone signs in; the manager is shown the clock screen and confirms the date in one step (CLOCK_WARNING, direction AHEAD); until then no invoice or receipt is issued and the day's own work waits. The one gap left: a date changed by more than that while a session is open is caught inside that session, but the work done after the change counts for the next one.

## 9. The access and change log

`AuditLog` carries the five things Law 18-07 art. 41 bis 3 asks for:

| The law | Column |
|---|---|
| operation | `operation`: COLLECT, CONSULT, CHANGE, DISCLOSE, ERASE (and SECURITY for what is not about a person's data) + `action` |
| reason | `reason`, never empty |
| date | `localDate` |
| time | `localTime` (`occurredAt` keeps the instant) |
| user | `userId`, `userName`, `userRole`; `approvedByUserId` when the manager answered inside someone else's session |

Plus `entity` / `entityId` / `entityLabel`, `subjectKind` / `subjectId` / `subjectLabel` (whose data), `disclosure` and `recipient`, `changes` (field: old, new), `context`, `ownerCode`, and the chain columns.

**One service, Foundation's**, called by every owner inside the same transaction as the change: `logCollect`, `logConsult`, `logChange`, `logDisclose`, `logErase`, `logSecurity`. Nobody else inserts into `AuditLog`.

**Reason.** Routine acts take a standard purpose from the action catalogue. The user must type the reason for: a void or a cancellation; a soft delete; a restore; a correction of typed attendance times; reopening a closed visit; editing a locked file; moving a stage back; claiming a number; a working-time rule override; setting or lifting a sanction; the manager's yes or no; printing a filled worker form; any manager approval.

| Operation | When |
|---|---|
| COLLECT | a row holding personal data is created: `StaffMember`, `StaffConfidential`, `Client`, `Contact`, `Site`, `Resident`, `RepVisit`, a complainant on `Complaint`, `User` |
| CONSULT | always for restricted data: each group of `StaffConfidential`, every restricted upload (the signed form scan, a `StaffDocument` with `isRestricted`, a sick note in `EmployeeLeave.attachmentUrl` or `WorkerAbsence.documentUrl`), the residents list, cost and margin. For a person's file page: once per user, record and day (`logConsultOnce`, which writes nothing when today's entry exists; ruling 29). Lists are not logged |
| CHANGE | every update of the tables above, with old and new values per field; typed times and sign-off; every status change of a file, visit, complaint, pay run; settings; roles and accounts |
| DISCLOSE | every print of a sheet that names a person, every export, every backup |
| ERASE | every soft delete and every removed upload |
| SECURITY | sign-in, failed sign-in, lock, password change, manager approval, chain verification, restore, anchor rebase, clock warning |

**Values that never enter the log.** `changes` names the field and carries `"§"` in place of the old and new value for: every column of `StaffConfidential`; `User.passwordHash` and `User.recoveryHash`; every column of `CostStudy`, and the four settings it is made from (`costing.hourlyLabourCost`, `marginPercent`, `reservePercent`, `adminSharePercent`; F4, audit LOG-7): the log can be opened by roles that may not see cost. The list is one constant in Foundation's log service.

**Reading restricted data** goes through `readRestricted(ex, ctx, { capability, entity, id, part?, reason })`: it checks the capability, writes the CONSULT entry, and only then returns the row (for `StaffConfidential`, only the column group of that capability) or the bytes of a restricted upload. No other code selects from `StaffConfidential`, and the asset protocol does not serve `uploads/restricted/`.

`SanctionDecision.draftPayload` (what was typed before the manager was asked) never carries a column of `StaffConfidential`: People's registration screen strips them before filing the request.

Nothing is purged for ten years: `AuditLog` has no delete path. The screen (Settings › السجل) is read-only, for capability `log.read`.

## 10. Attachments (photos, scans, PDFs)

The file lives under `{appDataDir}/uploads/{entity}/{field}/{uuid}.{ext}` and every file is a row of `Upload` (path, table, column, owner row, name, type, size, SHA-256, who, when), written by Foundation's `saveManagedUpload`.

| Kind | Where |
|---|---|
| One file per row | the row also holds the path in a column ending in `Url`: `StaffMember.photoUrl`, `cvUrl`; `StaffConfidential.signedFormScanUrl`; `StaffDocument.fileUrl`; `Violation.attachmentUrl`; `EmployeeLeave.attachmentUrl`; `File.signedScanUrl`; `FirstVisit.sheetScanUrl`; `Quote.signedScanUrl`; `VisitReport.orderScanUrl`, `signoffScanUrl`; `WorkerAbsence.documentUrl`; `Inspection.sheetScanUrl`; `Payment.proofUrl`; `Expense.receiptUrl`; `EquipmentUnit.photoUrl`; `Purchase.invoiceUrl` |
| A set of photos on one row | **no table of its own**: the `Upload` rows with that `entity`, `field = "photos"` and `ownerId`, carrying `kind`, `caption`, `takenByEmployeeId`, `sortOrder`. Used for `FirstVisit` (Clients), `Visit` and `Inspection` (Operations) |
| Centre logo and letterhead images | settings `centre.logoUrl`, `letterhead.headerUrl`, `letterhead.footerUrl`; his two images are bundled assets and the defaults |

Rules:
- `saveManagedUpload` writes the bytes and the `Upload` row **before** the caller's transaction (it cannot run inside one: it is not a database call); the caller's transaction then calls `linkUpload(ex, url, ownerId)`. A file whose row never arrived has `ownerId` empty and is swept.
- Replacing or removing a file sets `Upload.removedAt` and logs an ERASE; the bytes stay.
- **Restricted files.** `Upload.restrictedCapability` names the capability needed to open the file; the bytes are stored under `uploads/restricted/`, outside the asset-protocol scope, and are read only through `readRestricted`. Set for: the signed worker form (it shows the health answers and the score); `StaffDocument` of type MEDICAL_CERT or CRIMINAL_RECORD; a document attached to a sick or maternity leave or absence.
- Photos at a client's site exist only when `Site.photoConsent` is set and only with `takenByEmployeeId` (article 8); `saveManagedUpload` refuses otherwise.
- Limits as the reference (photo 10 MB, PDF or scan 20 MB; jpg, png, webp, pdf).

## 11. Settings

`Setting (key, value)`, value always JSON text. Read through `getSetting(ex, key)` with the typed default below when the row is absent; written from Settings › عام and قواعد العمل; every change is a CHANGE log entry, except the `system.*` keys the program writes for itself. Amounts are centimes, durations minutes, rates basis points.

**Centre and system (عام)**

| Key | Default | Asked by |
|---|---|---|
| `system.databaseId` | UUID at creation; frozen by trigger | F |
| `system.firstRunDone` | `false` | F |
| `system.utcOffsetMin` | `60` | O, F |
| `system.clockJumpDays` | `3` | F |
| `system.alertsNotified` | `{}`: per alert key, the day and count last announced (one desktop notification per alert and day) | F |
| `system.dayStart` | `{}`: per owner, the last day its day-start handlers completed (F3; `src/lib/daily`) | F |
| `centre.nameAr` | `"مركز إنماء برو"` (A10) | all |
| `centre.nameLatin` | `"UNMAA Pro Center"` | M |
| `centre.legalForm`, `centre.address` | empty | M |
| `centre.phone` | `"06 59 53 81 83"`: Tel and WhatsApp, from his footer (F2) | M |
| `centre.email` | `"unmaapro.center@gmail.com"`, from his footer (F2). His Facebook page «مركز إنماء للخمات» has no key | M |
| `centre.city` | `"أم البواقي"` («حررت: بـ…»; a branch may have its own, `Branch.city`) | P, C |
| `centre.wilayaCode` | `"04"` | F |
| `centre.rc`, `centre.nis`, `centre.nif`, `centre.articleNumber` | empty; required before the first invoice | M |
| `centre.nin` | empty; optional (build notes: "clients deducting VAT need your NIF, NIN and RC") | M |
| `centre.bankName`, `centre.bankAccount`, `centre.ccpNumber`, `centre.ccpKey` | empty | M |
| `centre.cnasEmployerNumber` | empty | P |
| `centre.logoUrl`, `letterhead.headerUrl`, `letterhead.footerUrl` | bundled images | F |
| `app.defaultLocale` | `"ar"` | F |
| `backup.autoEnabled` | `true` | F |
| `backup.targetDir` | empty (asked at first run: a second drive or USB, never a synced folder) | F |
| `backup.keepCount` | `30` (protected copies are not counted and never removed) | F |
| `feature.siteQrOnOrder` | `false` (#26) | C, O |
| `security.idleLockMinutes` | `15`: minutes without input after which the program signs out to the sign-in window, so that the next person's acts are not logged under the last one's name; `0` switches it off (F3b, the coordinator's ruling). Logged as LOCK with cause IDLE | F |

**Work rules (قواعد العمل)**

| Key | Default | Asked by |
|---|---|---|
| `work.days` | `["SAT","SUN","MON","TUE","WED","THU"]` | O |
| `work.restDay` | `"FRI"` | O |
| `work.period.morning` | `{"from":"08:00","to":"12:00"}` | O |
| `work.period.evening` | `{"from":"13:30","to":"16:00"}` | O |
| `work.weekMin` | `2400` (40 h) | O, P |
| `work.overtimeCapMin` | `2880` (48 h) | O, P |
| `work.dayMin` | `480` (8 h; a full day of absence) | O, P |
| `work.daySpanMin` | `720` (12 h) | O |
| `work.night` | `{"from":"21:00","to":"05:00"}` | O |
| `work.travelGapMin` | `30` | O |
| `work.arrivalGraceMin` | `15` | O |
| `office.hours` | `{"from":"07:30","to":"17:00"}` | O |
| `calendar.hours` | `{"from":"06:00","to":"22:00"}` | O |
| `calendar.closedDays` | `[]` (dates; optional) | O |
| `reminder.leadWorkingDays` | `1` | O |
| `reminder.mode` | `"FIRST_AND_CHANGED"` | O |
| `complaint.targetMin` | `120` | O |
| `inspection.threshold` | `80` | O |
| `inspection.defaultFrequency.contract` | `"MONTHLY"` | O |
| `inspection.defaultFrequency.onDemand` | `"NONE"` | O |
| `inspection.missedAfterDays` | `7` | O |
| `corrective.dueDays` | `2` | O |
| `supervisor.maxWorkers` | `15` | O |
| `alerts.contractEndLeadDays` | `30` (A3) | M |
| `alerts.paymentDueLeadDays` | `7` (A3) | M |
| `alerts.maintenanceLeadDays` | `7` | M |
| `alerts.quoteFollowUpDays` | `3` | C |
| `alerts.documentExpiryLeadDays` | `30` (no source) | P |
| `alerts.trialEndLeadDays` | `7` (no source) | P |
| `alerts.staffContractEndLeadDays` | `30` (no source) | P |
| `alerts.backupStaleDays` | `3` (no source) | F |
| `quote.validityDays` | `15` (no source) | C |
| `quote.approvalRule` | `"MANAGER_ALWAYS"` (A9) | C |
| `costing.hourlyLabourCost` | none; margins show "not set" until typed | M, C |
| `costing.marginPercent`, `costing.reservePercent`, `costing.adminSharePercent` | none | C |
| `costing.hoursOverrunPercent` | `1000` (10%) | M |
| `tax.mode` | none; asked at first run (A9, س16) | M |
| `tax.vatRate` | `1900` | M |
| `tax.pricesIncludeVat` | `true`; frozen on each quote, on each file at «متعاقد» and on each invoice | M, C |
| `tax.ifuMention` | `{"ar":"غير خاضع للرسم على القيمة المضافة – نظام الضريبة الجزافية الوحيدة","fr":"Non assujetti à la TVA – régime de l'IFU"}` | M |
| `stamp.enabled` | `true` | M |
| `stamp.mode` | `"WHOLE"` | M |
| `stamp.bands` | `[{"upTo":3000000,"per100":100},{"upTo":10000000,"per100":150},{"upTo":null,"per100":200}]` | M |
| `stamp.exemptBelow` | `30000` (300 DA) | M |
| `stamp.minimum` | `500` (5 DA) | M |
| `stamp.maximum` | none | M |
| `stamp.roundUpToDinar` | `false` | M |
| `invoice.missedVisitRule` | `"BILL_DONE_ONLY"` | M |
| `invoice.missedVisitAmount` | none; required when the rule is `FIXED_AMOUNT` | M |
| `invoice.requireSignOff` | `true` | M |
| `forecast.months` | `3` | M |
| `export.separator` | `";"` | M |
| `export.decimalComma` | `true` | M |
| `numbering.fileSuffix` | `{"BUILDING_CONTRACT":"BLC","HOUSING_REQUEST":"","HOUSING_CONTRACT":"","ORG_REQUEST":"","ORG_CONTRACT":"","COMPLEX_CONTRACT":""}` (A6) | C |
| `numbering.employeeSuffix` | `""` | P |
| `numbering.width` | `{"QUOTE":4,"VISIT":5,"COMPLAINT":4,"INSPECTION":4,"VIOLATION":4,"PAY_RUN":4,"PAYSLIP":4,"PAYOUT":4,"HANDOUT":4,"COUNT":4,"PURCHASE_REQUEST":4,"PURCHASE":4,"EQUIPMENT_UNIT":4}` | F |
| `numbering.startAt` | `{}`: per ordinary SEQUENCE_KEY, the first number to give (to go on from the paper registers) | C, P |
| `numbering.legalSeries` | `""`: a prefix of invoice and receipt numbers, for a second PC of the same company | F |
| `pay.runPeriods` | `["MONTHLY"]`: the period types a pay run may have | P |
| `pay.overtimePremium` | `5000` (+50%, LAW) | P |
| `pay.restDayPremium` | `5000` (no source: the same +50%, to confirm) | P |
| `pay.monthlyDivisorMin` | `10400` (173.33 h) | P |
| `pay.leaveDaysPerMonth` | `2500` (2.5 days, LAW) | P |
| `pay.leaveYearStart` | `"07-01"` (to confirm with his accountant) | P |
| `pay.leaveCapDays` | `30000` (30 days; to confirm) | P |
| `pay.cnasEmployeeRate` | `900` (9%; to confirm) | P |
| `pay.cnasEmployerRate` | `2600` (26%; to confirm) | P |
| `pay.irgTable` | none; shape `{"brackets":[{"upTo":0,"rateBp":0}],"abatementBp":0,"abatementMin":0,"abatementMax":0,"exemptUpTo":0}` (amounts in centimes a month; typed by his accountant; until then IRG is typed per payslip) | P |
| `pay.defaultBasis`, `pay.defaultPeriod` | none, `"MONTHLY"` | P |
| `hiring.trialDays` | `30` | P |
| `evaluation.periodMonths` | `3` | P |
| `evaluation.scaleMax` | `5`; frozen on each evaluation | P |
| `documents.validityMonths` | `{}` (per document type) | P |
| `sanction.blockingStates` | `{"WORKER":["SUSPENDED","PENALISED"],"EMPLOYEE":["SUSPENDED","PENALISED"],"CLIENT":["SUSPENDED","PENALISED"]}` | P, C |
| `sanction.matchAcrossKinds` | `true` | P |

Lists kept as tables, each edited by its owner's own editor mounted in a slot of Foundation's settings pages (`CONTRACTS.md` section 3): zones and communes (`Zone`, `Commune`: F), roles and branches (F), training days and skills (`TrainingModule`, `Skill`: P), inspection criteria (`InspectionCriterion`: O), clause text (`ClauseTemplate`: C).

## 12. Roles and capabilities

A `User` has one `Role`. A role's grants are rows of `RoleGrant`: kind SECTION with a level (READ or WRITE; no row means no access), which is what "role by section" edits, and kind CAPABILITY for what a section level cannot say. `MANAGER` is a system role: it holds everything, needs no rows, and cannot be edited or removed.

**The session.** At sign-in Foundation loads the user, the role and its grants into a session snapshot. `requireSection(ctx, section, level)`, `requireCapability(ctx, key)` and `can(ctx, key)` read that snapshot and never the database, so they are safe inside a transaction (a query on the root connection from inside a transaction would wait for itself for ever). A screen reads it with `useSession()`, `useCan(key)` and `useSectionLevel(section)`. A change of grants takes effect at the next sign-in.

**Sign-in (F3).** Nobody is signed in when the program opens: the sign-in window is drawn instead of the program, so no page exists behind it. It lists the active accounts; a person picks his name and types his password (PBKDF2, `src/lib/auth.ts`). An account with no password yet (the manager on a new installation, an account just made) chooses one there; a password the manager gave (`giveAccountPassword`) must be replaced by its owner the first time it is used (`mustChangePassword`). Only the manager has a recovery code: it is shown once when he chooses his password, replaces a forgotten password, and is spent by doing so (a new one is shown). A wrong password is never an error: it is counted (`failedSignInCount`) and logged (`SIGN_IN_FAILED`, under nobody's name, the account as subject); there is no lockout. «قفل الآن» signs out (`LOCK`, cause USER) and returns to the window, and so does the idle lock after `security.idleLockMinutes` minutes without input (`LOCK`, cause IDLE): a form in progress is lost in both cases, nothing half-saved is kept. The services are in `src/features/core/services/sign-in.ts`; those that run before anybody is signed in run as the program and write their log entry under the account concerned.

**Roles by section on screen (F3).** The bar and the Ctrl+K list leave out a section the role holds no level on, and the route gate answers any other way in with "not open to your account" instead of the page, which is then never mounted. الرئيسية is everybody's: what it shows already follows the reader's role. This replaced the academy's manager password per section.

Roles seeded (list ROLE): `MANAGER`, `HR_OFFICER`, `ADMINISTRATION`, `SUPERVISOR` (the four his worker form names), `RECEPTION_SALES`, `OPERATIONS`, `ACCOUNTANT` (plan feature 23). The worker has no account.

Default section levels (to confirm, س5 is open):

| Role | الرئيسية | الموظفون | عمال النظافة | طلبات الخدمة | المصاريف | المخزون | الإعدادات |
|---|---|---|---|---|---|---|---|
| MANAGER | W | W | W | W | W | W | W |
| HR_OFFICER | R | W | W | R | – | – | – |
| ADMINISTRATION | R | R | R | W | R | R | – |
| SUPERVISOR | R | R | R | W | – | R | – |
| RECEPTION_SALES | R | – | – | W | – | – | – |
| OPERATIONS | R | R | W | W | – | W | – |
| ACCOUNTANT | R | – | R | R | W | W | – |

Capabilities, with who asked and the default holders besides MANAGER:

| Key | What it allows | Asked by | Default holders |
|---|---|---|---|
| `staff.write` | create and edit worker and employee files; decide a worker's leave | P | HR_OFFICER |
| `staff.health.read` | read the health answers and open the files that show them, the signed worker form first (logged); the hiring score alone does not open it (F4, audit LOG-1) | P, LAW | HR_OFFICER |
| `staff.hiringScore.read` | read and write the confidential score (logged) | P, LAW | HR_OFFICER |
| `staff.printFilledForm` | print a filled worker form (discloses health), or save a copy of the signed one, with a typed reason (F4, audit LOG-5) | P | HR_OFFICER |
| `staff.documents.read` | open the restricted scans of staff documents: medical certificate, criminal record (logged; F4, asked by People) | P, LAW | HR_OFFICER |
| `hiring.decide` | record «قرار الإدارة» | P | ADMINISTRATION |
| `attendance.employee.edit` | edit or delete an employee check record or absence | P | HR_OFFICER |
| `pay.read`, `pay.write` | hours, runs, payslips, payouts, advances | P | HR_OFFICER, ACCOUNTANT |
| `sanction.set` | set or lift a sanction on any of the three kinds | P, C | none |
| `sanction.answer` | answer «هل نسمح له أم لا؟» | P | none |
| `cost.read` | see cost, margin and profitability | C, M | none |
| `quote.approve` | approve a quote | C | none |
| `file.editLocked` | edit a file after «متعاقد» | C | none |
| `file.stageBack` | move a file back a stage | C | none |
| `file.delete` | delete a file | C | none |
| `file.setNumber` | type a file's «رقم التسجيل» or a client's «رقم الملف» that already exists on paper | C | none |
| `residents.read` | open the residents list (logged) | C | ADMINISTRATION, SUPERVISOR, OPERATIONS |
| `visit.enterOrder` | type in a returned order | O | ADMINISTRATION, SUPERVISOR, OPERATIONS, RECEPTION_SALES |
| `visit.correctTimes` | correct typed attendance times (reason, logged) | O | SUPERVISOR, OPERATIONS |
| `visit.reopen` | reopen a visit that is منفذة, مؤجلة or ملغاة | O | none |
| `schedule.overrideRule` | pass a working-time rule (`RuleOverride`) | O | none |
| `order.releaseSanctioned` | let an order print for a client who is «متوقف» or «معاقب» when the file's own decision does not cover it | O | none |
| `complaint.settleDiscount` | settle a complaint with a discount | O | none |
| `invoice.issue` | issue invoices | M | ACCOUNTANT |
| `invoice.void` | void an invoice | M | none |
| `payment.record` | record a payment and print its receipt | M | ACCOUNTANT, ADMINISTRATION, RECEPTION_SALES |
| `payment.void` | void a payment or a receipt | M | none |
| `reconciliation.close` | close a collector's day | M | ACCOUNTANT |
| `export.run` | export files for the accountant | M | ACCOUNTANT |
| `stock.manage` | counts, write-offs, purchases, maintenance, cancelling a hand-out or a purchase | M | ACCOUNTANT, OPERATIONS |
| `users.manage` | accounts and roles | F | none |
| `settings.rules` | change قواعد العمل | F | none |
| `log.read` | read the access and change log | F | none |
| `backup.run` | make a backup now | F | ADMINISTRATION |
| `backup.restore` | restore; MANAGER only, never a grant (CHECK on `RoleGrant`) | F, LAW | none |

**The manager's answer (F3, the coordinator's ruling).** The manager answers under his own name, signed in himself: «قفل الآن», his name, his password, and the question is waiting where its owner lists it (People's decisions and the `sanction.pending` tile for «هل نسمح له أم لا؟»). No dialog takes his password inside another user's session, and `requestManagerApproval` is not built. The columns that name who allowed (`RuleOverride.approvedByUserId`, `SanctionDecision.answeredByUserId`, `Visit.orderReleasedByUserId`) hold the user who acted, who must hold the capability; `AuditLog.approvedByUserId` stays empty.

## 13. Alerts: rules, and the indexes their queries need

The registry is Foundation's (`src/lib/alerts`); each rule lives in its owner's folder, in `src/features/<folder>/alerts.ts`, which exports `registerAlerts(register)` and calls `register({ key, section, severity, name, icon, leadSetting?, capability?, route, count(ex, ctx, { days }) })`. `count` answers a number, or `{ count, route }` when the list to open depends on what was found (`stock.low`). The home screen shows a tile for each alert whose count is above zero, to a reader who may open its section and holds its capability; the tile opens `route`. Labels are `Alerts.<name>.Title` and `.Hint` in the owner's messages. "Announced today" is kept in setting `system.alertsNotified`: an alert is announced on the desktop the first time in a day that it concerns something, and again that day only if it comes to concern more (`src/lib/alerts/announce.ts`); the notification is the operating system's, on this PC.

**The day-start job (F3).** `src/features/<folder>/daily.ts` exports `registerDaily(daily)` and calls `daily(name, handler)`; a handler is `(ex, ctx, { today, since })`, with `since` the last day that owner's handlers completed (null the first time). The runner (`src/lib/daily`) runs when the program opens and when the centre's date changes while it is open: each owner's handlers in one transaction, as the program (`ctx.userId` null), in owner order, once per local day (setting `system.dayStart`). An owner whose handlers fail is rolled back alone and tried again within the hour; the others are not held up. It does not run on a database whose anchor has something to ask the manager.

| Key | Owner | Query, in words | Index |
|---|---|---|---|
| `contract.ending` | M | (a) live contracts (stage CONTRACTED, `closedAt` empty) whose `endDate` is within the lead time and that have no successor at stage CONTRACTED (`renewalOfFileId` pointing at them); plus (b) contracts ended by expiry (`endKind` EXPIRED) with `closedAt` empty, no such successor, and `renewalDecision` not WILL_NOT_RENEW: listed in red until renewed or closed with NOT_RENEWED. A «قديم» copy is never a successor | `File (stage, endDate)`, `File (renewalOfFileId)` |
| `payment.dueSoon` | M | dues not cancelled, `paidAmount < amount`, due within the lead time. Whether the file is closed does not matter: a finished job's due stays until paid | partial `PaymentDue_open (dueDate)` |
| `payment.overdue` | M | the same with `dueDate` before today | same |
| `stock.low` | M | active items with `onHandQty <= minLevel` | partial `StockItem_low` |
| `stock.chargesToSettle` | M | hand-out returns with equipment lost or damaged at a cost above 0 and no `StaffDebtEntry` carrying the return yet: charges «للتسوية» waiting for the manager's decision (section `stock`, warning; added after Money's final review) | `HandOutReturn (handOutLineId)`, `StaffDebtEntry (handOutReturnId)` |
| `maintenance.due` | M | units in service with `nextMaintenanceDate` within the lead time or passed, or condition NEEDS_MAINTENANCE | `EquipmentUnit (nextMaintenanceDate)`, `(condition)` |
| `receipts.unreconciled` | M | receipts with no payment pointing at them and no VOIDED or MISSING event, whose batch date is before today | `Receipt (batchId)`, `Payment_receipt`, `LegalEvent (receiptId)`, `ReceiptBatch (date)` |
| `quote.followUp` | C | quotes ISSUED with result PENDING or NO_ANSWER, or POSTPONED with `postponedUntil` passed; where today is at least `alerts.quoteFollowUpDays` after the later of `issuedDate` and the last follow-up's `date`; and no follow-up has a `nextFollowUpDate` in the future. SUPERSEDED and CANCELLED versions never appear | `Quote (status, result)`, `QuoteFollowUp (quoteId, date)` |
| `document.expiry` | P | current documents (`isCurrent`) with `expiryDate` within the lead time or passed | `StaffDocument (expiryDate)`, `StaffDocument_current` |
| `trial.ending` | P | latest decision is ACCEPTED_ON_TRIAL with `trialEndDate` within the lead time | `HiringDecision (trialEndDate)`, `(staffId, decisionDate)` |
| `staffContract.ending` | P | `contractEndDate` within the lead time | `StaffMember (contractEndDate)` |
| `sanction.pending` | P | decisions with status PENDING | `SanctionDecision (status, requestedAt)` |
| `violation.open` | P | violations with status OPEN (handed over, not decided) | `Violation (status)` |
| `visit.noArrival` | O | today's visits, CONFIRMED or AWAITING_CONFIRMATION, past start plus grace, no arrival typed | `Visit (visitDate, status)`, `VisitWorker (visitId)` |
| `calls.tomorrow` | O | visits of the next working day that the file's `reminderMode` (else setting `reminder.mode`) says to announce: ALL every visit; FIRST_AND_CHANGED the file's first visit, any on-demand visit, and any visit whose `planChangedAt` is later than `clientInformedAt`; NONE none; and that have no REMINDER call yet | `Visit (visitDate, status)`, `VisitCall (visitId, purpose)` |
| `orders.notReturned` | O | visits before today still open, or DONE with no complete report | `Visit (visitDate, status)`, `VisitReport (entryState)` |
| `seats.open` | O | future visits AWAITING_CONFIRMATION | `Visit (status)`, `VisitWorker (visitId)` |
| `contract.noVisits` | O | live contracts with no visit | `File (division, serviceType, stage)`, `Visit (fileId, visitDate)` |
| `complaint.late` | O | complaints not answered with `dueAt` passed or near | `Complaint (status, dueAt)` |
| `corrective.overdue` | O | open tasks past `dueDate` | `CorrectiveTask (status, dueDate)` |
| `inspection.due` | O | PLANNED inspections due or missed | `Inspection (status, plannedDate)` |
| `backup.stale` | F | no successful backup for `alerts.backupStaleDays` days | `BackupRun (startedAt)` |

Visits cancelled with reason PROGRAMME_CHANGED are left out of every rule and count.

## 14. What cascades and what is restricted on delete

The default is `RESTRICT`. No foreign key is `SET NULL`. `CASCADE` exists in three places only, where the parent can still legitimately be hard-deleted:

| Child | Parent | Why it is safe |
|---|---|---|
| `RoleGrant` | `Role` | a role that is removed takes its grants (the system role cannot be removed) |
| `PayslipItem`, `PayslipSeat` | `Payslip` | a payslip can be deleted only while its run is DRAFT (trigger) |

Everything else is `RESTRICT`, including the lines of quotes, inspections and purchase requests, the day's ticks of a training session, and every part of a file: a `File` is never hard-deleted (its first stage event is written with it and is append-only), so nothing can cascade from it.

Two pairs of rows point at each other and are filled in two steps (insert the first with the key empty, insert the second, then set the key): `ProblemReport.correctiveTaskId` with `CorrectiveTask.problemReportId`, and `Complaint.correctiveTaskId` with `CorrectiveTask.complaintId`. They are Operations' own tables and are kept as its builder asked. The similar pair on `Violation` was removed (the sanction and the debt line point back at the violation).

## 15. CHECK constraints and partial indexes

All are `/// @check`, `/// @uniqueWhere` and `/// @index` lines in the schema. In words:

- Codes other owners' SQL relies on: the division on `Site`, `File`, `Invoice`, `Payment`; `File.serviceType`, `File.stage`; the seven `Visit.status`; `StaffMember.kind`; `Sanction.state`; `AuditLog.operation`; `LegalEvent.type`; `RoleGrant.kind` and `access`.
- Exactly one of: `Sanction` (staff or client, matching `subjectKind`), `FileAssignment` (worker or team), `SupervisorAssignment` (zone or worker), `LegalEvent` (invoice, payment or receipt). At least one of: `FileService` (code or label). At most one source on `StockMovement`.
- Pairs that must agree: `File` at CONTRACT_ENDED has `endedDate`; an ABSENT seat has its absence; a LEAVE absence has its leave type and days; a JOB hand-out has its file; an `Expense` source has its key; a collector of kind OFFICE has no staff row (four tables); a cash payment has its receipt and its words, and only cash carries stamp duty.
- Sums: `Payment.totalReceived = amount + stampDuty`; the five checks on `Invoice` totals (TTC = HT + VAT; net = TTC + stamp; IFU shows no VAT and carries its mention; stamp only on cash; gross less discount equals the price basis); `StaffDebtEntry.amount > 0`.
- One at a time (partial unique indexes): one default branch; one live pay run per kind, period and branch; one current document per person and type; one live worker per national number; one coordinator per site; one renewal per file; one accepted quote per file; one visit per slot and programme date; one active seat per worker and visit; one planned inspection per file and period; one live due per visit, per period, per single job; one payment per receipt; one void per invoice and per payment; one end per receipt; one reversal per allocation, movement and debt line; one closing per collector, day and branch; one payroll expense per payout, category and division.
- **Not** a constraint: "buildings and complexes are contract only" (scope A1) and "a pay run is monthly". Both are assumptions the client may lift, and removing a CHECK in SQLite means rebuilding the table. They are validator rules.

## 16. How the model serves the "functions over a Kysely executor" rule

- **One shape for every exported function: `(ex, ctx, input)`.** `ex` is the caller's executor. `ctx = { userId | null, roleId, staffMemberId | null, branchId, today, nowTime, now, toInstant, toLocal }` (as built: also `userName`, `sections`, `capabilities` and `touchedChains`; `src/lib/service/context.ts`) comes from Foundation: the session and the clock. `userId` is null for the day-start job and for event handlers that run for the program itself. A test builds a `ctx` by hand.
- Nothing reads ambient state inside a transaction: `getSetting(ex, key)` takes the executor; capabilities are checked against `ctx`; uploads are written before the transaction and linked inside it.
- Every rule that must hold is in the database or in such a function. Nothing needs Tauri: the hash is Web Crypto, the anchor is an interface, uploads are an interface.
- Cross-owner effects are function calls inside the caller's transaction, through Foundation's event registry (`CONTRACTS.md` section 4), so a test can take a file from «جديد» to a paid invoice on one SQLite file.
- The test harness applies the generated migration to a temporary `node:sqlite` file with the two pragmas of section 5.

## 17. Table-by-table notes, where the choice was not obvious

**Foundation**
- `RoleGrant` replaces `RoleSectionAccess` and `RoleCapability`: a section level and a capability are both "what this role may do".
- `User.staffMemberId` (not a user key on the staff row): the account is Foundation's and exists before any employee. People links them through `linkAccountToStaff`.
- `Commune` replaces `ZoneCommune` and the bundled national list (coordinator's ruling). `Zone` is retired, not deleted.
- "Announced today" is a setting, not a table. `SequenceGap` and `BackupRun` exist for the restore story of section 8.
- `Upload` also holds the photo sets (section 10).
- No `ManagerApproval`, `Notification`, `Session` or `OptionLabel` table.

**People**
- `StaffMember` is one table for both kinds (coordinator's ruling). Other owners keep their column names: `workerId`, `...EmployeeId`, `staffId`.
- `StaffConfidential` replaces `StaffHealth` and `HiringEvaluation`: both were one-to-one, both restricted to the same two roles, and the scan of the signed form shows both. Each column group keeps its own capability.
- `StaffEvent` is the history that the current columns of `StaffMember` cannot give: status (so "active on that date" is answerable after a readmission) and pay terms (so a past period costs what it cost).
- `StaffMember.skillCodes` replaces the `StaffSkill` table: a set nobody joins on in SQL, like `abilities`.
- `Sanction` has two real foreign keys (`staffId`, `clientId`); the state of a person is derived, never stored on `StaffMember` or `Client`.
- Leave. Workers: `WorkerAbsence` (Operations'). Employees: `EmployeeLeave`. A leave crossing a month end is cut into one row per month (`splitGroupId`), so each payslip reads whole rows. The payslip of an employee reads leave from `EmployeeLeave` and absences from `EmployeeAbsence`; approving a leave writes no absence row.
- Pay. A run is monthly unless `pay.runPeriods` says otherwise. A Saturday-to-Friday week is paid in the run that holds its Friday. Operations returns minutes per seat and day and the designated rest date of each week; **People** computes the excess over 40 hours and the rest-day minutes. `PayslipSeat` records which seats a payslip paid, so a seat is paid once and a late order is paid as arrears by the next run. Pay records are frozen by triggers, not chained.
- `Payslip.paidAmount` and `paidDate` are written only by the payout service, from the WAGE payouts linked to the payslip.

**Clients and contracts**
- `FileDescription` is one table for the three form families (it was three): the six labels they share are six columns, the rest are empty for the other families.
- `File` carries his whole «الدراسة المالية», both variants; "required before «متعاقد»" is a service check, so drafts save.
- `File.copiedFromFileId` («قديم») and `File.renewalOfFileId` (renewal) replace the draft's one `previousFileId`, which meant both and made a one-off job opened with «قديم» look like a renewal.
- **The four endings.** (1) A contract reaches `endDate`: the day-start job sets CONTRACT_ENDED, `endedDate = endDate`, `endKind` RENEWED when a successor is already «متعاقد», else EXPIRED, and leaves `closedAt` empty for Money's list. (2) Early ending: `endContract` with its kind and date. (3) An on-demand job whose last visit is done and has no open redo visit or complaint: `closeFile(JOB_DONE)` sets CONTRACT_ENDED, `endedDate`, `endKind` JOB_DONE and `closedAt`. (4) A refused quote or an abandoned request: `closeFile` sets `closedAt` and the reason and leaves the stage (A5). `renewFile` ends nothing: it creates the successor and the old contract runs to its end date.
- `File.partySnapshot` freezes at «متعاقد» what the sheet prints from `Client` and `Site`, so a signed contract never reprints under a name that did not sign it.
- `File.clauses`, `CostStudy.lines` and `FirstVisit.spaces` are JSON (they were the tables `FileClause`, `CostLine`, `FirstVisitSpace`).
- The accepted quote of a file is found through the unique index, not through a pointer on `File` (which would make a cycle).

**Operations**
- `FileProgramme` is Operations' one row per file: the two switches the coordinator left per file, the "form changed" mark, and the inspection plan (it was `FileWorkProfile` and `InspectionPlan`).
- `SupervisorAssignment` is one table for "supervises this zone" and "supervises this worker" (it was two).
- `Visit.slotDate` is the generation key and never moves; `visitDate` is where the visit really is.
- `Visit.billable` is system-set (DONE and not a REDO or INITIAL visit); the office's decision is Money's `VisitBilling` (coordinator's ruling).
- `VisitWorker.role` uses People's WORKER_ROLE codes. `FileAssignment.role` is a different list (seat in the standing team).
- No replacement table: a replacement is a new `VisitWorker` seat with `replacesVisitWorkerId`.
- History rules (replacement ranking "has worked this site before", inspection escalation) read by `File.siteId`, not `fileId`: a renewal is a new file on the same site.

**Money and stock**
- `LegalEvent` is one table for what happens to an invoice, a payment or a receipt after it was written (it was three event tables). "Used" is not an event: the payment that points at the receipt says it.
- `Invoice` has no `status` column and never holds a draft (coordinator's ruling).
- `PaymentDue.paidAmount` and `StockItem.onHandQty` are the two cached totals, each kept by a trigger on an insert-only ledger and guarded against any other write.
- Expenses are money out. A payout to staff posts its expense on the day it is paid (`Expense.staffPayoutId`); closing a pay run posts nothing (`RULINGS-NEEDED.md`, item 1).
- Stock documents follow their ledger: `HandOutLine`, `HandOutReturn` and `PurchaseLine` are insert-only; a wrong hand-out or purchase is cancelled (reversal movements) and typed again.
- `EquipmentUnit.locationSiteId` holds «تخزين معدات»: the site outlives the file, which a renewal replaces.
- `HandOut.fileId`, `division` and `serviceType` are empty for a worker's standing kit.

## 18. Builders' names that changed

| Builder's name | Here | Reason |
|---|---|---|
| P `regSeq`, `regSuffix`, `regNumber`; C `regSeq`, `regSuffix`, `registrationNumber`, `dossierSeq`, `dossierNumber`; P `StaffPayout.receiptNumber`; M `EquipmentUnit.codeSeq`, `code`; M `Invoice.number`, `year`, `displayNumber` | `numberSeq`, `numberSuffix`, `number` (and `numberYear`) on every numbered table | one name per idea |
| P `StaffMember.weeklyCapacityHours` | `weeklyCapacityMin` | minutes |
| P `StaffMember.workTime` | `workTimeKind` | `...Time` is a clock time |
| P `birthCommune`, `birthWilaya` | `birthPlace` (text), `birthWilayaCode` (optional) | coordinator's ruling |
| P `residenceCommune`, `residenceWilaya`; C `commune`, `wilaya` | `residenceCommuneId`; `communeId` (the wilaya comes from the commune row) | coordinator's ruling |
| P `photo`, `cv`, `file`, `attachment` | `photoUrl`, `cvUrl`, `fileUrl`, `attachmentUrl` | upload naming |
| P `signedFormScan` | `StaffConfidential.signedFormScanUrl` | it shows restricted data |
| P `regulationsScan` | `StaffDocument` rows of type REGULATIONS_ACK (`fileUrl`, `version`, `issueDate`) | a second signature no longer erases the first |
| P `StaffHealth`, `HiringEvaluation` | `StaffConfidential` (`note` became `evaluationNote`) | merged |
| P `StaffSkill` | `StaffMember.skillCodes` | merged |
| P `StaffMember.userId` | `User.staffMemberId` | coordinator's decision |
| P `HiringEvaluation.evaluatedAt` (date) | `evaluatedDate` | `...At` is an instant |
| P `HiringInterview.scheduledAt` | `scheduledDate`, `scheduledTime` | a date is never an instant |
| P `interviewerId`, `trainerId`, `reportedById`, `evaluatorId` | `...EmployeeId` | one naming for employee keys |
| P `Violation.sourceId`, `sanctionId`, `debtEntryId` | `complaintId` / `inspectionId` / `visitId` / `problemReportId`; the links from `Sanction.violationId` and `StaffDebtEntry.violationId` | real foreign keys; no cycle |
| P `Sanction.subjectId`, `nationalId` | `staffId` / `clientId`; `nationalIdNumber` | real foreign keys; one name |
| P `Leave` | `EmployeeLeave`; workers' leave is `WorkerAbsence` | coordinator's ruling |
| P `EmployeeAbsence.absenceHours`, `startTime` / `endTime` (datetime), `leaveId` | `absenceMin`, `@time` strings, `employeeLeaveId` | minutes, times |
| P `HoursAdjustment.hours`, `userId` | `adjustMin`, `createdByUserId` | minutes |
| P `PayRun.periodType` WEEK / MONTH | WEEKLY / MONTHLY | one list |
| P `Payslip.normalHours`, `overtimeHours`, `absenceHours`, `lateMinutes`, `paidAt`, `regNumber` | `normalMin`, `overtimeMin`, `absenceMin`, `lateMin`, `paidDate`, `staffNumber` | minutes; a date; a snapshot |
| P `PayslipItem.order`, `TrainingModule.order` | `sortOrder` | SQL keyword |
| P JOB_POSITION `SALES_RECEPTION`, `OPERATIONS_OFFICER` | `RECEPTION_SALES`, `OPERATIONS` | same codes as the login roles |
| C `Client.sanctionState`, `sanctionReason`, `sanctionSince`, `sanctionSetBy` | People's `Sanction` | one owner |
| C `Inspection`, `InspectionSpace`, photos | `FirstVisit`, `FirstVisit.spaces` (JSON), `Upload` rows | name taken by #17; merged |
| C `CostLine`, `FileClause` | `CostStudy.lines`, `File.clauses` (JSON) | merged |
| C the description block | `FileDescription` | one table |
| C `Site.active`, `keyReceivedAt`; `Resident.registeredAt`, `leftAt` | `isActive`, `keyReceivedDate`; `registeredDate`, `leftDate` | naming; dates |
| C `File.previousFileId` | `copiedFromFileId`, `renewalOfFileId` | two meanings |
| C `File.sanctionOverrideRef`, `endedAt`, `signedScan` | `sanctionDecisionId`, `endedDate`, `signedScanUrl` | a real key; a date |
| C `RepVisit.fileId` | `File.sourceRepVisitId` only | one direction |
| C `FileStageEvent.from`, `to`, `at`, `userId` | `fromStage`, `toStage`, `changedAt`, `changedByUserId` | SQL keywords |
| C `hoursPerVisit`, `weeklyHours`, `monthlyHours`, `travelMinutes` | `perVisitMin`, `weeklyMin`, `monthlyMin`, `travelMin` | minutes |
| C `position` | `sortOrder` | one name |
| C, P, O `notes` | `note` | one name |
| O every `...Min` clock time (`startMin`, `plannedStartMin`, `arrivedMin`, `workStartMin`, `workEndMin`, `leftMin`, `doneAtMin`) | `startTime`, `plannedStartTime`, `arrivedTime`, `workStartTime`, `workEndTime`, `leftTime`, `doneAtTime` | coordinator's `HH:MM` |
| O `FileWorkProfile` (14 fields), `InspectionPlan` | 12 fields on `Site`; `FileProgramme` (`rotateRestDay`, `reminderMode`, `formChangedAt`, `inspection...`) | coordinator's ruling; merged |
| O `Inspection.planId` | `planPeriod` (the plan is the file's `FileProgramme`) | merged |
| O `SupervisorZone`, `SupervisorWorker` | `SupervisorAssignment` | merged |
| O `VisitPhoto` | `Upload` rows | merged |
| O `FileSlot.periodId`, `Visit.periodId` | dropped | a renewal is a new file |
| O `VisitReport.returnedAt`; `ProblemReport.occurredAt` | `returnedDate`; `occurredDate`, `occurredTime` | dates |
| O `WorkerAbsence.absenceHours`, `isCancelled` | `absenceMin`, `status` | minutes; one status |
| O `RuleOverride.value` | `valueMin`, `ruleDate` | checkable |
| O `VisitWorker.role` WORKER / SENIOR / LEADER | CLEANER / SENIOR_WORKER / TEAM_LEADER | People's codes |
| O `Visit.transportMode` code OWN | WORKER_OWN | one list with Clients |
| O catalogue codes `ORG.D.01` | `ORG_D_01` | upper snake |
| M every lower-case code | upper snake; `homes` .. `complexes` are HOUSING .. COMPLEX | coordinator's decision |
| M `Invoice.status` | none: a draft is `InvoiceDraft`, a void is a `LegalEvent` | coordinator's ruling |
| M `InvoiceEvent`, `PaymentEvent`, `ReceiptEvent` (`userId`, `at`, `voidReason`) | `LegalEvent` (`createdByUserId`, `createdAt`, `reason`) | merged |
| M the `used` event's `payerName`, `amount`, `stampDuty`, `total`, `fileId`, `paymentId` | the `Payment` row that points at the receipt | one copy |
| M the `used` event's `amountWordsAr`, `amountWordsFr`, `reason` | `Payment.amountWordsAr`, `amountWordsFr`, `receiptReason` | moved with it |
| M `PaymentAllocation.reversalOf` | `reversesAllocationId` | as `reversesMovementId`, `reversesEntryId` |
| M `InvoiceVisit.hours` | `workedMin` | minutes |
| M `collectorId`, `enteredBy`, `issuedBy`, `handedBy`, `receivedBy`, `closedBy`, `countedBy`, `requestedBy` | `collectorStaffId`, and `...ByUserId` | naming |
| M `Expense.sourceId`, `spentBy` | `purchaseId` / `maintenanceRecordId` / `staffPayoutId` (+ `payRunId`); `spentByEmployeeId` + `spentByName` | real foreign keys |
| M `StockMovement.returnId`, `Purchase.requestId` | `handOutReturnId`, `purchaseRequestId` | naming |
| M `StockItem.category` (text) | a code of STOCK_CATEGORY | it is a filter |
| M `costsInsideTotal`, `materialsBy`, `materialsCost`, `transportBy`, `transportCost`, `paymentPeriodicity` | Clients' `expensesIncluded`, `materialsBearer`, `materialsAmount`, `transportBearer`, `transportAmount`, `paymentFrequency` | the file is Clients' |

## 19. Changed while building it (Foundation, F2)

The model was built as designed. Where building it showed a fault, this is what changed, and why.

| What | Before | Now | Why |
|---|---|---|---|
| `ChainHead_step` (prisma/triggers.sql) | a head moved by one, with a 64-character hash | also only onto the row its table has just received (the `chain_advance` trigger runs after that insert) | an allowed `UPDATE "ChainHead" SET "lastSeq" = "lastSeq" + 1` from the webview was accepted: a head moved by hand hides a missing row until the next verification. The model's proof still passes all 157 cases; the tape was rewritten |
| `Invoice.contentDigest` (section 8) | over "the line or visit row" without six columns | over the columns of the row's hash version without the same six (`hashV` stays) | a column added later to `InvoiceLine` would have broken the digest of every older invoice; and a digest computed in memory (no `hashV` yet) did not equal the one recomputed from the stored row. |
| Wilayas | `01`..`58` | `01`..`69` | ruling 6 |
| The academy's section lock | none | none | the shell's lock (one manager password, a list of locked bar sections kept in a setting of its own) stayed while sign-in did not exist (F2). F3 removed both: who may open a section follows from the role of whoever signed in |
| Function shapes (sections 6 and 8) | `nextNumber(ex, key, …)`, `appendChained(ex, table, row)` | `(ex, ctx, …)` | the counters write `updatedAt`, `claimNumber` checks a capability and logs, `appendChained` records the chains it touched for the anchor: all need `ctx` |
| First run (BUILD-NOTES section 5) | the first `AuditLog` entry in step 8 | the first entry right after the chain heads, then the manager account (logged as a COLLECT of a USER) | the account is personal data and its creation must be logged: the log has to exist before it |
| Manager approval (section 12) | a dialog taking the manager's password inside another user's session, `requestManagerApproval` | not built: the manager signs in himself and answers under his own name | the coordinator's ruling for F3 |
| Alert registration (section 13) | `registerAlert({ key, owner, labels, tone, count, rows, route, leadSetting })` | `registerAlerts(register)` exported from the owner's `alerts.ts`; `section`, `severity`, `name`, `icon`, `capability`; no `rows` | the list is its owner's screen, opened by `route`: the registry never needs the rows. A folder's file is found by its name, so no owner edits a shared list |
| Day start (CONTRACTS section 3) | `onDayStart(handler)` | `registerDaily(daily)` exported from the owner's `daily.ts`; one transaction per owner; `since` given to the handler | the coordinator's brief for F3; `since` lets a handler catch up after days the program stayed closed |
| Setting `security.idleLockMinutes` (section 11) | none | `15` | the coordinator's ruling (F3b): an account left open puts the next person's acts under the wrong name |
| Backup rotation (section 8) | by `BackupRun.isProtected` and `backup.keepCount` | by file name in the folder: only `inmaa-auto-YYYY-MM-DD.db` is ever removed | a row cannot say that its file is gone, and the folder may hold copies from before a restore; the protected copy has another name and is never a candidate |
| The restore's memory (section 8) | a `BackupRun` row written at the restore | a note beside the database, read at the next start | the restored database is the copy: what was written before the restore is not in it |
| Owner seeds (BUILD-NOTES) | rows each owner's seed would insert, with no way in | a registry (`src/lib/seeds`): each owner's `seeds.ts` steps run by first run and again by the day-start job | the coordinator's brief: a real installation must start with the training modules, inspection criteria and stock items, and an older database must catch up |
| An account's name | `User.displayName` | the linked employee's name, surname first, or the display name (written surname first) | the Checker's audit: the sign-in window, the log and a receipt named people first name first |
| `Inspection.correctionNeeded` | none | `Boolean?`: the supervisor's own tick «هل يحتاج العمل إلى تصحيح؟ ☐ نعم ☐ لا», kept apart from the computed `belowThreshold`; null when neither box is ticked | the coordinator's addition: Operations prints and types it |
| `centre.phone`, `centre.email` defaults | empty | his footer's number and address | the coordinator's addition; as `centre.nameAr` and `centre.city` come from his letterhead, they are defaults in code, not rows |
| Communes of أم البواقي (BUILD-NOTES section 5) | 29 names from memory, ids `commune-04-NN` in no particular order | checked on 2026-10-12 (census 2008 and the wilaya's Wikipedia pages); «الرحية» is «الراحية»; ids `commune-0401` … `commune-0429` carry the official codes | the coordinator's check (F2b). `Commune` has no column for the code |
| Shared option lists | each owner's own copy | one module, `src/lib/options`: the codes, his words, the labels in three languages (`Options.<List>`), each division's service subset in print order | F2b; `npm run db:docs` checks them against OPTION-CODES.md |
| Stored file addresses (section 10) | `/api/uploads/<admin>/<entity>/<field>/<file>` in the academy shell | `/uploads/<Table>/<column>/<file>`, and `/uploads/restricted/<Table>/<column>/<file>`; the asset protocol denies `uploads/restricted/**` | as section 10 describes; the shell is moved to it |
| The clock's reference (section 8) | the newest `AuditLog` entry | the work recorded since the manager's latest word on the date, without the comings and goings, the present session, or a session opened on a clock out of order; checked at start-up, sign-in and each day's start too | audit INV-1: a sign-in, written at the PC's own date, made every date look ordinary |
| The signed worker form's scan | opened with `staff.health.read` or `staff.hiringScore.read` | `staff.health.read` only; a copy saved outside also needs `staff.printFilledForm` and a typed reason | audit LOG-1 and LOG-5, the coordinator's rulings: its pages show the health answers |
| A copy of a stored file (`saveUploadCopy`) | a CONSULT for a restricted file, nothing for the others | a DISCLOSE (EXPORT) to the place chosen, for every file but the program's own pictures, before the copy (`recordUploadCopy`) | audit LOG-5: every export is a disclosure |
| The centre's costs (`costing.hourlyLabourCost`, `marginPercent`, `reservePercent`, `adminSharePercent`) | in the Settings read and in the log's `changes` | read apart with `cost.read` (a CONSULT each time), changed with `cost.read`, withheld in `changes` (§) | audit LOG-7, the coordinator's ruling |
| The manager's place (section 12) | any holder of `users.manage` could give the MANAGER role | only the manager gives or changes the MANAGER role, switches a manager's account, or gives or takes away a capability no role holds by default; nobody changes his own role or raises his own role's rights | audit ACC-5, the coordinator's ruling |
| `numbering.legalSeries` (section 6) | changeable at any time | a short code (up to four capital letters or digits), frozen for a year once an invoice or receipt is numbered in it | audit INV-5, the coordinator's ruling |
| Printing | the window's Ctrl+P and context menu printed any screen | Ctrl+P presses the screen's `PrintButton` or does nothing; the window's menu does not open | audit LOG-2, the coordinator's ruling |
| ANCHOR_REBASE | the typed reason in `context` only | in `reason`, and the act needs one | audit LOG-4 |
| The picker's «إضافة بلدية» | `ensureCommune` with no check | `addCommune`: `settings.rules` or WRITE on REQUESTS, WORKERS or EMPLOYEES | audit ACC-4 |
| `Payment.fileNumber`, `Payment.clientName` | none | @snap, written with the payment | audit INV-X2 (Money): a reprinted receipt names the client as issued |
| `SanctionDecisionMatch` | one `SanctionDecision.sanctionId` | a row per sanction the request matched (append-only); `sanctionId` stays the first | the coordinator's ruling: one yes covers every active sanction matched |
| `staff.documents.read` | none (People stored those scans under `staff.health.read`) | default HR_OFFICER | People's round 4 |
| `ProblemReport.deletedAt`, `deletedByUserId` | none | soft delete | audit LOG-14 (Operations): a re-typed order takes a report away |
| `staff.unavailable` payload | workerId, dates, cause | and `reason`, the typed reason of the act that caused it | audit LOG-X1: Operations' ERASE entries need it |
| Branches on screen (feature 47) | the `Branch` table and `User.branchId`, on no screen | a card in Settings › عام (add, rename, switch off; the manager's; the main branch first and never off; off only with no active account), an account's branch on the accounts tab (`ctx.branchId`), `<BranchPicker allowAll>` for lists and reports | the Checker's audit, F-47 |
| Writing the anchor (section 8) | after any chained commit, before a backup, at close, whatever the start-up found | only while the database agrees with it; `writeAnchor` refuses a database in question unless first run or the manager's answer (`accept`) | final review FND-01: one sign-in made an older copy pass as normal and its lost numbers were given again |
| The clock's lookups (section 8) | the manager's latest word and the present sign-in by their date | by their place in the log (`chainSeq`) | final review FND-02, FND-03: an entry written at a wrong future date won |
| The restore (section 8) | any file copied over the open database | checked to be this program's database, staged, swapped by renaming after the connection is closed, undone on failure | final review FND-04 |
| After Money's final review | — | `MaintenanceRecord.cancelledAt`, `cancelledByUserId`, `cancelReason` (a record with no cost is cancelled too); alert `stock.chargesToSettle`; `InventoryCountLine.systemQty` is the record when the line was typed; index `StaffDebtEntry (handOutReturnId)` | Money's final-review fixes |
| The opening gap (RULINGS 4, BUILD-NOTES section 5 step 7) | promised, written by nothing | Settings › قواعد العمل, beside the numbering: the last invoice and the last receipt issued on paper this year, each declared once per key and year by the manager with a typed reason (NUMBER_CLAIM in the log); one `SequenceGap` of kind OPENING (1 to n) and the counter moved after it, its date floor at the paper document's date; refused once a number of that key exists that year (`src/features/core/services/paper-numbers.ts`) | the coordinator, preparing the client's questionnaire |
| His two service lists (the developer, 2026-10-22) | code: `PROVIDED_SERVICES_OF` / `PROGRAMMED_SERVICES_OF` in `src/lib/options`, and each form definition's own copy of its options | rows the manager edits in Settings › الخدمات: `CatalogueService` (one per service of a list: code, three names, `isActive`) and `CatalogueServiceDivision` (its place on each division's forms), class C; migration `0003_service_catalogue.sql`, the first forward migration, seeds the 48 of his forms. A form's service row says where its columns and blank lines are (`ServiceRowSpec`) and is filled by `resolveDefinition`, keeping the codes a file already ticks. `FileService` is unchanged; its `sortOrder` follows the lists at each save without counting as a change of the sheet | he must add, rename, remove and reorder services without a new version of the program, and an installed copy keeps its data |
| Migrations (BUILD-NOTES section 5) | 0001 and 0002 written by `npm run db:types` | 0001 and 0002 frozen (`FROZEN_MIGRATIONS`, checked by sha256 in db:verify), 0003 frozen with 1.0.0; later migrations generated from `LATER_MIGRATIONS` until they ship | the first installer has left the developer's machine: sqlx refuses a database whose applied migration changed |
| `StaffMember.trialEndDate`, `fixedTermReason` (the developer, 2026-10-30) | none | `trialEndDate` (`@date`, null: no trial period, Law 90-11 art. 18 to 20) and `fixedTermReason` (free text: why a fixed-term contract, art. 12 and 12 bis), both nullable, People's; migration `0004_staff_trial_and_fixed_term.sql` adds them with `ALTER TABLE … ADD COLUMN`, so in the database they stand last in `StaffMember`, whatever their place in the schema | the employee hiring sheet (`docs/employee-hiring-sheet.md`, section 5) prints both; an installed copy keeps its rows, which read null |
| Later migrations that add columns | a later migration only created tables (`LATER_MIGRATIONS` `{ file, models }`) | also `columns: [{ model, names }]`: `modelsOfInit` leaves those columns out (0001 as it shipped), `buildAddColumns` writes one `ALTER TABLE … ADD COLUMN` a column with the same type, default and format check a `CREATE TABLE` gives it, and db:verify expects them after the table's first columns (`columnsInTableOrder`). A column that is a key, unique, required without a default, or named by an index, check, relation or a `frozenWithRun … except` trigger is refused by the generator: it needs a migration written by hand | migration 0004 |

No option code was renamed or removed. PROVIDED_SERVICE and PROGRAMMED_SERVICE stopped being code on 2026-10-22: the manager's rows hold them, his codes kept as seeded and the new ones coded `ADDED_<n>`. Two were added after the model was handed out: `RECEIPTS` in EXPORT_KIND (F4, Money's receipts journal) and `CANCELLED` in END_KIND (a signed contract the client cancels before its start; Clients' fix CLI-3).

