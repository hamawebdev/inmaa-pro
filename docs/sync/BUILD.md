# Two-laptop sync: the build brief

For the sync team. Read `docs/sync/DECISION.md` first: it is the decision, and every outcome there is binding. This file says who builds what, the contracts between you, and how the work is checked. Branch: `sync-two-laptops`. The coordinator commits; nobody else runs a git command that writes.

`CLAUDE.md` still describes the codebase and its conventions (services over `(ex, ctx, input)`, `action`, the log, the three languages, the academy's look, logical classes, `<Ltr>`, no native pickers, never `npm install`). Its six-teammate table does not apply to this work: the table below replaces it. Its rule 1 (offline) is replaced by DECISION section 9. `npm install` stays forbidden in this folder; a Rust crate may be fetched by cargo (the network is available to us, not to the program).

## 1. The team and its files

| Teammate | Job | Owns |
|---|---|---|
| **database** | Migration 0005 and everything that makes it: the sync tables, `AuditLog.chain` with hash version 2, the per-chain log trigger, capture triggers on every shared table, `LOST_DEVICE`; the generator's support for triggers in a later migration; db:verify; the Rust upgrade tests; the data-model documents | `prisma/**`, `scripts/db/**`, `scripts/generate-db-types.mjs`, `scripts/verify-db.mjs`, `src/lib/db/**` (generated), `src-tauri/migrations/**`, `src/testing/table-shapes.ts`, `src/testing/fixtures/1.0.0/**` (a database made by the 1.0.0 migrations, with data), `docs/data-model/**` |
| **relay** | The mailbox Worker and its tests; the client's relay API and its in-memory twin; the encryption, the pairing code, the key ring | `relay/**`, `src/lib/sync/crypto/**`, `src/lib/sync/relay/**`, `src/testing/sync/memory-relay.ts`, the `include` lines that bring `relay/` into `tsconfig*.json` and `vitest.config.*` |
| **native** | Everything in Rust and the program's frame: the licence removed (keeping the anchor's secret and folders), the HTTP command limited to the mailbox, the sync vault, the snapshot and file-part commands, the joining install; the offline checks updated; the harness stubs | `src-tauri/**` (except `migrations/`), `lock.html` (deleted), `src/lock/**` (deleted), `vite.config.ts`, `eslint.config.js`, `package.json` scripts, `src/lib/offline.test.ts`, `src/lib/bindings.ts` (generated: only native runs `cargo test --lib`), `scripts/harness/**` |
| **engine** | Capture stamping, the hybrid clock, the outbox, envelopes' content, sending and receiving, the merge, held changes and conflicts, file bytes, the full copy, joining, catching up after a restore, the sync loop and its status, the services the screens call; the two-copy test harness | `src/lib/sync/**` (except `crypto/` and `relay/`), `src/server/sync*.ts`, `src/lib/service/runner.ts`, `src/lib/service/context.ts`, `src/testing/sync/**` (except `memory-relay.ts`), `src/testing/database.ts` |
| **ledger** | Numbers, books and chains: number blocks and their claims; the books, their hand-over and their enforcement; the per-laptop log chain in `appendChained`, `verifyChains` and the anchor; the clock check on the laptop's own chain; the day-start jobs on the books' holder only; ids derived from what they are for settings, zones and communes | `src/lib/numbering/**`, `src/lib/chain/**`, `src/lib/clock/**`, `src/lib/log/**`, `src/lib/daily/**`, `src/lib/settings/**`, `src/features/core/services/places.ts`, `src/features/core/services/paper-numbers.ts`, `src/lib/sync/books/**`, `src/lib/sync/blocks/**`; and the one-line `requireBooks` calls in Money's and People's services (list them in your report) |
| **program** | What the office sees: the licence's screens and texts removed; Settings › المزامنة; the status on the bar; the alert tile; «الانضمام إلى مركز موجود» on the first screen; the assistant's account in the pairing flow; the session reloaded when access changes; every text in Arabic, French and English | `src/features/sync/**` (new: messages, code labels, quick actions), `src/pages/dashboard/settings/**`, `src/components/**`, `src/hooks/**`, `src/navigation/**`, `src/features/core/**` except the two services ledger owns, `src/lib/access/**`, `src/lib/alerts/**`, `src/i18n/**`, `src/main.tsx`, `src/routes.tsx`, `src/index.css`, `src/lib/license*.ts` (deleted) |
| **coordinator** | This brief, `CLAUDE.md`, `docs/scope.md`, `docs/sync/DECISION.md`; commits; the final gates | |

A file not listed: ask the coordinator. Need a change in someone else's file: message its owner with the exact change (`SendMessage`), copy the coordinator, and carry on. Several teammates work in this folder at once: judge your work by your own files, type-check and read only your errors, lint and test your own paths, stop what you start, delete nothing you did not create.

## 2. The contracts

Change a contract only by agreement with every teammate it names, and tell the coordinator.

### 2.1 Tables (database builds; names are fixed)

Local, never captured (each laptop's own; reset when a laptop joins from a full copy):

| Table | Columns | Notes |
|---|---|---|
| `SyncSession` | `id` ('session'), `capturing` 0/1, `applying` 0/1, `txId` text null, `hlc` text null | one row, seeded by the migration; `capturing` 0 until sync is set up |
| `SyncOutbox` | `seq` integer primary key, `txId`, `hlc`, `tbl`, `rowId`, `op` ('I','U','D'), `data` JSON | written only by the capture triggers |
| `SyncCell` | `tbl`, `rowId`, `col`, `hlc` (primary key the first three) | the stamp of each field's last change; written by the capture trigger on a local update and by the engine on an applied one |
| `SyncState` | `key` primary key, `value` JSON | this laptop's identity, cursors, clock, status (engine's keys) |
| `SyncHeld` | `id`, `originDeviceId`, `txSeq`, `hlc`, `change` JSON, `reason`, `firstAt`, `lastTriedAt`, `tries`, `resolvedAt`, `resolution` | changes the database refused |
| `SyncConflict` | `id` (derived: table, row, field and both stamps), `tbl`, `rowId`, `col`, `keptValue`, `keptHlc`, `otherValue`, `otherHlc`, `otherDeviceId`, `detectedAt`, `resolvedAt`, `resolution` | |

Shared, captured like business tables:

| Table | Columns | Writer |
|---|---|---|
| `SyncDevice` | `id`, `name`, `slot` (0 or 1), `joinedAt`, `removedAt`, `removedReason`, `replacesDeviceId`, `createdAt`, `updatedAt` | engine |
| `SyncBooks` | `id` ('books'), `holderDeviceId`, `epoch`, `handedAt`, `requestedByDeviceId`, `requestedAt`, `lastInvoiceNumber`, `lastReceiptNumber`, `forced` 0/1, `reason`, `updatedAt` | ledger |
| `NumberBlock` | `id` (`<key>-<year>-<blockIndex>-<deviceId>`), `key`, `year`, `blockIndex`, `size`, `deviceId`, `kind` (START, CLAIM, FALLBACK), `answer` (null, ACCEPTED, REFUSED), `answeredAt`, `used`, `createdAt`, `updatedAt` | ledger (the owner writes `used`; the other laptop writes `answer`) |

Changed: `AuditLog.chain` text, null for the 1.0.0 chain, `AuditLog:<deviceId>` after set-up; hash version 2 covers it. `SequenceGap.kind` gains `LOST_DEVICE`. `ChainHead` may hold `AuditLog:<deviceId>` rows, created at lastSeq 0 with that chain's genesis hash.

Not captured: `Sequence`, `ChainHead`, `BackupRun`, the six local sync tables, `_license`, `_sqlx_migrations`; `Setting` rows whose key starts with `system.` or `backup.`; the fields `PaymentDue.paidAmount`, `StockItem.onHandQty` (on update), `User.failedSignInCount`, `User.lastSignInAt`.

### 2.2 Capture (database writes the triggers; engine stamps)

- Every shared table has AFTER INSERT, AFTER UPDATE and AFTER DELETE triggers (insert only on append-only and chained tables) that run when `SyncSession.capturing = 1 AND applying = 0`, and refuse with `RAISE(ABORT, 'SYNC_UNSTAMPED')` when `txId` is null then. So a write path that forgets to stamp fails loudly in tests instead of corrupting the order.
- `data`: for I, `{col: value, …}` with every column; for U, `{col: [newValue, replacedHlc], …}` with the changed columns only (`IS NOT`), `replacedHlc` read from `SyncCell` (null when the field never changed since its insert); for D, the whole old row. Values exactly as SQLite stores them (text, integer, null).
- On U the trigger also upserts `SyncCell` for each changed column with `SyncSession.hlc`.
- Engine's `stampTransaction(ex, ctx)` (in `src/lib/sync/session.ts`) runs first in every write transaction and sets `txId` and `hlc`; `unstampTransaction(ex)` clears `txId` as its last statement. Called by `runner.transact`, the day-start runner, first run and every other path that writes (grep for `transaction()`). Cheap when sync is not set up (a cached flag).
- The hybrid clock: `HLC = <ms, 13 digits>.<counter, 4 digits>.<deviceId>`, compared as text. Its milliseconds are the clock's `now` plus the mailbox offset; never below the last stamp issued or received.

### 2.3 Envelopes (engine builds the payload; relay seals and carries it)

- Payload (engine): `{ v: 1, origin: deviceId, txs: [{ seq, txId, hlc, changes: [{ t, id, op, data }] }], applied: { <deviceId>: <last txSeq applied> } }`, gzipped (`CompressionStream`), cut so the sealed envelope stays under 1.5 MB (a single transaction larger than that is split across parts that are applied together).
- Seal (relay): `sealEnvelope(keyRing, header, bytes)` / `openEnvelope(keyRing, header, bytes)`, AES-256-GCM, a fresh 96-bit nonce, the key from HKDF-SHA-256 over the centre key, the header (`centreId`, `deviceId`, `seq`, `keyId`, `kind`) as additional data. Same for file parts (`kind: "file"`, `blobId`, `part`).
- File ids: `blobId = hex(HMAC-SHA-256(fileKey, sha256 of the plain bytes))`, so the mailbox never sees a file's hash.
- Web Crypto only (`globalThis.crypto.subtle`), so the same code runs in the window and under Node in tests.

### 2.4 The relay API (relay builds both sides)

`src/lib/sync/relay/client.ts` exports `RelayClient` (one interface) with `createRelayClient(transport, credentials)`; the transport is `tauriTransport` in the program (calls native's `sync_request`) and `memoryTransport(worker)` in tests (calls the Worker's own `fetch` handler in process, on Durable Object storage backed by `node:sqlite`). Methods, all on `/v1/`: `time`, `createCentre(setupKey, deviceName)`, `createTicket(ticketId, sealed, ttlSec)`, `redeemTicket(ticketId, deviceName)`, `putEnvelope({ seq, keyId, kind, body })` (idempotent: the same seq with the same bytes is accepted again; different bytes are a conflict), `listEnvelopes({ after, limit })` (every laptop's, ordered by the mailbox's own sequence), `ack(upTo)`, `putPart` / `getPart` (1 MB parts), `devices`, `removeDevice(id)`, `rotateKey` (announced as an envelope), `usage`. Every answer carries the mailbox's time. Typed failures: `RelayOffline`, `RelayLimit` (with `retryAt`), `RelayRevoked`, `RelayFull`, `RelayConflict`, `RelayRefused`. Bodies are binary, never base64 JSON (the 10 ms CPU limit).

### 2.5 Native commands (native builds; engine calls them from `src/server/sync*.ts`)

- `sync_request(method, path, body: bytes) -> { status, headers, body }`: HTTPS to the origin saved in the vault, path must start with `/v1/`, nothing else reachable, a 30 s timeout. `sync_set_origin(origin)` (https only, no path) is the only way to choose the address.
- The vault, outside the database and the backups (application config folder): `sync_vault_read`, `sync_vault_write(json)`, `sync_vault_clear`. Holds the origin, centre id, device id, token, key ring, slot.
- `db_snapshot(path)` (`VACUUM INTO` a file in the program's temp folder), `file_read_part(path, offset, len)`, `file_write_part(path, offset, bytes)`, `file_commit(tmpPath, finalPath, sha256)` (checks, then renames), all inside the program's own folders.
- `sync_install_copy(path)`: installs a received full copy as `restore_from` installs a backup (checks, staging, swap, relaunch), without the checks that tie a copy to this machine's previous database, and writes a note the next start reads.

### 2.6 Ledger's functions (engine and the screens call them)

`src/lib/sync/books/index.ts`: `booksState(ex)`, `requireBooks(ex, ctx)` (throws the ServiceError «The books are on the other laptop.» style sentence), `requestBooks`, `answerBooksRequest(ex, ctx)` (run by the loop after applying), `takeBooksFromLostLaptop(ex, ctx, { deviceId, lastInvoice, lastReceipt, reason })`, `initBooks(ex, ctx, deviceId)`.
`src/lib/sync/blocks/index.ts`: `startBlocks(ex, ctx, deviceId)` (from the current counters, at set-up), `answerBlockClaims(ex, ctx)` (after applying), `topUpBlockClaims(ex, ctx)` (by the loop), and `nextNumbers` / `claimNumber` in `src/lib/numbering` switch to blocks when sync is set up.
`src/lib/chain`: `startOwnLogChain(ex, ctx, deviceId)`, `ensureChainHead(ex, chain)` (genesis for a chain first met), `verifyChains` over every chain.
`src/lib/daily`: owners' handlers skipped on a laptop that does not hold the books (Foundation's own steps, the backup and the alerts still run).

### 2.7 Engine's services (the screens call them; engine owns them)

In `src/lib/sync/services/`: `syncStatus` (the state the bar and the page show: role, last exchange, waiting count, the other laptop's last time, clock difference, books holder, held and conflict counts, the problem and what to do), `setUpSync(setupKey, origin)`, `addSecondLaptop({ accountId | newAccount })` → the pairing code, `joinCentre(origin, code)` (from the first screen, before sign-in), `removeLaptop({ deviceId, reason, lastInvoice?, lastReceipt? })`, `listConflicts`, `resolveConflict`, `retryHeld`, `resolveHeld`, `syncNow`. Each is `(ex, ctx, input)` with its `action` wrapper, and checks capability `sync.manage` (the manager's own; no role holds it by default) except `syncStatus` and `syncNow`.

## 3. Order of work

1. Everyone: read DECISION, this brief and the code you own; send your questions on contracts to the teammate concerned within your first hour.
2. In parallel: database (migration 0005 first: everyone depends on it), relay, native (licence first), ledger, program (licence screens first, then the sync screens against the services' types).
3. Engine starts at once on the hybrid clock, the payload and the two-copy harness, and switches to the real tables as soon as database has 0005 in the test database.
4. A verifier joins when the two-copy harness syncs: one scenario test per case of DECISION section 7, plus "no invoice number twice", "the chains verify on both copies", "a 1.0.0 database upgrades and syncs", "the program opens with no licence step", "the director changes the assistant's access and it applies on her laptop".

## 4. Done

- Two copies on separate databases change both sides and end with the same data (a test compares every shared table, row by row, after sync).
- Every case of DECISION section 7 has a test with the defined outcome, without the real service.
- No invoice or receipt number is issued twice; the chains verify on both copies.
- A 1.0.0 database upgrades and syncs (TypeScript test on the fixture, and `cargo test --lib` upgrading it in place).
- The program opens with no licence step.
- The director changes the assistant's access and it applies on her laptop.
- `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test`, `npm run db:verify`, `cargo test --lib --offline` all pass.

## 5. Report

End each task with a message to the coordinator: what you built, what you ran and its result (pasted briefly), what is not done, what you need from whom. Say plainly what does not work. Then wait for the next message: the coordinator may send fixes.
