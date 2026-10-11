# Reference shell and navigation (`/mnt/data/academy-system-desktop`)

Paths are relative to the repo root; `P/` = `src/pages/dashboard/`.

## 1. Window layout

- Two Tauri windows, both `create: false` and built from Rust by label (`src-tauri/src/lib.rs:57-81`): `main` 1440x900, min 1024x640; `lock` 900x640, `url: lock.html`, not resizable (`src-tauri/tauri.conf.json:13-35`). Two Vite entries (`vite.config.ts:28-30`): `index.html` -> `src/main.tsx`; `lock.html` -> `src/lock/main.tsx` (no router, no query client).
- Both HTML files carry the same synchronous boot script: reads localStorage `theme_mode` and `locale`, sets `.dark`, `data-theme-mode`, `lang`, `dir` (`index.html:18-55`). Defaults `system` / `en`; locales `en|ar|fr`.
- Provider order (`src/main.tsx:26-40`): `QueryClientProvider > TooltipProvider > PreferencesStoreProvider > I18nProvider > RouterProvider`. `createHashRouter` (`src/routes.tsx:62`).
- Shell = `DashboardLayout` (`P/layout.tsx:53-90`): `div[data-app-shell].flex.h-dvh.flex-col.overflow-hidden` containing, in order: `QrScanListener` (renders nothing), `<main data-app-main tabIndex=-1>` (the only scroller, `flex-1 overflow-y-auto overflow-x-hidden`) wrapping `<RouteGate><Outlet/></RouteGate>`, `<BottomNav pathname>`, `<CommandPalette/>`, `<Toaster>` (top-left in RTL). `body` is `overflow: hidden` (`src/index.css:579`).
- **There is no app header and no sidebar.** The "header" is in-page: `ScreenHeader` (`src/components/screen.tsx:89-159`) = optional ghost back button, icon plate (`size-14`, section `fill/border/text`), `h1` in the section hue, one-line description (`short:hidden`), trailing `actions`.
- Bottom bar: `BottomNav` (`src/components/bottom-nav.tsx:94-177`), a flex sibling of `<main>` (not fixed), `border-t-[3px] border-border-strong bg-card`, height `h-chrome-navbar` = `--chrome-navbar: clamp(4.25rem,10vh,5.75rem)`, smaller under 1000px and 820px height (`src/index.css:76, 554-562`). Items are icon over label; active = 1.5-unit top rule + `fill` tint + hue + bold + bigger icon.
- Utility group: a `div.border-s-[3px]` holding Lock (a `<button>` wrapped by `LockMenu`, neutral grey, opens an upward dropdown "LockNow" / "LockSettings" + `LockSettingsDialog`, `src/components/lock-menu.tsx:47-65`) and Settings (`NavLink`). Each `w-24 xl:w-28 tall:w-32` (`bottom-nav.tsx:100`).
- Content box: `Screen` (`screen.tsx:29-41`): `mx-auto max-w-[92rem] px-5 pt-5 pb-16`, padding keyed to height variants `short:`/`tall:` (`src/index.css:43-45`). `PageActions` (`screen.tsx:55-73`) is the non-sticky form footer. `SectionHeading` = `h2`.
- Lists: `TableSearch`, `DataTable`, `TablePager` (`src/components/data-table-shell.tsx`), TanStack table, chevrons mirrored in RTL, pager hidden at one page.
- Print: `@media print` hides `header, nav, button, .no-print` and un-pins `[data-app-shell]`, `[data-app-main]` (`src/index.css:735-784`).

## 2. Declaring a section, tabs, detail routes

Single registry: `src/navigation/sections.ts`. `SectionDef { id, labelKey (Nav namespace), icon, href, segments[], tabs? }`; `SectionTab { id, labelKey, href, icon?, owns? }` (`:175-204`). `segments` are the **exact** first path parts after `/dashboard`; `resolveSection()` (`:318-335`) requires a `dashboard` part in the path and maps `parts[at+1]` through `SECTION_BY_SEGMENT`. `resolveTab()` (`:353-366`) is longest-match over `tab.href` + `owns`.

To add section `X` with N tabs, a landing, a "new" page and a detail page:

1. `src/navigation/sections.ts`: add `"X"` to `SectionId` (`:32`), an entry in `SECTION_ACCENT` (`:81-173`, 9 literal class strings), an entry in `SECTIONS` with `segments` and `tabs` (give the list tab `owns: ["/dashboard/x"]` so `/new` and `/:id` keep it lit).
2. `src/index.css`: `--section-X` in `:root` and `.dark`, `--color-section-X` in `@theme inline`.
3. `src/messages/{en,ar,fr}.json`: `Nav` keys for section, each tab, `XViews` aria label, `NewX`.
4. `src/routes.tsx`: one child route per tab href, plus `x/new`, `x/:id` (static imports, no lazy loading).
5. Pages under `P/x/`:
   - Landing / each tab page: `<SectionScreen section="X" title description tabsAriaLabel actions={<Button asChild variant="add"><Link to=".../new"><Plus/>…</Link></Button>}>` (`src/components/section-screen.tsx`; example `P/students/page.tsx:26-41`). It draws `Screen` + `ScreenHeader` (section icon) + `ScreenTabs` derived from the registry.
   - New and detail: `<DetailScreen section="X" title back={{href,label}} actions className="max-w-4xl">` (`src/components/detail-screen.tsx`; `P/students/new/page.tsx:19-26`, `P/students/[id]/page.tsx:26-33`). `back` is required; no tab strip.
   - Inner tabs on a detail page: Radix `Tabs` + `TabsList variant="line"` with local state (`defaultValue`), e.g. `P/teachers/[id]/payments/_components/teacher-payment-tabs.tsx:23-27`; student form has 6 (`P/students/_components/student-form.tsx:265-272`). Not URL-driven.
6. Also touch: `src/lib/lockable-sections.ts` (`LOCKABLE_SECTIONS`, defaults), `QUICK_ACTIONS` in `src/components/command-palette.tsx:47-52`, and both test files (section 4).

Data convention the shell assumes: page queries are keyed `pathKey("/dashboard/x")` and mutations call `revalidatePath("/dashboard/x")` (`src/lib/compat/revalidate.ts`), prefix-matched by TanStack Query. `src/lib/compat/navigation.tsx` gives Next-style `Link(href)`, `useRouter`, `usePathname`, `useSearchParams`, `redirect`, `notFound`; `RouteError` (`src/pages/route-error.tsx`) absorbs the two signals. `compat/image.tsx` resolves `/api/uploads/...` to asset-protocol URLs. `src/i18n/routing.tsx` re-exports the same shims.

`RouteGate` (`src/components/security/route-gate.tsx:30-58`): skeleton while settings load, `ErrorState` on failure, pass-through if no password or already unlocked, else `LockScreen` instead of the page when `isSectionLocked(resolveSection(pathname), parseLockedSections(settings.locked_pages))`.

## 3. Capacity

- Bar: designed for **6 primary + Lock + Settings**. `PRIMARY_SECTIONS = SECTIONS.filter(id !== "settings")` (`sections.ts:297`), each `flex-1 basis-0`. No overflow or "more" menu exists: a 7th section just narrows the others, labels `truncate`. `sections.test.ts:142-145` asserts length 6 and would fail. My arithmetic, not measured: at 1024px wide about 138px per item with 6, 118px with 7, 104px with 8.
- `ScreenTabs` (`src/components/screen-tabs.tsx:67-92`): Radix `ToggleGroup type="single" variant="outline" spacing={2}`, URL-driven (`navigate(target.href)`), class `flex-wrap` so it **wraps, never scrolls**. Largest registry strip: Students, 4 tabs (`sections.ts:222-227`); Staff 3, Classes 3, Finance 2.
- Attendance: no `tabs` in the registry (`sections.ts:259-262`). `AttendanceScreen` (`P/attendance/_components/attendance-screen.tsx:57-74`) composes `Screen` + `ScreenHeader` and two `ScreenTabs` in one `flex flex-wrap gap-x-6` row: "who" (`STAFF_KINDS` x3, href `attendanceHref(k, view)`) and "what" (records/absences, href `attendanceHref(kind, v)`), so switching one axis keeps the other. Each of the 12 route pages hard-codes `kind` and `view` props. Its `/:id` routes also use `AttendanceScreen` (strips stay, no back action). `resolveAttendanceRoute` (`staff-kind.ts:143`) has no callers.
- Finance: tab `analytics` -> `P/finance/page.tsx` `SectionScreen` -> `FinanceDashboard` -> `FinanceTabs` (`P/finance/_components/finance-tabs.tsx:25-49`): `Tabs defaultValue="student-payments"` (local state), `TabsList variant="segmented" className="w-full"`, 7 triggers each with `SECTION_ACCENT.finance.tabSegment`; wraps to a second row. This is the largest strip in the app. Groups uses a local-state `ToggleGroup` of 4 levels with `SECTION_ACCENT.classes.segment` (`P/groups/_components/groups-tabs.tsx:102-125`).

## 4. Section hues

- Tokens `src/index.css`: light `--section-{overview,students,staff,attendance,classes,finance,settings}` `:96-102` (oklch, hues 195/250/300/55/155/345/105); dark `:396-402`; Tailwind bridge `--color-section-*` `:483-489`.
- Classes: `SECTION_ACCENT: Record<SectionId, SectionAccent>` with `text, bg, rule, ring, border, fill, hoverBg, segment, tabSegment` (`sections.ts:51-173`). Must be literal strings; a template like `text-section-${id}` emits no CSS.
- `SECTION_TONES` in `src/components/section-panel.tsx:16-58` names panels by colour (`teal, blue, violet, amber, green, plum, sage, neutral`) but uses the same `section-<id>` classes.

Rename checklist for a `SectionId`:

| Place | Lines |
|---|---|
| `src/navigation/sections.ts` | type `:32`; `SECTION_ACCENT` `:81-173`; `SECTIONS` `:206-294`; `"settings"` filters `:297,299`; `STUDENT_REPORT_SEGMENTS` + `academy` special case `:306, 329-332` |
| `src/index.css` | `:96-102`, `:396-402`, `:483-489` |
| `src/components/section-panel.tsx` | `:16-51` |
| `src/components/bottom-nav.tsx` | `:155-156` (`"settings"`, `SECTION_ACCENT.settings`) |
| `src/lib/lockable-sections.ts` | `LockableId` `:23`; `LOCKABLE_SECTIONS` `:34-41`; `DEFAULT_LOCKED_SECTIONS` `:61`; ids persist as JSON in `Setting.locked_pages` |
| `src/components/stat-card.tsx` | `tone?: SectionId` `:38`; callers `P/academy/_components/general-stats.tsx:32,40,48`, `payment-status-cards.tsx:34,42,50` |
| Direct lookups | `finance-tabs.tsx:22`, `groups-tabs.tsx:57`, `attendance-screen.tsx:42,60,68,69`, `P/academy/page.tsx:37-38`, `payment-status-view.tsx:59` |
| Every page | literal `section="…"` on `SectionScreen` / `DetailScreen` / `ScreenHeader` |
| Tests | `src/navigation/sections.test.ts:20-82, 101-131, 142-145`; `src/lib/lockable-sections.test.ts` (ids at `:42, 62, 68, 86-93`) |
| i18n | `Nav` namespace in `src/messages/{en,ar,fr}.json` |

`src/lib/permissions.ts:12-27` `DASHBOARD_MODULES` is a separate, unused-for-gating list (`can()` always true).

## 5. Routes (`src/routes.tsx:62-144`), 47 pages

`/` and `/dashboard` index -> `Navigate /dashboard/academy`; `dashboard/*` -> `src/pages/not-found.tsx`; root `*` -> Navigate. All under `DashboardLayout`.

| Path (after `/dashboard/`) | Page file under `P/` | Section | Pattern |
|---|---|---|---|
| `academy` | `academy/page.tsx` | overview | `Screen` + `ScreenHeader`, no tabs |
| `academy/{expired,one-remaining,outstanding-debt}` | `academy/<name>/page.tsx` -> `PaymentStatusView` | students | `SectionScreen` |
| `students` | `students/page.tsx` | students | `SectionScreen` + add action |
| `students/new` | `students/new/page.tsx` | students | `DetailScreen` |
| `students/:id` | `students/[id]/page.tsx` | students | `DetailScreen`, form with 6 line tabs |
| `students/:id/overview` | `students/[id]/overview/page.tsx` | students | `DetailScreen` + edit action |
| `students/:id/card` | `students/[id]/card/page.tsx` | students | `DetailScreen` + `PrintButton`, back to profile |
| `students/:id/observations` | `students/[id]/observations/page.tsx` | students | `DetailScreen`, back to overview |
| `teachers` | `teachers/page.tsx` | staff | `SectionScreen` |
| `teachers/new`, `teachers/:id` | `teachers/new/page.tsx`, `teachers/[id]/page.tsx` | staff | `DetailScreen` |
| `teachers/:id/{overview,card}` | `teachers/[id]/<name>/page.tsx` | staff | `DetailScreen`, back to record |
| `teachers/:id/payments` | `teachers/[id]/payments/page.tsx` | staff | `DetailScreen` + 2 line tabs |
| `edu-programs` | `edu-programs/page.tsx` | classes | `SectionScreen` |
| `groups` | `groups/page.tsx` | classes | `SectionScreen` + level switch |
| `groups/:groupId` | `groups/[groupId]/page.tsx` | classes | `DetailScreen` |
| `groups/:groupId/students/:studentId/payments` | `groups/[groupId]/students/[studentId]/payments/page.tsx` | classes | `DetailScreen`, back to group |
| `employees` | `employees/page.tsx` | staff | `SectionScreen` |
| `employees/new`, `employees/:id` | `employees/new/page.tsx`, `employees/[id]/page.tsx` | staff | `DetailScreen` |
| `employees/:id/{card,payments}` | `employees/[id]/<name>/page.tsx` | staff | `DetailScreen` (payments: 2 line tabs) |
| `rent-teachers` | `rent-teachers/page.tsx` | staff | `SectionScreen` |
| `rent-teachers/new`, `rent-teachers/:id` | `rent-teachers/new/page.tsx`, `rent-teachers/[id]/page.tsx` | staff | `DetailScreen` |
| `rent-teachers/:id/card` | `rent-teachers/[id]/card/page.tsx` | staff | `DetailScreen` |
| `rent-teachers/:id/groups/:groupId` | `rent-teachers/[id]/groups/[groupId]/page.tsx` | staff | `DetailScreen`, back to teacher |
| `{teacher,rent-teacher,employee}-{attendance,absences}` (6) | `<name>/page.tsx` | attendance | `AttendanceScreen` + add action |
| same six + `/:teacherId` / `:rentTeacherId` / `:employeeId` | `<name>/[<param>]/page.tsx` | attendance | `AttendanceScreen`, title = person |
| `scheduling` | `scheduling/page.tsx` | classes | `SectionScreen` |
| `expenses` | `expenses/page.tsx` | finance | `SectionScreen` |
| `finance` | `finance/page.tsx` | finance | `SectionScreen` + 7 segmented tabs |
| `settings` | `settings/page.tsx` | settings | `Screen max-w-4xl` + `ScreenHeader`, one column of cards |
| `coming-soon` | `coming-soon/page.tsx` | none (bar unlit) | bare centred text |

## 6. Command palette and keyboard

- `CommandPalette` (`src/components/command-palette.tsx`): Ctrl/Cmd+K document listener (`:60-69`), no visible trigger. Indexes `SECTIONS` only: one group per section; items are its `tabs`, or the section itself when it has none (so Attendance offers only `/dashboard/teacher-attendance`). Plus hard-coded `QUICK_ACTIONS` (4 "new" routes, `:47-52`). Labels from `Nav`; dialog text from `Header` (`CommandDialogTitle`, `SearchPlaceholder`, `NoResults`, `QuickActions`). It does **not** search records, although the placeholder says "Search pages, students, guardians...". Locked sections stay listed on purpose.
- Scrolling keys: `handleScrollKeyDown` (`src/lib/scroll-keyboard-nav.ts:59-107`) on `<main>`: arrows 80px, PageUp/Down 0.9 viewport, Home/End; ignores text inputs. `layout.tsx:46-51` scrolls to top and focuses `<main>` on every pathname change.
- No section number shortcuts found. Bar items are plain links; `ScreenTabs` gets Radix roving focus.
- `QrScanListener` (`src/components/qr-scan-listener.tsx:259`) is a capture-phase document keydown listener for 64-hex scanner bursts.

## 7. Academy-specific items to rename or remove

- Product name "Academy Manager": `index.html:7`, `lock.html:7`, `src-tauri/tauri.conf.json:3,16,25`, identifier `com.hamawebdev.academy-manager` `:5`, `package.json:2`, `src-tauri/Cargo.toml:2,4,9,24`, `src/config/app-config.ts:6-12`.
- Home path `/dashboard/academy`: `src/routes.tsx:67,73,126-129,141`; `sections.ts:211,214,224-226,306,329-332`; folder `P/academy/`; i18n namespace `Academy`.
- All seven section ids, labels, icons (`GraduationCap`, `BookOpen`...) and segments: `sections.ts:21-30, 206-294`; `Nav` strings in the three message files (Arabic `Classes` = "الأقسام الدراسية").
- `QUICK_ACTIONS` and `Header.SearchPlaceholder`.
- `QrScanListener` mount (`P/layout.tsx:58`) calls `processQrScan` / `confirmStudentAttendance`.
- `STAFF_KINDS` teacher / rent-teacher / employee (`staff-kind.ts:55-57`).
- Lock defaults `["staff","finance","settings"]` (`lockable-sections.ts:61`).
- Settings cards `AcademyIdentityCard`, `AcademicYearCard`, `ClassroomsCard` (`P/settings/page.tsx:11-12,55-59`). Academic year appears only there; no year switcher in the shell (not found in `src/components`, `src/stores`, `src/hooks`).
- Tenant: not found in the shell; the word matches only in `src/lib/db/*` and `src/lib/validators/policy.ts` (unsure, not read).
- Logos: no logo in the chrome. Favicon `/icons/favicon-32.png` (`index.html:5`, `lock.html:5`, `public/icons/`), bundle icons `src-tauri/icons/*`. `src/components/card-template.tsx:17,40` prints `academyName`.
- Boot default locale `en` (`index.html:22`, `lock.html:19`); an Arabic-first app must change both.
- Asset scope `$APPDATA/uploads/**` (`tauri.conf.json:40`) follows the identifier.
