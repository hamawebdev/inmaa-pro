/**
 * Every setting, with its default.
 *
 * A setting is a row of `Setting` (key, JSON value) only once someone changed
 * it; until then its value is the default written here. Amounts are centimes,
 * durations minutes, rates basis points, as everywhere.
 *
 * Source: docs/data-model/DESIGN.md section 11, where each key says who asked
 * for it and why. `null` is "not set": the screen that needs the value says so
 * instead of guessing (a margin with no labour cost shows "not set").
 *
 * Add a key here before reading it: `getSetting` takes nothing else.
 */

/** A span of the year, as two 'MM-DD' days. */
export type Period = { from: string; to: string };
/** One band of stamp duty: up to an amount (null for the last band), so much per 100 DA. */
export type StampBand = { upTo: number | null; per100: number };

/**
 * The income tax scale on wages (setting `pay.irgTable`): the accountant types
 * it; until then the IRG of a payslip is typed by hand. Amounts in centimes,
 * rates in basis points. People's pay rules read it in this shape.
 */
export interface IrgTable {
  /** Brackets in order; the income above the last one is taxed at the last rate. */
  brackets: ReadonlyArray<{ upTo: number; rateBp: number }>;
  /** The abatement on the tax, its rate and its floor and ceiling. */
  abatementBp: number;
  abatementMin: number;
  abatementMax: number;
  /** A taxable income up to this owes nothing. */
  exemptUpTo: number;
}

export const SETTING_DEFAULTS = {
  // ── Centre and system (عام) ──────────────────────────────────────────────
  "system.databaseId": null as string | null,
  "system.firstRunDone": false as boolean,
  "system.utcOffsetMin": 60 as number,
  "system.clockJumpDays": 3 as number,
  "system.alertsNotified": {} as Record<string, { date: string; count: number }>,
  /** Per owner, the last day its day-start handlers completed (src/lib/daily). */
  "system.dayStart": {} as Record<string, string>,
  "centre.nameAr": "مركز إنماء برو" as string,
  "centre.nameLatin": "UNMAA Pro Center" as string,
  "centre.legalForm": "" as string,
  "centre.address": "" as string,
  /** From his footer picture: Tel and WhatsApp. */
  "centre.phone": "06 59 53 81 83" as string,
  /** From his footer picture. */
  "centre.email": "unmaapro.center@gmail.com" as string,
  "centre.city": "أم البواقي" as string,
  "centre.wilayaCode": "04" as string,
  "centre.rc": "" as string,
  "centre.nis": "" as string,
  "centre.nif": "" as string,
  "centre.articleNumber": "" as string,
  "centre.nin": "" as string,
  "centre.bankName": "" as string,
  "centre.bankAccount": "" as string,
  "centre.ccpNumber": "" as string,
  "centre.ccpKey": "" as string,
  "centre.cnasEmployerNumber": "" as string,
  /** Null is the bundled picture. */
  "centre.logoUrl": null as string | null,
  "letterhead.headerUrl": null as string | null,
  "letterhead.footerUrl": null as string | null,
  "app.defaultLocale": "ar" as "ar" | "fr" | "en",
  "backup.autoEnabled": true as boolean,
  "backup.targetDir": "" as string,
  "backup.keepCount": 30 as number,
  "feature.siteQrOnOrder": false as boolean,
  /** Minutes without input after which the program signs out to the sign-in window. 0 switches it off. */
  "security.idleLockMinutes": 15 as number,

  // ── Work rules (قواعد العمل) ─────────────────────────────────────────────
  "work.days": ["SAT", "SUN", "MON", "TUE", "WED", "THU"] as string[],
  "work.restDay": "FRI" as string,
  "work.period.morning": { from: "08:00", to: "12:00" } as Period,
  "work.period.evening": { from: "13:30", to: "16:00" } as Period,
  "work.weekMin": 2400 as number,
  "work.overtimeCapMin": 2880 as number,
  "work.dayMin": 480 as number,
  "work.daySpanMin": 720 as number,
  "work.night": { from: "21:00", to: "05:00" } as Period,
  "work.travelGapMin": 30 as number,
  "work.arrivalGraceMin": 15 as number,
  "office.hours": { from: "07:30", to: "17:00" } as Period,
  "calendar.hours": { from: "06:00", to: "22:00" } as Period,
  "calendar.closedDays": [] as string[],
  "reminder.leadWorkingDays": 1 as number,
  "reminder.mode": "FIRST_AND_CHANGED" as "ALL" | "FIRST_AND_CHANGED" | "NONE",
  "complaint.targetMin": 120 as number,
  "inspection.threshold": 80 as number,
  "inspection.defaultFrequency.contract": "MONTHLY" as string,
  "inspection.defaultFrequency.onDemand": "NONE" as string,
  "inspection.missedAfterDays": 7 as number,
  "corrective.dueDays": 2 as number,
  "supervisor.maxWorkers": 15 as number,
  "alerts.contractEndLeadDays": 30 as number,
  "alerts.paymentDueLeadDays": 7 as number,
  "alerts.maintenanceLeadDays": 7 as number,
  "alerts.quoteFollowUpDays": 3 as number,
  "alerts.documentExpiryLeadDays": 30 as number,
  "alerts.trialEndLeadDays": 7 as number,
  "alerts.staffContractEndLeadDays": 30 as number,
  "alerts.backupStaleDays": 3 as number,
  "quote.validityDays": 15 as number,
  "quote.approvalRule": "MANAGER_ALWAYS" as string,
  "costing.hourlyLabourCost": null as number | null,
  "costing.marginPercent": null as number | null,
  "costing.reservePercent": null as number | null,
  "costing.adminSharePercent": null as number | null,
  "costing.hoursOverrunPercent": 1000 as number,
  /** Asked at first run; nothing is invoiced before it is chosen. */
  "tax.mode": null as "VAT" | "IFU" | null,
  "tax.vatRate": 1900 as number,
  "tax.pricesIncludeVat": true as boolean,
  "tax.ifuMention": {
    ar: "غير خاضع للرسم على القيمة المضافة – نظام الضريبة الجزافية الوحيدة",
    fr: "Non assujetti à la TVA – régime de l'IFU",
  } as { ar: string; fr: string },
  "stamp.enabled": true as boolean,
  "stamp.mode": "WHOLE" as "WHOLE" | "PROGRESSIVE",
  "stamp.bands": [
    { upTo: 3000000, per100: 100 },
    { upTo: 10000000, per100: 150 },
    { upTo: null, per100: 200 },
  ] as StampBand[],
  "stamp.exemptBelow": 30000 as number,
  "stamp.minimum": 500 as number,
  "stamp.maximum": null as number | null,
  "stamp.roundUpToDinar": false as boolean,
  "invoice.missedVisitRule": "BILL_DONE_ONLY" as string,
  "invoice.missedVisitAmount": null as number | null,
  "invoice.requireSignOff": true as boolean,
  "forecast.months": 3 as number,
  "export.separator": ";" as string,
  "export.decimalComma": true as boolean,
  "numbering.fileSuffix": {
    BUILDING_CONTRACT: "BLC",
    HOUSING_REQUEST: "",
    HOUSING_CONTRACT: "",
    ORG_REQUEST: "",
    ORG_CONTRACT: "",
    COMPLEX_CONTRACT: "",
  } as Record<string, string>,
  "numbering.employeeSuffix": "" as string,
  "numbering.width": {
    QUOTE: 4,
    VISIT: 5,
    COMPLAINT: 4,
    INSPECTION: 4,
    VIOLATION: 4,
    PAY_RUN: 4,
    PAYSLIP: 4,
    PAYOUT: 4,
    HANDOUT: 4,
    COUNT: 4,
    PURCHASE_REQUEST: 4,
    PURCHASE: 4,
    EQUIPMENT_UNIT: 4,
  } as Record<string, number>,
  /** Per ordinary sequence key, the first number to give: to go on from the paper registers. */
  "numbering.startAt": {} as Record<string, number>,
  /** A prefix of invoice and receipt numbers, for a second PC of the same company. */
  "numbering.legalSeries": "" as string,
  "pay.runPeriods": ["MONTHLY"] as string[],
  "pay.overtimePremium": 5000 as number,
  "pay.restDayPremium": 5000 as number,
  "pay.monthlyDivisorMin": 10400 as number,
  "pay.leaveDaysPerMonth": 2500 as number,
  "pay.leaveYearStart": "07-01" as string,
  "pay.leaveCapDays": 30000 as number,
  "pay.cnasEmployeeRate": 900 as number,
  "pay.cnasEmployerRate": 2600 as number,
  "pay.irgTable": null as IrgTable | null,
  "pay.defaultBasis": null as string | null,
  "pay.defaultPeriod": "MONTHLY" as string,
  "hiring.trialDays": 30 as number,
  "evaluation.periodMonths": 3 as number,
  "evaluation.scaleMax": 5 as number,
  "documents.validityMonths": {} as Record<string, number>,
  "sanction.blockingStates": {
    WORKER: ["SUSPENDED", "PENALISED"],
    EMPLOYEE: ["SUSPENDED", "PENALISED"],
    CLIENT: ["SUSPENDED", "PENALISED"],
  } as Record<string, string[]>,
  "sanction.matchAcrossKinds": true as boolean,
};

export type SettingKey = keyof typeof SETTING_DEFAULTS;
export type SettingValue<K extends SettingKey> = (typeof SETTING_DEFAULTS)[K];

export const SETTING_KEYS = Object.keys(SETTING_DEFAULTS) as SettingKey[];

/** Written by the program for itself: not a change a person made, so not a log entry. */
export function isSystemSetting(key: SettingKey): boolean {
  return key.startsWith("system.");
}
