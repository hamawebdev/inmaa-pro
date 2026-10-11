# Reference: design system, languages, RTL (`/mnt/data/academy-system-desktop`)

Stack: Tailwind v4 CSS-first (no tailwind.config; `components.json`: `new-york`, baseColor `neutral`, lucide), `radix-ui` 1.4, cva, `use-intl` 4.9, zustand. Paths are under `src/`.

## 1. Colour tokens
All in `index.css`, OKLCH: light `:root` 47-306, `.dark` 308-418, bridged to utilities in `@theme inline` 420-518.

- Neutrals: `--background --foreground --card --popover --field --field-empty --primary --secondary --muted --accent` (+`-foreground`), `--border --border-strong --input --ring`.
- Status: `--destructive --success --warning --warning-ink --info` (`warning-ink` = amber as text).
- Action colours with fixed meaning (213-226, mirrored as Button variants): `--edit` orange, `--add` emerald, `--export` violet, `--import` teal-green; success commits, info prints, destructive deletes.
- `--chip-1..8` categorical palette (defined, no call site found); `--chart-1..5`; `--shadow-xs..xl`; `--radius: 0.875rem`; `--border-width: 2px`, `--border-width-strong: 3px` (utilities `.border-app`, `.border-app-strong`); `--chrome-navbar`.
- Light → dark: background `0.955 0.009 80` → `0.185 0.008 68`; card `0.985` → `0.232`; foreground `0.235 0.014 62` → `0.94 0.006 82`; primary = ring `0.505 0.115 195` (teal) → `0.735 0.115 195`; border `0.835 0.017 80` → `1 0 0 / 17%`; input `0.58 0.03 80` → `1 0 0 / 44%`. Status hues: destructive 27, success 155, warning 74, info 245. Warm canvas (hue ~80), nothing is pure white.
- Section hues (96-102, dark 396-402): `--section-overview` 195 teal, `-students` 250 blue, `-staff` 300 violet, `-attendance` 55 amber, `-classes` 155 green, `-finance` 345 plum, `-settings` 105 sage. Consumed through `SECTION_ACCENT: Record<SectionId, SectionAccent>` (navigation/sections.ts:81-173; fields `text bg rule ring border fill hoverBg segment tabSegment`) and `SECTION_TONES` (components/section-panel.tsx:16). Classes are written out in full because Tailwind scans text. The seven ids are academy names: rename them in the CSS, `@theme`, both records and `SectionId`.
- Dark mode: class `.dark` on `<html>` (`@custom-variant dark`, line 16). `ThemeMode = light|dark|system`, default `system` (lib/preferences/preferences-config.ts:34), in `localStorage["theme_mode"]`. Boot script `index.html:18-55` (copied in `lock.html`) sets class, `data-theme-mode`, `color-scheme` before paint; `PreferencesStoreProvider` reads the DOM back; `applyThemeMode()` (lib/preferences/theme-utils.ts:11) toggles under `.disable-transitions` and follows the OS in `system`. UI: `AppearanceCard` (pages/dashboard/settings/_components/appearance-cards.tsx:69) calls `setThemeMode` + `persistPreference("theme_mode", …)`.
- Theme presets: none, deliberately removed (lib/preferences/theme.ts:4-9).
- Density variants: `tall:` (≥1001px high), `short:` (≤1000), `tight:` (≤820); declaration order is load-bearing (43-45).

## 2. Type
- `--font-sans`/`--font-display` = `"Geist Variable", "IBM Plex Sans Arabic", system…`; `--font-mono` = `"Geist Mono Variable"` (105-112). Under `:lang(ar)`/`[dir="rtl"]`, body and h1-h4 put `"IBM Plex Sans Arabic"` first and reset letter-spacing (619-632).
- Offline: `@fontsource-variable/geist`, `@fontsource-variable/geist-mono`, `@fontsource/ibm-plex-sans-arabic` `arabic-400/500/600/700.css`, `@import`ed at index.css:9-14; Vite emits the woff2 files into `dist/assets`. No remote font URL anywhere.
- Scale: `html { font-size: clamp(16px, min(1.4vw, 2.6vh), 22px) }` (543); rem everywhere except control heights and borders (px). `tabular-nums` on tables and `.tabular` (608-615).
- Headings: `ScreenHeader` h1 `text-2xl short:text-3xl tall:text-4xl font-bold` in the section colour (components/screen.tsx:142); `SectionHeading` h2 one step smaller (167); `CardTitle` and `SectionPanel` h3 `text-lg short:text-xl tall:text-2xl bold`.
- Tables (ui/table.tsx): head `text-sm font-bold uppercase tracking-[0.08em]` (244); cell `h-16 text-base tall:text-lg` (258); `border-b-2` rows.
- Forms: `Label` `text-base font-bold tall:text-lg` (ui/label.tsx:24); `Input` `text-base`, `h-[52px] short:h-[56px] tall:h-[60px]` (`fieldHeight`, ui/input.tsx:38); `FieldError`/`FieldDescription` `text-sm`. Buttons `font-bold`, heights 38/46/52/58/62px.

## 3. Languages
- `LOCALES = ["en","ar","fr"]`, `DEFAULT_LOCALE = "en"`, `RTL_LOCALES = ["ar"]`, `LOCALE_STORAGE_KEY = "locale"` (i18n/config.ts:8-22), kept in localStorage so the boot script reads it synchronously.
- Arabic-first needs: `DEFAULT_LOCALE`; `DEFAULTS.locale` and the locale list in `index.html:22,48` and `lock.html:19,45`; `<html lang dir>`. English must stay the reference catalogue (tests, error lookup).
- `I18nProvider` (i18n/provider.tsx:26) wraps use-intl `IntlProvider` with `MESSAGES[locale]`; missing keys only warn in DEV. `useLocaleSwitcher()` (61) gives `{locale, setLocale}`; UI is `LanguageCard` (appearance-cards.tsx:40), saved on click. `i18n/use-intl.d.ts` narrows `useLocale()`. `i18n/routing.tsx` only re-exports router shims.
- Direction: `directionFor(locale)` (config.ts:28) written to `<html lang dir>` by the boot script and the provider effect (29-33). Toaster flips sides (pages/dashboard/layout.tsx:88). `dir="ltr"` is forced on codes and passwords.
- RTL gaps (read from source, not run):
  - Radix `DirectionProvider` (ui/direction.tsx) is never mounted; Radix `useDirection` falls back to `"ltr"`, so ToggleGroup (`ScreenTabs`), Tabs, DropdownMenu and Select content carry `dir="ltr"` in Arabic. One-line fix in `I18nProvider`; the coordinator should decide copy-as-is or fix.
  - Shell and newer shared components use logical utilities (`ps- pe- ms- start- end- text-start`, `rtl:rotate-180`). Older pages keep physical ones (about 116 hits; 25 files patch with `rtl:`), e.g. `employees-table.tsx:298,306`.
  - Physical classes remain in `ui/field.tsx:134` (`text-left`), `ui/native-select.tsx:27,30`, `ui/calendar.tsx:104-116`.
- Message files `messages/{en,ar,fr}.json`: 81 top-level namespaces, 1764 leaves. Shell: `Nav` 33, `Auth` 49, `Common` 14, `Errors` 115, `Table` 7, `Header` 8, `Settings` 46 (nested `Language`, `Appearance`, `Backup`…), `License` 21, `MediaUpload`, `DateRangePicker`, `PrintFooter`, `AdminLogoMark`, `NotFound`. Code-label namespaces: `EducationLevels`, `Subjects`, `Streams`…, plus nested ones like `EmployeesTable.JobPositions`. Otherwise one namespace per screen or component. Key style is mixed: 596 leaf keys are English phrases with spaces (`"Last Name *"`), the rest PascalCase. Arabic uses all six ICU plural forms.
- `messages/messages.test.ts`: en is the reference; ar and fr must have exactly the same leaf keys (missing and extra both fail), the same ICU argument names per message, and no empty values. It imports `@formatjs/icu-messageformat-parser`, only a transitive dependency.
- `i18n/code-labels.test.ts`: `CASES` pairs a namespace with code arrays (validator consts, `data/*.ts`, regex over `src-tauri/migrations/0002_seed.sql`); every code needs a label in all three locales. It asserts academy seed counts (110-112). Rewrite `CASES` for the new domain and add every new enum.
- Stored enums: the DB keeps the code; `useCodeLabel(namespace)` (i18n/use-code-label.ts:18) returns `code => t.has(code) ? t(code) : code` (21 files).
- Errors (i18n/errors.ts): actions return `{ success: false, error: "English sentence" }` and zod schemas carry English messages. `en.json` `Errors` values are the lookup table: `matchErrorMessage()` matches exactly or by `{placeholder}` pattern, `useErrorMessage()` renders that key in the active locale. Toasts: `errorMessage(result.error, t("SaveFailed"))`; fields: `errorMessage(fieldState.error?.message)`. `z.setErrorMap(zodErrorMap)` (main.tsx:24) replaces zod defaults.
- `i18n/errors.test.ts` AST-scans `server/actions/**`, `server/form-data.ts`, `server/permissions.ts`, `lib/validators/*.ts`: every literal `error`/`message`/`notFound`/`required_error`/`invalid_type_error`, every `new …Error("…")` and every zod-method string must match an `Errors` entry; `Errors` may use plain `{args}` only; it requires more than 150 messages found (216), so a young app must lower that.

## 4. Numbers, dates, currency
- `intlLocaleFor(locale)` → `en-US`/`ar-DZ`/`fr-DZ` (config.ts:39-47, 49 files); `dateFnsLocaleFor` → `enUS`/`arDZ`/`fr` (53-61).
- Currency: `useFormatCurrency()` (lib/use-currency.ts:17) = `amount.toLocaleString(localeCode) + " " + t("Common.Currency")`; `DA` (en, fr), `دج` (ar). DZD-ready but hard-wired: no currency setting found in settings, server or migrations. Only 8 files use the hook; five namespaces duplicate a `Currency` key and "DA" is baked into strings (`Errors.AmountCannotExceed`, `"Amount (DA)"`). `formatMoney(value, localeCode)` (lib/finance/calculations.ts:82) forces 2 decimals.
- Dates: no central helper. `Intl.DateTimeFormat(localeCode, …)` inline in 27 files, date-fns `format()` in 34 (tables show `yyyy-MM-dd HH:mm`), `useFormatter` in one page.
- Digits: no numbering-system override. `ar-DZ` resolves to `latn`, Western digits (Node ICU: `1.234.567,5`, `11 أكتوبر 2026`); not verified inside WebView2/WebKitGTK.
- Week: Saturday is hard-coded (`DAYS_OF_WEEK` value 0 = Saturday, data/schedule.ts:1; `weekStartsOn: 6` in attendance pages). `Calendar` takes its week start from the date-fns locale (arDZ Sunday, fr Monday), so it disagrees. No setting.

## 5. Components
Shared composites in components/:
- `Screen {className}`: `max-w-[92rem]` page box. `ScreenHeader {section, title, description?, icon?, actions?, back?}`. `SectionHeading`. `PageActions {note?}` (no call site). All in screen.tsx.
- `SectionScreen {section, title, description?, actions?, tabsAriaLabel?}`: header + tabs from the registry; 11 list pages.
- `DetailScreen {section, title, back, description?, icon?, actions?}`: 20 detail pages.
- `ScreenTabs {section, items[{id,label,href,icon?}], value, ariaLabel}`: URL-driven; SectionScreen, attendance-screen.
- `StatCard {label, value, hint?, icon?, tone?: SectionId, href?}`: general-stats, payment-status-cards.
- `StatusChip {tone: success|warning|danger|info|neutral|pending, label, icon?}`: manager-password-section, staff-absence-overview.
- `SectionPanel {title, hint?, icon?, tone?: teal|blue|violet|amber|green|plum|sage|neutral, actions?}`: no call site.
- `ErrorState {title?, description?, onRetry?}`: route-gate, lock-settings.
- `useConfirm()` → `[confirm({title, description?, confirmLabel?, cancelLabel?, tone?}) => Promise<boolean>, dialogNode]`: 11 files.
- `DateRangePicker {value?, onChange?, locale?, placeholder?}`: finance-date-filter.
- `MediaUploadField {label, rule, existingUrl?, value: UploadSelection, onChange, …}`: 6 forms.
- `CardTemplate {roleLabel, branding?, photoUrl?, name, subtitle?, fields[], qrToken, badges?}`: 7 card pages.
- `AdminLogoMark {logoUrl?, name}`; `BottomNav`; `CommandPalette` (Ctrl+K, generated from `SECTIONS`); `LockMenu`; `QrCodeDisplay`; `QrScanListener`; `print/*`; `security/*`.
- Academy-specific: `GroupSelectDialog`, `WeeklyCheckCalendar` (hard-coded green/red, physical left/right).

ui/ has 54 files. Restyled to the system: `button` (variants `default success info warning destructive edit add export import outline secondary ghost link`; sizes `xs sm default lg xl icon icon-xs icon-sm icon-lg`; props `loading`, `succeeded`; `useActionFeedback()`), `input` (exports `fieldShell`, `fieldHeight`), `textarea`, `select`, `checkbox` (32px), `label`, `card` (`size`), `badge` (adds `success warning info muted`), `table` (`numeric`, `TableEmpty`, scroll buttons), `tabs` (`default|line|segmented`), `toggle`, `toggle-group` (`spacing`), `dialog`, `alert-dialog` (`AlertDialogMedia`), `sheet`, `dropdown-menu` (44px items), `empty` (`EmptyMedia` `icon|destructive`), `sonner` (reads the theme store, 4.5 s). `dialog`, `sheet`, `spinner`, `table` call `useTranslations` (`Common`, `Table`), so they need `I18nProvider`. The rest are stock shadcn (`field`, `calendar`, `chart`, `popover`, `command`, `switch`, `radio-group`, `native-select`…); many are unused by pages.

## 6. Forms
- `react-hook-form` 7 + `zod` 3 + `@hookform/resolvers` (16 files). `lib/validators/*.ts` export code arrays, schema and type. No shadcn `ui/form.tsx`.
- Pattern (pages/dashboard/employees/_components/employee-form.tsx:164-173): `<Controller render={({field, fieldState}) => <Field><FieldLabel/><Input {...field}/><FieldError>{errorMessage(fieldState.error?.message)}</FieldError></Field>} />`. The required marker is typed into the label. Layout: `Card` blocks with `grid grid-cols-1 gap-4 sm:grid-cols-2`, or `Tabs variant="line"` (student-form.tsx:266).
- Select: Radix `Select value={field.value} onValueChange={field.onChange}`, items labelled by `useCodeLabel`. Checkbox and checkbox group: `Checkbox` inside `Controller`, array toggled by hand (student-form.tsx:249, 525). Dates: native `<Input type="date">` with per-form `toDateInputValue`/`parseDateInput` (7 files); `Calendar` only inside `DateRangePicker`. Files: `MediaUploadField`, state outside RHF.
- Submit: `createJsonFormData(payload)`, `appendOptionalFile`, `appendBooleanFlag` (lib/form-submission.ts) for the four forms with uploads; then sonner `toast` and `router.push()` + `router.refresh()`. Big forms use `disabled={isSubmitting}`; dialogs and settings use `<Button loading>`.
- Unsaved-changes guard: `useUnsavedChanges(hasChanges)` (hooks/use-unsaved-changes.ts) exists, `beforeunload` only, zero call sites; no `useBlocker`. Effectively not implemented.

## 7. Tables
- `@tanstack/react-table` 8 (11 files), client-side: the page loads the whole list with `useQuery({ queryKey: pathKey(path) })` and filters in `useMemo`.
- There is no `DataTableShell` component. `components/data-table-shell.tsx` exports `TableSearch {value, onChange, placeholder}`, `DataTable {table, columnCount, emptyMessage}` and `TablePager {table}` (first/prev/next/last mirrored in RTL, hidden for one page, `Table.PageOf`). No built-in filters, sorting or row-action API.
- Canonical recipe: pages/dashboard/attendance/_components/staff-attendance-overview.tsx:48-124. Row actions there are `Button variant="outline" size="sm"`.
- Most other tables (employees, students, teachers, expenses, finance) are older hand-rolled copies: Select filters above, a `Card` with a `CountSummary` title, `DropdownMenu` (`EllipsisVertical`) row actions, delete through `useConfirm`. Copy the shell version.
- List page: `SectionScreen` with `actions={<Button asChild variant="add">…}` around the table (employees/page.tsx:22-37).

## 8. Charts
`recharts` 3.8 through `ui/chart.tsx` (`ChartContainer {config}`, `ChartTooltip`, `ChartTooltipContent`; injects colours for light and `.dark`). Colours: `var(--chart-1)` → `var(--color-<key>)`. Two users: expenses/_components/expenses-chart.tsx and finance/_components/shared/daily-bar-chart.tsx (bar/line/area switch). No shared chart-card wrapper.

## 9. Do not redraw
`index.css` whole (tokens, height variants, fluid root size, scrollbars, print rules, `.no-spinner`); both boot scripts; `lib/preferences/*`, `stores/preferences/*`; `i18n/*` and its tests; `lib/utils.ts` (`cn`, `getInitials`), `lib/use-currency.ts`, `lib/form-submission.ts`; all `components/ui/*`; every composite in §5 except the academy-specific two; `LanguageCard`/`AppearanceCard`; shell namespaces `Common`, `Table`, `Nav`, `Header`, `Auth`, `Settings`, `License`, `MediaUpload`, `DateRangePicker` and the generic `Errors` entries. No raw palette classes (`text-green-700`), no native `confirm()`.
