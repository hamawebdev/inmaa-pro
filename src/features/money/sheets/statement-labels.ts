import type { Division, PaymentFrequency } from "../validators/option-codes";

/**
 * The Arabic words an invoice freezes when it is issued: what its lines are
 * called and what its visit statement says of each visit. Written in his
 * words, and stored with the invoice so that it reprints as it was issued.
 */

/** D9 section 16: «مكتملة بالكامل», «مكتملة جزئياً», «لم تكتمل». */
export const COMPLETION_LABEL: Readonly<Record<string, string>> = {
  FULL: "مكتملة بالكامل",
  PARTIAL: "مكتملة جزئياً",
  NOT_DONE: "لم تكتمل",
};

/** The client's answer: D2 section 21 for homes, D9 section 18 for the three other divisions. */
const SIGNOFF_HOUSING: Readonly<Record<string, string>> = {
  ACCEPTED: "راضٍ",
  ACCEPTED_WITH_NOTES: "راضٍ مع ملاحظات",
  NOT_ACCEPTED: "غير راضٍ",
};
const SIGNOFF_OTHER: Readonly<Record<string, string>> = {
  ACCEPTED: "تم قبول الخدمة",
  ACCEPTED_WITH_NOTES: "تم قبولها مع ملاحظات",
  NOT_ACCEPTED: "تحتاج إلى تصحيح",
};

export function signOffLabel(division: Division, status: string | null): string | null {
  if (status === null) return null;
  return (division === "HOUSING" ? SIGNOFF_HOUSING : SIGNOFF_OTHER)[status] ?? null;
}

/** The plan's visit statuses, for a visit that has no completion to show. */
export const VISIT_STATUS_LABEL: Readonly<Record<string, string>> = {
  CONFIRMED: "مؤكدة",
  AWAITING_CONFIRMATION: "بانتظار التأكيد",
  IN_PROGRESS: "جارية",
  DONE: "منفذة",
  POSTPONED: "مؤجلة",
  PROBLEM: "مشكلة",
  CANCELLED: "ملغاة",
};

/** The unit a period's line is counted in, from «دورية السداد». */
export const PERIOD_UNIT_LABEL: Readonly<Record<Exclude<PaymentFrequency, "PER_VISIT">, string>> = {
  WEEKLY: "أسبوع",
  BIWEEKLY: "أسبوعان",
  MONTHLY: "شهر",
};
export const VISIT_UNIT_LABEL = "زيارة";
export const JOB_UNIT_LABEL = "خدمة";

export const NOBODY_TO_SIGN_LABEL = "لم يوقّع أحد";
export const CLIENT_AT_FAULT_REMARK = "تعذرت بسبب العميل";
export const MAKEUP_REMARK = "زيارة تعويضية";
export const NOT_SIGNED_OFF_REMARK = "أمر المهمة لم يُدخل كاملاً";
