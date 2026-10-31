/**
 * The program's navigation model: seven sections, the paths each one owns, and
 * the hue each one wears.
 *
 * The bottom bar it feeds shows six daily sections plus a narrow utility group
 * (Lock, Settings). Everything below a section is a tab *inside* it — see
 * `tabs` below. The sections are the client's own five, plus the home screen
 * the academy shell brought with it (docs/scope.md, section 2).
 *
 * ## Paths are the source of truth
 *
 * Pages key their queries with `pathKey("/dashboard/workers")` and services
 * call `revalidatePath()` with the same literals, so the cache-invalidation
 * contract is written in URLs. Sections and tabs are a presentation layer laid
 * *over* those paths — `resolveSection()` reads a location and answers "which
 * light is on", and nothing downstream of it can invalidate a query key.
 *
 * ## Who edits this file
 *
 * Foundation only. A new tab, a renamed path or a new section is a change to
 * the shell that every owner sees; ask for it. Detail routes below an existing
 * tab (`workers/new`, `files/:id/quote`) need no change here: they are declared
 * in the owner's own route list (src/features/<owner>/routes.tsx).
 */

import { Boxes, BrushCleaning, ClipboardList, House, Settings, Users, Wallet, type LucideIcon } from "lucide-react";

export type SectionId = "home" | "employees" | "workers" | "requests" | "money" | "stock" | "settings";

/**
 * One hue per section, used everywhere that section is named.
 *
 * The staff running the centre's office are not confident computer users, and
 * "you are on the violet screen" is a landmark in a way that "you are on the
 * third tab" is not. So the bottom bar, the screen's heading, its rule and its
 * panels all draw from the same entry here, and the mapping never varies — a
 * colour that meant *students* in the bar cannot mean something else one click
 * later.
 *
 * Colour is never the only signal. Every place these are used also carries an
 * icon and a word, so nothing here is load-bearing for a colour-blind reader.
 *
 * The classes are spelled out in full rather than composed, because Tailwind
 * scans source *text*: a template literal like `text-section-${id}` produces no
 * CSS at all and fails silently as an unstyled control.
 */
export interface SectionAccent {
  /** Heading and icon colour. */
  text: string;
  /** Faint wash behind a resting nav item. */
  bg: string;
  /** The rule above an active nav item, and beside a screen heading. */
  rule: string;
  /** Focus ring for controls that belong to the section. */
  ring: string;
  /** Border for enclosures that belong to the section. Pairs with `bg`. */
  border: string;
  /** Stronger wash, for the icon plate and the active nav item. */
  fill: string;
  /** Hover wash — one step up from `bg`, so pointing at an item deepens the
   * same hue instead of switching to a generic grey overlay. */
  hoverBg: string;
  /** The lit segment of a ScreenTabs switch belonging to this section. */
  segment: string;
  /**
   * The same treatment for a `<TabsList variant="segmented">` strip.
   *
   * A separate string because the two primitives report their on-state with
   * different attributes — Radix ToggleGroup says `data-state="on"`, Radix Tabs
   * says `data-state="active"` — so neither string can serve both. The `dark:`
   * copies are load-bearing: the trigger's own `dark:text-muted-foreground`
   * would otherwise win in dark mode and grey the hue out.
   */
  tabSegment: string;
}

export const SECTION_ACCENT: Record<SectionId, SectionAccent> = {
  home: {
    text: "text-section-home",
    bg: "bg-section-home/10",
    rule: "bg-section-home",
    ring: "focus-visible:ring-section-home/40",
    border: "border-section-home/35",
    fill: "bg-section-home/15",
    hoverBg: "hover:bg-section-home/20",
    segment:
      "text-section-home data-[state=on]:border-section-home data-[state=on]:bg-section-home/12 data-[state=on]:text-section-home",
    tabSegment:
      "text-section-home dark:text-section-home data-[state=active]:border-section-home data-[state=active]:bg-section-home/12 data-[state=active]:text-section-home dark:data-[state=active]:text-section-home",
  },
  employees: {
    text: "text-section-employees",
    bg: "bg-section-employees/10",
    rule: "bg-section-employees",
    ring: "focus-visible:ring-section-employees/40",
    border: "border-section-employees/35",
    fill: "bg-section-employees/15",
    hoverBg: "hover:bg-section-employees/20",
    segment:
      "text-section-employees data-[state=on]:border-section-employees data-[state=on]:bg-section-employees/12 data-[state=on]:text-section-employees",
    tabSegment:
      "text-section-employees dark:text-section-employees data-[state=active]:border-section-employees data-[state=active]:bg-section-employees/12 data-[state=active]:text-section-employees dark:data-[state=active]:text-section-employees",
  },
  workers: {
    text: "text-section-workers",
    bg: "bg-section-workers/10",
    rule: "bg-section-workers",
    ring: "focus-visible:ring-section-workers/40",
    border: "border-section-workers/35",
    fill: "bg-section-workers/15",
    hoverBg: "hover:bg-section-workers/20",
    segment:
      "text-section-workers data-[state=on]:border-section-workers data-[state=on]:bg-section-workers/12 data-[state=on]:text-section-workers",
    tabSegment:
      "text-section-workers dark:text-section-workers data-[state=active]:border-section-workers data-[state=active]:bg-section-workers/12 data-[state=active]:text-section-workers dark:data-[state=active]:text-section-workers",
  },
  requests: {
    text: "text-section-requests",
    bg: "bg-section-requests/10",
    rule: "bg-section-requests",
    ring: "focus-visible:ring-section-requests/40",
    border: "border-section-requests/35",
    fill: "bg-section-requests/15",
    hoverBg: "hover:bg-section-requests/20",
    segment:
      "text-section-requests data-[state=on]:border-section-requests data-[state=on]:bg-section-requests/12 data-[state=on]:text-section-requests",
    tabSegment:
      "text-section-requests dark:text-section-requests data-[state=active]:border-section-requests data-[state=active]:bg-section-requests/12 data-[state=active]:text-section-requests dark:data-[state=active]:text-section-requests",
  },
  money: {
    text: "text-section-money",
    bg: "bg-section-money/10",
    rule: "bg-section-money",
    ring: "focus-visible:ring-section-money/40",
    border: "border-section-money/35",
    fill: "bg-section-money/15",
    hoverBg: "hover:bg-section-money/20",
    segment:
      "text-section-money data-[state=on]:border-section-money data-[state=on]:bg-section-money/12 data-[state=on]:text-section-money",
    tabSegment:
      "text-section-money dark:text-section-money data-[state=active]:border-section-money data-[state=active]:bg-section-money/12 data-[state=active]:text-section-money dark:data-[state=active]:text-section-money",
  },
  stock: {
    text: "text-section-stock",
    bg: "bg-section-stock/10",
    rule: "bg-section-stock",
    ring: "focus-visible:ring-section-stock/40",
    border: "border-section-stock/35",
    fill: "bg-section-stock/15",
    hoverBg: "hover:bg-section-stock/20",
    segment:
      "text-section-stock data-[state=on]:border-section-stock data-[state=on]:bg-section-stock/12 data-[state=on]:text-section-stock",
    tabSegment:
      "text-section-stock dark:text-section-stock data-[state=active]:border-section-stock data-[state=active]:bg-section-stock/12 data-[state=active]:text-section-stock dark:data-[state=active]:text-section-stock",
  },
  settings: {
    text: "text-section-settings",
    bg: "bg-section-settings/10",
    rule: "bg-section-settings",
    ring: "focus-visible:ring-section-settings/40",
    border: "border-section-settings/35",
    fill: "bg-section-settings/15",
    hoverBg: "hover:bg-section-settings/20",
    segment:
      "text-section-settings data-[state=on]:border-section-settings data-[state=on]:bg-section-settings/12 data-[state=on]:text-section-settings",
    tabSegment:
      "text-section-settings dark:text-section-settings data-[state=active]:border-section-settings data-[state=active]:bg-section-settings/12 data-[state=active]:text-section-settings dark:data-[state=active]:text-section-settings",
  },
};

export interface SectionTab {
  id: string;
  /** Key inside the `Nav` i18n namespace. */
  labelKey: string;
  href: string;
  icon?: LucideIcon;
  /**
   * Extra path prefixes that should light this tab. A tab's own `href` always
   * counts; this is for the detail routes that hang off it — `/workers/new`
   * and `/workers/:id` both belong to the "Workers" tab.
   */
  owns?: readonly string[];
}

export interface SectionDef {
  id: SectionId;
  /** The short name on the bottom bar. Key inside the `Nav` i18n namespace. */
  labelKey: string;
  /** The heading on the section's screens, where the client's notes give a longer one. */
  headingKey: string;
  icon: LucideIcon;
  /** Where the bottom bar sends you. */
  href: string;
  /**
   * The **exact** first path segments after `/dashboard` that belong to this
   * section. Exact, never `startsWith`: `/dashboard/workers` and
   * `/dashboard/worker-attendance` share a prefix and happen to share a
   * section, but `/dashboard/employees` and `/dashboard/employee-attendance`
   * style pairs must never be matched by accident.
   */
  segments: readonly string[];
  tabs?: readonly SectionTab[];
}

/** A tab whose first path segment is also its id, and which keeps its detail routes lit. */
function tab(segment: string, labelKey: string): SectionTab {
  const href = `/dashboard/${segment}`;
  return { id: segment, labelKey, href, owns: [href] };
}

export const SECTIONS: readonly SectionDef[] = [
  {
    id: "home",
    labelKey: "Home",
    headingKey: "HomeHeading",
    icon: House,
    href: "/dashboard/home",
    segments: ["home"],
  },
  {
    // His section 1: قسم الموظفين بالمركز.
    id: "employees",
    labelKey: "Employees",
    headingKey: "EmployeesHeading",
    icon: Users,
    href: "/dashboard/employees",
    segments: ["employees", "employee-attendance", "supervisors", "rep-visits"],
    tabs: [
      tab("employees", "EmployeesList"),
      tab("employee-attendance", "EmployeeAttendance"),
      tab("supervisors", "Supervisors"),
      tab("rep-visits", "RepVisits"),
    ],
  },
  {
    // His section 2: عمال وعاملات النظافة.
    id: "workers",
    labelKey: "Workers",
    headingKey: "WorkersHeading",
    icon: BrushCleaning,
    href: "/dashboard/workers",
    segments: ["workers", "hiring", "work-program", "worker-attendance", "hours-pay"],
    tabs: [
      tab("workers", "WorkersList"),
      tab("hiring", "Hiring"),
      tab("work-program", "WorkProgram"),
      tab("worker-attendance", "WorkerAttendance"),
      tab("hours-pay", "HoursPay"),
    ],
  },
  {
    // His section 3: طلبات الخدمة. A file's own pages (`files/:id/...`) stay
    // under the "Files" tab; their list is in src/navigation/file-parts.ts.
    id: "requests",
    labelKey: "Requests",
    headingKey: "RequestsHeading",
    icon: ClipboardList,
    href: "/dashboard/files",
    segments: ["files", "visits", "quality", "clients"],
    tabs: [tab("files", "Files"), tab("visits", "Visits"), tab("quality", "Quality"), tab("clients", "Clients")],
  },
  {
    // His section 4. Bar label «المصاريف», heading «المصاريف والمداخيل».
    id: "money",
    labelKey: "Money",
    headingKey: "MoneyHeading",
    icon: Wallet,
    href: "/dashboard/expenses",
    segments: ["expenses", "income", "invoices", "payments", "reports"],
    tabs: [
      tab("expenses", "Expenses"),
      tab("income", "Income"),
      tab("invoices", "Invoices"),
      tab("payments", "Payments"),
      tab("reports", "Reports"),
    ],
  },
  {
    // His section 5: إدارة المخزون.
    id: "stock",
    labelKey: "Stock",
    headingKey: "StockHeading",
    icon: Boxes,
    href: "/dashboard/inventory",
    segments: ["inventory", "handouts", "purchases", "maintenance"],
    tabs: [
      tab("inventory", "Inventory"),
      tab("handouts", "Handouts"),
      tab("purchases", "Purchases"),
      tab("maintenance", "Maintenance"),
    ],
  },
  {
    id: "settings",
    labelKey: "Settings",
    headingKey: "SettingsHeading",
    icon: Settings,
    href: "/dashboard/settings",
    segments: ["settings"],
    // One first segment, six tabs: the five below the first are told apart by
    // their second segment, which `resolveTab`'s longest match handles.
    tabs: [
      { id: "general", labelKey: "SettingsGeneral", href: "/dashboard/settings" },
      {
        id: "rules",
        labelKey: "SettingsRules",
        href: "/dashboard/settings/rules",
        owns: ["/dashboard/settings/rules"],
      },
      {
        // His two service lists, the manager's to edit (the developer, 2026-10-22).
        id: "services",
        labelKey: "SettingsServices",
        href: "/dashboard/settings/services",
        owns: ["/dashboard/settings/services"],
      },
      {
        id: "users",
        labelKey: "SettingsUsers",
        href: "/dashboard/settings/users",
        owns: ["/dashboard/settings/users"],
      },
      {
        // The two laptops (docs/sync/DECISION.md): set-up, pairing, the books, conflicts.
        id: "sync",
        labelKey: "SettingsSync",
        href: "/dashboard/settings/sync",
        owns: ["/dashboard/settings/sync"],
      },
      { id: "log", labelKey: "SettingsLog", href: "/dashboard/settings/log", owns: ["/dashboard/settings/log"] },
    ],
  },
];

/** The six that share the bar's width. Settings sits in the utility group. */
export const PRIMARY_SECTIONS = SECTIONS.filter((s) => s.id !== "settings");

export const SETTINGS_SECTION = SECTIONS.find((s) => s.id === "settings")!;

/** Where the program opens, and where an unknown address is sent. */
export const HOME_PATH = "/dashboard/home";

const SECTION_BY_SEGMENT = new Map<string, SectionId>(
  SECTIONS.flatMap((s) => s.segments.map((seg) => [seg, s.id] as const)),
);

/**
 * Which section a location belongs to, or `undefined` for a route that is in no
 * section at all (an unmatched path).
 *
 * Matches on whole segments rather than string prefixes. `"employees"` and
 * `"employee-attendance"`, `"workers"` and `"worker-attendance"`, `"visits"`
 * and `"rep-visits"` are the pairs that make this necessary: a prefix test
 * lights the wrong tab, and the bug is invisible until someone opens the page.
 */
export function resolveSection(pathname: string): SectionId | undefined {
  const parts = pathname.split("/").filter(Boolean);
  const at = parts.indexOf("dashboard");
  if (at === -1) return undefined;
  const head = parts[at + 1];
  if (!head) return "home";
  return SECTION_BY_SEGMENT.get(head);
}

export function getSection(id: SectionId): SectionDef {
  return SECTIONS.find((s) => s.id === id)!;
}

/** True when `pathname` is exactly `href` or a child route of it. */
function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * Which tab of `section` is active, or `undefined` when the location belongs to
 * no tab.
 *
 * Longest match wins, so `/dashboard/settings/users` picks the Users tab
 * rather than the General tab it also sits under.
 */
export function resolveTab(sectionId: SectionId, pathname: string): string | undefined {
  const tabs = getSection(sectionId).tabs;
  if (!tabs) return undefined;

  let best: { id: string; length: number } | undefined;
  for (const tab of tabs) {
    for (const href of [tab.href, ...(tab.owns ?? [])]) {
      if (isUnder(pathname, href) && (!best || href.length > best.length)) {
        best = { id: tab.id, length: href.length };
      }
    }
  }
  return best?.id;
}

/**
 * Whether the location is a section's own landing view rather than a detail
 * route beneath it.
 *
 * The tab strip shows only on landing views: a strip switches between siblings,
 * and a single worker's file has none. Detail routes get a back action in
 * their `ScreenHeader` instead.
 */
export function isSectionLanding(sectionId: SectionId, pathname: string): boolean {
  const section = getSection(sectionId);
  if (!section.tabs) return true;
  return section.tabs.some((tab) => pathname === tab.href);
}
