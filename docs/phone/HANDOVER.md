# The director's phone: what is left for you

For the developer. Everything else is built and checked (`docs/phone/VERIFY.md`). **The mailbox is deployed on your Cloudflare account** (section 1, done on 2026-11-02, and checked end to end with two laptop copies and the APK on the emulator). What is left needs the director's laptops and his real phone, which we do not have here:

1. ~~Deploy the mailbox on Cloudflare.~~ Done: section 1.
2. Publish the 1.2.0 Windows installer (push and run the workflow; nothing was pushed from here) and install it on both laptops.
3. Set sync up on the director's laptop, then add the assistant's laptop.
4. Install the APK on the director's phone and pair it.
5. Check that a change goes both ways.

The setup key, the Cloudflare token, your account id and the release key never go into the repository. The mailbox address is written below because you will type it on three devices; it lets nobody in without the setup key or a pairing code.

## 1. The mailbox (deployed)

| | |
|---|---|
| Mailbox address | `https://inmaa-relay.ayoubwass404.workers.dev` |
| Worker | `inmaa-relay` on the account whose workers.dev subdomain is `ayoubwass404`, deployed from `relay/` with wrangler 4.156.0 on 2026-11-02; the version live is `fb8bac76` (11:19 UTC), with the day's mailbox fixes |
| Setup key | on this PC only, in `~/.inmaa-cloudflare/setup-key` (mode 600, 64 hex characters); set on the Worker as the secret `SETUP_KEY`. **Copy it to paper** and keep it with the backup of `~/.inmaa-android/` |
| Cloudflare token | `~/.inmaa-cloudflare/env` (mode 600): `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, for wrangler without a browser sign-in |

The three checks of `relay/README.md` step 6 answered as they should (200 with `x-relay-time` within a second of the PC's clock, 426 `UPDATE_REQUIRED`, 403 `SETUP_KEY`); `docs/phone/VERIFY.md` section 7 has them and the live test.

**Updating the mailbox later** (after a change in `relay/src/`), from `relay/`, with no browser:

```sh
set -a; . ~/.inmaa-cloudflare/env; set +a
npx wrangler@4 deploy        # the address and the stored envelopes stay
rm -rf .wrangler             # wrangler's scratch folder (git-ignored)
```

A new setup key, if the old one leaks: `node -e "process.stdout.write(require('crypto').randomBytes(32).toString('hex'))" > ~/.inmaa-cloudflare/setup-key`, then `npx wrangler@4 secret put SETUP_KEY < ~/.inmaa-cloudflare/setup-key`. The devices already in the centre keep working.

**From Algerian networks.** On the line used here (a mobile connection in Algeria), the addresses that ordinary DNS gives for `*.workers.dev` are filtered; Cloudflare's resolver gives others that work. Version 1.2.0 handles it by itself (`docs/phone/DECISION.md` section 10): when the usual addresses fail it asks Cloudflare's resolver and remembers the address that answered. The first exchange on a filtered line therefore takes longer; the next ones go straight to the address that answered. Seen working here on the phone (the APK on the emulator with its ordinary DNS joined, synced both ways) and with the desktop's own HTTP code (`docs/phone/VERIFY.md` section 7); an APK or a laptop program from before this fallback cannot reach the mailbox from such a line. For good, a domain of your own on Cloudflare (about 10 USD a year) gives the mailbox addresses that work here directly; the devices then only need the new address typed in Settings › المزامنة.

**Test centres on the mailbox.** The live test created test centres on this mailbox, their devices named «اختبار حاسوب المدير», «اختبار حاسوب المساعدة», «اختبار هاتف المدير». They are separate from the centre the director will create (each centre is its own sealed mailbox; nobody can read one with another's keys), and hold a few hundred kilobytes of the free plan's 5 GB. Nothing to do; the mailbox has no command to delete a whole centre.

## 2. Install 1.2.0 on both laptops

The mailbox speaks sync protocol 2: a laptop still on 1.1.0 is refused and shows «حدّث البرنامج على هذا الجهاز».

The Windows installer is built by GitHub Actions, as for 1.0.0 and 1.1.0; nothing was pushed from here. When you are happy with the branch `phone-app`, merge it into `main`, push, and run the workflow:

```sh
git switch main && git merge --ff-only phone-app   # or merge as you prefer
git push origin main
gh workflow run windows-installer.yml --ref main -f prerelease=false
gh run watch                                         # about twenty minutes; it publishes «Inmaa Pro v1.2.0 (Windows)»
```

Install it over 1.1.0 on both laptops, as before; the data stays and migration 0006 upgrades the database when the program opens. (Once 1.2.0 ships, add the sha256 of `0006_phone.sql` to `FROZEN_MIGRATIONS` in `scripts/db/schema-tools.mjs`, as was done for 0004 and 0005.)

## 3. Sync on the two laptops

On the **director's laptop**, signed in as the director:

1. Settings › المزامنة › «إعداد المزامنة».
2. Type the mailbox address and the setup key. The laptop becomes the centre's first device and holds the books.
3. «إضافة الحاسوب الثاني»: choose or create the assistant's account. A 20-character code appears, valid 30 minutes, once.

On the **assistant's laptop**, freshly installed (nothing typed in it yet): the first screen › «الانضمام إلى مركز موجود», type the mailbox address and the code. It downloads the centre and opens on the sign-in window.

## 4. The director's phone

### What you need

- The phone: Android 7.0 or later, with **Android System WebView** up to date (Play Store › «Android System WebView» › Update; it must be version 111 or later, which any phone updated since 2023 has).
- The signed release APK, from either place (both sign with the same key, so either can update the other):
  - **GitHub Actions** (about 10 minutes, nothing to install): every push to the branch `phone-app` runs «Android APK» (`.github/workflows/android-apk.yml`). Open the run in the repository's Actions tab and download `inmaa-pro-apk` under Artifacts (a zip holding `inmaa-pro-1.2.0.apk`; kept 30 days), or `gh run download <run id> -n inmaa-pro-apk`. The release key is in the repository's secrets (`ANDROID_KEYSTORE_BASE64` and three more); once the workflow file is on `main`, it can also be started by hand with a test APK beside it.
  - **This PC:** `npm run android:build`, which makes `src-tauri/target/android/inmaa-pro-1.2.0.apk` (`docs/phone/ANDROID-BUILD.md`). It needs the release key in `~/.inmaa-android/`. **Never** install the `…-test.apk` on his phone: its window can be debugged over USB.
- We recommend a screen lock on the phone (a PIN or a fingerprint). The program's own password protects the program; the screen lock protects everything else.

### Install it

Either, with no PC at the centre:

1. Copy `inmaa-pro-1.2.0.apk` to the phone (USB cable in file-transfer mode, or a USB key with an adapter).
2. On the phone, open the Files app, tap the APK.
3. Android asks to allow «install unknown apps» for the Files app: allow it, go back, tap «Install».
4. Once installed, you may switch «install unknown apps» off again.

Or with a cable and adb (USB debugging on the phone: Settings › About › tap «Build number» seven times, then Developer options › USB debugging):

```sh
adb devices
adb install -r src-tauri/target/android/inmaa-pro-1.2.0.apk
```

Switch USB debugging off afterwards.

### Pair it

1. On the **director's laptop**, signed in as the director: Settings › المزامنة › «إضافة هاتف المدير». A 20-character code appears, in groups of four, valid 30 minutes, once. (The button is not offered while the centre already has a phone: remove the old one first with «إزالة جهاز».)
2. On the **phone**, open «Inmaa Pro». Its first screen offers only «الانضمام إلى مركز موجود» (a phone never starts a centre).
3. Type the mailbox address (the same as on the laptops) and the code. A typo in the code is caught before anything is sent.
4. The phone downloads the centre (a few minutes on mobile data; better on Wi-Fi), installs it and opens on the sign-in window.
5. The director picks his name and types **his usual password**. Only accounts with the manager's role are listed and accepted on the phone.
6. Android asks once whether «إنماء برو» may send notifications: answer **Allow** (the program's alerts: contracts ending, payments due, sync problems).

### Check it works

1. On the phone, register something small (for example a worker's phone number corrected, or a note on a file). Within a minute, on the director's laptop, Settings › المزامنة shows the phone among «أجهزة المركز» with its last contact, and the change is there; the assistant's laptop shows it too after its next round.
2. On a laptop, change something; open the app on the phone (or bring it back to the front): it syncs at once and shows the change.
3. Settings › المزامنة on a laptop lists three devices: two «حاسوب» and one «هاتف المدير».

### What the director should know

- The phone syncs **while the app is open** (when opened, after each save, then every 15 to 60 seconds). Android stops apps in the background; opening the app is enough to catch up.
- **Printing, backups and saving copies are done from a laptop.** A sheet can be looked at on the phone; its print button says «تُطبع من الحاسوب».
- **Invoices, receipts and payments are issued from a laptop.** The books never go to the phone (`docs/phone/DECISION.md` section 6): money must never exist only on a device that is easily lost. On the phone he approves, answers, registers, corrects and follows everything else.
- **If the phone is lost or stolen:** on a laptop, Settings › المزامنة › «إزالة جهاز», choose the phone, type the reason. Its access to the mailbox is revoked at once and the centre key is replaced. Pairing codes made before the removal no longer work; make a new one. A new phone then joins as in "Pair it" above.
- **Updating the app later:** install the new APK over the old one, signed with the same key; the data stays. If the release key is ever lost, the app must be removed and the phone paired again (nothing is lost on the centre's side).

## 5. If something goes wrong

| The program shows | What it means | What to do |
|---|---|---|
| «حدّث البرنامج على هذا الجهاز», or «هذا البرنامج أقدم من أن يتبادل مع صندوق البريد…» | this device's program is older than the mailbox | install 1.2.0 on it |
| «غير متصل» and a number of changes waiting | no internet on this device, or the mailbox cannot be reached | nothing: they go when the network returns |
| «تعذّر الوصول إلى صندوق البريد» on a device whose internet works | the line filters the mailbox's addresses and the program is older than this fallback, or the line filters Cloudflare's resolver too | make sure the device has the 1.2.0 of 2026-11-02 or later; if it persists, a domain of your own on Cloudflare for the mailbox (section 1) |
| «الخدمة بلغت حدّها اليومي» | the free plan's daily allowance is spent | nothing: it resumes after 01:00 |
| «هذا الرمز مُعدّ لحاسوب…» on the phone | a laptop's code was typed on the phone | make the code with «إضافة هاتف المدير» |
| the phone refuses the assistant's account | by design: only the manager's role signs in on the phone | |
| «ساعة هذا الجهاز غير مضبوطة» | the device's clock is more than two minutes off the mailbox's | set the date and time automatically in the phone's or PC's settings |

`npx wrangler@4 tail`, from `relay/`, shows the mailbox's requests as they arrive (paths and statuses only; it never logs a body).
