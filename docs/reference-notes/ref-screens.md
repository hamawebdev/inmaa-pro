# Reference screen catalogue — academy-system-desktop

Root `/mnt/data/academy-system-desktop`; `P` = `src/pages/dashboard`. Router `src/routes.tsx:62-144` (hash router, 47 routes, index → `/dashboard/academy`). Section and tab registry `src/navigation/sections.ts:206-294`.

Wrappers: **SS** `SectionScreen` (`src/components/section-screen.tsx:21`: heading + URL-driven `ScreenTabs`); **DS** `DetailScreen` (`src/components/detail-screen.tsx:20`: back link + heading, no tabs); **AS** `AttendanceScreen` (`P/attendance/_components/attendance-screen.tsx:25`: two tab strips).

**Read first: two visual generations.** Shared primitives are only partly adopted. `StatCard` is used by the overview only; `DataTable/TableSearch/TablePager` (`src/components/data-table-shell.tsx`) by the attendance family only; `StatusChip` by the absence overview only; `SectionPanel`, `PageActions` and `src/components/print/*` have **no page users**. Every other screen hand-rolls shadcn `Card` + `Table` + its own pager, with smaller type (`h-9`, `text-sm`) and some raw colours (`text-green-600`, `bg-emerald-100`). Newest style = overview, attendance family, settings. Not found anywhere: row selection / bulk actions, column sorting, CSV/Excel export.

## 1. Screens (routes under `/dashboard`)

| Route | Purpose | Pattern | Composes | Behaviour |
|---|---|---|---|---|
| `academy` | Landing overview | dashboard with stat cards | `Screen`, `ScreenHeader`, `SectionHeading`, `StatCard`; `GeneralStats`, `PaymentStatusCards` | 6 clickable tiles, refetch on every open |
| `academy/expired`, `academy/one-remaining`, `academy/outstanding-debt` | Students to chase (shown as Students tabs) | list with table | SS + `PaymentStatusView` → `PaymentStatusTable` | search; rows 10/25/50; phones; row button "Renew Subscription" |
| `students` | Roster | list with table | SS + `StudentsTable` | search; level + programme filters in URL params; ⋮ menu; `useConfirm` delete; "x of y" |
| `students/new` | Create | create form page | DS + `StudentForm` | 6 form tabs, photo upload |
| `students/:id` | Edit file | detail with inner tabs | DS + `StudentDetailContent` | summary card, last 5 observations + add dialog, form |
| `students/:id/overview` | Read-only summary | detail (stacked cards, no tabs) | DS, inline cards | observations, present/absent/excused counters, group cards → payments |
| `students/:id/observations` | Notes log | dialog form over a list | DS + `StudentObservationsTable`, `ObservationFormDialog` | add/edit/delete, manager-signature toggle |
| `students/:id/card` | ID card | printable card | DS + `PrintButton`, `StudentCardPrint` → `CardTemplate` | QR auto-generated; print |
| `teachers` | List | list with table | SS + `TeachersTable` | search; level/programme (URL), gender; badges; CV link |
| `teachers/new` | Create | create form page | DS + `TeacherForm` | 6 form tabs; CV + photo |
| `teachers/:id` | Edit file | detail with inner tabs | DS + `TeacherDetailContent` | badge strip, print-card button, form |
| `teachers/:id/overview` | Teacher's groups | list with cards | DS + `TeacherGroupsOverview`, `GroupCard`, `Empty` | level tabs with count pill |
| `teachers/:id/payments` | Income + debt ledger | detail with inner tabs | DS + `TeacherPaymentTabs` (`IncomeTab`, `DebtTab`) | payments ledger, receipts |
| `teachers/:id/card` | ID card | printable card | `TeacherCardPrint` | QR, print |
| `edu-programs` | Programme lookup | dialog form over a list | SS + `TeacherProgramsTable`, `TeacherProgramDialog` | add/edit/delete |
| `groups` | Classes | list with cards | SS + `GroupsTabs`, `GroupCard`, `GroupFormDialog` | search; 4-level pill switch (local state) |
| `groups/:groupId` | Group + attendance grid | detail (no tabs) | DS + `GroupDetailContent`, `AttendanceTable`, `AddStudentDialog` | click-to-cycle cells; sticky name column |
| `groups/:groupId/students/:studentId/payments` | Subscription ledger | detail (no tabs) | `PaymentSummaryCards`, `RenewSubscriptionDialog`, `ForgiveDebtDialog`, `DebtSessionsList`, `PaymentHistoryTable` | debt list, receipts |
| `employees` | List | list with table | SS + `EmployeesTable` | search 6 fields; position + status filters; activate/deactivate |
| `employees/new` | Create | create form page | DS + `EmployeeForm` | 5 stacked cards, no tabs |
| `employees/:id` | Edit file | detail (no tabs) | DS + badges + `EmployeeForm` | |
| `employees/:id/payments` | Payouts + debt | detail with inner tabs | `EmployeePaymentTabs` (`PayoutTab`, `DebtTab`) | inline add form, receipt |
| `employees/:id/card` | ID card | printable card | `EmployeeCardPrint` | |
| `rent-teachers` | Room renters | list with table | SS + `RentTeachersTable` | status filter; totals and red debt column |
| `rent-teachers/new` | Create | create form page | DS + `RentTeacherForm` | name, email, phone, active |
| `rent-teachers/:id` | Renter file | detail (no tabs) | 4 KPI cards, `RentTeacherGroupsList`, `RentGroupFormDialog`, `RentTeacherForm` | |
| `rent-teachers/:id/groups/:groupId` | Rent contract ledger | dialog form over a list | `RentFinancialCards`, `RentPaymentSection`, `RentSessionSection` + dialogs | edit/delete rows |
| `rent-teachers/:id/card` | ID card | printable card | `RentTeacherCardPrint` | no photo |
| `teacher-attendance`, `rent-teacher-attendance`, `employee-attendance` | Latest check-in/out per person | two-axis list | AS + `StaffAttendanceOverview`, `AddCheckRecordAction` | search; add check-in/out |
| `…-attendance/:id` (×3) | One person's week | weekly calendar (read-only) | AS + `StaffCheckHistory`, `WeeklyCheckCalendar` | prev/next week |
| `teacher-absences`, `rent-teacher-absences`, `employee-absences` | Absence counts | two-axis list | AS + `StaffAbsenceOverview`, `AddAbsenceAction`, `StatusChip` | |
| `…-absences/:id` (×3) | One person's absences | dialog form over a list | AS + `StaffAbsenceDetail`, `AddAbsenceDialog` | |
| `scheduling` | Room timetable | weekly calendar with drag and drop | SS + `SchedulingPageClient`, `ClassroomSelector`, `WeeklyCalendar`, `ScheduleEntrySheet`, `ClassroomSettingsDialog` | section 5 |
| `finance` | Analytics | analytics with charts and inner tabs | SS + `FinanceDashboard` | section 6 |
| `expenses` | Expense log | dialog form over a list | SS + `ExpensesChart`, `ExpensesTable`, `ExpenseFormDialog` | chart; category/level filters; receipt preview |
| `settings` | Configuration | settings cards | `Screen` + 10 cards | identity, language, appearance, academic year, classrooms, password, lock, backup, licence, system |
| `coming-soon` | Placeholder | — | plain text | in no section |

## 2. Patterns: open these first

Layout order below is heading / tab strip / toolbar / body / footer.

- **Dashboard with stat cards** — `P/academy/page.tsx`, `src/components/stat-card.tsx`. Icon plate + coloured H1 + description / none / none / two `SectionHeading` blocks, each `grid md:grid-cols-3 gap-5` of tiles (icon plate, label, `text-3xl…5xl tabular-nums` number, hint) / none, deep bottom padding.
- **List with table** — newest: `P/attendance/_components/staff-attendance-overview.tsx`; richest filters: `P/employees/_components/employees-table.tsx`. H1 with `variant="add"` button / section pills / search + `Select` filters (older tables repeat an add button at the far end) / `Card` titled "x of y" holding the table, last column ⋮ `DropdownMenu` / "Page x of y" + first-prev-next-last icon buttons.
- **List with cards** — `P/groups/_components/groups-tabs.tsx`, `group-card.tsx`. H1 / section pills / search + create-dialog trigger / second pill switch, then `grid sm:2 lg:3` of link cards or `Empty` / none.
- **Two-axis list** — `attendance-screen.tsx`, `staff-kind.ts`. H1 + action buttons / two `ScreenTabs` side by side (who ×3, what ×2; switching one keeps the other) / `TableSearch` / `DataTable` with row buttons / `TablePager` (hidden on one page).
- **Create form page** — `P/students/_components/student-form.tsx` (tabbed), `P/employees/_components/employee-form.tsx` (cards). Back link + H1 / `TabsList variant="line"` or none / none / `grid sm:2 lg:3 gap-4` of `Field`, `FieldLabel`, `Input`/`Select`, `FieldError`, `MediaUploadField` / right-aligned Cancel (`router.back()`) + Submit.
- **Detail with inner tabs** — `P/teachers/[id]/payments/_components/teacher-payment-tabs.tsx`. Back link + H1 / `Tabs variant="line"` / none / balance card → inline add-form card → history-table card / receipt `Dialog`.
- **Weekly calendar DnD** — `P/scheduling/_components/weekly-calendar.tsx`. H1 / section pills / classroom `Select` + settings icon / sticky weekday header, 56px time gutter, 7 columns of 32px half-hour cells with absolute blocks / none.
- **Analytics** — `P/finance/_components/finance-dashboard.tsx`. H1 / section pills / date-preset pill bar / KPI grid, then `TabsList variant="segmented"` with chart card + table card per tab / rows-per-page + pager.
- **Settings cards** — `P/settings/page.tsx`: `Screen max-w-4xl flex-col gap-6`, no tabs, stacked self-saving `Card`s.
- **Printable card** — `P/students/[id]/card/page.tsx`, `src/components/card-template.tsx`. Back to profile + title / none / `PrintButton` row (`print:hidden`) / centred `max-w-md` card: primary band with logo + role, photo + name, 2-column fields, badges, 140px QR / "Issued <date>". Print CSS `src/index.css:735-785` hides `header, nav, button, .no-print`, forces white, unpins the shell height.
- **Dialog form over a list** — `P/expenses/_components/expenses-table.tsx` + `expense-form-dialog.tsx`; `rent-payment-section.tsx`. Card header title + Add button / table with Edit/Delete / `Dialog sm:max-w-md|lg`, `DialogFooter` Cancel + Save; delete through `useConfirm({ title, tone: "danger" })` (`src/components/confirm-dialog.tsx:66`); sonner toasts.

**Right-to-left.** New shared parts are logical: `ms-auto`, `-ms-3`, back arrow `rtl:rotate-180` (`src/components/screen.tsx:116-120,155`); pills are separated so they mirror (`screen-tabs.tsx:39-42`); pager swaps chevrons by `directionFor(locale)` (`data-table-shell.tsx:98-103`); search icon `start-4`/`ps-12`; toasts move to top-left (`P/layout.tsx:88`); date/time inputs forced `dir="ltr"`. Older screens use `ltr:left-2.5 rtl:right-2.5` pairs, and some physical leftovers remain (`ml-auto` `student-detail-content.tsx:223`; `left-2.5 pl-8` `employees-table.tsx:298,306`; `mr-2` `payout-form.tsx:133`; `text-right` amount headers). Both calendars use physical `left/right/border-r/sticky left-0`: unsure how they render in Arabic.

## 3. Person-file family

**Lists** (fetch 200, filter and paginate client-side):
- Students: name + national reg. no., father/grandfather, birth date, father/mother phone, ⋮ (details, enrolled groups, print QR card, edit, remove). Name → `/overview`.
- Teachers: name, degree badge, gender badge, phone, email, level badges, CV link, ⋮ (adds Payments). Delete can be refused when still assigned (`teachers-table.tsx:182-188`).
- Employees: last, first, position badge, gender, phone, email, photo link, education, CV link, Active/Inactive badge, ⋮ (view, edit, payments, card, activate/deactivate, delete).
- Rent teachers: name, email, phone, active-groups badge, total payments, outstanding debt (red), status badge.

**New form** (react-hook-form + zod, submitted as FormData via `createJsonFormData`/`appendOptionalFile`):
- Student tabs Personal, Contact, Health, Family, Education (level, stream, year, programme checkboxes), Notes (7 textareas) — `student-form.tsx:265-570`; create lands on the new file.
- Teacher tabs Personal, Contact, Academic, Professional (joining/leaving date, contract type, employment contract, social security, teaching levels), Family, Additional (CV, photo) — `teacher-form.tsx:145-601`.
- Employee cards Personal (incl. job position), Contact, Professional (same contract fields), Family, Additional (CV, photo) — `employee-form.tsx:180-464`.
- Rent teacher: first, last, email, phone, active.

**Detail `/:id`** is the same form in edit mode under a strip of badges (degree/position, Active/Inactive) and a "Print QR card" button. Student adds an Overview card (level, programmes, joined) and a Recent Observations card. Rent teacher adds 4 KPI cards and a Rent Groups table with dialog.

**Overview, payments, observations, card are separate routes, not tabs**, reached from the row menu or buttons, each with `back`. Real inner tabs exist only inside the forms and the payments pages:
- Teacher payments: *Income* — current balance card, "Reset Income" `AlertDialog` → `resetTeacherIncome` → receipt dialog with Print; reset log (date, amount paid in red, balance before, printer icon). *Debts* — current debt card, inline form (type INCREASE/DECREASE, amount, note), history (date, note, ± change, resulting balance).
- Employee payments: *Payouts* — total card, inline amount + note → receipt dialog, history; *Debts* — as teacher.
- Observations (students): table Subject, Observation, Signed, Date; dialog student, level, subject, text, manager signature.
- Card: `CardTemplate` with per-type fields; token from `getQrToken`/`generateQrToken(kind, id)`.

## 4. Attendance family

- One registry drives three kinds: `staff-kind.ts:85-131` (paths, i18n namespaces, actions); server factory `src/server/actions/_staff-attendance.ts` (`makeCheckRecordActions:79`, `makeAbsenceActions:201`).
- **Entry by scanner:** `src/components/qr-scan-listener.tsx` listens document-wide for a 64-hex burst (key gap < 50 ms) → `processQrScan` → toast CheckedIn / CheckedOut; students in several groups get `GroupSelectDialog`.
- **Entry by hand:** "Add Check-In" (`variant="success"`) / "Add Check-Out" (`variant="warning"`) → `AddCheckRecordDialog`: person select (overview) or fixed (detail), date + time defaulting to now, note.
- **Overview list:** first, last, latest check-in (`text-success`), latest check-out (`text-warning-ink`), buttons History / Absences; active people only.
- **Weekly check calendar** (`src/components/weekly-check-calendar.tsx`): Saturday-start week (`weekStartsOn: 6`), 06:00–22:00 at 64 px/hour, a 22px IN (green) or OUT (red) chip at the clock time, note in tooltip; prev/next week with a localised range label. Display only.
- **Absences:** overview count as `StatusChip` (warning if > 0); detail table start, end, type, hours, reason, details; dialog type FULL_DAY (8 h) / HALF_DAY (4 h) / HOURS (start and end required, end after start — `src/lib/validators/absence.ts:3-10`), reason, details.
- **Correction is add-only:** no update or delete for check records or absences found in the factory or the UI.
- Student attendance is separate: per-group months × sessions matrix, click cycles empty → PRESENT → ABSENT → EXCUSED → empty via `setAttendanceCell` (`attendance-table.tsx:47-52,103`).

## 5. Scheduling

- **Entry** `ClassroomSchedule` (`src/lib/db/models.ts:394-408`): `classroomNumber`, `dayOfWeek` 0 = Saturday … 6 = Friday, `startHour` 8–21, `startMinute` 0|30, `durationMinutes` 30–180 in 30s, exactly one of `groupId`/`rentGroupId`, `version`, soft `deletedAt`. A recurring weekly template with no dates. Validators `src/lib/validators/classroom-schedule.ts`; constants `src/data/schedule.ts`.
- **Create:** click an empty half-hour cell → side `Sheet` (type → level → group, duration) → `createScheduleEntry`.
- **Drag:** `@dnd-kit/core`, `PointerSensor` distance 5, `restrictToWindowEdges`, `DragOverlay`; target cell tints `bg-primary/5`, or `bg-destructive/10` when it would clash; drop → `moveScheduleEntry`.
- **Resize:** 8px bottom handle, 30-minute snap, capped at 180 min and 22:00 → `resizeScheduleEntry` (`resize-handle.tsx:21-23,78`).
- **Delete:** hover trash icon, no confirmation (`schedule-block.tsx:36-45`).
- **Conflicts:** client `doesOverlap` + past-end check (toasts `SlotOccupied`, `ExtendPastEnd`), then server `checkOverlap` returning `Overlaps with "<name>" (HH:MM–HH:MM).` (`src/server/actions/classroom-schedule.ts:300-339`). Per classroom only; no teacher double-booking check.
- **Colours:** hash of group id over 14 hard-coded light palettes (`schedule-block.tsx:50-72`), not dark-mode aware.
- **Classroom selector:** `Select w-48` "Classroom n" for 1..count; count is `Setting` key `classroom_count` (1–50), edited here and in Settings; cannot shrink past a classroom with entries.
- **Possible defect (unverified):** `SchedulingPageClient` seeds `useState(initialCount)` with no mount effect (`scheduling-page-client.tsx:31-45`) while the page passes a query that starts at 0 (`P/scheduling/page.tsx:19`); the schedule loads only in `handleClassroomChange`.

## 6. Finance family

- **Date filter** (`finance-date-filter.tsx`): pills Today / 7 Days / This Month (default) / Custom, stored in URL `?from&to&preset`; Custom opens `DateRangePicker` (two-month range popover). Query keyed by range; skeleton while loading.
- **KPI cards** (10, up to 5 per row): Active Subscribers, Student Payments, Student Debts, Rent Payments, Expenses, Teacher Payouts, Teacher Debts, Employee Payouts, Employee Debts, Net Profit (green/red). Net = student + rent payments − teacher payouts − employee payouts − expenses (`src/server/actions/finance.ts:330-336`).
- **Tabs** (`variant="segmented"`, finance hue): Student Payments (chart; date, student, group, ± amount; Print), Student Debts (table only: debt-session change, price/session, debt change, ending debt), Teacher Payouts, Teacher Debts, Employee Payouts, Employee Debts, Rent Payments (each chart + table).
- **Chart** `DailyBarChart`: recharts through `src/components/ui/chart.tsx`, one series `var(--chart-1)`, switchable bar/line/area, daily totals.
- **Table** `FinanceDataTable`: title with count, optional Print (`window.print()`), rows 10/20/50.
- **Expenses:** chart + table (purchasing agent, category badge, level badge, date, amount, note, receipt as image popover or PDF link); dialog agent*, category* (7 fixed codes), level, date*, amount*, note, receipt upload.
- **Payment dialogs:** `RenewSubscriptionDialog` (amount chosen from multiples of the session price; preview sessions − debt; then turns into a printable receipt), `ForgiveDebtDialog`, `RentPaymentDialog` (must be a multiple), `ResetIncomeDialog`, inline `PayoutForm`/`DebtEntryForm`.
- **Money:** three helpers coexist — `useFormatCurrency()` (`src/lib/use-currency.ts`: grouped number + translated `Common.Currency`, deliberately not Intl currency style); `formatMoney`/`formatSignedMoney` (`src/lib/finance/calculations.ts:82-93`, 2 decimals, cent-safe sums); ad-hoc `toLocaleString(localeCode) + t("Currency")`. Always `tabular-nums`; outflow red with "−", inflow green with "+".

## 7. Overview dashboard

Header in the overview hue → "General Statistics": Groups / Teachers / Students tiles, each in its destination section's hue and linking there → "Student Payment Status": Expired Subscription / One Remaining Session / Outstanding Debt (icons `TimerOff`, `CircleAlert`, `TrendingDown`) linking to the three lists. No tables, charts or activity feed. Data `getDashboardStats` (`src/server/actions/dashboard.ts:129`).

## 8. Alerts, reminders, badges

- **Only mechanism: derived counts + filtered lists.** `filterByCategory` (`dashboard.ts:117-123`): expired = paid > 0 and remaining = 0; one-remaining = remaining = 1; debt = remaining < 0 (remaining = paid − attended sessions per student and group). Shown as three overview tiles and three Students tabs with phones and a Renew button. Recomputed on every open (`AGGREGATE_QUERY_OPTIONS = { staleTime: 0 }`, `src/lib/query-client.ts:42`). Thresholds are session counts, not dates.
- **Not found:** bottom-bar badges or dots, a notification centre, scheduled reminders, due-date fields. `tauri-plugin-notification` is registered (`src-tauri/src/lib.rs:188`, `src-tauri/capabilities/default.json:12`) but never imported in `src`; `ui/alert.tsx` has no users.
- **Related:** licence trial badge turns `warning` in the last 7 days (`license-card.tsx:74`, `WARNING_MS` `src/lib/license.ts:19`), Settings only.
- **Small signals:** count pill on tabs (`teacher-groups-overview.tsx:36-40`), `StatusChip` counts, red debt figures, red-bordered "Unpaid sessions" card, toasts.
- **Implication:** contract-end and payment-due alerts must be built new. Closest template: stat tile → filtered list, driven by a date-window query instead of a session count.
