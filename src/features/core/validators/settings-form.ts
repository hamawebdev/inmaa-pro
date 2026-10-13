import { z } from "zod";

import {
  PAY_BASES,
  PAY_PERIODS,
  SANCTION_STATES,
  SANCTION_SUBJECTS,
  STAFF_DOCUMENT_TYPES,
} from "@/features/people/validators/staff-codes";
import { WILAYAS } from "@/lib/geo/wilayas";
import { SEQUENCE_KEYS } from "@/lib/numbering";
import { WEEKDAYS } from "@/lib/options";
import type { SettingKey } from "@/lib/settings";

/**
 * Every setting a person sets in Settings, with the form it is typed in.
 *
 * Source: docs/data-model/DESIGN.md section 11, in its order and its two
 * groups: «عام» (the centre and the system) and «قواعد العمل» (work rules).
 * Inside قواعد العمل the cards follow the families of the document's table.
 * The `system.*` keys are the program's own and have no form.
 *
 * The same description serves the screen (which field to draw) and the
 * service (`schemaOf`: what it accepts), so a value the screen sends is
 * checked by the rule that drew it. Values are stored as everywhere: amounts
 * in centimes, durations in minutes, rates in basis points, days of leave in
 * thousandths of a day.
 */

/** The file kinds of `numbering.fileSuffix` (FORM_KIND). */
export const FORM_KINDS = [
  "HOUSING_REQUEST",
  "HOUSING_CONTRACT",
  "ORG_REQUEST",
  "ORG_CONTRACT",
  "BUILDING_CONTRACT",
  "COMPLEX_CONTRACT",
] as const;

/** The counters whose number is not legal (all but INVOICE and RECEIPT): `numbering.startAt`. */
export const ORDINARY_SEQUENCE_KEYS = SEQUENCE_KEYS.filter((key) => key !== "INVOICE" && key !== "RECEIPT");

/** The counters whose width can be chosen: those of `numbering.width`. */
export const WIDTH_SEQUENCE_KEYS = [
  "QUOTE",
  "VISIT",
  "COMPLAINT",
  "INSPECTION",
  "VIOLATION",
  "PAY_RUN",
  "PAYSLIP",
  "PAYOUT",
  "HANDOUT",
  "COUNT",
  "PURCHASE_REQUEST",
  "PURCHASE",
  "EQUIPMENT_UNIT",
] as const;

export const REMINDER_MODES = ["ALL", "FIRST_AND_CHANGED", "NONE"] as const;
export const INSPECTION_FREQUENCIES = ["WEEKLY", "MONTHLY", "NONE"] as const;
export const QUOTE_APPROVAL_RULES = ["MANAGER_ALWAYS"] as const;
export const TAX_MODES = ["VAT", "IFU"] as const;
export const STAMP_MODES = ["WHOLE", "PROGRESSIVE"] as const;
export const MISSED_VISIT_RULES = ["BILL_DONE_ONLY", "FIXED_AMOUNT"] as const;
export const EXPORT_SEPARATORS = [";", ",", "\t"] as const;
export const APP_LOCALES = ["ar", "fr", "en"] as const;

/** Where a choice's words are: a namespace of the messages, and the key of each code inside it. */
export interface ChoiceLabels {
  namespace: string;
  /** The message key of a code, when the code itself cannot be one (";" is not a key). */
  keyOf?: (code: string) => string;
}

export type FieldKind =
  | { kind: "text"; ltr?: boolean; multiline?: boolean; required?: boolean }
  | { kind: "wilaya" }
  | { kind: "boolean" }
  | { kind: "integer"; unit: IntegerUnit; min: number; max: number; nullable?: boolean }
  /** A duration stored and typed in minutes. */
  | { kind: "minutes"; max: number }
  /** A duration stored in minutes, typed in hours (two decimals). */
  | { kind: "hours"; max: number }
  /** Days stored in thousandths of a day, typed in days (three decimals). */
  | { kind: "days1000"; max: number }
  /** A rate stored in basis points, typed in percent (two decimals). */
  | { kind: "percent"; max: number; nullable?: boolean }
  /** An amount stored in centimes, typed in dinars (two decimals). */
  | { kind: "money"; nullable?: boolean }
  /** From and to, `HH:MM`. `overnight`: the end may come before the start (the night). */
  | { kind: "timeRange"; overnight?: boolean }
  | { kind: "weekdays" }
  | { kind: "weekday" }
  | { kind: "choice"; options: readonly string[]; labels: ChoiceLabels; nullable?: boolean }
  | { kind: "choices"; options: readonly string[]; labels: ChoiceLabels }
  /** Calendar dates, `YYYY-MM-DD`. */
  | { kind: "dates" }
  /** A day of the year, `MM-DD`. */
  | { kind: "monthDay" }
  /** One value per code of a fixed list. `optional`: a code may have none (left empty). */
  | {
      kind: "codeMap";
      codes: readonly string[];
      labels: ChoiceLabels;
      value: "text" | "integer";
      min?: number;
      max?: number;
      optional?: boolean;
    }
  | { kind: "stampBands" }
  | { kind: "irgTable" }
  | { kind: "blockingStates" }
  | { kind: "ifuMention" };

export type IntegerUnit = "days" | "workingDays" | "months" | "workers" | "points" | "none";

export interface SettingField {
  key: SettingKey;
  field: FieldKind;
}

export type SettingsTab = "general" | "rules";

export interface SettingGroup {
  /** Its messages: `SettingsForm.Groups.<id>.Title` and `.Description`. */
  id: string;
  tab: SettingsTab;
  fields: readonly SettingField[];
}

const text = (options: { ltr?: boolean; multiline?: boolean; required?: boolean } = {}): FieldKind => ({
  kind: "text",
  ...options,
});
const days = (min = 0, max = 365): FieldKind => ({ kind: "integer", unit: "days", min, max });
const percent = (max = 10000, nullable = false): FieldKind => ({ kind: "percent", max, nullable });
const money = (nullable = false): FieldKind => ({ kind: "money", nullable });
const yesNo: FieldKind = { kind: "boolean" };
const own = (namespace: string, keyOf?: (code: string) => string): ChoiceLabels => ({ namespace, keyOf });

export const SETTING_GROUPS: readonly SettingGroup[] = [
  // ── عام ──────────────────────────────────────────────────────────────────
  {
    id: "centre",
    tab: "general",
    fields: [
      { key: "centre.nameLatin", field: text({ ltr: true }) },
      { key: "centre.legalForm", field: text() },
      { key: "centre.address", field: text({ multiline: true }) },
      { key: "centre.city", field: text({ required: true }) },
      { key: "centre.wilayaCode", field: { kind: "wilaya" } },
      { key: "centre.phone", field: text({ ltr: true }) },
      { key: "centre.email", field: text({ ltr: true }) },
    ],
  },
  {
    id: "taxIds",
    tab: "general",
    fields: [
      { key: "centre.rc", field: text({ ltr: true }) },
      { key: "centre.nis", field: text({ ltr: true }) },
      { key: "centre.nif", field: text({ ltr: true }) },
      { key: "centre.articleNumber", field: text({ ltr: true }) },
      { key: "centre.nin", field: text({ ltr: true }) },
      { key: "centre.cnasEmployerNumber", field: text({ ltr: true }) },
    ],
  },
  {
    id: "bank",
    tab: "general",
    fields: [
      { key: "centre.bankName", field: text() },
      { key: "centre.bankAccount", field: text({ ltr: true }) },
      { key: "centre.ccpNumber", field: text({ ltr: true }) },
      { key: "centre.ccpKey", field: text({ ltr: true }) },
    ],
  },
  {
    id: "program",
    tab: "general",
    fields: [
      {
        key: "app.defaultLocale",
        field: { kind: "choice", options: APP_LOCALES, labels: own("SettingsForm.Locales") },
      },
      { key: "feature.siteQrOnOrder", field: yesNo },
      { key: "security.idleLockMinutes", field: { kind: "minutes", max: 480 } },
    ],
  },

  // ── قواعد العمل ─────────────────────────────────────────────────────────
  {
    id: "workingTime",
    tab: "rules",
    fields: [
      { key: "work.days", field: { kind: "weekdays" } },
      { key: "work.restDay", field: { kind: "weekday" } },
      { key: "work.period.morning", field: { kind: "timeRange" } },
      { key: "work.period.evening", field: { kind: "timeRange" } },
      { key: "work.weekMin", field: { kind: "hours", max: 7 * 24 * 60 } },
      { key: "work.overtimeCapMin", field: { kind: "hours", max: 7 * 24 * 60 } },
      { key: "work.dayMin", field: { kind: "hours", max: 24 * 60 } },
      { key: "work.daySpanMin", field: { kind: "hours", max: 24 * 60 } },
      { key: "work.night", field: { kind: "timeRange", overnight: true } },
      { key: "work.travelGapMin", field: { kind: "minutes", max: 600 } },
      { key: "work.arrivalGraceMin", field: { kind: "minutes", max: 240 } },
      { key: "office.hours", field: { kind: "timeRange" } },
      { key: "calendar.hours", field: { kind: "timeRange" } },
      { key: "calendar.closedDays", field: { kind: "dates" } },
    ],
  },
  {
    id: "visitsQuality",
    tab: "rules",
    fields: [
      { key: "reminder.leadWorkingDays", field: { kind: "integer", unit: "workingDays", min: 0, max: 30 } },
      {
        key: "reminder.mode",
        field: { kind: "choice", options: REMINDER_MODES, labels: own("SettingsForm.ReminderModes") },
      },
      { key: "complaint.targetMin", field: { kind: "minutes", max: 7 * 24 * 60 } },
      { key: "inspection.threshold", field: { kind: "integer", unit: "points", min: 0, max: 100 } },
      {
        key: "inspection.defaultFrequency.contract",
        field: { kind: "choice", options: INSPECTION_FREQUENCIES, labels: own("SettingsForm.InspectionFrequencies") },
      },
      {
        key: "inspection.defaultFrequency.onDemand",
        field: { kind: "choice", options: INSPECTION_FREQUENCIES, labels: own("SettingsForm.InspectionFrequencies") },
      },
      { key: "inspection.missedAfterDays", field: days(1, 90) },
      { key: "corrective.dueDays", field: days(0, 90) },
      { key: "supervisor.maxWorkers", field: { kind: "integer", unit: "workers", min: 1, max: 200 } },
    ],
  },
  {
    id: "alerts",
    tab: "rules",
    fields: [
      { key: "alerts.contractEndLeadDays", field: days(1) },
      { key: "alerts.paymentDueLeadDays", field: days(0) },
      { key: "alerts.maintenanceLeadDays", field: days(0) },
      { key: "alerts.quoteFollowUpDays", field: days(1) },
      { key: "alerts.documentExpiryLeadDays", field: days(0) },
      { key: "alerts.trialEndLeadDays", field: days(0) },
      { key: "alerts.staffContractEndLeadDays", field: days(0) },
      { key: "alerts.backupStaleDays", field: days(1, 60) },
    ],
  },
  {
    id: "quotesCosting",
    tab: "rules",
    fields: [
      { key: "quote.validityDays", field: days(1) },
      {
        key: "quote.approvalRule",
        field: { kind: "choice", options: QUOTE_APPROVAL_RULES, labels: own("SettingsForm.QuoteApprovalRules") },
      },
      { key: "costing.hourlyLabourCost", field: money(true) },
      { key: "costing.marginPercent", field: percent(10000, true) },
      { key: "costing.reservePercent", field: percent(10000, true) },
      { key: "costing.adminSharePercent", field: percent(10000, true) },
      { key: "costing.hoursOverrunPercent", field: percent() },
    ],
  },
  {
    id: "taxStamp",
    tab: "rules",
    fields: [
      {
        key: "tax.mode",
        field: { kind: "choice", options: TAX_MODES, labels: own("SettingsForm.TaxModes"), nullable: true },
      },
      { key: "tax.vatRate", field: percent() },
      { key: "tax.pricesIncludeVat", field: yesNo },
      { key: "tax.ifuMention", field: { kind: "ifuMention" } },
      { key: "stamp.enabled", field: yesNo },
      { key: "stamp.mode", field: { kind: "choice", options: STAMP_MODES, labels: own("SettingsForm.StampModes") } },
      { key: "stamp.bands", field: { kind: "stampBands" } },
      { key: "stamp.exemptBelow", field: money() },
      { key: "stamp.minimum", field: money() },
      { key: "stamp.maximum", field: money(true) },
      { key: "stamp.roundUpToDinar", field: yesNo },
    ],
  },
  {
    id: "invoicesExports",
    tab: "rules",
    fields: [
      {
        key: "invoice.missedVisitRule",
        field: { kind: "choice", options: MISSED_VISIT_RULES, labels: own("SettingsForm.MissedVisitRules") },
      },
      { key: "invoice.missedVisitAmount", field: money(true) },
      { key: "invoice.requireSignOff", field: yesNo },
      { key: "forecast.months", field: { kind: "integer", unit: "months", min: 1, max: 24 } },
      {
        key: "export.separator",
        field: {
          kind: "choice",
          options: EXPORT_SEPARATORS,
          labels: own("SettingsForm.Separators", (code) => ({ ";": "semicolon", ",": "comma" })[code] ?? "tab"),
        },
      },
      { key: "export.decimalComma", field: yesNo },
    ],
  },
  {
    id: "numbering",
    tab: "rules",
    fields: [
      {
        key: "numbering.fileSuffix",
        field: { kind: "codeMap", codes: FORM_KINDS, labels: own("SettingsForm.FormKinds"), value: "text" },
      },
      { key: "numbering.employeeSuffix", field: text({ ltr: true }) },
      {
        key: "numbering.width",
        field: {
          kind: "codeMap",
          codes: WIDTH_SEQUENCE_KEYS,
          labels: own("SettingsForm.SequenceKeys"),
          value: "integer",
          min: 1,
          max: 9,
        },
      },
      {
        key: "numbering.startAt",
        field: {
          kind: "codeMap",
          codes: ORDINARY_SEQUENCE_KEYS,
          labels: own("SettingsForm.SequenceKeys"),
          value: "integer",
          min: 1,
          max: 999_999,
          optional: true,
        },
      },
      { key: "numbering.legalSeries", field: text({ ltr: true }) },
    ],
  },
  {
    id: "pay",
    tab: "rules",
    fields: [
      { key: "pay.runPeriods", field: { kind: "choices", options: PAY_PERIODS, labels: own("WorkerForm.PayPeriods") } },
      { key: "pay.overtimePremium", field: percent(30000) },
      { key: "pay.restDayPremium", field: percent(30000) },
      { key: "pay.monthlyDivisorMin", field: { kind: "hours", max: 744 * 60 } },
      { key: "pay.leaveDaysPerMonth", field: { kind: "days1000", max: 31_000 } },
      { key: "pay.leaveYearStart", field: { kind: "monthDay" } },
      { key: "pay.leaveCapDays", field: { kind: "days1000", max: 366_000 } },
      { key: "pay.cnasEmployeeRate", field: percent() },
      { key: "pay.cnasEmployerRate", field: percent() },
      { key: "pay.irgTable", field: { kind: "irgTable" } },
      {
        key: "pay.defaultBasis",
        field: { kind: "choice", options: PAY_BASES, labels: own("WorkerForm.PayBases"), nullable: true },
      },
      {
        key: "pay.defaultPeriod",
        field: { kind: "choice", options: PAY_PERIODS, labels: own("WorkerForm.PayPeriods") },
      },
    ],
  },
  {
    id: "staff",
    tab: "rules",
    fields: [
      { key: "hiring.trialDays", field: days(0) },
      { key: "evaluation.periodMonths", field: { kind: "integer", unit: "months", min: 1, max: 24 } },
      { key: "evaluation.scaleMax", field: { kind: "integer", unit: "points", min: 2, max: 20 } },
      {
        key: "documents.validityMonths",
        field: {
          kind: "codeMap",
          codes: STAFF_DOCUMENT_TYPES,
          labels: own("WorkerForm.Documents"),
          value: "integer",
          min: 1,
          max: 240,
          optional: true,
        },
      },
      { key: "sanction.blockingStates", field: { kind: "blockingStates" } },
      { key: "sanction.matchAcrossKinds", field: yesNo },
    ],
  },
];

export const SETTING_FIELDS: ReadonlyMap<SettingKey, SettingField & { tab: SettingsTab; group: string }> = new Map(
  SETTING_GROUPS.flatMap((group) =>
    group.fields.map((field) => [field.key, { ...field, tab: group.tab, group: group.id }] as const),
  ),
);

/** The key of a setting as a message key: dots are nesting in the messages. */
export const settingMessageKey = (key: SettingKey) => key.replace(/\./g, "_");

// ── What each form accepts ──────────────────────────────────────────────────

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const MONTH_DAY = /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

const whole = (min: number, max: number) => z.number().int().min(min).max(max);
const centimes = z.number().int().min(0).max(100_000_000_000);

/** What the service accepts for a field: the stored shape, checked. */
export function schemaOf(field: FieldKind): z.ZodType {
  switch (field.kind) {
    case "text": {
      const base = z
        .string()
        .trim()
        .max(field.multiline ? 500 : 120);
      return field.required ? base.min(1) : base;
    }
    case "wilaya":
      return z.enum(WILAYAS.map((wilaya) => wilaya.code) as [string, ...string[]]);
    case "boolean":
      return z.boolean();
    case "integer":
      return field.nullable ? whole(field.min, field.max).nullable() : whole(field.min, field.max);
    case "minutes":
    case "hours":
      return whole(0, field.max);
    case "days1000":
      return whole(0, field.max);
    case "percent":
      return field.nullable ? whole(0, field.max).nullable() : whole(0, field.max);
    case "money":
      return field.nullable ? centimes.nullable() : centimes;
    case "timeRange":
      return z
        .object({ from: z.string().regex(TIME), to: z.string().regex(TIME) })
        .refine((range) => field.overnight || range.from < range.to, { message: "The end must come after the start." });
    case "weekdays":
      return z.array(z.enum(WEEKDAYS)).min(1);
    case "weekday":
      return z.enum(WEEKDAYS);
    case "choice": {
      const codes = z.enum(field.options as [string, ...string[]]);
      return field.nullable ? codes.nullable() : codes;
    }
    case "choices":
      return z.array(z.enum(field.options as [string, ...string[]])).min(1);
    case "dates":
      return z.array(z.string().regex(DATE)).max(366);
    case "monthDay":
      return z.string().regex(MONTH_DAY);
    case "codeMap": {
      const value = field.value === "text" ? z.string().trim().max(10) : whole(field.min ?? 0, field.max ?? 1_000_000);
      const shape = Object.fromEntries(
        field.codes.map((code) => [code, field.optional ? value.optional() : value] as const),
      );
      return z.object(shape).strict();
    }
    case "stampBands":
      return z
        .array(z.object({ upTo: centimes.nullable(), per100: centimes }))
        .min(1)
        .refine(
          (bands) =>
            bands.every((band, index) =>
              index === bands.length - 1
                ? band.upTo === null
                : band.upTo !== null && (index === 0 || band.upTo > (bands[index - 1].upTo ?? Infinity)),
            ),
          { message: "Each band must go higher than the one before, and only the last one has no ceiling." },
        );
    case "irgTable":
      return z
        .object({
          brackets: z.array(z.object({ upTo: centimes, rateBp: whole(0, 10000) })).min(1),
          abatementBp: whole(0, 10000),
          abatementMin: centimes,
          abatementMax: centimes,
          exemptUpTo: centimes,
        })
        .refine(
          (table) =>
            table.brackets.every((bracket, index) => index === 0 || bracket.upTo > table.brackets[index - 1].upTo),
          { message: "Each band must go higher than the one before, and only the last one has no ceiling." },
        )
        .nullable();
    case "blockingStates":
      return z
        .object(Object.fromEntries(SANCTION_SUBJECTS.map((subject) => [subject, z.array(z.enum(SANCTION_STATES))])))
        .strict();
    case "ifuMention":
      return z.object({ ar: z.string().trim().min(1).max(300), fr: z.string().trim().min(1).max(300) }).strict();
  }
}
