import type {
  Bearer,
  CallPurpose,
  CallResult,
  Completion,
  CorrectiveAction,
  Division,
  ForbiddenPlace,
  Ppe,
  ProblemKind,
  QualityLevel,
  Sex,
  SignoffStatus,
  SiteInstruction,
  TaskFrequency,
  TeamAccess,
  WorkerRole,
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

/** The division, as his notes name the four. */
export const DIVISION_WORD: Record<Division, string> = {
  HOUSING: "المنازل",
  ORGANISATION: "المؤسسات",
  BUILDING: "العمارات",
  COMPLEX: "التجمعات السكنية",
};

/** 0 = السبت … 6 = الجمعة. His client forms spell «الاثنين»; the worker form «الإثنين». */
export const WEEKDAY_WORD = ["السبت", "الأحد", "الاثنين", "الثلاثاء", "الأربعاء", "الخميس", "الجمعة"] as const;

/** «الصفة» on his worker card. */
export function workerRoleWord(role: WorkerRole, sex: Sex): string {
  if (role === "TEAM_LEADER") return "قائد فريق";
  if (role === "SENIOR_WORKER") return "عامل رئيسي";
  return sex === "FEMALE" ? "عاملة نظافة" : "عامل نظافة";
}

/** «دخول الفريق» on his client forms. */
export const TEAM_ACCESS_WORD: Record<TeamAccess, string> = {
  VIA_GUARD: "عن طريق الحارس",
  OWN_KEY: "مفتاح خاص",
  BUILDING_MANAGER: "مسؤول العمارة",
  OPEN_DOOR: "باب مفتوح خلال ساعات العمل",
};

/** «مواد التنظيف» on his client forms. */
export const BEARER_WORD: Record<Bearer, string> = {
  CENTRE: "على عاتق المركز",
  OWNER: "على عاتق صاحبها",
};

/** Card section 9, «مناطق ممنوع دخولها أو لمسها». */
export const FORBIDDEN_PLACE_WORD: Record<ForbiddenPlace, string> = {
  RESIDENT_FLATS: "شقق السكان",
  TECH_ROOMS: "غرف تقنية",
  ELECTRIC_ROOMS: "غرف كهرباء",
  EQUIPMENT_ROOMS: "غرف معدات",
  STORES: "مستودعات",
  OTHER: "مناطق أخرى",
};

/** His sentence under the forbidden places. */
export const FORBIDDEN_RULE = "لا يدخل العامل أي مساحة غير مدرجة في نطاق المهمة إلا بتوجيه من المسؤول المعتمد.";

/** Card section 10, «تعليمات خاصة». */
export const SITE_INSTRUCTION_WORD: Record<SiteInstruction, string> = {
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

/** Card section 12, «معدات الوقاية». */
export const PPE_WORD: Record<Ppe, string> = {
  GLOVES: "قفازات",
  SHOES: "أحذية مناسبة",
  WORKWEAR: "لباس العمل",
  BADGE: "سترة/شارة تعريف",
  MASK: "كمامة عند الحاجة",
  EXTRA: "معدات حماية إضافية حسب طبيعة المهمة",
};

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

export const CORRECTIVE_ACTION_WORD: Record<CorrectiveAction, string> = {
  REDO_SERVICE: "إعادة الخدمة",
  FIX_ITEMS: "تصحيح النقائص",
  TRAIN_WORKER: "تدريب العاملة",
  CHANGE_WORKER: "تغيير العاملة",
  OTHER: "أخرى",
};

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
