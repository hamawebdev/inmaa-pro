/**
 * Every option list Operations' rules and sheets use, each written once, here.
 *
 * The codes follow the data model's draft list of option codes. A few may still
 * be renamed: that is a change to this file only, and the compiler then points
 * at every use.
 *
 * Two kinds of list live here:
 *
 *  - Operations' own lists (statuses of a visit, kinds of problem…).
 *  - Lists that belong to another owner or are shared, which Foundation will
 *    publish for everyone. Until that module exists they are copied below under
 *    "Read from other owners"; when it does, each one becomes a re-export and
 *    nothing else in this folder changes.
 *
 * Arabic wording for paper is in ../sheets/print-labels.ts; labels for the
 * screen are in ../messages, checked through ../code-labels.ts.
 */

// ── Read from other owners ──────────────────────────────────────────────────

/** His four divisions (shared; wording Clients). */
export const DIVISIONS = ["HOUSING", "ORGANISATION", "BUILDING", "COMPLEX"] as const;
export type Division = (typeof DIVISIONS)[number];

/** «عند الطلب» / «عقد» (shared; wording Clients). */
export const SERVICE_TYPES = ["ON_DEMAND", "CONTRACT"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];

/** «تحديد الفترة» on his five client forms (Clients). */
export const DAY_PERIODS = ["MORNING", "EVENING", "BOTH"] as const;
export type DayPeriod = (typeof DAY_PERIODS)[number];

/** The unit of «مدة التنفيذ» on the on-demand forms (Clients, office-only). */
export const DURATION_UNITS = ["HOURS", "DAYS"] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];

/** «دخول الفريق» on his five client forms (Clients). */
export const TEAM_ACCESS = ["VIA_GUARD", "OWN_KEY", "BUILDING_MANAGER", "OPEN_DOOR"] as const;
export type TeamAccess = (typeof TEAM_ACCESS)[number];

/** Who bears the cleaning materials and the transport: «على عاتق المركز» / «على عاتق صاحبها» (Clients). */
export const BEARERS = ["CENTRE", "OWNER"] as const;
export type Bearer = (typeof BEARERS)[number];

/**
 * The weekday codes stored in code lists («الأيام المتاحة», «أيام التنفيذ»,
 * `work.days`), in the centre's week order. A code's index is the weekday
 * number Operations' rules use: 0 = SAT … 6 = FRI.
 */
export const WEEKDAY_CODES = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"] as const;
export type WeekdayCode = (typeof WEEKDAY_CODES)[number];

/** People's two sexes; the worker form prints them as the «/H/F» suffix. */
export const SEXES = ["MALE", "FEMALE"] as const;
export type Sex = (typeof SEXES)[number];

/** «الصفة» on his buildings worker card (shared; wording People). */
export const WORKER_ROLES = ["CLEANER", "SENIOR_WORKER", "TEAM_LEADER"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];

/** «معدات الوقاية» on his buildings worker card (shared; wording Operations). */
export const PPE = ["GLOVES", "SHOES", "WORKWEAR", "BADGE", "MASK", "EXTRA"] as const;
export type Ppe = (typeof PPE)[number];

/** «مناطق ممنوع دخولها أو لمسها» (stored on the site by Clients; wording Operations). */
export const FORBIDDEN_PLACES = [
  "RESIDENT_FLATS",
  "TECH_ROOMS",
  "ELECTRIC_ROOMS",
  "EQUIPMENT_ROOMS",
  "STORES",
  "OTHER",
] as const;
export type ForbiddenPlace = (typeof FORBIDDEN_PLACES)[number];

/** «تعليمات خاصة» (stored on the site by Clients; wording Operations). */
export const SITE_INSTRUCTIONS = [
  "NO_MOVE_PROPERTY",
  "NO_TOUCH_DOCS",
  "NO_UNAPPROVED_PRODUCTS",
  "NO_MIXING",
  "PROTECT_COMMON",
  "KEEP_QUIET",
  "KEEP_PASSAGES_SAFE",
  "WET_FLOOR_SIGNS",
  "REPORT_DAMAGE",
] as const;
export type SiteInstruction = (typeof SITE_INSTRUCTIONS)[number];

/** What follows a low score (shared; wording Operations, from his study). */
export const CORRECTIVE_ACTIONS = ["REDO_SERVICE", "FIX_ITEMS", "TRAIN_WORKER", "CHANGE_WORKER", "OTHER"] as const;
export type CorrectiveAction = (typeof CORRECTIVE_ACTIONS)[number];

// ── Operations' own lists ───────────────────────────────────────────────────

/** The seven statuses of a visit (scope A9; plan feature 10). */
export const VISIT_STATUSES = [
  "CONFIRMED",
  "AWAITING_CONFIRMATION",
  "IN_PROGRESS",
  "DONE",
  "POSTPONED",
  "PROBLEM",
  "CANCELLED",
] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];

/** Daily, weekly, monthly and special tasks of a file. */
export const TASK_FREQUENCIES = ["DAILY", "WEEKLY", "MONTHLY", "SPECIAL"] as const;
export type TaskFrequency = (typeof TASK_FREQUENCIES)[number];

/** «المنطقة» in the floor and entrance table of his buildings worker card. */
export const AREA_KINDS = ["ENTRANCE", "FLOOR", "ROOM", "SPACE", "OTHER"] as const;
export type AreaKind = (typeof AREA_KINDS)[number];

/** A worker's place on a visit. */
export const SEAT_STATUSES = ["ASSIGNED", "ABSENT", "RESTING", "REPLACED", "REMOVED"] as const;
export type SeatStatus = (typeof SEAT_STATUSES)[number];

/** Which of a worker's two times the site contact initialled on the order. */
export const PRESENCE_PROOFS = ["BOTH", "ARRIVAL_ONLY", "DEPARTURE_ONLY", "NONE"] as const;
export type PresenceProof = (typeof PRESENCE_PROOFS)[number];

/** Whether a returned order has been typed in full. */
export const ENTRY_STATES = ["PARTIAL", "COMPLETE"] as const;
export type EntryState = (typeof ENTRY_STATES)[number];

/** The kinds of line on a visit's checklist: a task, a row of the floor table, a check before leaving. */
export const CHECKLIST_KINDS = ["TASK", "AREA", "DEPARTURE"] as const;
export type ChecklistKind = (typeof CHECKLIST_KINDS)[number];

/** «حالة الإنجاز» on the returned order. */
export const COMPLETIONS = ["FULL", "PARTIAL", "NOT_DONE"] as const;
export type Completion = (typeof COMPLETIONS)[number];

/** «حالة الاستلام»: one list, worded per division on paper. */
export const SIGNOFF_STATUSES = ["ACCEPTED", "ACCEPTED_WITH_NOTES", "NOT_ACCEPTED"] as const;
export type SignoffStatus = (typeof SIGNOFF_STATUSES)[number];

/** «نوع المشكلة» in the worker's notes; the last two come from article 13 of his regulations. */
export const PROBLEM_KINDS = [
  "MATERIAL_SHORTAGE",
  "EQUIPMENT_SHORTAGE",
  "OBSTACLE",
  "AREA_UNAVAILABLE",
  "PRIOR_DAMAGE",
  "SAFETY_HAZARD",
  "RESIDENT_COMPLAINT",
  "EXTRA_SERVICE",
  "OTHER",
  "DAMAGE_DURING_WORK",
  "INJURY_ACCIDENT",
] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number];

/** «مستوى جودة العمل» as the supervisor ticks it. */
export const QUALITY_LEVELS = ["EXCELLENT", "VERY_GOOD", "GOOD", "ACCEPTABLE", "REDO"] as const;
export type QualityLevel = (typeof QUALITY_LEVELS)[number];

/** Why the office telephones about a visit. */
export const CALL_PURPOSES = ["REMINDER", "REPLACEMENT_NOTICE", "ARRIVAL_CHECK", "FOLLOW_UP"] as const;
export type CallPurpose = (typeof CALL_PURPOSES)[number];

/** How a call ended. */
export const CALL_RESULTS = ["INFORMED", "NO_ANSWER", "POSTPONE_REQUESTED", "CANCEL_REQUESTED"] as const;
export type CallResult = (typeof CALL_RESULTS)[number];

/**
 * A working-time rule that a planned seat breaks.
 *
 * The first seven are the data model's RULE_CODE, the rules a manager may pass
 * with a reason (stored on the override). The last four only warn or note, and
 * are shown, never stored.
 */
export const WORK_RULE_CODES = [
  "OVERLAP",
  "DAY_SPAN_12H",
  "WEEK_OVER_48H",
  "NIGHT_WOMAN",
  "NO_REST_DAY",
  "UNAVAILABLE_DAY",
  "ON_LEAVE",
  "WEEK_OVER_CAPACITY",
  "WEEK_OVERTIME",
  "DAY_OVER_8H",
  "REST_DAY_WORKED",
] as const;
export type WorkRuleCode = (typeof WORK_RULE_CODES)[number];

/** What a broken rule costs: a note, a warning, the manager's approval, or a refusal. */
export const WORK_RULE_LEVELS = ["FLAG", "WARNING", "NEEDS_MANAGER", "REFUSED"] as const;
export type WorkRuleLevel = (typeof WORK_RULE_LEVELS)[number];

/** Why a worker is not offered as a replacement. */
export const REPLACEMENT_EXCLUSIONS = [
  "ABSENT",
  "SANCTIONED",
  "UNAVAILABLE_DAY",
  "OVERLAP",
  "WOMEN_ONLY",
  "MISSING_ABILITY",
  "DAY_SPAN_12H",
  "WEEK_OVER_48H",
  "NIGHT_WOMAN",
  "RESTING",
] as const;
export type ReplacementExclusion = (typeof REPLACEMENT_EXCLUSIONS)[number];

/** The five groups replacement candidates are offered in, best first. */
export const REPLACEMENT_TIERS = [
  "FILE_ALTERNATE",
  "RESERVE_SAME_ZONE",
  "WORKER_SAME_ZONE",
  "RESERVE_OTHER_ZONE",
  "WORKER_OTHER_ZONE",
] as const;
export type ReplacementTier = (typeof REPLACEMENT_TIERS)[number];

/** What is wrong with the dates and days a file was given. */
export const PROGRAMME_WARNINGS = [
  "END_BEFORE_START",
  "NO_EXECUTION_DAY",
  "VISITS_PER_WEEK_MISMATCH",
  "REST_DAY_SLOT",
  "OUTSIDE_ALLOWED_WINDOW",
  "DURATION_DAYS_MISMATCH",
  "NO_WORKING_DAY_IN_RANGE",
  "MISSING_DATES",
  "OUTSIDE_SITE_DAYS",
  "OUTSIDE_SITE_HOURS",
] as const;
export type ProgrammeWarning = (typeof PROGRAMME_WARNINGS)[number];

/** Where a complaint stands against its target time. */
export const COMPLAINT_COUNTER_STATES = [
  "RUNNING",
  "CLOSE_TO_TARGET",
  "LATE",
  "ANSWERED_IN_TIME",
  "ANSWERED_LATE",
] as const;
export type ComplaintCounterState = (typeof COMPLAINT_COUNTER_STATES)[number];
