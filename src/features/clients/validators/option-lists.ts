import {
  BEARER_AR,
  BEARERS,
  CLEANLINESS_AR,
  CLEANLINESS_LEVELS,
  CLIENT_WEEKDAY_AR,
  CLIENT_WEEKDAYS,
  DAY_PERIOD_AR,
  DAY_PERIODS,
  DIVISION_AR,
  DIVISIONS,
  FILE_STAGES,
  optionEntries,
  PAYMENT_FREQUENCIES,
  PAYMENT_FREQUENCY_AR,
  PAYMENT_METHOD_AR,
  PAYMENT_METHODS,
  PROGRAMMED_SERVICE_AR,
  PROGRAMMED_SERVICES,
  PROVIDED_SERVICE_AR,
  PROVIDED_SERVICES,
  SERVICE_TYPE_AR,
  SERVICE_TYPES,
  TEAM_ACCESS,
  TEAM_ACCESS_AR,
  YES_NO,
  YES_NO_AR,
  type FileStage,
} from "@/lib/options";

/**
 * Every option list of his five client forms, each written once.
 *
 * A code is what will be stored; `ar` is his wording for it, without the
 * stretching character. The form definitions (`../forms/definitions`) hold only
 * his wording and find the code here, so a code can be renamed in this file
 * alone. The codes follow the data model (OPTION-CODES.md).
 *
 * The lists more than one owner uses are Foundation's (`src/lib/options`): they
 * are taken from there, codes and words, and labelled on screen under
 * `Options.` (`useCodeLabel("Options.Division")`). The others are ours, and
 * labelled under `FileOptions.` in this folder's messages.
 */

export interface OptionEntry {
  readonly code: string;
  /** His wording, as typed on the forms. */
  readonly ar: string;
}

/** The code of the option that carries a dotted place for free text («أخرى: ……», or a bare blank). */
export const OTHER_CODE = "OTHER";

export const OPTION_LISTS = {
  DIVISION: optionEntries(DIVISIONS, DIVISION_AR),
  SERVICE_TYPE: optionEntries(SERVICE_TYPES, SERVICE_TYPE_AR),
  /** The eight boxes of «حالة الملف». Printed, never stored as such. */
  FILE_STATUS_TICK: [
    { code: "OLD", ar: "قديم" },
    { code: "NEW", ar: "جديد" },
    { code: "VISIT", ar: "الزيارة" },
    { code: "QUOTE", ar: "عرض سعر" },
    { code: "CONTRACTED", ar: "متعاقد" },
    { code: "CONTRACT_ENDED", ar: "انتهاء التعاقد" },
    { code: "SUSPENDED", ar: "متوقف" },
    { code: "PENALISED", ar: "معاقب" },
  ],
  PROPERTY_TYPE_HOUSING: [
    { code: "HOUSE", ar: "منزل" },
    { code: "APARTMENT", ar: "شقة" },
    { code: "DUPLEX", ar: "دوبلكس" },
    { code: "VILLA", ar: "فيلا" },
    { code: OTHER_CODE, ar: "أخرى" },
  ],
  PROPERTY_TYPE_ORGANISATION: [
    { code: "SMALL_SHOP", ar: "محل صغير" },
    { code: "LARGE", ar: "كبير" },
    { code: "COMPANY", ar: "شركة" },
    { code: "FLAT_F2", ar: "F2" },
    { code: "FLAT_F3", ar: "F3" },
    { code: "FLAT_F4", ar: "F4" },
    { code: "FLAT_F5", ar: "F5" },
    { code: OTHER_CODE, ar: "أخرى" },
  ],
  /** «مسأجر» is his typing; it is shown and printed «مستأجر» (scope A8). */
  OWNERSHIP: [
    { code: "OWNED", ar: "ملك" },
    { code: "RENTED", ar: "مسأجر" },
  ],
  SECTOR: [
    { code: "PUBLIC", ar: "عام" },
    { code: "PRIVATE", ar: "خاص" },
  ],
  CONTRACTING_PARTY: [
    { code: "BUILDING_OWNER", ar: "مالك العمارة" },
    { code: "RESIDENTS_REP", ar: "ممثل السكان" },
    { code: "RESIDENCE_MANAGER", ar: "مسير الإقامة" },
    { code: "SYNDIC", ar: "سانديك" },
    { code: "RESIDENTS_ASSOCIATION", ar: "جمعية السكان" },
    { code: "PROPERTY_MANAGEMENT", ar: "شركة تسيير عقاري" },
    { code: OTHER_CODE, ar: "أخرى" },
  ],
  CLEANLINESS: optionEntries(CLEANLINESS_LEVELS, CLEANLINESS_AR),
  /** A nullable Boolean in the database: «نعم» is true, «لا» is false. */
  YES_NO: optionEntries(YES_NO, YES_NO_AR),
  WASTE_DISPOSAL: [
    { code: "COLLECTION_POINT", ar: "نقطة التجميع" },
    { code: "CONTAINERS", ar: "إلى الحاويات" },
    { code: "BUILDING_INSTRUCTIONS", ar: "تعليمات العمارة" },
    { code: OTHER_CODE, ar: "" },
  ],
  RESIDENT_TURNOVER: [
    { code: "LOW", ar: "منخفض" },
    { code: "MEDIUM", ar: "متوسط" },
    { code: "HIGH", ar: "مرتفع" },
  ],
  CONTRACT_KIND: [
    { code: "SHORT", ar: "قصير" },
    { code: "LONG", ar: "طويل" },
  ],
  CONTRACT_DURATION: [
    { code: "M1", ar: "شهر" },
    { code: "M3", ar: "3 أشهر" },
    { code: "M6", ar: "6 أشهر" },
    { code: "Y1", ar: "سنة" },
  ],
  /** Stored as the whole number `visitsPerWeek`, 1 to 6. */
  VISITS_PER_WEEK: [
    { code: "1", ar: "واحدة بالأسبوع" },
    { code: "2", ar: "اثنين بالأسبوع" },
    { code: "3", ar: "ثلاثة بالأسبوع" },
    { code: "4", ar: "أربعة بالأسبوع" },
    { code: "5", ar: "خمسة بالأسبوع" },
    { code: "6", ar: "ستة بالأسبوع" },
  ],
  REQUEST_KIND: [
    { code: "COMPREHENSIVE", ar: "شامل" },
    { code: "DEEP", ar: "عميق" },
  ],
  /** Client forms offer Saturday to Thursday. */
  WEEKDAY: optionEntries(CLIENT_WEEKDAYS, CLIENT_WEEKDAY_AR),
  DAY_PERIOD: optionEntries(DAY_PERIODS, DAY_PERIOD_AR),
  BEARER: optionEntries(BEARERS, BEARER_AR),
  PAYMENT_METHOD: optionEntries(PAYMENT_METHODS, PAYMENT_METHOD_AR),
  PAYMENT_FREQUENCY: optionEntries(PAYMENT_FREQUENCIES, PAYMENT_FREQUENCY_AR),
  TEAM_ACCESS: optionEntries(TEAM_ACCESS, TEAM_ACCESS_AR),
  /** «الخدمات المقدمة»: one catalogue (Foundation's); each form prints a subset in its own order. */
  PROVIDED_SERVICE: optionEntries(PROVIDED_SERVICES, PROVIDED_SERVICE_AR),
  /** «تنظيف غ..الضيوف» stays as he typed it until he confirms «غرف» (scope A8). */
  PROGRAMMED_SERVICE: optionEntries(PROGRAMMED_SERVICES, PROGRAMMED_SERVICE_AR),
} as const satisfies Record<string, readonly OptionEntry[]>;

export type OptionListName = keyof typeof OPTION_LISTS;
export type OptionCode<L extends OptionListName> = (typeof OPTION_LISTS)[L][number]["code"];

/** The codes of a list, in the list's order. */
export function codesOf<L extends OptionListName>(list: L): OptionCode<L>[] {
  return OPTION_LISTS[list].map((entry) => entry.code) as OptionCode<L>[];
}

export type Division = OptionCode<"DIVISION">;
export type ServiceType = OptionCode<"SERVICE_TYPE">;
export type FileStatusTick = OptionCode<"FILE_STATUS_TICK">;
export type ContractKind = OptionCode<"CONTRACT_KIND">;
export type ContractDuration = OptionCode<"CONTRACT_DURATION">;

/** The stages a file goes through, in order (scope A5): Foundation's list. Their words are the status boxes'. */
export { FILE_STAGES, type FileStage };
FILE_STAGES satisfies readonly FileStatusTick[];

/** A sanction on the client; it ticks «متوقف» or «معاقب» on every sheet of his files. */
export const CLIENT_SANCTIONS = ["NONE", "SUSPENDED", "PENALISED"] as const;
export type ClientSanction = (typeof CLIENT_SANCTIONS)[number];

/** His five sheets and the complexes copy of the building contract. */
export const FORM_KINDS = [
  "HOUSING_REQUEST",
  "HOUSING_CONTRACT",
  "ORG_REQUEST",
  "ORG_CONTRACT",
  "BUILDING_CONTRACT",
  "COMPLEX_CONTRACT",
] as const;
export type FormKind = (typeof FORM_KINDS)[number];

/** Which block of site description a form prints. */
export const DESCRIPTION_FAMILIES = ["HOUSING", "ORGANISATION", "BUILDING"] as const;
export type DescriptionFamily = (typeof DESCRIPTION_FAMILIES)[number];

/** Why a file was closed without a status of its own (scope A5). */
export const CLOSE_REASONS = [
  "QUOTE_REFUSED",
  "JOB_DONE",
  "NO_ANSWER",
  "CLIENT_CANCELLED",
  "NOT_SERVICEABLE",
  "NOT_RENEWED",
  "OTHER",
] as const;
export type CloseReason = (typeof CLOSE_REASONS)[number];

/** How a contracted file came to «انتهاء التعاقد». */
export const END_KINDS = [
  "EXPIRED",
  "ENDED_BY_CLIENT",
  "ENDED_BY_CENTRE",
  "NON_PAYMENT",
  "RENEWED",
  "JOB_DONE",
] as const;
export type EndKind = (typeof END_KINDS)[number];

/** The division and the service type each form is for. Buildings and complexes are contract only (scope A1). */
export const FORM_KIND_OF: Record<FormKind, { division: Division; serviceType: ServiceType }> = {
  HOUSING_REQUEST: { division: "HOUSING", serviceType: "ON_DEMAND" },
  HOUSING_CONTRACT: { division: "HOUSING", serviceType: "CONTRACT" },
  ORG_REQUEST: { division: "ORGANISATION", serviceType: "ON_DEMAND" },
  ORG_CONTRACT: { division: "ORGANISATION", serviceType: "CONTRACT" },
  BUILDING_CONTRACT: { division: "BUILDING", serviceType: "CONTRACT" },
  COMPLEX_CONTRACT: { division: "COMPLEX", serviceType: "CONTRACT" },
};

/** The form of a division and a service type, or null where the scope offers none (an on-demand building). */
export function formKindFor(division: Division, serviceType: ServiceType): FormKind | null {
  return (
    FORM_KINDS.find((kind) => {
      const of = FORM_KIND_OF[kind];
      return of.division === division && of.serviceType === serviceType;
    }) ?? null
  );
}

/** The divisions whose files are on demand or contract; the other two are contract only (scope A1). */
export const DIVISIONS_WITH_REQUESTS: readonly Division[] = ["HOUSING", "ORGANISATION"];

/** What kind of client a division's first file makes. */
export const CLIENT_TYPES = ["INDIVIDUAL", "ORGANISATION", "BUILDING_PARTY"] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];
export const CLIENT_TYPE_OF: Record<Division, ClientType> = {
  HOUSING: "INDIVIDUAL",
  ORGANISATION: "ORGANISATION",
  BUILDING: "BUILDING_PARTY",
  COMPLEX: "BUILDING_PARTY",
};

// ── Office-only lists: on the screen, never on his sheets (OPTION-CODES.md, Clients' office-only lists) ──

/** How the request came in (plan feature 2). SERVICE_LEAD is set from a returned visit sheet, not chosen here. */
export const REQUEST_SOURCES = [
  "PHONE",
  "WHATSAPP",
  "FACEBOOK",
  "VISIT",
  "REFERRAL",
  "REP",
  "AD",
  "SERVICE_LEAD",
  "OTHER",
] as const;
export type RequestSource = (typeof REQUEST_SOURCES)[number];

export const PRIORITIES = ["NORMAL", "IMPORTANT", "URGENT"] as const;
export type Priority = (typeof PRIORITIES)[number];

/** What «المبلغ إجمالي» is the price of (scope A7), and the unit of «مدة التنفيذ»: Foundation's lists. */
export { AMOUNT_BASES, DURATION_UNITS, type AmountBasis, type DurationUnit } from "@/lib/options";
