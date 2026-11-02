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
- **The real Cloudflare deploy.** The Worker ran in Cloudflare's runtime on this machine (`wrangler dev --local`), reached through Cloudflare's network over HTTPS, but not deployed on an account: the free plan's limits (requests a day, CPU per request, storage), `workers.dev`'s address and certificate, and `secret put` were not exercised. `docs/phone/HANDOVER.md` section 1.
- **The desktop window talking to the real mailbox.** The laptops of the live test are the program's engine in Node; the Windows program's own HTTP command reaching the mailbox is proven by the Rust tests and by the two-laptop work of 1.1.0, not end to end here.
