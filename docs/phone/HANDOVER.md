# The director's phone: what is left for you

For the developer. Everything else is built and checked (`docs/phone/VERIFY.md`). What is left needs your Cloudflare account and the director's real phone, which we do not have here:

1. Deploy the mailbox on Cloudflare (once, about twenty minutes).
2. Publish the 1.2.0 Windows installer (push and run the workflow; nothing was pushed from here) and install it on both laptops.
3. Set sync up on the director's laptop, then add the assistant's laptop.
4. Install the APK on the director's phone and pair it.
5. Check that a change goes both ways.

Nothing you create here goes into the repository: not the mailbox address, not the setup key, not your account id, not the release key.

## 1. Deploy the mailbox

The full steps, with what each command prints, are in `relay/README.md`. In short, from the repository's `relay/` folder, on a computer with internet and Node.js 20 or later:

```sh
npx wrangler@4 login                 # the browser opens on Cloudflare: Allow
npx wrangler@4 whoami                # prints your e-mail and account
npx wrangler@4 deploy                # prints the address: https://inmaa-relay.<your-name>.workers.dev
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # the setup key: write it down
npx wrangler@4 secret put SETUP_KEY  # paste it
npx wrangler@4 secret list           # lists SETUP_KEY
```

Check it answers (on Windows PowerShell write `curl.exe`):

```sh
curl -i -H "x-inmaa-protocol: 2" https://inmaa-relay.<your-name>.workers.dev/v1/time
#   200, a line x-relay-time: …, and {"now":…}
curl -i https://inmaa-relay.<your-name>.workers.dev/v1/time
#   426 with x-relay-error: UPDATE_REQUIRED (an older program is refused)
curl -i -X POST -H "x-inmaa-protocol: 2" -H "x-setup-key: wrong" -d '{"deviceName":"test"}' \
  https://inmaa-relay.<your-name>.workers.dev/v1/centres
#   403 with x-relay-error: SETUP_KEY
```

These three answers were seen from the same Worker code running locally in Cloudflare's runtime and reached over real HTTPS (`docs/phone/VERIFY.md`, "The live test"); on your account they should be identical.

Keep the **mailbox address** and the **setup key** on paper. Back the setup key up together with the folder `~/.inmaa-android/` (the phone's release key, section 4).

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
- The signed release APK: `npm run android:build` on your PC makes `src-tauri/target/android/inmaa-pro-1.2.0.apk` (`docs/phone/ANDROID-BUILD.md`). It needs the release key in `~/.inmaa-android/`. **Never** install the `…-test.apk` on his phone: its window can be debugged over USB.
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
- He may take the books on the phone («طلب الدفاتر») to issue an invoice or record a payment away from the office; the originals print from a laptop once the books are back there.
- **If the phone is lost or stolen:** on a laptop, Settings › المزامنة › «إزالة جهاز», choose the phone, type the reason. Its access to the mailbox is revoked at once and the centre key is replaced. If it held the books, he types the last invoice and receipt numbers he saw on paper. A new phone then joins as in "Pair it" above.
- **Updating the app later:** install the new APK over the old one, signed with the same key; the data stays. If the release key is ever lost, the app must be removed and the phone paired again (nothing is lost on the centre's side).

## 5. If something goes wrong

| The program shows | What it means | What to do |
|---|---|---|
| «حدّث البرنامج على هذا الجهاز», or «هذا البرنامج أقدم من أن يتبادل مع صندوق البريد…» | this device's program is older than the mailbox | install 1.2.0 on it |
| «غير متصل» and a number of changes waiting | no internet on this device, or the mailbox cannot be reached | nothing: they go when the network returns |
| «الخدمة بلغت حدّها اليومي» | the free plan's daily allowance is spent | nothing: it resumes after 01:00 |
| «هذا الرمز مُعدّ لحاسوب…» on the phone | a laptop's code was typed on the phone | make the code with «إضافة هاتف المدير» |
| the phone refuses the assistant's account | by design: only the manager's role signs in on the phone | |
| «ساعة هذا الجهاز غير مضبوطة» | the device's clock is more than two minutes off the mailbox's | set the date and time automatically in the phone's or PC's settings |

`npx wrangler@4 tail`, from `relay/`, shows the mailbox's requests as they arrive (paths and statuses only; it never logs a body).
