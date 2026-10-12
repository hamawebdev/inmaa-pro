import type {
  CallPurpose,
  CallResult,
  Completion,
  CorrectiveAction,
  Division,
  ProblemKind,
  QualityLevel,
  SignoffStatus,
  TaskFrequency,
} from "../validators/option-codes";

/**
 * The Arabic words Operations' printed sheets use for stored codes.
 *
 * A printed sheet is always Arabic and worded as the client's own documents
 * word it, whatever the language of the screen, so these are not in the message
 * files. Each list is keyed by its codes: renaming a code breaks the build here.
 *
 * Sources: his buildings worker card (9.md), his homes client file (2.md), his
 * study (1.md) and his five client forms.
 */

/** 0 = السبت … 6 = الجمعة. His client forms spell «الاثنين»; the worker form «الإثنين». */
export const WEEKDAY_WORD = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"] as const;

/** His sentence under the forbidden places. */
export const FORBIDDEN_RULE = "لا يدخل العامل أي مساحة غير مدرجة في نطاق المهمة إلا بتوجيه من المسؤول المعتمد.";

/** His study and inspection forms: «الخدمات اليومية / الأسبوعية / الشهرية / الخاصة». */
export const TASK_FREQUENCY_WORD: Record<TaskFrequency, string> = {
  DAILY: "يومية",
  WEEKLY: "أسبوعية",
  MONTHLY: "شهرية",
  SPECIAL: "خاصة",
};

/** Card section 14, «قائمة التحقق قبل المغادرة», in his order (DEP_01 to DEP_08). */
export const DEPARTURE_CHECKS = [
  "تم تنظيف جميع المناطق المحددة",
  "تم جمع النفايات حسب الاتفاق",
  "تم تنظيف الأدوات بعد الاستعمال",
  "تم إعادة المعدات إلى مكانها",
  "تم التأكد من عدم ترك مواد التنظيف في أماكن غير آمنة",
  "تم التأكد من إغلاق الأبواب التي تم فتحها أثناء العمل",
  "تم إبلاغ المشرف بأي ملاحظة",
  "تم تسليم الموقع للمسؤول",
] as const;

/** Card section 15, «نوع المشكلة»; the last two are from article 13 of his regulations. */
export const PROBLEM_KIND_WORD: Record<ProblemKind, string> = {
  MATERIAL_SHORTAGE: "نقص مواد",
  EQUIPMENT_SHORTAGE: "نقص معدات",
  OBSTACLE: "عائق أمام العمل",
  AREA_UNAVAILABLE: "مساحة غير متاحة",
  PRIOR_DAMAGE: "تلف سابق",
  SAFETY_HAZARD: "خطر على السلامة",
  RESIDENT_COMPLAINT: "شكوى من أحد السكان",
  EXTRA_SERVICE: "خدمة إضافية مطلوبة",
  DAMAGE_DURING_WORK: "تلف أو كسر",
  INJURY_ACCIDENT: "إصابة أو حادث",
  OTHER: "أخرى",
};

/** The order the kinds are printed in: his nine, the two additions before «أخرى». */
export const PROBLEM_KINDS_IN_PRINT_ORDER: readonly ProblemKind[] = [
  "MATERIAL_SHORTAGE",
  "EQUIPMENT_SHORTAGE",
  "OBSTACLE",
  "AREA_UNAVAILABLE",
  "PRIOR_DAMAGE",
  "SAFETY_HAZARD",
  "RESIDENT_COMPLAINT",
  "EXTRA_SERVICE",
  "DAMAGE_DURING_WORK",
  "INJURY_ACCIDENT",
  "OTHER",
];

/** Card section 16, «حالة الإنجاز». */
export const COMPLETION_WORD: Record<Completion, string> = {
  FULL: "مكتملة بالكامل",
  PARTIAL: "مكتملة جزئياً",
  NOT_DONE: "لم تكتمل",
};

/**
 * «حالة الاستلام». Homes are worded as his homes file (section 21), the other
 * three divisions as his buildings card (section 18).
 */
export function signoffWord(status: SignoffStatus, division: Division): string {
  const housing: Record<SignoffStatus, string> = {
    ACCEPTED: "راضٍ",
    ACCEPTED_WITH_NOTES: "راضٍ مع ملاحظات",
    NOT_ACCEPTED: "غير راضٍ",
  };
  const others: Record<SignoffStatus, string> = {
    ACCEPTED: "تم قبول الخدمة",
    ACCEPTED_WITH_NOTES: "تم قبولها مع ملاحظات",
    NOT_ACCEPTED: "تحتاج إلى تصحيح",
  };
  return (division === "HOUSING" ? housing : others)[status];
}

/** Who signs, per division: «اسم العميل» in his homes file, «اسم ممثل العمارة» on his card. */
export const SIGNER_WORD: Record<Division, string> = {
  HOUSING: "اسم العميل",
  ORGANISATION: "اسم ممثل المؤسسة",
  BUILDING: "اسم ممثل العمارة",
  COMPLEX: "اسم ممثل التجمع السكني",
};

/** Homes file section 22, «تقييم الخدمة من 1 إلى 5». */
export const RATING_CRITERIA = [
  { key: "quality", word: "جودة التنظيف" },
  { key: "punctuality", word: "الالتزام بالموعد" },
  { key: "behaviour", word: "سلوك العامل(ة)" },
  { key: "materials", word: "جودة المواد" },
  { key: "overall", word: "التقييم العام" },
] as const;
export type RatingKey = (typeof RATING_CRITERIA)[number]["key"];

/** Card section 17, «مستوى جودة العمل». */
export const QUALITY_LEVEL_WORD: Record<QualityLevel, string> = {
  EXCELLENT: "ممتاز",
  VERY_GOOD: "جيد جداً",
  GOOD: "جيد",
  ACCEPTABLE: "مقبول",
  REDO: "يحتاج إلى إعادة",
};

/** His study: what follows a quality under 80. Only these three are offered on the inspection sheet. */
export const INSPECTION_ACTIONS: readonly CorrectiveAction[] = ["REDO_SERVICE", "TRAIN_WORKER", "CHANGE_WORKER"];

/** The call list: why the office calls, and how the call ended. */
export const CALL_PURPOSE_WORD: Record<CallPurpose, string> = {
  REMINDER: "تأكيد الموعد",
  REPLACEMENT_NOTICE: "تعويض عاملة",
  ARRIVAL_CHECK: "التأكد من الوصول",
  FOLLOW_UP: "متابعة",
};

export const CALL_RESULT_WORD: Record<CallResult, string> = {
  INFORMED: "تم إبلاغ العميل",
  NO_ANSWER: "لم يرد",
  POSTPONE_REQUESTED: "طلب تأجيل",
  CANCEL_REQUESTED: "طلب إلغاء",
};

/**
 * His study, «إرسال تأكيد للعميل» and «نظام الغياب», which write both without
 * quotation marks. They print without: on paper, guillemets in right-to-left
 * text came out pointing inwards (»…«), unmirrored.
 */
export const REMINDER_SCRIPT = "نؤكد لكم موعد خدمة التنظيف غدًا على الساعة …… .";
export const REPLACEMENT_SCRIPT = "نعتذر، تم تعويض العاملة بعاملة أخرى من فريقنا لضمان استمرار الخدمة.";

/** His closing note on the worker card. */
export const ORDER_IS_NOT_A_CONTRACT = "هذه البطاقة هي أمر توجيه وتنفيذ وليست عقداً مع العميل.";

/** Card section 11: the materials and equipment a blank order lists. */
export const DEFAULT_HANDOUT_ITEMS = [
  "ممسحة",
  "دلو",
  "مكنسة",
  "منظف أرضيات",
  "منظف زجاج",
  "منظف دورات/أسطح",
  "أكياس نفايات",
  "قفازات",
  "معدات أخرى",
] as const;

/** «الحالة عند الاستلام» of a handed-out tool. */
export const HANDOUT_CONDITION_WORD = { GOOD: "جيدة", NEEDS_MAINTENANCE: "تحتاج صيانة" } as const;
export type HandoutCondition = keyof typeof HANDOUT_CONDITION_WORD;
