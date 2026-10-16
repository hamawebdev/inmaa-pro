# Browser harness

Shows a screen of the app in headless Google Chrome, without the desktop window, and saves a
screenshot or an A4 PDF. Development tooling only: nothing here is imported by `src/`, nothing
here is in the production bundle, and the app itself still makes no network request.

It works on two apps:

- **this project** (the default), once it has its own `index.html` and `node_modules`;
- **the reference academy app**, through the scratch copy in `.reference-scratch/` (`--reference`),
  so a new screen and its closest academy screen can be shot the same way and compared.

## The commands

Run them from the project root. Each run starts its own server on a free port of 127.0.0.1,
builds a fresh database from the app's migrations, opens Chrome, does its work and stops
everything. Two people can run it at the same time.

```sh
# A screenshot. Prints the file it saved.
node scripts/harness/shot.mjs --route /dashboard/home --locale ar --theme dark --both-sizes

# The same screen of the academy app, with demo rows and a fixed clock
node scripts/harness/shot.mjs --reference --route /dashboard/employees --locale ar --theme dark \
  --seed scripts/harness/seeds/academy-demo.sql --now 2026-10-11T10:30:00

# One element only, and a value read from the page
node scripts/harness/shot.mjs --route /dashboard/workers --clip "[data-slot=toggle-group]" \
  --eval "document.documentElement.dir"

# A printed sheet, on A4, plus a PNG of each page to look at
node scripts/harness/pdf.mjs --route /dashboard/files/1/form --locale ar --png

# All the academy baseline shots again (about three minutes)
node scripts/harness/baseline.mjs

# The built app under the content security policy (build first: npm run build)
node scripts/harness/csp-check.mjs --route /dashboard/home --route /dashboard/settings
```

`--help` on any of them lists every option. The ones used most:

| Option                                      | Meaning                                                                    |
| ------------------------------------------- | -------------------------------------------------------------------------- |
| `--route <path>`                            | the hash-router path, as in the address after `#`                          |
| `--reference`                               | use the scratch copy of the academy app                                    |
| `--locale ar\|fr\|en`                       | language; left out, the app's own default applies                          |
| `--theme light\|dark`                       | theme; left out, the app's own default applies (shown as light)            |
| `--size 1440x900`, `--both-sizes`           | window size; `--both-sizes` is 1440x900 and 1024x640 from one load         |
| `--seed <file.sql>`                         | SQL run after the migrations; repeatable                                   |
| `--demo`                                    | start from the demo data (`npm run demo`); see below                       |
| `--now <datetime>`                          | a fixed clock that still ticks, in the centre's time zone (Africa/Algiers) |
| `--user <name>`                             | the account to sign in as, by sign-in name; `manager` when left out        |
| `--signed-out`                              | stay on the sign-in window (`shot` only; the file is named `sign-in__…`)   |
| `--before <js>`                             | evaluate this once settled, then settle again, before the picture          |
| `--scroll bottom`, `--scroll-to <selector>` | scroll the main area before shooting                                       |
| `--clip <selector>`                         | shoot one element                                                          |
| `--eval <js>`                               | print the value of an expression evaluated in the page                     |
| `--page lock.html --license expired`        | the lock window                                                            |
| `--keep`                                    | keep the run's database and browser profile, for looking inside            |

## Signing in

The program opens on its sign-in window and draws nothing else until somebody has signed in. There is no way round
it, in the source or in the built program, so the harness does what a person does on every page it opens: it picks
the account, types the password, and on a new database, where the manager has no password yet, chooses one and says it
wrote the recovery code down (`lib/sign-in.mjs`). One password serves every run, `inmaa-demo`: the demo data gives it
to all its accounts.

- Without `--user` the run is the manager's. On a new database he is the only account.
- With `--demo`, `--user` is one of `manager`, `hr`, `admin`, `supervisor`, `reception`, `operations`, `accountant`:
  one account for each role, with that role's sections on the bar. The picture is named `…__as-<user>__…`.
- `--signed-out` leaves the sign-in window on screen. `--before` reaches its other steps:

```sh
npm run shot -- --demo --signed-out --locale ar --theme dark --both-sizes
npm run shot -- --demo --signed-out --before "document.querySelector('[data-signin-user=accountant]').click()"
npm run shot -- --demo --user accountant --route /dashboard/expenses
```

A refused sign-in stops the run and says what the window said.

## Several people at once

A run is heavy (a Vite server and a headless Chrome), and six teammates share this machine: twenty runs at once starve
one another, screens "never settle" and the machine runs out of file handles. So a run takes one of a few slots before
it starts anything, and waits its turn when they are taken (`lib/slots.mjs`): it says so on stderr and goes on by
itself. Nothing to do, except to leave your own time limit long enough for the wait.

- The queue's only shared files are `.harness/slots/slot-<n>` (each holds the pid of the run that has it, touched every 20 s); nothing of the queue is written in anybody's scratchpad. Keep your own files in `scratchpad/<owner>/`.
- `HARNESS_SLOTS=<n>` sets how many runs go at once (default: half the processors, between 2 and 6); `0` switches the
  queue off.
- `HARNESS_SETTLE_MS=<ms>` sets how long a screen may take to settle (default 75 000).
- Print many sheets in **one** run: `npm run pdf -- --demo --routes sheets.txt --png`. The file holds one route a line
  (`/dashboard/files/{clients.housingContract}/form/print`), optionally ` > name` to choose the PDF's name; `#` starts
  a comment. One slot, one browser, one database; a sheet that fails does not cost the others their turn.
- `pdf` takes `--before <js>` as `shot` does: for a page whose sheet appears only after something is typed or pressed.

## Demo data

`npm run demo` builds one database from every folder's `src/features/<folder>/demo.ts` (see "Demo data" in
CLAUDE.md) into `.harness/demo/inmaa-demo.db`, with its anchor and a manifest (`inmaa-demo.json`: the folders, what
each named, the rows per table). `--demo` starts a run from a copy of it instead of an empty database, after building
it again when it is missing or older than the migrations or than a `demo.ts`. After you change a service your demo
data uses, run `npm run demo` yourself.

With `--demo` the clock is the demo's (Monday 12 October 2026, 09:00) unless `--now` says otherwise, and a route may
name a record the demo data named:

```sh
npm run demo
npm run pdf -- --demo --route "/dashboard/files/{clients.housingFile}/print" --png
```

The clock and the program's clock guard (src/lib/clock/sanity.ts). One session keeps one clock: every tab starts at
the fixed `now`, but a view opened after another (`pdf --routes`, two sizes) starts where the session's clock has got
to, as if the PC's clock had kept running, so a sign-in is never earlier than what the last view wrote (a print's
disclosure). Nobody needs to move `--now` by hand between views. A `--now` more than `system.clockJumpDays` (3) days
after the data's last work opens, for the manager, on the screen where he confirms the date: the harness confirms it
as he would after a closure. Another account signs in and works, but is refused an invoice or a receipt until the
manager has confirmed. A `--now` earlier than the data's last work is refused at sign-in, as on the PC: every account
but the manager's, who is shown the clock screen.

`--keep` leaves the run's folder under `.harness/run/` for a day; other people's runs do not sweep it before then.

## Where things go

| Path                           | What                                                                       |
| ------------------------------ | -------------------------------------------------------------------------- |
| `.harness/shots/`              | screenshots, named `<route>__<locale>__<theme>__<WxH>.png`                 |
| `.harness/pdf/`                | PDFs and their page PNGs                                                   |
| `.harness/baseline/`           | the academy baseline, with `manifest.json`                                 |
| `.harness/baseline/tab-strip/` | Arabic before/after shots for the direction provider, with `findings.json` |
| `.harness/run/<id>/`           | one run's database, uploads and browser profile; deleted when the run ends |

`.harness/` and `.reference-scratch/` are git-ignored.

## Comparing a new screen with the academy

Shoot both with the same locale, theme and size, then open the two files:

```sh
node scripts/harness/shot.mjs --route /dashboard/employee-attendance --locale ar --theme light
# the matching academy shot is already in .harness/baseline/attendance__ar__light__1440x900.png
```

Baseline views: `home`, `attendance`, `attendance-absences`, `settings`, `settings-lower`, `list`
(employees), `form` (new employee), `finance`, `finance-tabs`, `finance-table`; each in Arabic and
English, light and dark, at both sizes. For an academy screen that is not in the baseline, shoot
it with `--reference`.

**Arabic screens are compared with `.harness/baseline/ar-direction-fixed/`, not with the unchanged
Arabic shots.** The academy lays every Radix part out left to right in Arabic: the tab strips, and
whole forms and tables inside tabs (`.harness/baseline/tab-strip/` shows it, before and after).
The approved scope fixes that defect here instead of copying it (scope section 7, R6), so this
program mounts the direction provider and its Arabic screens mirror where the academy's do not.
The `ar-direction-fixed` shots are the academy with that one fix applied in memory; they are what
"same as the academy" means for an Arabic screen. French and English are compared with the
unchanged shots.

Two things in those shots are still not to be copied: the academy's charts, whose axis labels
overlap the bars in Arabic (here a chart is always drawn left to right), and its phone numbers and
date-times, which Arabic reorders (here such values go inside `<Ltr>`).

## What a run tells you besides the picture

- `!` lines make the command exit with 1: the screen never settled, the page asked for something
  outside this machine, or the content security policy refused something.
- `?` lines: a Tauri command the harness has no answer for. The app received an error for it.
  Tell Foundation; the answer goes in `lib/backend.mjs`.
- `-` lines: console errors and warnings, and uncaught exceptions. Read them.

Chrome is started so that it can reach 127.0.0.1 and nothing else. A screen that needs a remote
font, script or image fails here and is reported.

## What the harness does not prove

It shows the web part of the app in Chrome. These still need the real program:

- **The desktop window.** That it opens, its size and title, single instance, the lock window
  appearing when the licence runs out.
- **Tauri itself.** The harness answers the app's commands from Node (`lib/backend.mjs`). The Rust
  commands, the capability files and the licence guard are not exercised.
- **The content security policy as Tauri applies it.** `csp-check.mjs` sends the policy written in
  `tauri.conf.json` as a header and Chrome enforces it, with three things adapted for the browser
  (it prints them): the hash of the inline boot script, which Tauri adds at build time, and
  same-origin requests standing in for Tauri's `ipc:` and `asset:` transports. A real launch must
  still show that commands and uploaded images work under the policy.
- **The database engine.** Node's SQLite is newer (3.50) than the one built into the app (3.46).
  A migration is proven on the app's engine by the Rust migration test, not here.
- **The licence.** `--license` only chooses what the screens are told.
- **Dialogs, backup and restore.** File dialogs always answer "cancelled", so a backup made by hand, a restore and an
  export stop at their dialog. A copy the program makes by itself (`backup_to`) and a file it saves (`save_text_file`)
  land in the run's own folder (`backups/`, `exports/`), whatever path was asked; `restore_from` is refused. The daily
  copy is not made in a run: no folder is chosen in a new database.
- **Paper.** `pdf.mjs` uses Chrome's print engine on A4, which is what WebView2 on Windows uses
  too. The printer, its margins and the user's choices in the print dialog are not covered.
  Backgrounds are left out unless `--backgrounds` is given, as in the dialog by default.
- **The browser's own controls.** A native date field or file button is drawn in the browser's
  language and date order (English here), on the client's PC in the language of Windows.
- **Fonts that are not in the app.** His Word fonts (Traditional Arabic, Sakkal Majalla) are not
  on this machine, so a sheet that asks for them shows the bundled Arabic font instead.

## The scratch copy of the reference

`.reference-scratch/` holds the academy app's frontend, its configuration files, its two
migrations and its `node_modules`. It holds no Rust source: the academy's licence secret must not
be copied into this project. Do not edit it; it is only useful while it is an exact copy.

Nothing may be built, installed or run inside `/mnt/data/academy-system-desktop`. To make the
scratch copy again (it only reads the reference):

```sh
REF=/mnt/data/academy-system-desktop
DST=".reference-scratch"
mkdir -p "$DST/src-tauri/migrations"
rsync -a "$REF/src" "$REF/public" "$REF/index.html" "$REF/lock.html" "$REF/package.json" \
  "$REF/package-lock.json" "$REF/.npmrc" "$REF/tsconfig.json" "$REF/tsconfig.node.json" \
  "$REF/vite.config.ts" "$REF/components.json" "$DST/"
rsync -a "$REF/src-tauri/migrations/" "$DST/src-tauri/migrations/"
cp -a "$REF/node_modules" "$DST/node_modules"
```

`csp-check.mjs --reference` needs a build of it: `(cd .reference-scratch && ./node_modules/.bin/vite build)`.

## How it works

| File                     | Job                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------- |
| `lib/session.mjs`        | one run: backend, server, Chrome, teardown                                              |
| `lib/backend.mjs`        | answers Tauri commands from a real SQLite file (`node:sqlite`) and a folder for uploads |
| `lib/endpoints.mjs`      | the three URLs added to the server: the stub, a command, an uploaded file               |
| `browser/tauri-stub.js`  | stands in for the Tauri runtime in the page; applies locale, theme and clock            |
| `lib/vite-server.mjs`    | serves the app's source with the app's own Vite, plus one plugin                        |
| `lib/dist-server.mjs`    | serves the built `dist/` under the content security policy                              |
| `lib/browser.mjs`        | starts Chrome and talks to its debugging port with Node's WebSocket                     |
| `lib/experiments.mjs`    | changes applied in memory for a before/after pair                                       |
| `seeds/academy-demo.sql` | demo rows for the academy app only                                                      |

Needs Node 22.13 or later (for `node:sqlite` and the built-in WebSocket) and Google Chrome
(`CHROME_BIN` overrides where it is looked for). It installs nothing.
