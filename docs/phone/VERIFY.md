# The director's phone: how it was checked

For the developer. What `docs/phone/BUILD.md` section 4 calls "done", item by item: how each was checked here, the result, and where the evidence is. The last section says what could not be checked on this machine.

Evidence outside the repository lives in `/mnt/data/inmaa-phone-verify/` (pictures, logs, the exported baseline tree); it is not committed.

> **Status of this file:** complete as of 2026-11-02. Every item of `docs/phone/BUILD.md` section 4 was run here; section 6 says what only the developer can check.

## 1. The desktop is unchanged at desktop sizes

**How.** Before any UI file changed, the committed tree (3bd730a) was exported with `git archive HEAD` to `/mnt/data/inmaa-phone-verify/baseline-tree`, with its own copy of `node_modules`, its own harness (the harness has since gained `--phone` in the working tree; the baseline used the committed one) and its own demo database. `scripts/e2e/desktop-compare.mjs shoot` shot from it the sign-in window, the 29 tabs of the seven sections and 37 detail and print pages (a file hub and its parts, a client, a worker, a suspended worker, an employee, a pay run, a payslip, a visit, an inspection, a complaint, a new invoice, an invoice's sheet, a receipt's sheet, the new forms of the stock pages…), in Arabic, light and dark, at 1440×900 and 1024×640: **268 pictures**, in `/mnt/data/inmaa-phone-verify/baseline-shots/`, 0 views with problems (no console error, no foreign request).

Each view runs on its own fixed clock (09:00 on the demo's Monday plus three minutes per view, the same in both runs), so times on screen do not differ between the two runs because one ran slower.

**The comparison** (at the end, from the working tree, with the working tree's harness):

```sh
node scripts/e2e/desktop-compare.mjs shoot --out .harness/desktop-compare/after
node scripts/e2e/desktop-compare.mjs compare --before /mnt/data/inmaa-phone-verify/baseline-shots \
  --after .harness/desktop-compare/after --diff .harness/desktop-compare/diff
```

Pixel-exact; every differing picture gets a red-on-grey diff image and its bounding box.

**Result** (2026-11-02, working tree at 4ee0b49, after shell, sync and screens committed): **no layout change at desktop sizes.** 226 of 268 pictures are identical to the pixel; 42 differ by 1 to 472 pixels, none by a visible amount. To tell rendering noise from change, the baseline tree was shot a second time (`/mnt/data/inmaa-phone-verify/baseline-shots-2`): **the baseline differs from itself in 39 pictures** (up to 472 pixels and a channel difference of 53 in one picture, at the same places: card and table corners, the scrollbar's edge, glyph edges), because Chrome's rasteriser under this machine's load does not antialias identically every time.

- 25 of the 42 differ where the two baselines also differ: noise.
- 17 differ from both baselines while the two baselines agree: `clients`, `files`, `quality`, `hiring` (×2), `handouts`, `income`, `invoices`, `reports`, `worker-attendance` (dark), `payments` (1440), `payments/reconciliation` (dark), and the 1024×640 pictures of a file's contract sheet, its payments, its tasks and an inspection. Each is 3 to 91 pixels with a channel difference of at most 10 out of 255 (one of 46, on 3 pixels of a glyph at the window's edge), all on the rounded corners and trailing edges of cards and tables or on glyph edges; side by side at 300% they cannot be told apart (`/mnt/data/inmaa-phone-verify/crops2/`). No element moved or changed size: a move of one pixel changes thousands. The likely cause is that the new phone-only rules (`narrow:`, max-width 767.98 px) add CSS that changes how Chrome groups these cards and tables into layers, which shifts antialiasing; none of those rules applies at 1024 or 1440 pixels (`src/components/ui/table.tsx`, `src/components/data-table-shell.tsx`, all under `narrow:`).
- Shell's intended differences in Settings › المزامنة do not show here: the demo database has no sync set up, so that page shows its set-up card, unchanged.

Reports: `/mnt/data/inmaa-phone-verify/after-vs-baseline.txt`, `after-vs-baseline2.txt`, `noise.txt`; diff images in `.harness/desktop-compare/diff/` and `/mnt/data/inmaa-phone-verify/noise-diff/`.

Differences expected and explained by shell (all in Settings › المزامنة, the Ctrl+K list and the users' page): the sync texts speak of «أجهزة المركز» / «هذا الجهاز» instead of the two laptops; the devices list has a kind chip (حاسوب / هاتف المدير), «آخر اتصال بصندوق البريد» and how many changes wait; «إضافة هاتف المدير» beside «إضافة الحاسوب الثاني»; «إزالة جهاز»; a Ctrl+K entry «إضافة هاتف المدير»; the text of the capability `sync.manage`.

## 2. Three copies: every case of the sync decision where the phone changes the outcome

**How.** `src/testing/scenarios/phone/` (27 tests), on sync's three-copy harness (`src/testing/sync/trio.ts`): three databases built from the real migrations (0001–0006), three clocks, three data folders, the real sync engine, and the real mailbox Worker code (`relay/src`) running in memory on Durable Objects backed by SQLite. Every step goes through the owners' services in stamped transactions, as a screen's action does. **Every test ends** with every shared table equal row by row on the three copies (`trio.expectSame`), no invoice or receipt number on two documents and every number from 1 to the highest on a document or in a declared gap (`expectLegalNumbersUnique`), and every chain verified on all three (`verifyChains`: each chain whole, each invoice's digest, no missing number, the cached totals).

```sh
npx vitest run src/testing/scenarios/phone
```

**Result:** 27 passed (one failed on first run and was a real bug, below).

| File | What it proves |
|---|---|
| `pairing-and-sign-in.test.ts` | The phone joins on a phone's code as slot 2, kind PHONE, seen so on all three copies, with its own log chain. A laptop's code is refused to the phone and a phone's code to a laptop (each with its sentence), without using the code up. A fourth device is refused: a second phone and a third laptop, both when the code is made and, with a code made before the slot was taken, by the mailbox itself. The phone neither sets up a centre nor makes a code. Pairing a phone needs `sync.manage`. **Only the manager's role signs in on the phone**: the assistant is refused before her password is checked (nothing counted) and signs in on her laptop; an account without a password cannot choose one on the phone unless it is a manager's; a second manager-role account demoted on a laptop while signed in on the phone is signed out there and cannot sign in again. The director's change of the assistant's role, made on his phone, reloads her session on her laptop, logged in the phone's chain under his name. |
| `cases.test.ts` | **Case 1**: the phone and a laptop edit one worker apart: different fields both kept, same field the later stamp wins on all three, the other value listed. **Case 2**: the phone in a drawer for 100 days: the mailbox keeps every envelope the phone has not applied, even past 90 days and with a fresh full copy, then collects them once the phone applied them; the phone sends its own change first; after confirming the date on its own clock check it takes the books and issues the next number of the new year. Fell behind what the mailbox keeps: the phone cannot make the full copy, a laptop does, the phone catches up from it and its own change lands on top. **Case 3**: the phone's clock a day ahead: the later change in real time wins on all three; the laptops' clock checks are not moved by its rows. **Case 4**: the phone's send cut before the answer: sent again, stored once. **Case 5**: the phone offline: works alone, its changes wait, then go. **Case 7**: the director's laptop restores a backup while the phone worked: it takes back the phone's changes too and gives no number twice. **Case 9**: the phone lost while holding the books, with receipts on it never sent: the manager removes it from his laptop with a reason, declares the last number seen; `LOST_DEVICE` gap 3–5, key replaced, its token refused, its blocks retired, the next receipt is 6; a new phone joins in slot 2 under a new id and a new log chain. Case 9 with the assistant's laptop away across one key rotation, and across two (the phone lost, its replacement lost too): it comes back days later, finds the new key, sends and receives. **Case 11**: the assistant's laptop and the phone ask for the books at once: one holder, the same on all three, the other refused with the books' sentence and then served; the phone holding the books switched off: the laptops wait and are told the phone has them. **Case 12**: the same national number registered on the phone and a laptop apart: held with the database's reason, one live worker everywhere. |
| `numbers-and-protocol.test.ts` | **Ordinary numbers**: workers, files and clients registered on the three devices together, then apart past their agreed blocks, then together again: no number given twice, none changed after it was given, and apart every device took fallback blocks only in its own third (`blockIndex % 3 === slot`). **Legal numbers**: receipts as the books go director's laptop → phone → assistant's laptop → director's laptop, the phone issuing while offline and the laptops refused: one unbroken sequence 1–8 on all three. The three devices each asking for the books while apart: one holder after, no number twice. **A 1.1.0 program** (no protocol header, or protocol 1) is refused by the mailbox with 426 `UPDATE_REQUIRED` (`RelayOutdated`); a laptop round on the old protocol ends `OUTDATED`, its status shows the problem `OUTDATED` as danger, nothing is lost and it sends once updated. |

Cases 6 (the free service's limit, down, full), 8 (a restore from before set-up) and 10 for the laptops are not changed by the phone beyond what is above; they stay covered by the two-laptop scenarios in `src/testing/scenarios/sync/`, which still pass.

**Bug found and fixed.** A second manager-role account signed in on the phone and demoted to accountant on a laptop stayed signed in on the phone (`sessionAfterSync` answered `reloaded`). Reported to shell with the failing test; fixed in `src/lib/access/session.ts` (it answers `signedOut` when the device is a phone and the role is no longer in `PHONE_ROLES`); the test passes.

## 3. The live rig: the real Worker over real HTTPS

**How.** The program refuses any mailbox address that is not HTTPS, so a local Worker on `http://127.0.0.1:8787` would not do. `scripts/e2e/live/rig.sh start`:

1. copies `relay/` to `/mnt/data/inmaa-phone-verify/live-rig/relay` (so nothing is written in the repository; the copy's file hashes are kept in `relay.version`) with a random `SETUP_KEY` in its `.dev.vars`;
2. runs it with `wrangler dev --local` (wrangler 4.156.0, installed outside the repository in `/mnt/data/inmaa-phone-verify/tools`): Cloudflare's own runtime, workerd, with SQLite-backed Durable Objects, the same code `wrangler deploy` would send;
3. puts it behind a Cloudflare **quick tunnel** (`cloudflared tunnel --protocol http2 --url http://127.0.0.1:8787`, cloudflared 2026.10.7, no account): a public `https://<words>.trycloudflare.com` address with a real certificate from a public CA, which the program's HTTP client (ureq on rustls with Mozilla's roots, on the laptops and on Android alike) accepts as it will accept `*.workers.dev`.

**Result.** Through the tunnel: `GET /v1/time` with `x-inmaa-protocol: 2` → `HTTP/2 200`, `x-relay-time`, `{"now":…}`; without the header → `426`, `x-relay-error: UPDATE_REQUIRED`; `POST /v1/centres` with a wrong setup key → `403`, `x-relay-error: SETUP_KEY`. These are the checks of `relay/README.md` step 6.

## 4. The live test: two laptops and the real APK on an emulator

**What is real and what stands in.**

- The mailbox: the real Worker, as in section 3.
- The phone: the real test APK (`inmaa-pro-1.2.0-test.apk`, x86_64 added for the emulator, signed with the release key) on the Android emulator `inmaa-phone` (Android 15, Google APIs, x86_64), its window driven over the Chrome DevTools Protocol (`scripts/android/emulator.sh devtools`), screenshots taken at each step. Its traffic goes through its own Rust HTTP client to the tunnel, as on a real phone.
- The two laptops: **Node program copies**, not the desktop window: the program's own migrations, first run, services and sync engine, each on a database file in a folder of its own with the PC's real clock, reaching the mailbox through `scripts/e2e/live/node-transport.ts`, which does what native's `sync_request` does (HTTPS to one origin, `/v1/` paths only, the allowed headers only, no redirect, 30 s timeout). The desktop window's part is covered by the comparison (section 1) and the harness; the Rust HTTP command by its own tests (`src-tauri/src/sync/tests.rs`).

```sh
scripts/e2e/live/rig.sh start            # prints the https address
LIVE_ORIGIN=$(cat /mnt/data/inmaa-phone-verify/live-rig/origin.txt) \
LIVE_SETUP_KEY=$(cat /mnt/data/inmaa-phone-verify/live-rig/setup-key.txt) LIVE_PHONE=1 \
  npx vitest run --config scripts/e2e/live/vitest.config.ts
scripts/e2e/live/rig.sh stop
```

Steps: the director's laptop chooses his password and sets the centre up; it pairs the assistant's laptop, which joins from the full copy and signs in; a change on each laptop reaches the other; the director's laptop makes a phone's code; on the emulator the program's first screen offers only «الانضمام إلى مركز موجود», the address and code are typed, the phone downloads and installs the centre, restarts and shows the sign-in window, and the director signs in with his password; the laptops see three devices; a change made on the phone shows on both laptops; a change made on a laptop shows on the phone; the laptops' chains verify and their shared rows are equal.

**Result, the laptops' half** (2026-11-01, without the phone): passed. Over `https://venice-publishing-which-consortium.trycloudflare.com`: the director's laptop created the centre (`POST /v1/centres` 201), put its first full copy in four parts and recorded it; it paired the assistant's laptop, which redeemed the ticket, downloaded and installed the copy, and signed in with the password the director gave (replaced at once); a worker registered on each laptop reached the other; after the last rounds both laptops' shared rows were equal and their chains verified. Each request took 1 to 7 seconds through the tunnel on this line. Log: `/mnt/data/inmaa-phone-verify/live/live-laptops-only.log`.

Two things this line needed, neither in the program: Node's `fetch` connects one address at a time here (`net.setDefaultAutoSelectFamily(false)` in the Node transport: its default gives each address 250 ms, and every attempt timed out though curl connected), and the tunnel runs over HTTP/2 (`cloudflared --protocol http2`: the QUIC connection dropped under this machine's load).

**Result, with the phone** (2026-11-02, 00:19–00:22 UTC, test APK of 00:50 on `inmaa-phone`, Android 15, WebView 124): **6 of 6 passed.**

1. The director's laptop set the centre up and paired the assistant's laptop (slot 1), which joined from the full copy and signed in; a change on each laptop reached the other.
2. The director's laptop made a phone's code. On the emulator the program's first screen offered only «الانضمام إلى مركز موجود» (`phone-01-first-screen.png`); the address and code were typed; the phone redeemed the ticket, downloaded the four parts of the full copy through its own Rust HTTP client and the tunnel, installed it, restarted its window and showed the sign-in window listing **only the manager's account** (`phone-04-sign-in.png`). The director signed in with the password he chose on his laptop (`phone-05-home.png`: the home screen, the phone's bar with «المزيد»). Both laptops then listed three devices: LAPTOP slot 0, LAPTOP slot 1, PHONE slot 2.
3. **Phone → laptops:** on the phone, Settings › عام, the centre's name changed and saved (`phone-06-change-on-phone.png`); on the next rounds both laptops read `centre.nameAr = "مركز إنماء برو (من الهاتف 00:21)"`.
4. **Laptop → phone:** a worker «من الحاسوب إلى الهاتف» registered on the director's laptop and sent; the phone's own sync loop brought it within about 15 seconds and it shows in the phone's workers list (`phone-07-laptop-change-on-phone.png`), beside the two workers typed on the laptops.
5. Afterwards both laptops' chains verified and their shared rows were equal.

Log: `/mnt/data/inmaa-phone-verify/live/live-with-phone.log`; pictures of the phone's screen: `/mnt/data/inmaa-phone-verify/live/phone-*.png`.

**What the live test found on the way:**

- **A real bug, fixed:** on Android every `sync_request` was refused with «REFUSED: the body must be bytes», so the phone could not reach the mailbox at all («تعذّر الوصول إلى صندوق البريد»). Tauri's Android bridge passes every invoke through the WebView's text channel, so the raw `Uint8Array` body arrived as a JSON array of numbers. Reported to android with the repro; fixed in `src-tauri/src/sync/mod.rs` (`sync_request` and `file_write_part` take that form beside raw bytes; the desktop path unchanged). The three-copy scenarios could not see it: they run the engine in Node, not over Tauri's Android IPC. Evidence of the failure: `/mnt/data/inmaa-phone-verify/live/failed-run-1/`.
- **A gap of the rig, not the program:** the phone then refused the first full copy with «This file is not a backup of this program's data», because the Node laptop copies' databases (built by the test database code) lacked sqlx's `_sqlx_migrations` table, which a real laptop's database always has; the phone's install checks it, as it should. The laptop copies now record it as sqlx does (`scripts/e2e/live/laptops.ts`).
- Android asks once whether the program may show notifications; the driver grants it beforehand (`pm grant … POST_NOTIFICATIONS`) so the system's dialog does not cover the pictures. The director will see that question once and should answer «Allow».

## 5. The final gates

Run on 2026-11-02 on the working tree after every teammate reported done (HEAD 7fc7eca plus android's last uncommitted changes); logs in `/mnt/data/inmaa-phone-verify/gates/`.

| Gate | Result |
|---|---|
| `npx tsc --noEmit` | passed (no error) |
| `npm run lint` | passed: 0 errors, the 17 known warnings of the academy shell |
| `npm run format:check` | passed: all files in Prettier's style |
| `npm test` | passed: 239 files, 1993 tests (with the 27 phone scenarios and the two-laptop ones) |
| `npm run build` | passed (type-check and Vite) |
| `npm run csp:check` | passed: the built program opened under the written policy, no violation |
| `npm run db:verify` | passed: frozen migrations unchanged, generated files equal, the model's proof 157/157, the sync proof 70/70, the documents 0 problems |
| `cargo check --offline`, `cargo test --lib --offline` | passed, run by android (it rewrites `src/lib/bindings.ts`): 37 tests, 0 failed, including the 1.1.0 → 0006 upgrade in place and the Android byte bodies; `src/lib/bindings.ts` unchanged |
| The desktop program with no network | passed: the release binary of `npm run tauri build` (`src-tauri/target/release/inmaa-pro`, 1.2.0) started inside `unshare -rn` (a network namespace whose only interface, `lo`, is down), on a private Xvfb display, with its data in a scratch folder; after 60 seconds it was running and showed its first window, «اختر كلمة المرور» with «الانضمام إلى مركز موجود» (`/mnt/data/inmaa-phone-verify/desktop-offline/window.png`, log `app.log`) |
| The desktop comparison | passed with explanations: section 1 |
| The signed release APK | `src-tauri/target/android/inmaa-pro-1.2.0.apk` (arm64-v8a and armeabi-v7a, signed with the centre's key, `apksigner verify` by android): the emulator's image runs arm64 code through its translator, so it installed (`primaryCpuAbi=arm64-v8a`, version 1.2.0) and opened on «الانضمام إلى مركز موجود» (`/mnt/data/inmaa-phone-verify/live/release-apk-first-screen.png`; the «System UI isn't responding» dialog over it is the emulator's own launcher under this machine's load). The live test (section 4) ran the test APK, which is the same build with x86_64 added and WebView debugging on |

## 6. What could not be checked here

- **A real phone.** Everything ran on the emulator (x86_64, Android 15, WebView 124; the release APK's arm64 code only through the emulator's translator). Not seen: the ARM build on real hardware, an older Android (the floor is 7.0) or an old WebView, real mobile data, the battery and background behaviour of a particular phone maker, installing by copying the APK through the Files app. `docs/phone/HANDOVER.md` section 4 gives the steps and the checks to make on the director's phone.
- ~~**The real Cloudflare deploy.**~~ Done since: section 7 (the deploy, `secret put`, `workers.dev`'s address and certificate, the whole live test on the deployed mailbox). Not reached: the free plan's daily limits and storage, far above what a test uses.
- **The desktop window talking to the real mailbox.** The laptops of the live test are the program's engine in Node; the program's own HTTP code (`http.rs`) reached the deployed mailbox on this line through its fallback (section 7), but the Windows program's window, on Windows and its resolver, was not run against it here. Nor were other Algerian networks (the centre's own line, another mobile operator): what the fallback meets there is unknown until the laptops and the phone are set up.

## 7. The live test on Cloudflare

On 2026-11-02 the mailbox was deployed on the developer's Cloudflare account and the live test of section 4 was run against it. Evidence: `/mnt/data/inmaa-phone-verify/live-cloudflare/`.

### The deploy

From `relay/`, with the developer's API token (`~/.inmaa-cloudflare/env`; no browser sign-in), wrangler 4.156.0:

```sh
set -a; . ~/.inmaa-cloudflare/env; set +a
npx wrangler@4 deploy                                    # Deployed inmaa-relay … https://inmaa-relay.ayoubwass404.workers.dev
npx wrangler@4 secret put SETUP_KEY < ~/.inmaa-cloudflare/setup-key   # 32 random bytes as hex, mode 600, never printed
npx wrangler@4 secret list                               # SETUP_KEY, secret_text
```

`relay/wrangler.jsonc` was used as it is. Wrangler's scratch folder `relay/.wrangler/` (git-ignored) was removed afterwards. Log: `deploy.log` (no account id in it).

The same day the mailbox was deployed twice more with the relay reviewers' fixes (the key chain, the replacement owed after a removal, tickets, the error mapping), `wrangler.jsonc` and its migrations unchanged, the new tables and columns added inside each Durable Object when first reached: version `5faea5cf` at 10:55 UTC, then `fb8bac76` at 11:19 UTC (48.13 KiB). After each, the three checks below answered the same (`checks-after-redeploy.txt`, `checks-after-redeploy2.txt`; the sha256 of the `relay/src` files deployed: `redeploy2-relay-src.sha256`). Run 3 ran on `fb8bac76`.

### The three checks, and a finding: the line filters `workers.dev`'s usual addresses

From this PC (a mobile connection in Algeria), with the system's resolver (8.8.8.8), every request timed out: the addresses it gives for the mailbox (Cloudflare's 188.114.96.x / 188.114.97.x; also Quad9's answer) are filtered on the line, either no TCP answer or the connection reset right after the TLS ClientHello. Cloudflare's own resolver (1.1.1.1, also over DNS-over-HTTPS at `https://1.1.1.1/dns-query` and `https://1.0.0.1/dns-query`, both reachable in 0.3–0.6 s) gives 104.21.39.37 and 172.67.142.233, which answer. The same name and SNI reach the Worker through 188.114.96.1 too, so the filtering is on addresses, not on the name. Over 4 min 20 s, every 15 s: 104.21.39.37 20/20 and 172.67.142.233 20/20 answered 200 (mean 0.45 s, certificate `CN=ayoubwass404.workers.dev`, SAN `*.ayoubwass404.workers.dev`, Let's Encrypt YE1, verified); 188.114.96.12 and 188.114.97.12 20/20 reset (`stability.txt`, `doh.txt`). What was decided: `docs/phone/DECISION.md` section 10.

The checks of `relay/README.md` step 6, through 104.21.39.37 (`curl --resolve`; `checks.txt`):

| Request | Answer |
|---|---|
| `GET /v1/time`, `x-inmaa-protocol: 2` | `HTTP/2 200`, `x-relay-time: 1793611750899`, `{"now":1793611750899}`; the PC's clock (NTP-synchronised) read 1793611750021 just after: the mailbox's time is within a second |
| `GET /v1/time`, no header | `HTTP/2 426`, `x-relay-error: UPDATE_REQUIRED` |
| `POST /v1/centres`, `x-setup-key: wrong` | `HTTP/2 403`, `x-relay-error: SETUP_KEY` |

**The program's own Rust client.** A probe compiled outside the repository (`ureq-probe.txt`) with `send()` of `src-tauri/src/sync/http.rs` as it was before the fallback, on the same lock versions (ureq 3.5.0, rustls 0.23.46, webpki-roots 1.0.11): with the system resolver, `OFFLINE: io: Connection reset by peer (os error 104)` after 0.2 s, then `OFFLINE: io: Network is unreachable (os error 101)` after 24 s (the IPv4 addresses timed out, then IPv6, which this line has none of); with the name pinned to 104.21.39.37 (a hosts file in a private mount namespace), the same binary got 200 / 426 `UPDATE_REQUIRED` / 403 `SETUP_KEY` in about 0.3 s each, so rustls with the built-in webpki roots accepts the `workers.dev` certificate.

**The desktop's fallback, on this line** (`http-rs-fallback.txt`). After the fallback of `docs/phone/DECISION.md` section 10 was built, the program's own `src-tauri/src/sync/http.rs`, compiled unchanged (`#[path]`) into a small binary outside the repository with the same lock versions, sent the three checks and a fourth request to the deployed mailbox (`fb8bac76`) through `send()` with the program's limits, the system resolver giving only 188.114.96.12 and 188.114.97.12. With no remembered address: `GET /v1/time` 200 `{"now":…}` in 0.95 s (the filtered addresses refused, then DNS-over-HTTPS at 1.1.1.1, then 172.67.142.233), 426 `UPDATE_REQUIRED`, 403 `SETUP_KEY`, 200, each about 0.35 s; the address file then held `{"address":"172.67.142.233:443","host":"inmaa-relay.ayoubwass404.workers.dev"}`. A new process with that file: all four in 0.3–0.4 s each, straight to the remembered address. This is the code the Windows program runs; only its window and Windows' own resolver were not part of it.

### Run 1: the phone on the emulator's default DNS (`run1-phone-default-dns/`)

The laptops through 1.1.1.1 (below), the test APK of 2026-11-02 01:24 (before the fallback) on the emulator with its default DNS, which resolved the mailbox to 188.114.97.12. The laptops' half passed: the director's laptop created the centre (`POST /v1/centres` 201 with the real setup key), paired the assistant's laptop, a change on each reached the other, chains verified, shared rows equal; 60 requests. **The phone could not join**: 2.6 s after «انضمام», «تعذّر الوصول إلى صندوق البريد. تحقّقوا من الاتصال بالإنترنت وأعيدوا المحاولة.» (`phone-03-join-failed.png`). This is what the director's phone would have done on such a line.

### Run 2: everything through Cloudflare's resolver (`run2-dns-1111/`)

The same APK, the emulator started with `-dns-server 1.1.1.1,1.0.0.1` (the mailbox resolved to 172.67.142.233), the laptops through 1.1.1.1. **6 of 6 passed** (09:52–09:56 UTC, 79 requests from the laptops):

1. The director's laptop («اختبار حاسوب المدير») set the centre up with the real setup key and paired the assistant's laptop («اختبار حاسوب المساعدة», slot 1), which joined from the full copy and signed in; a worker registered on each laptop reached the other.
2. The director's laptop made a phone's code; on the emulator the first screen offered only «الانضمام إلى مركز موجود»; the address and the code were typed, the phone («اختبار هاتف المدير») downloaded the full copy from Cloudflare, restarted, listed only the manager's account, and the director signed in with his password. Both laptops then listed LAPTOP 0, LAPTOP 1, PHONE 2.
3. Phone → laptops: the centre's name changed on the phone at 09:54 (toast «تم حفظ بيانات المركز.») was on both laptops 25 s later.
4. Laptop → phone: a worker «من الحاسوب إلى الهاتف» registered on the director's laptop showed in the phone's workers list within 30 s (`phone-07-laptop-change-on-phone.png`).
5. Both laptops' chains verified and their shared rows were equal.

### Run 3, the final run: the phone on the emulator's default DNS, with the fallback (`run3-final-phone-default-dns/`)

The test APK of 13:11 (package `com.hamawebdev.inmaa_pro.test`, «إنماء برو (اختبار)», with the DNS fallback and the day's sync fixes), installed fresh on the emulator started by `scripts/android/emulator.sh start` with **no DNS override**: the emulator resolved the mailbox to the filtered 188.114.96.12, the condition under which run 1's phone could not join. A fresh centre on the mailbox `fb8bac76`; the laptops through 1.1.1.1 as before. **6 of 6 passed** (13:45–13:51 UTC, 80 requests from the laptops):

1. The director's laptop set the centre up (`POST /v1/centres` 201) and paired the assistant's laptop (slot 1), which joined and signed in; a worker registered on each laptop reached the other.
2. A phone's code made on the director's laptop; on the phone the first screen offered only «الانضمام إلى مركز موجود»; the address and the code typed at 13:47:29, the full copy downloaded and installed, the sign-in window at 13:48:27 listing only the manager's account, the director signed in. The laptops then listed LAPTOP 0, LAPTOP 1, PHONE 2.
3. Phone → laptops: the centre's name saved on the phone at 13:49:54 was on both laptops at 13:50:15.
4. Laptop → phone: the worker «من الحاسوب إلى الهاتف» sent from the director's laptop at 13:50:16 showed in the phone's workers list at 13:50:41 (`phone-08-after-run-clean.png`).
5. Both laptops' chains verified; their shared rows were equal.

The pictures `phone-04` to `phone-07` show the emulator's own «System UI isn't responding» dialog over the program (its launcher under this machine's load, as in section 5); `phone-08-after-run-clean.png` is the same screen after the dialog was dismissed. Receipts and invoices were not issued on the phone: the phone no longer holds the books (`docs/phone/DECISION.md`).

### Which half used which path

- **The laptops** are the Node program copies of section 4; they never run `http.rs`. They reached the mailbox through `scripts/e2e/live/node-transport.ts`, which with `LIVE_DNS=1.1.1.1,1.0.0.1` resolves the name through Cloudflare's resolver and connects with the mailbox's own name and certificate check. Without it they cannot reach the mailbox from this line.
- **The phone** is the real APK and its own Rust client (`sync_request`, `http.rs`). In run 2 the emulator's DNS was set to 1.1.1.1 (an APK without the fallback); **in run 3 it had its default DNS, and the program's fallback found the mailbox by itself.**
- **The desktop's own client** (`http.rs` on Linux, the code the Windows build compiles) was proven separately on this line with the system resolver: above, "The desktop's fallback, on this line".

```sh
LIVE_ORIGIN=https://inmaa-relay.ayoubwass404.workers.dev LIVE_SETUP_KEY="$(cat ~/.inmaa-cloudflare/setup-key)" \
LIVE_DNS=1.1.1.1,1.0.0.1 LIVE_LABEL="اختبار " LIVE_PHONE=1 LIVE_OUT=/mnt/data/inmaa-phone-verify/live-cloudflare/<run> \
  npx vitest run --config scripts/e2e/live/vitest.config.ts
```

(`LIVE_PACKAGE=com.hamawebdev.inmaa_pro.test` when the emulator holds the test build under its own package id. Without `LIVE_DNS` the laptops use the system's resolver, which does not reach the mailbox from this line.)

### Usage

Each full run made 60 to 80 requests from the laptops and a few dozen from the phone; with the checks, the four-minute stability probe and the Rust probes, the day's total stayed under a thousand, against the free plan's 100,000.
