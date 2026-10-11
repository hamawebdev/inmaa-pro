# Reference tooling: build, lint, tests, offline

REF = `/mnt/data/academy-system-desktop`. Nothing was built, installed or run in REF; "expected" means inferred from reading. One slip: I ran `git status --short` once. The tree is clean and the index unchanged, but the `.git/` directory mtime moved.

## 1. Commands, CI, bundle targets

| Task | Command | Source |
|---|---|---|
| Desktop dev | `npm run tauri dev` (starts `npm run dev`, Vite on fixed port 1420) | tauri.conf.json:7-8, vite.config.ts:40-42 |
| Type-check | `npx tsc --noEmit` (also the first half of `npm run build`) | ci.yml:20 |
| Lint | `npm run lint` = `eslint .` (warnings do not fail) | package.json:11 |
| Test | `npm test` = `vitest run`; `npm run test:watch` | package.json:12-13 |
| Format check | `npm run format:check` = `prettier --check .`; fix with `npm run format` | package.json:14-15 |
| Web build | `npm run build` = `tsc && vite build`; two entries, `index.html` and `lock.html`, into `dist/` | package.json:8, vite.config.ts:26-32 |
| Desktop build | `npm run tauri build` (runs `npm run build`, bundles `../dist`) | tauri.conf.json:9-10 |
| DB | `npm run db:verify`, `npm run db:types` | package.json:16-17 |
| Rust | `cargo test --lib`, `cargo fmt --all -- --check`, `cargo clippy --all-targets -- -D warnings`, `cargo run --bin unlock-code -- <device-id>` | ci.yml:38-39, Cargo.toml:14-18 |

**CI** (`ci.yml`): job `frontend` (ubuntu-22.04, Node 20) runs `npm ci`, lint, format:check, `npx tsc --noEmit`, `npm test`, `npm run db:verify`. Job `rust` installs `libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf`, then cargo fmt check and clippy. No `cargo test`, no `tauri build`.

CI is expected to be red today (not run):
- **format:check**: no `printWidth` is set (so 80), but 94 of 354 TS files have multi-name imports wider than 80 columns (e.g. `src/i18n/provider.tsx:1`, 109 columns). The ported code is 120-column.
- **db:verify** imports `node:sqlite` (`scripts/verify-db.mjs:11`), which Node 20 lacks.
- Unsure: the clippy job never builds `dist`, which `generate_context!` reads.

**Release** (`release.yml`): on a `v*` tag or manually; macos-latest (aarch64 and x86_64), ubuntu-22.04, windows-latest; `tauri-apps/tauri-action@v0`; draft release named "Atelier <tag>" (line 61, leftover). Signing is commented out.

**Bundle targets**: `"targets": "all"` (tauri.conf.json:45), so whatever the host supports: Linux deb, rpm, AppImage; Windows msi, nsis; macOS app, dmg. No `bundle.windows`, `bundle.linux`, `webviewInstallMode` or `plugins` block.

## 2. This machine (Ubuntu 24.04.3, x86_64)

Present: node v24.13.0, npm 11.6.2, cargo and rustc 1.95.0 with clippy and rustfmt (plus the `x86_64-pc-windows-msvc` target), webkit2gtk-4.1 2.52.6, gtk+-3.0 3.24.41, libsoup-3.0 3.4.4, librsvg-2.0 2.58.0, javascriptcoregtk-4.1 2.52.6, ayatana-appindicator3 0.5.90, libxdo-dev, libssl-dev, build-essential. `REF/node_modules/.bin` has eslint, prettier, tsc, vite, vitest, tauri (CLI 2.11.2). `REF/src-tauri/target/debug/academy-manager` exists, so a debug build has worked here; there is no release build.

| Step | Runs here? |
|---|---|
| dev, tsc, lint, test, format, web build, db:verify | Yes (Node 24 satisfies eslint 10, vite 7, vitest 4, `node:sqlite`) |
| cargo build, test, clippy | Yes, and offline: all 613 crates in Cargo.lock are in `~/.cargo/registry/cache` |
| `tauri build`, deb | Expected yes |
| rpm | Unsure: `rpm` and `rpmbuild` are not installed |
| AppImage | Expected no offline: `patchelf` is missing and `~/.cache/tauri` is absent (the bundler downloads its tooling). Use `npm run tauri build -- --bundles deb` |
| Windows msi, nsis | No: `makensis`, `cargo-xwin`, `clang`, `lld`, `llvm-rc` are missing. Needs a Windows host or the release workflow |

The debug target is 12 GB; `/` has 19 GB free, `/mnt/data` 757 GB. The new project path contains spaces; unsure every bundler step tolerates that.

## 3. Starting a new project without touching REF

**Copy** (read-only on REF): `rsync -a --exclude node_modules --exclude dist --exclude src-tauri/target --exclude src-tauri/gen --exclude .git --exclude .claude --exclude .kilo REF/ NEW/`. Or `git clone --no-hardlinks REF NEW` and delete `NEW/.git` (429 tracked files, including `src/lib/bindings.ts` and both lockfiles).

**Leave**: `node_modules` (451 MB), `dist`, `src-tauri/target` (12 GB), `src-tauri/gen/schemas` (regenerated), `.git`. Not needed: `identifier-problem.md`, `scripts/codemod-next.mjs`, `public/tauri.svg`, `public/vite.svg`, `docs/` (keep `licensing.md` as a template).

**Keep unchanged**: `.npmrc` (`legacy-peer-deps=true`, line 9; without it `npm install` and `npm ci` fail on the @base-ui/react and date-fns peer), `package-lock.json` (lockfileVersion 3, 490 tarballs, all registry.npmjs.org), `src-tauri/Cargo.lock`, `components.json` (shadcn `new-york`, css `src/index.css`, lucide), and the eslint, prettier, editorconfig, tsconfig, vite and vitest configs.

**node_modules offline**: `~/.npm/_cacache` exists (1005 MB) but is not enough. 54 lockfile tarballs needed on linux-x64 are absent (vitest 4.1.10 and `@vitest/*`, kysely 0.28.17, use-intl 4.13.5, lucide-react 0.562.0, date-fns 3.6.0, qrcode 1.5.4, `@dnd-kit/*`, `@tanstack/react-table`, react-day-picker, `@fontsource/ibm-plex-sans-arabic`), so `npm ci --offline` would fail. Either run `npm ci` online once or `cp -a REF/node_modules NEW/`; the installed tree matches the lockfile exactly (413 of 413 linux packages) and holds linux-x64 binaries only. Any new npm dependency needs the network.

**Rename**:
- `package.json:2` name (and `package-lock.json:2,8`), version at line 4.
- `tauri.conf.json:3` `productName`, `:4` version, `:5` `identifier` (`com.hamawebdev.academy-manager`), `:16` and `:25` window `title`.
- `Cargo.toml:2` name, `:4` description, `:5` authors `["you"]`, `:9` `default-run`, `:24` lib `academy_manager_lib`; also `src-tauri/src/main.rs:5` and `src/bin/unlock_code.rs:23`.
- `index.html:7`, `lock.html:7` `<title>`; boot-script default locale `"en"` (`index.html:22`, `lock.html:19`).
- DB file `academy.db`: `db.rs:69`, `backup.rs:52,84,91`, `license/mod.rs:331`.
- Licensing must not collide with the academy app: `SECRET` (`license/secret.rs:36`), `ANCHOR_NAME = "MsSvcHost"` (`license/vault.rs:45`), `ACADEMY_LICENSE_*` switches (`license/mod.rs:350-365`).
- Display defaults: `src/server/tenant.ts:30`, `src/components/print/print-header.tsx:9`, `migrations/0002_seed.sql:19,25`.
- Icons: `src-tauri/icons/*` are stock Tauri art and `public/icons/favicon-32.png` is copied from them; regenerate with `npm run tauri icon <1024px.png>` (README:140-142).
- `release.yml:61`; `scripts/verify-db.mjs:26,32` and its hard-coded academy tables.

## 4. Run-time network

Searched `src/`, `src-tauri/src/`, `index.html`, `lock.html`, `tauri.conf.json`, capabilities.

| Pattern | Hits | Real connection? |
|---|---|---|
| `fetch(`, `XMLHttpRequest`, `WebSocket`, `EventSource`, `sendBeacon`, service worker | none | no |
| Rust `reqwest`, `ureq`, `hyper`, `TcpStream`, plugin-http, plugin-updater | none; only the comment at `lib.rs:162` on why the updater is absent | no. `reqwest` is in Cargo.lock only as tauri's Android/iOS dependency |
| `http://academy.local` | `src/lib/uploads.ts:109,120,137,152` | no, dummy base for `new URL()` |
| `http://localhost:1420` | `tauri.conf.json:8`; HMR `ws` on 1421 only with `TAURI_DEV_HOST` (`vite.config.ts:44-49`) | dev only, loopback |
| `https://` | `tauri.conf.json:2` (`$schema`), `src/lib/bindings.ts:4` (comment) | no |
| CDN fonts, analytics | none; fonts are bundled from `@fontsource` (`src/index.css:9-14`) | no |
| plugin-opener | `lib.rs:184`, `opener:default` (`default.json:8`); no JS import, no `openUrl` | never called |
| plugin-notification | `lib.rs:188`, `notification:default` (`default.json:12`); no JS import | never called |
| plugin-store, plugin-log | `lib.rs:189-190`; no JS import | local |
| `tel:` | `src/lock/lock-app.tsx:99` | hands to the OS dialer |
| `target="_blank"` | `media-upload-field.tsx:175`, `employees-table.tsx:170,193`, `teachers-table.tsx:269`, `expenses-table.tsx:169` | hrefs are stored uploads, resolved by `convertFileSrc` to the local asset protocol (`src/server/uploads.ts:141`); unsure how the webview handles the new window |

JS plugins actually imported: dialog and process (`src/server/actions/backup.ts:2-3`), fs (`src/server/uploads.ts:3`), os (`src/pages/dashboard/settings/page.tsx:2`).

**CSP**: `"csp": null` (tauri.conf.json:37), so there is no Content-Security-Policy. Offline holds by absence of network code, not by enforcement: `resolveUploadSrc` passes non-managed URLs through unchanged (`src/server/uploads.ts:135`), so an external URL stored in data would load.

Install time: `webviewInstallMode` is not set, so on Windows Tauri's default applies and the installer downloads WebView2 when the PC lacks it. Offline client PCs need an offline or fixed-runtime mode.

## 5. Tests

- Vitest 4.1.10, `environment: "node"`, `include: ["src/**/*.test.ts"]` (vitest.config.ts:17-18), so `.test.tsx` is not picked up. No jsdom, no Testing Library, no setup file. Pure-function unit tests only.
- 8 files, 130 cases by static count. The last cached run (`node_modules/.vite/vitest/.../results.json`, 6 Oct) shows all passing and 327 ms of summed test time; expect 1 to 3 seconds wall clock (estimate).

| File | Cases | Asserts |
|---|---|---|
| `src/data/subjects.test.ts` | 3 | subjects and labels per level |
| `src/i18n/code-labels.test.ts` | 24 | every stored code, including those in `0002_seed.sql`, has an en/ar/fr label |
| `src/i18n/errors.test.ts` | 10 | every error string in server actions and validators has a catalogue entry |
| `src/lib/finance/calculations.test.ts` | 6 | money rounding in cents, debt signs, daily aggregation |
| `src/lib/license.test.ts` | 8 | licence state narrowing, remaining days and hours |
| `src/lib/lockable-sections.test.ts` | 12 | parse and serialize locked sections, safe defaults |
| `src/messages/messages.test.ts` | 7 | ar and fr match en's keys and ICU arguments, no empty values |
| `src/navigation/sections.test.ts` | 60 | 49 routes map to the right section and tab; registry integrity |

- `errors.test.ts` imports `@formatjs/icu-messageformat-parser`, which is not in package.json (hoisted from use-intl).
- **DB**: Vitest never touches it. `npm run db:verify` applies the real `0001_init.sql` and `0002_seed.sql` to a temp file with `node:sqlite` and runs 20 Kysely checks (seed, round-trip, joins, Arabic search, upsert, rollback, commit, foreign keys). It does not cover the IPC bridge or `db.rs`.
- **Rust**: 41 `#[test]` (`license/tests.rs` 31, `license/vault.rs` 9, `lib.rs` 1 = `export_bindings`, which writes `src/lib/bindings.ts`). Not in CI.
- **End-to-end or UI harness**: not found.

## 6. Lint and TypeScript

ESLint 10 flat config, TS and TSX only; ignores `dist`, `src-tauri`, `src/lib/bindings.ts`.
- `js.configs.recommended` + `tseslint.configs.recommended` (not type-aware): `no-explicit-any` and `ban-ts-comment` are errors.
- `@typescript-eslint/no-unused-vars` is an error; only `_`-prefixed names are exempt (eslint.config.js:30-37).
- eslint-plugin-react-hooks 7.1.1 `recommended`, which includes the React Compiler rules. Errors: `rules-of-hooks`, `use-memo`, `preserve-manual-memoization`, `immutability`, `globals`, `refs`, `error-boundaries`, `purity`, `set-state-in-render`. Warnings: `exhaustive-deps`, `incompatible-library`, `unsupported-syntax`, plus `static-components` and `set-state-in-effect`, downgraded at lines 43-44. `refs` and `purity` are the likely surprises (reading `ref.current` or calling `Date.now()` during render).
- `react-refresh/only-export-components` warns (`allowConstantExport`).
- `src/components/ui/**` (vendored shadcn) has those three rules off.
- No import-order, restricted-import or a11y rules. Only 2 `eslint-disable` comments in `src`.
- Prettier: semicolons, double quotes, `trailingComma: all`, 2 spaces, width 80, `prettier-plugin-tailwindcss`.

`tsconfig.json`: `strict`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, `isolatedModules`, `moduleResolution: bundler`, `resolveJsonModule`, `noEmit`, ES2022, alias `@/*` to `./src/*` (repeated in vite.config.ts:15 and vitest.config.ts:13). Not set: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, `noImplicitReturns`, `verbatimModuleSyntax`. `include: ["src"]`, so tests are type-checked.

## 7. README.md and identifier-problem.md

- `identifier-problem.md` describes a different app (a POS on tauri-plugin-sql), but the lesson applies: two Tauri apps with one `identifier` share `~/.config/<identifier>/`, so one opens the other's database. The identifier is compiled in, so changing it needs a Rust rebuild. Set a new one before the first run.
- No updater on purpose: registering it without a `plugins.updater` block aborts startup (README:30-34).
- No `tauri-plugin-sql` on purpose: its pool breaks transactions; `db.rs` owns one connection, `max_connections(1)` (README:109-116).
- `src/lib/bindings.ts` is rewritten on every debug run (README:50-52, lib.rs:153-155).
- Query keys must follow the route path or `revalidatePath` misses them (README:95-99).
- Schema change: edit `prisma/schema.prisma`, run `npm run db:types`, add a numbered SQL file in `src-tauri/migrations` (README:122-131). Dates are ISO text, booleans 0/1 (README:118-120).
- Before shipping: replace icons; print a card and a receipt on each platform (README:140-146).
- Stale README lines: "English + Arabic" (line 21) though `fr.json` exists; "Vitest (finance calculations)" (line 81) though there are 8 files; the camera and `/dashboard/scan` note (lines 143-145), though scanning is now a keyboard-wedge listener with no camera (`src/components/qr-scan-listener.tsx:11-17`).
- Windows 7: not found anywhere in the repo. Unsure it can run there; current Rust's standard Windows target and WebView2 both need Windows 10 or later.
