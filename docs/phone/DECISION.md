# The director's phone: the decision

Status: decided 2026-10-31 by the coordinator, on the developer's instruction to build an Android app for the director and to choose without asking. Written for the developer, to review. Every decision below has its reason. The build brief for the team is `docs/phone/BUILD.md`; how it was checked is `docs/phone/VERIFY.md`; what is left for the developer is `docs/phone/HANDOVER.md`.

This extends `docs/sync/DECISION.md` (two laptops, one mailbox). Everything there still holds unless a section below says otherwise.

## 1. Tauri on Android, from the same code

**Chosen: Tauri 2's Android target, built from this repository: the same React window, the same services, the same SQLite migrations and triggers, the same Rust side, the same sync engine.** The phone is a third copy of the program, packaged as an APK.

| Option | Why not |
|---|---|
| React Native | The program's rules live in SQLite (120 triggers in 0001, the capture triggers of 0005, the chains) and in about 300 TypeScript services over Kysely. React Native would need its own SQLite binding and its own copy of the screens, written with native components instead of the academy's shadcn/Tailwind ones. The phone would then *resemble* the desktop instead of *being* it, every later change would be made twice, and a second implementation of legal numbering is exactly how an invoice number gets issued twice. |
| A web app or PWA | The developer ruled it out ("an app installed on the phone"). It would also need a server holding the data in clear. |
| Capacitor | Reuses the window, but not the Rust side: the single database connection (`db.rs`), the anchor, the sync vault, the one HTTP client limited to the mailbox. All of it would be rewritten in Kotlin. |
| A separate "viewer" app reading from the mailbox | The mailbox holds sealed envelopes it cannot read, by design (sync DECISION section 2). A viewer would have to hold the whole database anyway, and the developer asked that the director can act, not only look. |

What it costs: Android's system WebView renders the window, so the phone needs a WebView recent enough for the program's CSS (Chrome 111 or later, March 2023; any phone whose Play Store updates "Android System WebView"). Minimum Android 7.0 (API 24), Tauri's floor.

## 2. The phone is a third device of the centre

- **One centre, three devices at most: the two laptops and one phone.** The mailbox accepts at most two active laptops (slots 0 and 1, as before) and one active phone (slot 2). A device says its kind when it joins; a phone cannot take a laptop's place nor the reverse.
- **Migration 0006** rebuilds `SyncDevice` with `slot IN (0, 1, 2)` and a `kind` column (`LAPTOP`, `PHONE`; existing rows are laptops). 0005 is frozen as shipped, so this is a new file. It also gives `SyncBooks` a `handover` column (added 2026-11-02, before 1.2.0 shipped): the heads of the legal chains a hand-over of the books carries. Nothing else in the schema changes.
- **Number blocks: each block belongs to one third, and that third's device answers for it.** Block `i` is in the third of slot `i` modulo 3, and the device in that slot is its warden. A device out of touch numbers in its own third. A claim in a device's own third is accepted at once; a claim in a laptop's third is answered only by that laptop (refused if another device already uses the block; of two claims waiting on one block, the lower slot keeps it); laptops never claim in the phone's third, because the phone is online rarely; a claim whose warden was removed is refused. **Why a warden:** the two-laptop rule ("the other laptop answers") breaks with three devices: the assistant's laptop could accept a laptop's claim on a block the phone had already taken offline. With one answerer per block, no ordinary number is given twice, whatever happens; a fuzz test over three devices and twelve seeds proves it. **What it costs:** while the phone gives no numbers, about one block in three is skipped, so ordinary numbers (files, quotes, visits…) show more gaps than in 1.1.0. They are not legal sequences; invoices and receipts stay one unbroken sequence (the books, section 6).
- **Why changing the laptops' rule is safe:** the mailbox has never been deployed (sync DECISION section 11), so no centre has ever taken a fallback block. And the mailbox now requires **sync protocol 2** (`x-inmaa-protocol: 2` on every request) and refuses older programs with «حدّث البرنامج على هذا الجهاز». A 1.1.0 laptop can never sync beside a phone with a different rule for blocks.
- **The mailbox deletes an envelope when every active device has applied it** (it was: both laptops), and a full copy covers it, and not before 90 days.
- **Removing the phone** is case 9 of the sync decision: from a laptop, with a typed reason; its token is revoked, the centre key replaced, its blocks retired, and if it held the books the manager takes them with the last numbers seen on paper (`LOST_DEVICE` gap). *Added 2026-11-02 (fix-sync):* the laptop first applies everything the phone put on the mailbox (it may have handed the books on, or numbered in a block the next phone would take), and refuses with «sync first» when it cannot; the next phone's full copy is made after the same receive, and the new phone gives no number before its first sync.
- **The new key reaches the device that stays.** With two laptops the remover was the only one left; with three, the third device must get the new centre key too. The remover leaves the new key ring on the mailbox, sealed under the old key; a device that meets a key it does not hold follows the replacements forward, across several removals. What remains: someone holding both the removed device and a copy of the mailbox's storage could open that part (the revoked token alone stops the removed device). A per-device key exchange can close this later. Two devices removing a third at the same moment is not handled: only the first new key is kept, so do removals from one device.

## 3. Pairing the phone

- On a laptop where sync is set up, Settings › المزامنة has «إضافة هاتف المدير» beside «إضافة الحاسوب الثاني». The director presses it and the laptop shows a 20-character code, exactly as for the second laptop (same code, same ticket, same 30 minutes, once only), marked for a phone.
- On the phone, the first screen offers only «الانضمام إلى مركز موجود»: he types the mailbox address and the code. The phone downloads the full copy, installs it and opens on the sign-in window, where he signs in with his own account and his existing password.
- **Why no "new centre" on the phone:** the phone is never the first device. A centre starts on the director's laptop, where the backups, the printer and the letterhead are.
- **Why the code is typed and not scanned from a QR code:** scanning needs a camera plugin and a new dependency for a step done once; 20 characters in groups of four, with a typo check, take a minute.

## 4. Who signs in on the phone

**Only an account holding the manager role signs in on a phone.** The sign-in window on the phone lists only those accounts; the sign-in service refuses any other on a phone, with a sentence. The developer said the phone is the director's alone "for now": this is one rule in one place (`PHONE_ROLES`), easy to widen later.

On the phone he holds exactly the manager's rights, checked by the same services: what he may do on his laptop he may do on the phone, and the answers he alone gives (an approval, a sanction, an override) he can give from the phone. Nothing on the phone bypasses a check, and the log records the phone as the device (its own log chain, `AuditLog:<phone id>`).

## 5. What he does most, and how the phone shows it

The phone shows the whole program; nothing is cut out of it. The work went into making the screens he will open most read well on a phone, and into a bar that reaches them with a thumb. **What he will use most**, judged from what only he answers and from what a director checks away from the office:

1. **What waits for him**: the alert tiles of the home screen (contracts ending, payments due, debts, approvals and answers that are his, stock to buy, sync problems), each opening its list.
2. **Today at the centre**: today's tiles and the day board (who is where, which visits are under way, absences and replacements).
3. **Requests and contracts**: a client's file, its quote to approve, its contract, its visits.
4. **Money**: what came in and went out, invoices, payments and debts, the reports and indicators.
5. **Workers**: a worker's file, attendance, hours and pay, the suspended-or-penalised check.

So, under 768 pixels of width:

- **The bottom bar** (already the academy's own navigation, built for a thumb) holds الرئيسية, الطلبات والعقود, المال, العمال and «المزيد». «المزيد» opens a sheet from the bottom with the other sections (الموظفون, المخزون, الإعدادات), the search (the Ctrl+K list, which has no keyboard shortcut on a phone), the sync state and «قفل الآن».
- **The home screen** puts the alert tiles first, then today's tiles, then the board, one column.
- **Every page** is one column: tab strips scroll sideways, a table scrolls sideways inside its card with its first column kept in view, a dialog takes the whole screen, forms stack their fields, buttons are at least 44 pixels high, and the status bar and the gesture bar never cover anything (safe-area insets).
- **At 768 pixels and wider nothing changes**: the laptops look exactly as in 1.1.0. Screenshots of the desktop sizes before and after are compared to prove it.
- The layout follows the width, not the device: a narrow window on a laptop gets the same phone layout. What the phone *may* do (section 6) follows the device.

Arabic is the default and reads right to left; French and English are there; every text in the client's words, as on the desktop (`CLAUDE.md` rule 3). The phone follows the program's own theme setting, light or dark.

## 6. What the phone does not do, and why

| On the phone | Why |
|---|---|
| **No printing.** A sheet can be looked at; its print button is replaced by «تُطبع من الحاسوب». | Android's WebView has no `window.print()`. His forms and contracts are printed on his letterhead, A4, from the office. An invoice's original belongs to the device holding the books; a phone with no printer cannot give it. A bridge to Android's print service can be added later. |
| **No backup and no restore.** The backup card is not shown. | Android lets an app write outside its private storage only through the system's document picker, into folders a cloud client usually synchronises (which the backup refuses). The laptops back up every day; a lost or reset phone rejoins from the full copy in minutes. |
| **No saved copies or exports to the phone's storage.** | The same storage rule, and a copy saved outside is a disclosure under Law 18-07: a file in a phone's Downloads folder leaves the office's control. |
| **Not the first device, never makes the full copy.** | See section 3. The full copy is large and is refreshed weekly by a laptop (the books' laptop, or the director's laptop while the phone holds the books), not over the phone's data plan. |
| **No sync in the background.** It syncs while the app is open: at once when opened or brought back, after every save, then every 15 to 60 seconds, as the laptops do. | Android stops apps in the background; staying awake would need a permanent notification and drain the battery. Opening the app is enough to catch up. |
| **No calls, messages or links that open another app.** | `CLAUDE.md` rule 1 is unchanged: the program reaches the mailbox and nothing else. |

**The books stay on the laptops (changed 2026-11-02).** The phone never holds the books: it cannot ask for them («طلب الدفاتر» is not offered on a phone), a laptop never hands them to it, and on the phone issuing an invoice, a receipt or a payment, closing a cash day and writing a debt line are refused with «الدفاتر تبقى على الحواسيب: أصدِروا هذا من الحاسوب الذي يحمل الدفاتر». **Why:** the sync review showed that if the phone held the books and were lost before its last changes reached the mailbox, the receipts and payments recorded on it would be gone for good (its access is revoked on removal, so they can never be sent), and since a phone cannot print, nobody would have their numbers on paper to declare. A phone is the device most easily lost; money must never exist only on it. Everything else the manager does — approving, answering, registering, correcting, looking — he still does on the phone. The day-start jobs therefore always run on a laptop. (This replaces the first version of this paragraph, which let the phone hold the books.)

## 7. Offline, privacy and security on the phone

- **Offline first, as the laptops.** The whole database and the stored files are on the phone. With no network it works alone; the bar says «غير متصل» and how many changes wait; they go when the network returns. The content security policy is the desktop's; the window still connects nowhere; the one HTTP client in Rust reaches only the mailbox, over HTTPS. The Android manifest asks for `INTERNET` and `ACCESS_NETWORK_STATE` (for the mailbox) and `POST_NOTIFICATIONS` (alerts), nothing else; clear-text traffic is refused by the network security configuration.
- **Data stays in the app's private storage**, which Android encrypts on any phone since Android 10. `android:allowBackup="false"`, and data-extraction rules that exclude every folder from cloud backup and from a transfer to a new phone (on Android 12 and later `allowBackup` alone does not stop the transfer), so neither Google's cloud backup nor a cable backup copies the database or the sync key.
- **A lost phone**: the passwords protect the program; removing the phone from a laptop revokes it on the mailbox and replaces the centre key (section 2). We recommend a screen lock on the phone.
- **The idle lock** works as on the laptops (`security.idleLockMinutes`).

## 8. Building, signing and installing

- One version for the three devices: **1.2.0**. The laptops need 1.2.0 before the phone joins (protocol 2).
- The APK is signed with a release key made for the centre and kept **outside the repository** (`~/.inmaa-android/`, described in `docs/phone/ANDROID-BUILD.md`). Android installs an update only over an APK signed with the same key: if that key is lost, the next version must be installed after removing the app and rejoining from the full copy. Back it up with the Worker's setup key.
- One APK for real phones (`arm64-v8a` and `armeabi-v7a`); test builds add `x86_64` for the emulator.
- Installed by copying the APK to the phone and opening it ("install unknown apps"), or with `adb install`. No store, no updater: a new version is installed over the old one and its migrations upgrade the database in place, as on the laptops.

## 9. What changes for the laptops

- 1.2.0 on both laptops: protocol 2, the third-thirds rule for blocks, Settings › المزامنة shows the phone among the devices and offers «إضافة هاتف المدير» and «إزالة جهاز». Nothing else.
- Their look at desktop sizes is unchanged (section 5), their offline rule is unchanged, and their build, lint, type-check, tests, `db:verify` and `cargo test` pass.

## 10. Reaching the mailbox from Algerian networks (decided 2026-11-02)

**What was found when the mailbox was deployed.** From a mobile connection in Algeria, the addresses that ordinary DNS (the operator's, Google's 8.8.8.8, Quad9) gives for `inmaa-relay.<name>.workers.dev` (Cloudflare's 188.114.96.x and 188.114.97.x) are filtered on the line: TCP connects, then the connection is reset right after the TLS hello, or times out. Cloudflare's own resolver (1.1.1.1) gives other Cloudflare addresses for the same name (104.21.x, 172.67.x), which answered 20 times out of 20 over four minutes with the mailbox's own certificate. The emulator, on the default DNS, could not join. The filtering is on addresses, not on the name. Evidence: `/mnt/data/inmaa-phone-verify/live-cloudflare/`.

**Chosen: the program finds the mailbox through Cloudflare's resolver when the ordinary addresses fail.** In the Rust client only (`src-tauri/src/sync/http.rs`):

1. It connects first to an address that worked before (kept in a small local file beside the vault, never shared, never in a backup), else to what the system resolver gives, with a short connect limit.
2. If that fails before an answer (refused, reset, timed out, TLS cut), it asks DNS-over-HTTPS at `https://1.1.1.1/dns-query`, then `https://1.0.0.1/dns-query`, for the mailbox's IPv4 addresses, and connects to them, sending the mailbox's name (SNI and Host) and **checking the mailbox's own certificate exactly as before**. A wrong address can therefore only fail; it cannot pose as the mailbox.
3. The address that answered is remembered, so later rounds skip the slow path; it is forgotten when it fails.

**What this changes in the offline rule.** The program may now reach two things, both from Rust, both over HTTPS: the mailbox the director typed, and Cloudflare's resolver at the two fixed addresses above, asked only for the mailbox's own name. The window still connects nowhere; the content security policy is unchanged; `src/lib/offline.test.ts` allows those two literals in `http.rs` only.

**Rejected:** addresses written into the program (Cloudflare changes them); a resolver chosen by the user (one more thing to type and get wrong); a VPN or proxy (a third party that sees the traffic's endpoints and costs money).

**For good, the developer's choice:** a domain of his own on Cloudflare (about 10 USD a year) gives the mailbox the 104.21.x / 172.67.x kind of addresses that work here; the program then needs nothing but the new address typed at set-up. The fallback stays useful if those are ever filtered too.
