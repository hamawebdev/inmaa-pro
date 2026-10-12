import type { LocalDate } from "@/lib/units";

/**
 * The option lists more than one owner uses: one copy for everyone.
 *
 * Codes from docs/data-model/OPTION-CODES.md (section 1, and the lists the
 * owners' own copies showed in common), in his order. For each list:
 *
 *  - `DIVISIONS` the codes, `as const`, and `Division` their type;
 *  - `DIVISION_AR` his words for each, as his forms print them: what a printed
 *    sheet writes, whatever the interface language;
 *  - on screen, `useCodeLabel("Options.Division")` labels a code in the reader's
 *    language (src/features/core/messages; core's code-labels.ts has the test
 *    check all three).
 *
 * An owner's copy becomes a re-export, and nothing else in its folder changes:
 *
 *     export { DIVISIONS, type Division } from "@/lib/options";
 *
 * A change to one of these lists is asked of Foundation. Lists only one owner
 * uses stay in that owner's folder.
 */

// ── DIVISION (Clients, Operations, Money) ────────────────────────────────────────

/** His four divisions. The words are the switch labels of his notes; a form's title box uses `DIVISION_TITLE_AR`. */
export const DIVISIONS = ["HOUSING", "ORGANISATION", "BUILDING", "COMPLEX"] as const;
export type Division = (typeof DIVISIONS)[number];
export const DIVISION_AR: Readonly<Record<Division, string>> = {
  HOUSING: "المنازل",
  ORGANISATION: "المؤسسات",
  BUILDING: "العمارات",
  COMPLEX: "التجمعات السكنية",
};

/** The word in a form's title box: «طلب خدمة تنظيف (سكن)». */
export const DIVISION_TITLE_AR: Readonly<Record<Division, string>> = {
  HOUSING: "سكن",
  ORGANISATION: "مؤسسة",
  BUILDING: "عمارة",
  COMPLEX: "تجمع سكني",
};

// ── SERVICE_TYPE (Clients, Operations, Money) ────────────────────────────────────

/** «عند الطلب» or «عقد». */
export const SERVICE_TYPES = ["ON_DEMAND", "CONTRACT"] as const;
export type ServiceType = (typeof SERVICE_TYPES)[number];
export const SERVICE_TYPE_AR: Readonly<Record<ServiceType, string>> = {
  ON_DEMAND: "عند الطلب",
  CONTRACT: "عقد",
};

// ── PAYMENT_METHOD (Clients, Money, People (wage method)) ────────────────────────

/** «طريقة السداد»: the file's, an invoice's, a payment's, an expense's, a wage's. */
export const PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "POSTAL_TRANSFER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export const PAYMENT_METHOD_AR: Readonly<Record<PaymentMethod, string>> = {
  CASH: "نقدًا",
  BANK_TRANSFER: "تحويل بنكي",
  POSTAL_TRANSFER: "تحويل بريدي",
};

// ── PAYMENT_FREQUENCY (Clients, Money) ───────────────────────────────────────────

/** «دورية السداد» on his three contract forms. */
export const PAYMENT_FREQUENCIES = ["PER_VISIT", "WEEKLY", "BIWEEKLY", "MONTHLY"] as const;
export type PaymentFrequency = (typeof PAYMENT_FREQUENCIES)[number];
export const PAYMENT_FREQUENCY_AR: Readonly<Record<PaymentFrequency, string>> = {
  PER_VISIT: "بعد كل زيارة",
  WEEKLY: "أسبوعيا",
  BIWEEKLY: "كل أسبوعين",
  MONTHLY: "كل شهر",
};

// ── AMOUNT_BASIS (Clients, Money) ────────────────────────────────────────────────

/** What «المبلغ إجمالي» covers (office only, scope A7). */
export const AMOUNT_BASES = ["PER_PAYMENT_PERIOD", "WHOLE_CONTRACT"] as const;
export type AmountBasis = (typeof AMOUNT_BASES)[number];
export const AMOUNT_BASIS_AR: Readonly<Record<AmountBasis, string>> = {
  PER_PAYMENT_PERIOD: "لكل فترة سداد",
  WHOLE_CONTRACT: "لكامل العقد",
};

// ── WEEKDAY (People, Clients, Operations) ────────────────────────────────────────

/** Saturday first, as he lists them. The words are his worker form's («الأيام المتاحة»); the client forms' are `CLIENT_WEEKDAY_AR`. */
export const WEEKDAYS = ["SAT", "SUN", "MON", "TUE", "WED", "THU", "FRI"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_AR: Readonly<Record<Weekday, string>> = {
  SAT: "السبت",
  SUN: "الأحد",
  MON: "الإثنين",
  TUE: "الثلاثاء",
  WED: "الأربعاء",
  THU: "الخميس",
  FRI: "الجمعة",
};

/** The client forms' «أيام التنفيذ»: Saturday to Thursday, «الاثنين» written their way. */
export const CLIENT_WEEKDAYS = ["SAT", "SUN", "MON", "TUE", "WED", "THU"] as const;
export type ClientWeekday = (typeof CLIENT_WEEKDAYS)[number];
export const CLIENT_WEEKDAY_AR: Readonly<Record<ClientWeekday, string>> = {
  SAT: "السبت",
  SUN: "الأحد",
  MON: "الاثنين",
  TUE: "الثلاثاء",
  WED: "الأربعاء",
  THU: "الخميس",
};

/** The weekday number Operations' tables store: 0 is Saturday, 6 is Friday. */
export const weekdayIndex = (day: Weekday): number => WEEKDAYS.indexOf(day);

/** The weekday of a calendar date. */
export function weekdayOf(date: LocalDate): Weekday {
  const sundayFirst = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return WEEKDAYS[(sundayFirst + 1) % 7];
}

// ── YES_NO (all) ─────────────────────────────────────────────────────────────────

/** A nullable yes/no column, ticked: null is neither box. His forms print «نعم» then «لا», except «السجل التجاري» (F3, F4): «لا» then «نعم». */
export const YES_NO = ["YES", "NO"] as const;
export type YesNo = (typeof YES_NO)[number];
export const YES_NO_AR: Readonly<Record<YesNo, string>> = {
  YES: "نعم",
  NO: "لا",
};

/** A nullable yes/no column as a tick: null when neither box is ticked. */
export function yesNoOf(value: boolean | number | null | undefined): YesNo | null {
  return value === null || value === undefined ? null : value ? "YES" : "NO";
}

/** A tick as the column stores it. */
export function yesNoValue(code: YesNo | null | undefined): boolean | null {
  return code === null || code === undefined ? null : code === "YES";
}

// ── CLEANLINESS (Clients, Operations) ────────────────────────────────────────────

/** «تقييم النظافة» on every client form, and the state of each space of a first visit. */
export const CLEANLINESS_LEVELS = ["EXCELLENT", "GOOD", "AVERAGE", "POOR", "NEEDS_DEEP"] as const;
export type Cleanliness = (typeof CLEANLINESS_LEVELS)[number];
export const CLEANLINESS_AR: Readonly<Record<Cleanliness, string>> = {
  EXCELLENT: "ممتاز",
  GOOD: "جيد",
  AVERAGE: "متوسط",
  POOR: "ضعيف",
  NEEDS_DEEP: "يحتاج إلى تنظيف عميق",
};

// ── DAY_PERIOD (Clients, Operations) ─────────────────────────────────────────────

/** «تحديد الفترة» on his five client forms. */
export const DAY_PERIODS = ["MORNING", "EVENING", "BOTH"] as const;
export type DayPeriod = (typeof DAY_PERIODS)[number];
export const DAY_PERIOD_AR: Readonly<Record<DayPeriod, string>> = {
  MORNING: "الصباحية",
  EVENING: "المسائية",
  BOTH: "معا",
};

// ── BEARER (Clients, Operations, Money) ──────────────────────────────────────────

/** Who bears the cleaning materials and the transport («مواد التنظيف», «توفير النقل»). */
export const BEARERS = ["CENTRE", "OWNER"] as const;
export type Bearer = (typeof BEARERS)[number];
export const BEARER_AR: Readonly<Record<Bearer, string>> = {
  CENTRE: "على عاتق المركز",
  OWNER: "على عاتق صاحبها",
};

// ── DURATION_UNIT (Clients, Operations) ──────────────────────────────────────────

/** The unit of «مدة التنفيذ» on the on-demand forms. */
export const DURATION_UNITS = ["HOURS", "DAYS"] as const;
export type DurationUnit = (typeof DURATION_UNITS)[number];
export const DURATION_UNIT_AR: Readonly<Record<DurationUnit, string>> = {
  HOURS: "ساعة",
  DAYS: "يوم",
};

// ── TEAM_ACCESS (Clients, Operations) ────────────────────────────────────────────

/** «دخول الفريق» on his five client forms (several may be ticked). */
export const TEAM_ACCESS = ["VIA_GUARD", "OWN_KEY", "BUILDING_MANAGER", "OPEN_DOOR"] as const;
export type TeamAccess = (typeof TEAM_ACCESS)[number];
export const TEAM_ACCESS_AR: Readonly<Record<TeamAccess, string>> = {
  VIA_GUARD: "عن طريق الحارس",
  OWN_KEY: "مفتاح خاص",
  BUILDING_MANAGER: "مسؤول العمارة",
  OPEN_DOOR: "باب مفتوح خلال ساعات العمل",
};

// ── FILE_STAGE (Clients (owner), Operations, Money) ──────────────────────────────

/** The stored stage of a file, in order (scope A5). The words are his status boxes'. */
export const FILE_STAGES = ["NEW", "VISIT", "QUOTE", "CONTRACTED", "CONTRACT_ENDED"] as const;
export type FileStage = (typeof FILE_STAGES)[number];
export const FILE_STAGE_AR: Readonly<Record<FileStage, string>> = {
  NEW: "جديد",
  VISIT: "الزيارة",
  QUOTE: "عرض سعر",
  CONTRACTED: "متعاقد",
  CONTRACT_ENDED: "انتهاء التعاقد",
};

// ── SEX (People (owner), Operations) ─────────────────────────────────────────────

/** A person's sex (People's wording: the form has no sex field). It gives the «/H/F» of a worker's number. */
export const SEXES = ["MALE", "FEMALE"] as const;
export type Sex = (typeof SEXES)[number];
export const SEX_AR: Readonly<Record<Sex, string>> = {
  MALE: "ذكر",
  FEMALE: "أنثى",
};

/** «/H/F» after a worker's number: H for a man, F for a woman. */
export const REG_SUFFIXES = ["H", "F"] as const;
export type RegSuffix = (typeof REG_SUFFIXES)[number];
export const REG_SUFFIX_OF_SEX: Readonly<Record<Sex, RegSuffix>> = { MALE: "H", FEMALE: "F" };

// ── WORKER_ROLE (People (owner), Operations) ─────────────────────────────────────

/** «الصفة» of a worker (D9 section 2). A woman's words are `WORKER_ROLE_FEMININE_AR`; `workerRoleAr(role, sex)` picks. */
export const WORKER_ROLES = ["CLEANER", "SENIOR_WORKER", "TEAM_LEADER"] as const;
export type WorkerRole = (typeof WORKER_ROLES)[number];
export const WORKER_ROLE_AR: Readonly<Record<WorkerRole, string>> = {
  CLEANER: "عامل نظافة",
  SENIOR_WORKER: "عامل رئيسي",
  TEAM_LEADER: "قائد فريق",
};

/** The same, for a woman. */
export const WORKER_ROLE_FEMININE_AR: Readonly<Record<WorkerRole, string>> = {
  CLEANER: "عاملة نظافة",
  SENIOR_WORKER: "عاملة رئيسية",
  TEAM_LEADER: "قائدة فريق",
};

/** A worker's «الصفة» in his words, for a man or a woman. */
export function workerRoleAr(role: WorkerRole, sex: Sex | null | undefined): string {
  return sex === "FEMALE" ? WORKER_ROLE_FEMININE_AR[role] : WORKER_ROLE_AR[role];
}

// ── ABILITY (People (owner), Clients (a site's required abilities), Operations) ────

/** «القدرة البدنية / هل لديك قدرة على» on his worker form. */
export const ABILITIES = [
  "CARRY_EQUIPMENT",
  "STAND_LONG_HOURS",
  "CLIMB_STAIRS",
  "UPPER_FLOORS",
  "WORK_UNDER_PRESSURE",
  "MOVE_BETWEEN_SITES",
] as const;
export type Ability = (typeof ABILITIES)[number];
export const ABILITY_AR: Readonly<Record<Ability, string>> = {
  CARRY_EQUIPMENT: "حمل المعدات",
  STAND_LONG_HOURS: "الوقوف لساعات طويلة",
  CLIMB_STAIRS: "صعود السلالم",
  UPPER_FLOORS: "العمل في الطوابق العليا",
  WORK_UNDER_PRESSURE: "العمل تحت الضغط",
  MOVE_BETWEEN_SITES: "التنقل بين المؤسسات",
};

// ── TRANSPORT_MEANS (Clients, Operations) ────────────────────────────────────────

/** How the team travels (D6 section 16). */
export const TRANSPORT_MEANS = ["CENTRE_VEHICLE", "PUBLIC", "WORKER_OWN", "OTHER"] as const;
export type TransportMeans = (typeof TRANSPORT_MEANS)[number];
export const TRANSPORT_MEANS_AR: Readonly<Record<TransportMeans, string>> = {
  CENTRE_VEHICLE: "سيارة المؤسسة",
  PUBLIC: "نقل عمومي",
  WORKER_OWN: "وسيلة العامل",
  OTHER: "أخرى",
};

// ── ABSENCE_TYPE (People, Operations) ────────────────────────────────────────────

/** How long an absence is. */
export const ABSENCE_TYPES = ["FULL_DAY", "HALF_DAY", "HOURS"] as const;
export type AbsenceType = (typeof ABSENCE_TYPES)[number];
export const ABSENCE_TYPE_AR: Readonly<Record<AbsenceType, string>> = {
  FULL_DAY: "يوم كامل",
  HALF_DAY: "نصف يوم",
  HOURS: "ساعات",
};

// ── LEAVE_TYPE (People (owner), Operations) ──────────────────────────────────────

/** A kind of leave (People's wording; no client wording). */
export const LEAVE_TYPES = ["ANNUAL", "SICK", "UNPAID", "MATERNITY", "FAMILY_EVENT", "COMP_REST", "OTHER"] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];
export const LEAVE_TYPE_AR: Readonly<Record<LeaveType, string>> = {
  ANNUAL: "عطلة سنوية",
  SICK: "عطلة مرضية",
  UNPAID: "عطلة بدون أجر",
  MATERNITY: "عطلة أمومة",
  FAMILY_EVENT: "عطلة استثنائية",
  COMP_REST: "راحة تعويضية",
  OTHER: "أخرى",
};

// ── PPE (Clients (a site's kit), Operations, Money (stock items PPE_…)) ──────────

/** «معدات الوقاية» (D9 section 12). The seeded stock items are `PPE_` and the same code. */
export const PPE = ["GLOVES", "SHOES", "WORKWEAR", "BADGE", "MASK", "EXTRA"] as const;
export type Ppe = (typeof PPE)[number];
export const PPE_AR: Readonly<Record<Ppe, string>> = {
  GLOVES: "قفازات",
  SHOES: "أحذية مناسبة",
  WORKWEAR: "لباس العمل",
  BADGE: "سترة/شارة تعريف",
  MASK: "كمامة عند الحاجة",
  EXTRA: "معدات حماية إضافية حسب طبيعة المهمة",
};

// ── CORRECTIVE_ACTION (Operations, People) ───────────────────────────────────────

/** What follows a low score (D1). `FIX_ITEMS` is worded as Operations prints it. */
export const CORRECTIVE_ACTIONS = ["REDO_SERVICE", "FIX_ITEMS", "TRAIN_WORKER", "CHANGE_WORKER", "OTHER"] as const;
export type CorrectiveAction = (typeof CORRECTIVE_ACTIONS)[number];
export const CORRECTIVE_ACTION_AR: Readonly<Record<CorrectiveAction, string>> = {
  REDO_SERVICE: "إعادة الخدمة",
  FIX_ITEMS: "تصحيح النقائص",
  TRAIN_WORKER: "تدريب العاملة",
  CHANGE_WORKER: "تغيير العاملة",
  OTHER: "أخرى",
};

// ── EVALUATION_RECOMMENDATION (People, Operations) ───────────────────────────────

/** What a periodic evaluation recommends. «لا شيء» is our word: his list has none for it. */
export const EVALUATION_RECOMMENDATIONS = ["TRAIN_WORKER", "CHANGE_WORKER", "NONE"] as const;
export type EvaluationRecommendation = (typeof EVALUATION_RECOMMENDATIONS)[number];
export const EVALUATION_RECOMMENDATION_AR: Readonly<Record<EvaluationRecommendation, string>> = {
  TRAIN_WORKER: "تدريب العاملة",
  CHANGE_WORKER: "تغيير العاملة",
  NONE: "لا شيء",
};

// ── FORBIDDEN_PLACE (Clients (stores it on the site), Operations (prints it)) ────

/** «مناطق ممنوع دخولها أو لمسها» (D9 section 9). */
export const FORBIDDEN_PLACES = [
  "RESIDENT_FLATS",
  "TECH_ROOMS",
  "ELECTRIC_ROOMS",
  "EQUIPMENT_ROOMS",
  "STORES",
  "OTHER",
] as const;
export type ForbiddenPlace = (typeof FORBIDDEN_PLACES)[number];
export const FORBIDDEN_PLACE_AR: Readonly<Record<ForbiddenPlace, string>> = {
  RESIDENT_FLATS: "شقق السكان",
  TECH_ROOMS: "غرف تقنية",
  ELECTRIC_ROOMS: "غرف كهرباء",
  EQUIPMENT_ROOMS: "غرف معدات",
  STORES: "مستودعات",
  OTHER: "مناطق أخرى",
};

// ── SITE_INSTRUCTION (Clients (stores it on the site), Operations (prints it)) ────

/** «تعليمات خاصة» (D9 section 10). */
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
export const SITE_INSTRUCTION_AR: Readonly<Record<SiteInstruction, string>> = {
  NO_MOVE_PROPERTY: "عدم تحريك ممتلكات السكان",
  NO_TOUCH_DOCS: "عدم لمس الوثائق أو الأغراض الشخصية",
  NO_UNAPPROVED_PRODUCTS: "عدم استعمال مواد غير معتمدة",
  NO_MIXING: "عدم خلط مواد التنظيف",
  PROTECT_COMMON: "المحافظة على الممتلكات المشتركة",
  KEEP_QUIET: "المحافظة على الهدوء وعدم إزعاج السكان",
  KEEP_PASSAGES_SAFE: "إبقاء الممرات آمنة أثناء التنظيف",
  WET_FLOOR_SIGNS: "وضع إشارات تحذيرية عند وجود أرضية مبللة",
  REPORT_DAMAGE: "إبلاغ المشرف فوراً عن أي ضرر أو خطر",
};

// ── PROVIDED_SERVICE (Clients (owner), Operations (the day board), Money (income by service)) ────

/** «الخدمات المقدمة»: one catalogue; each division's forms offer a subset, `PROVIDED_SERVICES_OF`. */
export const PROVIDED_SERVICES = [
  "FLOORS",
  "KITCHEN",
  "CURTAINS",
  "WINDOWS",
  "CEILINGS",
  "FRIDGE",
  "BATHROOMS",
  "GLASS",
  "OVEN",
  "CARPETS",
  "CUPBOARDS",
  "CHILDREN_ROOMS",
  "GARAGE",
  "FURNITURE",
  "SIGNS_ADS",
  "TOILETS",
  "WASTE_SORTING",
  "SHELVES",
  "OFFICES",
  "CAR_PARKS",
  "APPLIANCES",
  "RECEPTION_HALL",
  "MEETING_ROOMS",
  "STORES",
  "GARDENS",
  "COURTYARDS",
  "SWEEP_DUST",
  "STAINS",
  "DOORS",
  "CORRIDORS",
  "WALLS",
  "CORNERS",
  "MAILBOXES",
  "ENTRANCES",
  "PAVEMENTS",
] as const;
export type ProvidedService = (typeof PROVIDED_SERVICES)[number];
export const PROVIDED_SERVICE_AR: Readonly<Record<ProvidedService, string>> = {
  FLOORS: "تنظيف الأرضيات",
  KITCHEN: "تنظيف المطبخ",
  CURTAINS: "تنظيف الستائر",
  WINDOWS: "تنظيف النوافذ",
  CEILINGS: "تنظيف الأسقف",
  FRIDGE: "تنظيف الثلاجة",
  BATHROOMS: "تنظيف الحمامات",
  GLASS: "تنظيف الزجاج",
  OVEN: "تنظيف الفرن",
  CARPETS: "تنظيف السجاد",
  CUPBOARDS: "تنظيف الخزائن",
  CHILDREN_ROOMS: "تنظيف غرف الأطفال",
  GARAGE: "تنظيف المرآب",
  FURNITURE: "تنظيف الأثاث",
  SIGNS_ADS: "اللوحات والإعلانات",
  TOILETS: "تنظيف دورات المياه",
  WASTE_SORTING: "جمع وفرز النفايات",
  SHELVES: "تنظيف الرفوف",
  OFFICES: "تنظيف المكاتب",
  CAR_PARKS: "تنظيف مواقف السيارات",
  APPLIANCES: "تنظيف الأجهزة",
  RECEPTION_HALL: "تنظيف قاعة الاستقبال",
  MEETING_ROOMS: "تنظيف قاعات الاجتماعات",
  STORES: "تنظيف المخازن",
  GARDENS: "تنظيف الحدائق",
  COURTYARDS: "الساحات",
  SWEEP_DUST: "كنس وإزالة الغبار",
  STAINS: "تنظيف البقع",
  DOORS: "تنظيف الأبواب",
  CORRIDORS: "تنظيف الممرات",
  WALLS: "تنظيف الجدران",
  CORNERS: "تنظيف الزوايا",
  MAILBOXES: "تنظيف صناديق البريد",
  ENTRANCES: "المداخل",
  PAVEMENTS: "الأرصفة",
};
const BUILDING_PROVIDED_SERVICES = [
  ...["FLOORS", "COURTYARDS", "SWEEP_DUST", "STAINS", "DOORS"],
  ...["CEILINGS", "CORRIDORS", "WINDOWS", "WASTE_SORTING", "WALLS"],
  ...["GLASS", "CORNERS", "MAILBOXES", "CAR_PARKS", "APPLIANCES"],
  ...["ENTRANCES", "PAVEMENTS", "GARAGE", "STORES", "GARDENS"],
] as const satisfies readonly ProvidedService[];

/**
 * What each division's forms offer, in print order: column by column, the first column on the right
 * (OPTION-CODES.md, PROVIDED_SERVICE). Housing F5, F6; organisation F3, F4; building F2, which complexes copy.
 * Blank lines for a service he did not list are a `FileService` row with a `customLabel` and no code.
 */
export const PROVIDED_SERVICES_OF: Readonly<Record<Division, readonly ProvidedService[]>> = {
  HOUSING: [
    ...["FLOORS", "KITCHEN", "CURTAINS", "WINDOWS"],
    ...["CEILINGS", "FRIDGE", "BATHROOMS"],
    ...["GLASS", "OVEN", "CARPETS"],
    ...["CUPBOARDS", "CHILDREN_ROOMS", "GARAGE"],
  ] as const satisfies readonly ProvidedService[],
  ORGANISATION: [
    ...["FLOORS", "KITCHEN", "CURTAINS", "FURNITURE", "SIGNS_ADS"],
    ...["CEILINGS", "TOILETS", "WINDOWS", "WASTE_SORTING", "SHELVES"],
    ...["GLASS", "OFFICES", "CARPETS", "CAR_PARKS", "APPLIANCES"],
    ...["RECEPTION_HALL", "MEETING_ROOMS", "GARAGE", "STORES", "GARDENS"],
  ] as const satisfies readonly ProvidedService[],
  BUILDING: BUILDING_PROVIDED_SERVICES,
  COMPLEX: BUILDING_PROVIDED_SERVICES,
};

// ── PROGRAMMED_SERVICE (Clients (owner), Operations (the day board)) ─────────────

/** «الخدمات المبرمجة» (F2, F3, F4) and «نوع الخدمة المبرمجة» (F5, F6): one catalogue, two subsets, `PROGRAMMED_SERVICES_OF`. «تنظيف غ..الضيوف» is kept as he wrote it until he confirms «غرف» (scope A8). */
export const PROGRAMMED_SERVICES = [
  "PERIODIC",
  "AFTER_CONSTRUCTION",
  "AFTER_RENOVATION",
  "AFTER_BANQUETS",
  "COMPREHENSIVE_DEEP",
  "COMPREHENSIVE",
  "GUESTS",
  "AFTER_TRAVEL",
  "RAMADAN",
  "DEBRIS_REMOVAL",
  "BEFORE_EVENTS",
  "AFTER_EVENTS",
  "DEEP",
] as const;
export type ProgrammedService = (typeof PROGRAMMED_SERVICES)[number];
export const PROGRAMMED_SERVICE_AR: Readonly<Record<ProgrammedService, string>> = {
  PERIODIC: "تنظيف دوري",
  AFTER_CONSTRUCTION: "تنظيف بعد البناء",
  AFTER_RENOVATION: "تنظيف بعد الترميم",
  AFTER_BANQUETS: "تنظيف بعد الولائم",
  COMPREHENSIVE_DEEP: "تنظيف شامل وعميق",
  COMPREHENSIVE: "تنظيف شامل",
  GUESTS: "تنظيف غ..الضيوف",
  AFTER_TRAVEL: "تنظيف بعد السفر",
  RAMADAN: "تنظيف رمضان",
  DEBRIS_REMOVAL: "إزالة المخلفات",
  BEFORE_EVENTS: "تنظيف قبل المناسبات",
  AFTER_EVENTS: "تنظيف بعد المناسبات",
  DEEP: "تنظيف عميق",
};
const CONTRACT_FORM_PROGRAMMED_SERVICES = [
  ...["PERIODIC", "AFTER_CONSTRUCTION", "AFTER_RENOVATION"],
  ...["AFTER_BANQUETS", "COMPREHENSIVE_DEEP", "GUESTS"],
  ...["AFTER_TRAVEL", "RAMADAN", "DEBRIS_REMOVAL"],
  ...["BEFORE_EVENTS", "AFTER_EVENTS"],
] as const satisfies readonly ProgrammedService[];

/** What each division's forms offer, in print order (column by column, the first column on the right). */
export const PROGRAMMED_SERVICES_OF: Readonly<Record<Division, readonly ProgrammedService[]>> = {
  HOUSING: [
    ...["PERIODIC", "AFTER_CONSTRUCTION", "AFTER_RENOVATION"],
    ...["AFTER_BANQUETS", "COMPREHENSIVE", "GUESTS"],
    ...["AFTER_TRAVEL", "RAMADAN", "DEBRIS_REMOVAL"],
    ...["BEFORE_EVENTS", "AFTER_EVENTS", "DEEP"],
  ] as const satisfies readonly ProgrammedService[],
  ORGANISATION: CONTRACT_FORM_PROGRAMMED_SERVICES,
  BUILDING: CONTRACT_FORM_PROGRAMMED_SERVICES,
  COMPLEX: CONTRACT_FORM_PROGRAMMED_SERVICES,
};

/** The heading of that block on each division's forms. */
export const PROGRAMMED_SERVICE_HEADING_AR: Readonly<Record<Division, string>> = {
  HOUSING: "نوع الخدمة المبرمجة",
  ORGANISATION: "الخدمات المبرمجة",
  BUILDING: "الخدمات المبرمجة",
  COMPLEX: "الخدمات المبرمجة",
};

// ── For every list ──────────────────────────────────────────────────────────

/** A list as `{ code, ar }` entries, in its order: what a form's tick boxes are drawn from. */
export function optionEntries<C extends string>(
  codes: readonly C[],
  ar: Readonly<Record<C, string>>,
): Array<{ code: C; ar: string }> {
  return codes.map((code) => ({ code, ar: ar[code] }));
}

/** Whether a stored code is one of a list's. */
export function isOneOf<C extends string>(codes: readonly C[], code: string | null | undefined): code is C {
  return code !== null && code !== undefined && (codes as readonly string[]).includes(code);
}

/** Every list here and the message namespace that labels it on screen, under `Options.` (core's code-labels.ts). */
export const SHARED_OPTION_LISTS = {
  Division: DIVISIONS,
  ServiceType: SERVICE_TYPES,
  PaymentMethod: PAYMENT_METHODS,
  PaymentFrequency: PAYMENT_FREQUENCIES,
  AmountBasis: AMOUNT_BASES,
  Weekday: WEEKDAYS,
  YesNo: YES_NO,
  Cleanliness: CLEANLINESS_LEVELS,
  DayPeriod: DAY_PERIODS,
  Bearer: BEARERS,
  DurationUnit: DURATION_UNITS,
  TeamAccess: TEAM_ACCESS,
  FileStage: FILE_STAGES,
  Sex: SEXES,
  WorkerRole: WORKER_ROLES,
  WorkerRoleFeminine: WORKER_ROLES,
  Ability: ABILITIES,
  TransportMeans: TRANSPORT_MEANS,
  AbsenceType: ABSENCE_TYPES,
  LeaveType: LEAVE_TYPES,
  Ppe: PPE,
  CorrectiveAction: CORRECTIVE_ACTIONS,
  EvaluationRecommendation: EVALUATION_RECOMMENDATIONS,
  ForbiddenPlace: FORBIDDEN_PLACES,
  SiteInstruction: SITE_INSTRUCTIONS,
  ProvidedService: PROVIDED_SERVICES,
  ProgrammedService: PROGRAMMED_SERVICES,
} as const;
