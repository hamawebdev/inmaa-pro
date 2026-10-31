# The director's phone: the build brief

For the phone team. Read `docs/phone/DECISION.md` first: it is binding. Then `docs/sync/DECISION.md` and `docs/sync/BUILD.md` (the sync this extends), and the last section of `CLAUDE.md` ("How this codebase works"), whose conventions all hold: services over `(ex, ctx, input)`, `action`, the log, three languages, the academy's look, logical classes, `<Ltr>`, no native pickers.

Branch: `phone-app` (from `sync-two-laptops`). The coordinator commits; nobody else runs a git command that writes (no add, commit, stash, reset, checkout, restore, clean, switch, worktree) or that uses the network (fetch, pull, push). `git diff`, `git show`, `git archive` and `git log` are fine.

`CLAUDE.md`'s six-teammate table does not apply to this work: the table below replaces it. The network is available to us (not to the program): cargo may fetch crates, and tools may be installed **outside this folder** (the Android SDK, a JDK, wrangler, cloudflared). `npm install` is still never run in this folder; if you truly need an npm package in the program, ask the coordinator first.

## 1. The team and its files

| Teammate | Job | Owns |
|---|---|---|
| **android** | The program builds, installs and runs on Android: the toolchain (outside the repo), `src-tauri` for Android, the generated Android project and its manifest, signing, the APK, the emulator, the npm scripts, version 1.2.0 | `src-tauri/**` except `src-tauri/migrations/**`; `src-tauri/gen/android/**` (new); `package.json` (scripts and version only); `vite.config.ts`; `.gitignore`; `scripts/android/**` (new); `src/lib/offline.test.ts`; `src/lib/bindings.ts` (generated; only android runs `cargo test --lib`); `docs/phone/ANDROID-BUILD.md` (new) |
| **sync** | Sync with three devices: the mailbox (two laptops and a phone, protocol 2, deletion when every device applied), migration 0006, the device kind, pairing and joining as a phone, blocks by thirds, the books among three, removing the phone, the status listing three devices, the three-copy test harness; the Cloudflare deploy steps | `relay/**`; `prisma/**`; `scripts/db/**`, `scripts/generate-db-types.mjs`, `scripts/verify-db.mjs`; `src/lib/db/**` (generated); `src-tauri/migrations/**`; `src/lib/sync/**`; `src/lib/numbering/**`, `src/lib/chain/**`, `src/lib/daily/**`; `src/server/sync.ts`; `src/testing/sync/**`, `src/testing/scenarios/sync/**`, `src/testing/database.ts`, `src/testing/rows.ts`, `src/testing/table-shapes.ts`, `src/testing/fixtures/**`; `docs/data-model/**` |
| **shell** | The program's frame on a phone: the device signal, the bar with «المزيد», safe areas, the shared components at phone width (screen, tabs, table, dialog, pickers, cards, print preview), the sign-in and join windows on a phone, the manager-only rule, the sync screens with the phone, what the phone does not do (section 6 of the decision), the home screen's order on a phone, the harness's `--phone`; every text in three languages | `src/components/**`; `src/hooks/**`; `src/navigation/**`; `src/i18n/**`; `src/index.css`; `src/main.tsx`; `src/routes.tsx`; `index.html`; `public/**`; `src/lib/access/**`; `src/lib/device/**` (new); `src/features/core/**`; `src/features/sync/**`; `src/pages/dashboard/settings/**`, `src/pages/dashboard/home/**`, `src/pages/dashboard/layout.tsx`, `src/pages/not-found.tsx`, `src/pages/route-error.tsx`; `scripts/harness/**` |
| **screens** | Every other page reads well at phone width (412×915 and 360×800), the five most-used areas first (decision section 5): requests and files, money, workers, then employees and stock; desktop sizes unchanged | `src/pages/dashboard/**` except what shell owns; the screen components inside `src/features/{people,clients,operations,money,stock}/` (`.tsx` files that are not `sheets/`); the `messages/*.json` of those folders when a page needs a new short label |
| **verifier** | Proves it: the desktop baseline before anything changes and the comparison after; the scenario tests with three copies (every case of the sync decision with the phone in it, no number twice, chains on three copies); the live test (the real APK on an emulator, the real Worker code, a laptop copy, changes both ways); the final gates; `docs/phone/VERIFY.md` and the deploy steps in `docs/phone/HANDOVER.md` | `src/testing/scenarios/phone/**` (new); `scripts/e2e/**` (new); `docs/phone/VERIFY.md`, `docs/phone/HANDOVER.md` (new) |
| **coordinator** | `docs/phone/DECISION.md`, this brief, `CLAUDE.md`, `docs/scope.md`, `docs/sync/**`; commits; arbitration | |

A file not listed: ask the coordinator. A change needed in someone else's file: message its owner with the exact change (`SendMessage`), copy the coordinator, and carry on with the rest. Several teammates work in this folder at once: judge your work by your own files, type-check and read only your errors, lint and test your own paths, stop every process you start, delete nothing you did not create.

## 2. The contracts

Change one only by agreement with every teammate it names, and tell the coordinator.

### 2.1 The device kind (sync, shell, android)

- Database: `SyncDevice.kind` text, `LAPTOP` or `PHONE`, and `slot IN (0, 1, 2)`; slot 2 is the phone's (migration 0006, sync).
- Services: `thisDeviceKind(ex): Promise<"LAPTOP" | "PHONE" | null>` in `src/lib/sync/device.ts` (sync; null before sync is set up or joined). A service decides by this, never by the platform: tests run under Node.
- The window: `useDevice(): { isPhone: boolean; platform: string }` in `src/lib/device/` (shell), from `@tauri-apps/plugin-os`'s `platform()` (`"android"`), so the first screen knows it is a phone before any join. The harness's `--phone` makes it answer android.
- Layout follows the **width** (Tailwind's `md:` breakpoint, 768 px), not the device. What the phone may do follows the **device**.

### 2.2 Pairing and joining (sync, shell)

- `pairDevice(env, ctx, { kind: "LAPTOP" | "PHONE", … })` replaces or extends `pairSecondLaptop`; the ticket says which kind it is for. `joinCentre` (or `redeemAndDownload`) takes the joining device's kind; the mailbox refuses a phone on a laptop ticket and the reverse, with a typed failure the window can word.
- The phone's first screen offers only «الانضمام إلى مركز موجود» (shell); its sign-in window lists manager accounts only.
- `PHONE_ROLES` (`src/lib/access/`, shell) holds `[MANAGER_ROLE]`. The sign-in service (`src/features/core/services/sign-in.ts`, shell) refuses any other role when `thisDeviceKind(ex) === "PHONE"`, with an `Errors` sentence in three languages.

### 2.3 The mailbox protocol (sync, android)

- Every request carries `x-inmaa-protocol: 2`; the mailbox answers a missing or lower version with 426 and code `UPDATE_REQUIRED`; the relay client maps it to a typed failure (`RelayOutdated`) and the status to «حدّث البرنامج على هذا الجهاز». If the header has to be set in Rust (`src-tauri/src/sync/http.rs`), sync asks android for the exact line.
- At most two active laptops and one active phone per centre. An envelope is deleted when every active device has acknowledged it (plus the full-copy and 90-day rules).

### 2.4 Android native (android, sync, shell)

- Every Tauri command the window calls today exists on Android with the same name and behaviour, except those the phone does not do (decision section 6: backup, restore, saving a copy outside, printing), which answer with an error the window never reaches because shell hides their buttons on a phone.
- `sync_install_copy` works on Android: the received copy replaces the database, and the program starts again on it (a process restart, or closing and reopening the connection and reloading the window; android chooses and documents).
- The vault, the anchor and the database live in the app's private storage. `android:allowBackup="false"`. Permissions: `INTERNET`, `ACCESS_NETWORK_STATE`, `POST_NOTIFICATIONS`. Clear text refused.
- The content security policy is the desktop's. The window's network rules (`src/lib/offline.test.ts`) are unchanged; the test learns about the Android project (no network plugin, no extra permission).
- Commands: `npm run android:dev` (emulator), `npm run android:build` (the signed release APK), `npm run android:build:test` (adds `x86_64`). The toolchain's paths are read from the environment (`ANDROID_HOME`, `NDK_HOME`, `JAVA_HOME`) and documented.
- When the app comes back to the foreground or the network returns, the window is told (an event or `visibilitychange` / `online`), so the sync loop runs at once (sync wires the loop, shell or android the signal; agree between you).

### 2.5 The harness (shell, screens, verifier)

`npm run shot -- --phone --route … --locale ar` shoots at 412×915 with the platform answering android and touch on; `--size 360x800 --phone` for a small phone. Everyone else uses it as soon as it exists; until then, `--size 412x915`.

### 2.6 Desktop unchanged (shell, screens, verifier)

Before any UI file changes, the verifier shoots the baseline: every tab and the main detail pages, Arabic light and dark, at 1440×900 and 1024×640, from the committed tree (use `git archive HEAD` into a scratch folder; do not touch the working tree). Shell and screens may start editing UI files once the verifier says the baseline is taken (it should be the verifier's first task; a short message will come). At the end the same shots from the working tree are compared pixel by pixel; any difference is a bug unless it is listed and explained in `VERIFY.md`.

## 3. Order of work

1. **Everyone**, first hour: read the two decisions, this brief and the code you own; send questions on contracts to the teammate concerned.
2. **android** starts the toolchain downloads at once (they are long), outside the repo; put big things on `/mnt/data` (the root disk has about 20 GB free): for instance the SDK in `/mnt/data/android/sdk` linked from `~/Android/sdk` (where `ANDROID_HOME` already points) and the JDK linked from `~/opt/jdk-17` (where `JAVA_HOME` points).
3. **verifier** takes the desktop baseline first, then writes the three-copy scenarios as soon as sync has the three-copy harness, and prepares the live rig.
4. **sync**: migration 0006 first (others depend on it), the three-copy harness second, then the rest.
5. **shell**: the device signal and the harness's `--phone` first, then the bar and the shared components, then the phone's rules and screens.
6. **screens**: survey every route at phone width with `--size 412x915` (do not edit until the baseline is taken), send shell the problems that belong to a shared component, then fix pages.

## 4. Done

- The release APK builds and is signed; it installs and opens on an Android emulator (and the steps to install it on a real phone are written); the director signs in; the phone pairs with a laptop; a change on the phone reaches the laptops and a change on a laptop reaches the phone, through the real mailbox code.
- Every case of the sync decision section 7 has a passing test with three copies where the phone changes the outcome; no invoice, receipt or ordinary number is issued twice across three devices; the chains verify on all three.
- The desktop sizes are unchanged (the comparison passes or every difference is explained).
- `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm test`, `npm run build`, `npm run csp:check`, `npm run db:verify`, `cargo test --lib --offline` all pass; the desktop binary opens with no network (`unshare -rn`).
- The Cloudflare deploy is the only thing left, and `docs/phone/HANDOVER.md` gives its steps.

## 5. Report

End each task with a message to the coordinator: what you built, what you ran and its result (pasted briefly), what is not done, what you need from whom. Say plainly what does not work. Then wait for the next message.
