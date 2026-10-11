# Reference: lock, activation, backup, printing

Root `/mnt/data/academy-system-desktop`; paths are relative to it. Nothing was run; print and PDF behaviour is read from code, not observed.

## 1. Who is the user

- **No accounts, logins or roles.** `src/server/tenant.ts:12,27-41` returns a constant session (`LOCAL_ADMIN_ID = "local-admin"`, role `ADMIN`). The row is seeded in `src-tauri/migrations/0002_seed.sql` with an empty `password`. `src/lib/permissions.ts:34-36` `can()` always returns `true`; `DASHBOARD_MODULES` is kept only so ported call sites compile.
- **`src/lib/auth.ts`** is one optional manager password plus a recovery code.
  - PBKDF2-SHA256 via Web Crypto, 600,000 iterations, 16-byte salt (`:24-33`), stored as `pbkdf2-sha256$1$600000$<salt>$<hash>` (`:67-71`).
  - Kept in the `Setting` table under `manager_password_hash` and `manager_recovery_hash` (`src/server/actions/settings.ts:21-25`).
  - Minimum length 6 (`:22`). The recovery code is 16 digits, shown once (`:116-132`), and using it clears the password.
  - Exports: `isPasswordSet`, `verifyPassword`, `verifyRecoveryCode`, `createPassword`, `changePassword`, `clearPassword`, `regenerateRecoveryCode`.
  - The file calls itself "accountability, not hard security" (`:10-14`): the database is unencrypted.
- **What is locked: whole navigation sections.** `src/lib/lockable-sections.ts:34-41` lists students, staff, attendance, classes, finance, settings. `overview` can never be locked (`:23`). The default is `["staff","finance","settings"]` (`:61`), stored as JSON in `Setting.locked_pages`; malformed JSON falls back to the defaults (`:76-87`).
- **Gate:** `src/components/security/route-gate.tsx:30-58` wraps `<Outlet/>` (`src/pages/dashboard/layout.tsx:76-78`). No password means open; `unlocked` means open; section not listed means open; otherwise `<LockScreen/>` renders instead of the page, so the page never mounts.
- **Unlock:** `src/components/security/lock-screen.tsx:44-80`, by password or recovery code, with no attempt limit. One unlock opens every section until the process exits (`src/stores/unlock-store.ts:23-27`, deliberately not persisted).
- **Re-lock:** "LockNow" in `src/components/lock-menu.tsx:53`, mounted at `src/components/bottom-nav.tsx:145`. The same menu opens the section picker (`lock-settings.tsx:51-73`), which asks for the password first and saves each tick immediately (`:153-169`).
- **Password dialogs:** `password-dialogs.tsx:50,130,257,375,486`.

## 2. Activation

- **Trial:** `TRIAL_DAYS = 7` (`src-tauri/src/license/secret.rs:42`). It counts consumed milliseconds, not dates. `state.rs:245-263` `advance` credits `max(wall delta, monotonic)` and `last_wall` never falls. The ticker runs every 60 s (`mod.rs:55`, `lib.rs:102-126`) and flushes every 5 min (`mod.rs:63`).
- **Startup (`lib.rs:198-223`):** capture `db_existed` before `db::init`, call `license::evaluate`, then build the `lock` window if `Expired`, else `main`. Both windows are `"create": false` in `tauri.conf.json:13-34`.
- **Second wall:** every app command opens with `crate::license::guard(&app)?` (`mod.rs:206-219`; `db.rs:171,190,207,219`; `backup.rs:47,75`). Only `license_status`, `license_unlock` and `license_restart` are unguarded (`lib.rs:45-50`). New commands must add the guard.
- **Device ID (`device.rs:26-44`):** first 16 hex characters of `SHA256("device-v1:" ‖ SECRET ‖ machine-id)`, shown as `XXXX-XXXX-XXXX-XXXX`. The machine id on Windows is HKLM `SOFTWARE\Microsoft\Cryptography\MachineGuid`, then `ProductId`, then `COMPUTERNAME` (`:54-94`); on Linux `/etc/machine-id` (`:103-120`).
- **Code (`code.rs:39-52`):** `HMAC-SHA256(SECRET, "unlock-v1:" ‖ UPPER(device_id))`, first 16 bytes mapped `% 32` into `0123456789ABCDEFGHJKMNPQRSTVWXYZ`, grouped 4×4. `verify_code` normalises case, hyphens, O→0, I/L→1, U→V and Arabic-Indic digits (`:92-113`). Codes are lifetime, per machine, stored nowhere, with no attempt limit.
- **Record (`state.rs:138-157`):** `LICENSE_V1|device|started_at|elapsed_ms|last_wall|tamper|status|unlocked_at|<hmac>`. A wrong MAC, device or version is rejected (`:165-220`).
- **Vault, six anchors:**
  - Windows (`vault/windows.rs`): HKCU `Software\Classes\CLSID\{7A04CEF6-2FF8-4E45-A4D3-772AC0F70CA8}\Cfg`, value `Data` (`:20,32`); HKLM `SOFTWARE\Microsoft\Windows NT\CurrentVersion\SvcData` (`:39`); `%ProgramData%`, `%APPDATA%` and `%LOCALAPPDATA%` each with `\Microsoft\MsSvcHost\state.dat` (`:82-93`).
  - Database: table `_license`, row `key='record'` (`vault/db.rs:47,68-78`).
  - Linux (dev): `linux.rs:49-59`.
  - `vault::load` (`vault.rs:78-103`) merges least-generously (`state.rs:274-298`) and `Unlocked` wins. Zero OS anchors with an existing database gives `wiped` (locked); zero with no database gives a fresh trial.
- **Lock window:** `lock.html` → `src/lock/main.tsx` → `src/lock/lock-app.tsx`. It is a separate Vite entry (`vite.config.ts:26-33`) with capability `capabilities/lock.json` (`core:default` only). It shows the phone, the Device ID and a code field, and calls `licenseRestart()` 1.6 s after success (`:59`). Theme and locale come from localStorage (`lock.html:19-47`, default locale `en`).
- **In-app:** `settings/_components/license-card.tsx` and `activate-dialog.tsx:69` use the same command with no restart. `src/hooks/use-license.ts` refetches every 60 s.
- **Generator:** `src-tauri/src/bin/unlock_code.rs:23-41`, run as `cargo run --quiet --bin unlock-code -- <DEVICE-ID>`; it prints `device :` and `unlock :`. It is not bundled because `default-run = "academy-manager"` (`Cargo.toml:9,16-18`).
- **Secrets:** only `src-tauri/src/license/secret.rs` (`SECRET` `:36-38`, `CONTACT_PHONE` `:55`). There are no `.env` or key files. `docs/licensing.md` repeats the phone number. The repo must stay private.

### What a new product must change

| What | Where | Why |
|---|---|---|
| `SECRET` (new random value) | `secret.rs:36-38` | Feeds the Device ID (`device.rs:31`), codes (`code.rs:40`) and signatures (`state.rs:304`). This alone makes academy codes useless. |
| `CONTACT_PHONE`, `TRIAL_DAYS` | `secret.rs:55,42` | Terms of the offer. |
| `ANCHOR_NAME`, `HKCU_PATH` GUID, `HKLM_PATH` | `vault.rs:45`; `vault/windows.rs:32,39` | Mandatory. With shared anchors the two apps overwrite each other, and the loser reads zero valid OS anchors with a database present and locks (`vault.rs:94-99`). |
| `identifier`, `productName`, window titles | `tauri.conf.json:5,3,16,25` | The identifier sets the app-data directory holding the database and `uploads/`. `identifier-problem.md` records a real collision from a shared identifier. |
| Package name, `default-run`, lib name | `Cargo.toml:2,9,24`; `main.rs:5`; `bin/unlock_code.rs:23` | So the generator links the new library. |
| `academy.db` (optional rename) | `db.rs:69`; `backup.rs:52,84,91`; `license/mod.rs:331` | Hard-coded in four files. |
| Cosmetic | `ACADEMY_LICENSE_*` (`mod.rs:350-365`); `academy-backup-` (`src/server/actions/backup.ts:43`); `src/config/app-config.ts`; `lock.html:7,19`; seed names | Product naming. |

## 3. Backup and restore

- **Manual only;** no scheduler was found. The UI is `settings/_components/backup-card.tsx`: "Back Up Now", and "Restore" behind an `AlertDialog`.
- **Backup (`src/server/actions/backup.ts:38-57`):** a save dialog with default name `academy-backup-<timestamp>.db`, then `db_checkpoint` (`PRAGMA wal_checkpoint(TRUNCATE)`, `db.rs:206-213`), then `backup_to`.
  - `backup.rs:44-62` copies `<app_data>/academy.db` to the chosen path and `uploads/` recursively to a sibling folder `<stem>-uploads` (`:37-40`).
- **Format:** a plain SQLite file plus a plain folder. There is no zip, encryption, checksum or version stamp.
  - Included: all tables, so also the password hashes, `locked_pages`, branding and `_license`.
  - Not included: localStorage theme and locale, and the OS licence anchors.
- **Restore (`:59-79`, `backup.rs:68-109`):** an open dialog, then overwrite `academy.db`, delete `-wal` and `-shm`, replace `uploads/` if the sidecar folder exists, then `relaunch()`. The chosen file is not validated. Migrations run at next start (`db.rs:93`).
- **Risk:** the user must keep the `.db` and the `-uploads` folder together.

## 4. Printing

- **Every print button calls `window.print()`.** The sites are:
  - `students/[id]/card/_components/print-button.tsx:10`, shared by the four card pages (students, teachers, employees, rent-teachers `…/card/page.tsx`);
  - `print-receipt-button.tsx:11`, `payment-history-table.tsx:135`, `payout-history-table.tsx:101`, `payout-form.tsx:132`, `income-tab.tsx:146`, `reset-income-dialog.tsx:119`;
  - `finance/_components/shared/finance-data-table.tsx:61`.
- **No Tauri print call was found.** `core:webview:allow-print` is granted (`capabilities/default.json:17`) but nothing invokes it.
- **`PrintLayout`, `PrintHeader` and `PrintFooter` (`src/components/print/*`) are imported nowhere.** They are dead code: a wrapper div (`.print-layout` plus `.print-portrait` or `.print-landscape`), a header (academy name, title, `dd/MM/yyyy`, `hidden print:flex`) and a signature-line footer.
- **Real templates:** `src/components/card-template.tsx` and the `*-receipt.tsx` files, using literal `bg-white` plus `print:` utilities.
- **CSS (`src/index.css:726-785`):**
  - `@page print-portrait{size:portrait}` and `print-landscape`, named pages that only `.print-layout` uses.
  - No A4 size and no margins, so the print dialog's defaults apply.
  - `@media print` hides `header, nav, button, .no-print` with `!important`, forces the body white and black, and sets `html, body, #root, [data-app-shell], [data-app-main]` to `height:auto; overflow:visible; display:block`.
  - `print-color-adjust` is not set.
- **Isolation is weak.** The live route is printed with chrome hidden; there is no separate window, route or iframe.
  - `ScreenHeader` is a `<div>` and its back link an `<a>` (`src/components/screen.tsx:114-124`), so the title and back link are not hidden by these rules.
  - Receipts print from inside a `Dialog` with no rule hiding the page behind.
  - Dark-theme tokens are not reset beyond `body`.
- **Fonts:** bundled `@fontsource` (`index.css:9-14`): Geist Variable, Geist Mono and IBM Plex Sans Arabic 400-700. The RTL rule is at `:620-632`. `<html dir/lang>` is unchanged when printing, so RTL carries over.
- **Branding:** `src/server/branding.ts:12-23` `getCurrentAdminBranding()` reads `User.name`, `academyName` and `logoUrl` (query key `["branding"]`) and passes them as props.
  - The logo goes through `AdminLogoMark` → `useUploadSrc` → `convertFileSrc` (`src/server/uploads.ts:133-141`; asset scope `$APPDATA/uploads/**`, `tauri.conf.json:39-42`).
  - There is no address field. `User.phone` exists but is not read.
  - It is written by `src/server/actions/branding.ts:16-69`.

### To print an A4 right-to-left Word-style form

1. Build a dedicated sheet component (reuse `PrintLayout`), previewed on screen as a white 210×297 mm box.
2. Add `@page { size: A4 portrait; margin: … }`.
3. Hide everything but the sheet: `print:hidden` on `ScreenHeader`, or `visibility:hidden` on all but `.print-sheet`. Do not print from a dialog.
4. Use real `<table>` elements with `border-collapse:collapse`, 1px black borders, mm/pt sizes, and `break-inside:avoid` on rows.
5. Do not use `ui/checkbox` for checkboxes. It is a Radix `<button>` (`src/components/ui/checkbox.tsx:22`) and the print rule removes it. Draw a bordered `<span>` or SVG box with a tick.
6. Keep `<header>`, `<nav>` and `<button>` out of the sheet.
7. Put `dir="rtl" lang="ar"` on the sheet root so it is Arabic whatever the UI language, and wrap numbers and phones in `dir="ltr"`.
8. Use literal black and white, plus `print-color-adjust: exact` for any shaded cells.
9. Add address, phone and registration fields to branding.
10. If the Word template needs a specific Arabic font, bundle the file locally.

**PDF:** no PDF library is in `package.json` or `Cargo.toml`. Saving to PDF is possible offline only through the OS print dialog (a PDF printer or "print to file"), driven by the user. Programmatic export was not found.

## 5. Settings screen (`src/pages/dashboard/settings/page.tsx:55-79`)

| Card | Stores |
|---|---|
| `AcademyIdentityCard` | `User.academyName`, `User.name`, `User.logoUrl`; logo file in `uploads/` (jpeg, png or webp, up to 5 MB); explicit Save |
| `LanguageCard` | en, ar, fr; localStorage `locale` (read at `lock.html:44`; the write path was not traced) |
| `AppearanceCard` | light, dark, system; localStorage `theme_mode` |
| `AcademicYearCard` | read-only |
| `ClassroomsCard` | `Setting.classroom_count` |
| `ManagerPasswordSection` | the two hashes |
| `LockSettingsCard` | `Setting.locked_pages` |
| `BackupCard` | nothing |
| `LicenseCard` | nothing; shows state, Device ID and Activate |
| System | `APP_CONFIG.name` and version, OS `platform()` and `version()` |

`src/server/actions/setup.ts` only returns counts (`getSetupStatus`). No first-run wizard was found in the files read.

## 6. QR

- **Token:** 64 hex characters from `crypto.getRandomValues` (`src/lib/qr-token.ts:6-10`), stored in the `QrToken` table per role (`STUDENT`, `TEACHER`, `EMPLOYEE`, `RENT_TEACHER`) and `referenceId` (`src/server/actions/qr-tokens.ts:45-78`). It is created lazily when a card page opens (`students/[id]/card/page.tsx:27-36`) and drawn by `src/components/qr-code-display.tsx` (the `qrcode` package, literal black on white) on the printed ID card.
- **Listener:** `src/components/qr-scan-listener.tsx`, mounted once at `layout.tsx:58`. It is a document-level key listener for USB or Bluetooth HID scanners: hex bursts under 50 ms apart, claimed after 6 characters, complete at 64, then `processQrScan` records staff check-in or check-out, or student attendance. There is no camera.
- It is academy-specific; keep it only if the cleaning company wants badge attendance.

## 7. Network

- **None found** in `src` or `src-tauri/src`: no `fetch`, no HTTP plugin, no updater (`lib.rs:162-166`), and fonts are bundled.
- `csp: null` (`tauri.conf.json:37`), so nothing blocks network use either.
- `tauri-plugin-opener` is registered (`lib.rs:184`) but never imported by the frontend.
- `http://academy.local` in `src/lib/uploads.ts:109-152` is only a URL-parsing base.
- The lock screen's `tel:` link (`lock-app.tsx:98-99`) hands off to the OS.
- Build-time only: the Vite dev server on `localhost:1420`, and `.github/workflows/release.yml` using `GITHUB_TOKEN`.
