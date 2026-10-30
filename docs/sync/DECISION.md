# Two laptops, one centre: the sync decision

Status: decided 2026-10-31, before any code. Written for the developer. The build brief for the team is `docs/sync/BUILD.md`; how the office uses it day to day is section 10 here.

The director's laptop and the assistant's laptop each keep the whole program and the whole database. Each works alone, with or without internet. When either has internet, it sends its changes, encrypted, to a small mailbox on Cloudflare's free plan and takes the other laptop's changes from it. The mailbox stores sealed envelopes it cannot open.

## 1. What was chosen, and what was rejected

**Chosen: a Cloudflare Worker with one SQLite-backed Durable Object per centre, used as an encrypted mailbox.** The Worker's code is in this repository (`relay/`); the developer deploys it to his own Cloudflare account. Free plan figures, checked on 2026-10-31 (Cloudflare's limits pages):

| Limit (free plan) | Figure | Our use |
|---|---|---|
| Worker requests | 100,000 a day, reset 00:00 UTC | about 12,000 a day for two laptops polling every 15 s while the program is open |
| Durable Object requests | 100,000 a day | the same count |
| Durable Object storage | 5 GB per account; a value or row up to 2 MB | envelopes are cut below 1.5 MB; photos and scans are sent in 1 MB parts |
| Rows written | 100,000 a day | one row per envelope or part |
| CPU per request | 10 ms | the Worker never decrypts or parses data: it stores and returns bytes |
| Card | not needed for Workers and Durable Objects (no official page says either way; R2 needs one) | no R2, no KV |

When a limit is reached, Cloudflare refuses requests until 00:00 UTC (01:00 in Algeria). Both laptops keep working and send what waited the next day (section 7, case 6).

**Rejected:**

| Option | Why not |
|---|---|
| Direct laptop to laptop (Tailscale, Syncthing, Cloudflare Tunnel) | both must be on at the same moment; the brief says either may be off for weeks. Tailscale's free plan is non-commercial |
| Cloudflare D1 | works, but 500 MB per database is tight for years of scans, and it gives no single-writer guarantee per centre without extra care. Durable Objects serialise each centre's requests by construction |
| Cloudflare R2, KV | R2 needs a payment method; KV allows 1,000 writes a day |
| Supabase free | pauses a project after a week without activity |
| Firebase Spark | file storage and functions need the paid plan; 1 MiB documents |
| Turso (libSQL) | its server reads the plain database; offline writes are in beta with no conflict resolution |
| Google Drive or Dropbox as a mailbox | needs a browser sign-in and a published OAuth app; tokens expire after months unused |
| Deno Deploy, Vercel, Netlify, Fly.io, Oracle | shut down, non-commercial, credit-based, no free tier, or a card required |
| cr-sqlite, the SQLite session extension, ElectricSQL, PowerSync | cr-sqlite is unmaintained and merges around our triggers; the session extension is not compiled into the SQLite we ship; Electric and PowerSync need a server that reads the data |

**Method: our own change log, captured by SQLite triggers, merged field by field.** Every write to a shared table is copied by a trigger into a local outbox, in the same transaction, with a hybrid logical clock stamp (section 4). Changes travel as whole transactions and are applied as whole transactions. Business rules stay in the database: the other laptop's changes go through the same triggers and checks as local ones.

## 2. Keeping the data private

- **One key per centre.** When sync is set up on the director's laptop, the program makes a random 256-bit key. Every envelope and every file part is compressed, then encrypted with AES-256-GCM under a key derived from it (HKDF-SHA-256). The envelope's header (centre, laptop, sequence, key id) is bound into the encryption, so the mailbox cannot alter, swap or replay an envelope unnoticed. The mailbox holds ciphertext, sizes and times. It never holds the key.
- **The key never touches the mailbox in clear, and is not in the database.** It is kept by the program in its own file in the operating system's application folder, beside the anchor, outside the database and outside every backup (a backup taken to a USB key holds no way into the mailbox).
- **Only two laptops.** The mailbox accepts a laptop only with a device token it issued at pairing; it accepts at most two active laptops per centre; a removed laptop's token is refused. Creating a centre on the mailbox needs a setup key the developer chooses and sets as a Worker secret, so nobody else can use his free allowance.
- **Pairing in the same room.** On the director's laptop, «إضافة الحاسوب الثاني» shows a 20-character code (100 random bits, in groups of four, Crockford base32: no letters that read like digits) valid for 30 minutes and once only. The assistant's laptop, freshly installed, offers «الانضمام إلى مركز موجود» on its first screen; she types the mailbox address and the code. Both sides derive from the code a wrapping key and a ticket name; the director's laptop has left the centre key, sealed under the wrapping key, at that ticket. The mailbox sees the ticket name and the sealed bytes, never the code: guessing 100 bits is out of reach, and the ticket dies after one use or 30 minutes. No password-authenticated key exchange library is needed (the maintained ones are unaudited), because the code itself is long enough.
- **A lost laptop.** Removing it (section 7, case 9) revokes its token on the mailbox and replaces the centre key; envelopes after that are sealed under the new key, which the lost laptop never had.
- What stays out of reach of this design: someone who holds the lost laptop itself holds the database file on its disk. The program's passwords protect the program, not the file. We recommend BitLocker on both laptops (Windows' own disk encryption).

## 3. What is shared and what stays on each laptop

Shared: every business table, the accounts, roles and grants, the log, and the stored files (photos, scans, PDFs), with their bytes.

Stays on each laptop:
- the counters (`Sequence`) and chain heads (`ChainHead`): each laptop derives them from the rows it holds, so its own triggers keep checking every insert;
- `BackupRun`, and the settings `system.*` (except the database id, which both share because the second laptop starts as a copy) and `backup.*` (each laptop has its own backup folder);
- `User.failedSignInCount` and `User.lastSignInAt`;
- the sync tables themselves: outbox, cell clocks, cursors, held changes, conflicts (section 5).

The two cached totals (`PaymentDue.paidAmount`, `StockItem.onHandQty`) are never sent as changes: each laptop's triggers recompute them from the ledger rows that are sent.

Three things that today would create the same thing twice on two laptops get ids derived from what they are, so both laptops make the same row: a setting (`setting-<key>`), a zone made for a commune (`zone-<communeId>`), a commune added by name (`commune-<wilaya>-<hash of its name key>`). Two identical inserts merge into one.

## 4. Conflicts: how two edits of the same record are merged

**The clock.** Each change carries a hybrid logical clock stamp: milliseconds, a counter, and the laptop's id. The milliseconds come from the PC's clock corrected by its measured difference to the mailbox's clock (every answer from the mailbox carries the mailbox's time), so a PC set a day wrong does not win every conflict. The stamp also never goes below a stamp already received, so a change made after seeing another always sorts after it.

**The rule, field by field.** Each field of each row remembers the stamp of its last change (`SyncCell`). A change says, per field, the new value and the stamp it replaced.
- Fields changed on one laptop only: applied. The director corrects a client's phone, the assistant his address: both stay.
- The same field changed on both while apart: the later stamp wins on both laptops, and the other value is kept in the conflict list with who typed it and when. Nothing is lost: «استعمال هذه القيمة» puts it back in one click, as a new change both laptops take.
- Equal values: no conflict.
- A record deleted on one laptop and changed on the other: the delete stands where the database allows it; the changes are kept in the conflict list.

**When the database refuses a change from the other laptop.** Every change goes through the same triggers, checks, unique indexes and foreign keys as a local one. Some combinations are only possible when two laptops worked apart: the same worker registered on both (one live worker per national number), two accepted quotes for one file, a payslip edited on one laptop while its run was closed on the other. Then:
- the refused change is **held** on that laptop with its full content and the database's reason, and the laptop goes on applying what does not depend on it; held changes are tried again at every sync (a later change may unblock them);
- the office sees it in «تعارضات المزامنة» in plain words, with the record, both versions and what to do: try again after fixing the cause, keep this laptop's version (sent to the other laptop as a new change), or set aside the newer record where its table allows a soft delete;
- the same refusal happens symmetrically on the other laptop, so the office may resolve it on either; the resolution is an ordinary change and both laptops converge.

**Line numbers inside a document** (`PaymentDue (fileId, seq)`, `PurchaseLine`, `QuoteLine` and the like). When both laptops add a line to the same document while apart, the laptop that added the later line moves it to the next free number; the other laptop shows it there provisionally until that move arrives. The person's debt ledger (`StaffDebtEntry`, a running balance) is written only on the laptop that holds the books (section 5).

**The day-start jobs** (ending contracts past their date, planning inspections ahead, ending sanctions and training) run only on the laptop that holds the books, so they never run twice. The other laptop receives their results. Seeds are idempotent with fixed ids and merge.

**Events between owners** are not run again on the receiving laptop: it receives every row the handlers wrote on the first laptop.

## 5. Numbers and chains across two laptops

### Invoices, receipts and payments: one laptop holds the books

One laptop at a time **holds the books** («الدفاتر عند هذا الحاسوب»). Only it may write the seven legal chains (`Invoice`, `InvoiceLine`, `InvoiceVisit`, `Receipt`, `Payment`, `PaymentAllocation`, `LegalEvent`), the legal gaps (`SequenceGap`), the person's debt ledger (`StaffDebtEntry`), close a cash day (`CashReconciliation`), and run the day-start jobs. `appendChained` and these services refuse on the other laptop with a sentence that says where the books are.

- So invoice and receipt numbers stay **one unbroken sequence per year**, and the seven legal chains stay **single chains**, exactly as in 1.0.0. The existing triggers (counter plus one, date floor, chain head plus one, lines only under the newest invoice) keep checking every row on both laptops.
- **Moving the books.** The other laptop asks («طلب الدفاتر»); the holding laptop, at its next sync, writes the hand-over (holder, a new epoch, its last invoice and receipt numbers and dates) after everything it issued. The asking laptop takes the books when it has applied that hand-over, so it has every invoice before it. With both laptops online this takes under a minute; nobody needs to be at the other laptop.
- **First holder:** the director's laptop when sync is set up.
- **Taking the books from a laptop that is lost or broken** is the manager's act alone, with a typed reason: she declares the last invoice and receipt numbers seen on paper; the numbers between the last one this laptop holds and the declared one are covered by a `SequenceGap` of a new kind, `LOST_DEVICE`, so no number is ever issued twice. The removed laptop's token is revoked at once. If the lost laptop comes back and had issued after that point, its documents cannot join the chain: they are kept whole in the conflict list as a legal incident for the director, and the program shows it as danger.

### The other numbers: blocks agreed between the laptops

Worker and employee registration numbers, client and file numbers, quotes, mission orders (visits), complaints, inspections, violations, pay runs, payslips, payouts, hand-outs, counts, purchase requests, purchases and equipment units are not legal sequences. They must still never be given twice.

- Each key and year is cut into blocks of 10 numbers (50 for visits, which come by the year). A laptop numbers only inside a block that is its own.
- **While the laptops are in touch**, a laptop asks for the next free block ahead of time; the other laptop answers at its next sync (accepted, or refused when it already uses that block). Blocks are handed out in order, so numbers stay close to the order of time and few are skipped: at any moment at most the rest of each laptop's current block and one spare.
- **While apart**, a laptop that has used up its agreed blocks takes a block from its own half: the director's laptop the even blocks, the assistant's the odd blocks, always above every block it knows of. The other laptop refuses any later request for a block already used that way. The two halves never overlap, so no number is given twice, whatever happens.
- Numbers are **never changed after they are given**. The cost: a number can come out of time order between the two laptops, and the rest of an abandoned block stays unused.
- At set-up, every counter's current value is kept as the director's laptop's starting block, so its next number is the one it would have given anyway.
- A number typed from paper (`claimNumber`) is accepted below the numbers given before sync was set up, or inside this laptop's own block; otherwise it is refused with a sentence.
- Before sync is set up, numbering is exactly as in 1.0.0.

### The log's chain: one chain per laptop

The access and change log is written on both laptops all day (a sign-in, a read of restricted data). It cannot be one chain with two writers. So `AuditLog` gains a column `chain`: rows written before sync keep the 1.0.0 chain; from sync set-up, each laptop writes its own chain (`AuditLog:<laptop id>`), with its own genesis (`GENESIS\n<database id>\nAuditLog:<laptop id>`), under hash version 2 (version 1 rows stay verifiable as they are). Each laptop receives the other's rows unchanged and checks them with the same trigger and the same `verifyChains`. **The chains verify on both laptops after every sync**, and a test proves it.

The clock check (`src/lib/clock/sanity.ts`) reads only this laptop's own chain: a laptop is never judged by the other laptop's clock.

The anchor outside the database keeps every chain's head, both laptops' log chains included. A database that received the other laptop's rows is "ahead", which is normal.

## 6. Applying a sync, step by step

1. **Capture.** Every write transaction starts by stamping the transaction (`SyncSession`: transaction id, stamp). Triggers on every shared table copy each insert, change (changed fields only, with the stamps they replace) and delete into `SyncOutbox`. Changes applied from the other laptop are not copied back.
2. **Send.** The sync loop packs whole transactions, in order, into envelopes (compressed, encrypted, under 1.5 MB), numbered per laptop. A stored file's bytes go in parts beside them. The mailbox stores an envelope once; sending it again after a cut is harmless.
3. **Receive.** The loop fetches envelopes after its cursor, checks each one's seal and sequence (a gap waits for the missing envelope), and applies each transaction in **one database transaction** together with the cursor: a power cut leaves either the whole transaction applied or none of it.
4. **Merge** as in section 4; refused changes are held; conflicts are listed.
5. **Refresh.** Screens are refreshed; if the signed-in account's role or grants changed, the session is reloaded at once (section 7, case 10).
6. **Acknowledge.** Each laptop tells the mailbox how far it has applied. The mailbox deletes an envelope when both active laptops have applied it and a full copy (section 7) covers it, and not before 90 days.

**Full copy.** The program can put a full encrypted copy of the database and its files on the mailbox (a snapshot made with SQLite's `VACUUM INTO`). It is used to start the second laptop, to replace a lost one, and to catch up a laptop that fell behind what the mailbox still keeps. The laptop holding the books refreshes it weekly.

How often: when the program is open and online, every 15 seconds after recent activity and every 60 seconds when quiet; at once after a save; never more than the free plan allows.

## 7. Every case, and its defined outcome

Each row has a test that runs without the real service: two copies of the program on two separate databases, talking through the real mailbox code running in memory.

| # | Case | Outcome |
|---|---|---|
| 1 | Both laptops change the same record while apart | Different fields: both kept. Same field: the later stamp wins on both, the other value kept in the conflict list, one click to use it. Same values: nothing to show. Both laptops end with the same data |
| 2 | A laptop stays off for weeks | The mailbox keeps everything it has not applied. When it comes back, it sends its own changes first, then applies the other's in order; if it fell behind what the mailbox keeps, it takes the full copy and then its own unsent changes are applied on top. Its books, blocks and stamps continue |
| 3 | The two clocks disagree | Merge order follows the corrected stamps, not the PC's date; each laptop's clock check reads its own log only; a laptop more than 2 minutes from the mailbox's time shows «ساعة هذا الحاسوب غير مضبوطة» with the difference. Invoice dates keep their floor on both |
| 4 | A sync is cut halfway (power, network, program closed) | An envelope is applied whole with its cursor, or not at all; sending again is harmless; a file is written only when all its parts arrived and its SHA-256 matches; a full copy is installed only after it is complete and checked |
| 5 | The internet is down | Each laptop works alone; the bar shows «غير متصل» and how many changes wait; they go when the internet returns |
| 6 | The free service is down or its daily limit is reached | The same as case 5, and the screen says which («الخدمة بلغت حدها اليومي، يُستأنف بعد 01:00»); requests back off; nothing is lost. A full mailbox (5 GB) is shown as danger with what to do |
| 7 | One laptop restores a backup | After the restore, before anyone works on it, the laptop takes back from the mailbox what it had sent after that backup (its own changes) and everything from the other laptop, then goes on. Its log chain, its invoices and its blocks continue as they were, so no number is given twice. Without internet it waits on a screen that says so; the manager may instead take this laptop out of sync |
| 8 | A laptop restores a backup from before sync was set up | It is no longer in sync: it offers to join again from the full copy |
| 9 | A laptop is lost or replaced | The manager removes it on the other laptop with a typed reason: its token is revoked, the key replaced, its blocks retired; if it held the books she takes them, declaring the last numbers on paper (`LOST_DEVICE` gap). A replacement joins with a new code and a full copy, under a new laptop id and a new log chain |
| 10 | An account or its access changes while the other laptop is offline | It takes effect on that laptop as soon as the change arrives: a signed-in session is reloaded at once (a section closed to her leaves her screen); a switched-off account is signed out. What she did before the change arrived is kept: it was allowed when done, and the log records the role she held then |
| 11 | Both laptops ask for the books at once, or the holder is offline | Only the holder can hand over; the asker waits and the screen says where the books are and since when |
| 12 | Both register the same thing while apart (same national number, two accepted quotes for one file) | Held on both laptops with a plain explanation; the office resolves once, on either laptop; both converge |

## 8. The installed database upgrades in place

Migration `0005` adds the sync tables, the `AuditLog.chain` column (hash version 2), the capture triggers, the per-laptop log chain in the chained trigger, and the `LOST_DEVICE` gap kind. Nothing existing is rewritten: old log rows keep version 1 and their chain. Until sync is set up, capture is off and the program behaves as 1.0.0. A test opens a database made by the 1.0.0 migrations with data in it, upgrades it, sets up sync and syncs it with a second copy.

## 9. What else changes

- **The offline rule is lifted for sync only.** The program may reach one address: the mailbox the director typed at set-up, over HTTPS, under `/v1/`. The request is made by the program's own Rust side; the window still cannot connect anywhere (its content security policy is unchanged), and every other rule stays: no updater, no links that open a browser, no remote fonts or scripts. `src/lib/offline.test.ts` now allows exactly one HTTP library and checks that it is used in one file, and only toward the configured address.
- **The licence is removed entirely**: no trial, no unlock code, no lock window, no licence card. The anchor keeps its secret and its folders, so installed copies keep their anchor and open normally.
- **Roles.** The seven roles stay. The director is the manager account. If the centre has no account for the assistant, setting up the second laptop asks the director to create it (name, user name, role, a first password she replaces at first sign-in). The director changes the assistant's role and rights in Settings › المستخدمون والصلاحيات as today; nobody changes their own access, and only the manager touches the manager's role.

## 10. Day to day

**The director**
- Once: in Settings › المزامنة, types the mailbox address and setup key the developer gives her, then «إضافة الحاسوب الثاني», creates or picks the assistant's account, and reads the code to the assistant.
- Daily: nothing. The bar shows «متزامن» with the time of the last exchange. If it shows «يحتاج تدخلًا», she opens Settings › المزامنة and follows what it says.
- She decides the assistant's access in Settings › المستخدمون والصلاحيات; the change reaches the assistant's laptop at its next sync.
- If a laptop is lost: Settings › المزامنة › «إزالة حاسوب».

**The assistant**
- Once: installs the program, chooses «الانضمام إلى مركز موجود», types the address and the code, signs in with the account the director made, and chooses her password.
- Daily: works as usual. To issue an invoice or record a payment when the books are on the director's laptop, she presses «طلب الدفاتر»; they move within a minute while the director's laptop is on and online.

**Both**: keep the laptops' date and time right, and keep backing up as today (each laptop to its own folder).

## 11. What the developer must create

A free Cloudflare account, the Worker deployed from `relay/` (`relay/README.md` gives every command), and a setup key set as a Worker secret. He gives the director the Worker's address and the setup key; neither is written in this repository. Everything else is built and tested without the account.
