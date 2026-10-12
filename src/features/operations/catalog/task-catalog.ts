import type { Division, TaskFrequency } from "../validators/option-codes";

/**
 * His own lists of cleaning tasks, as the seeded catalogue a file's tasks are
 * picked from, and as what a blank mission order prints.
 *
 * Constants, not a table: the label is copied onto the file's task when it is
 * picked, so the code is only the task's origin. Codes are the prefix and the
 * item's rank in his document; the wording is his, unchanged.
 *
 * Sources: 6.md section 11 (organisations), 8.md section 12 (buildings), 9.md
 * sections 5 and 7 (the buildings worker card), 2.md sections 17 and 18 (homes).
 */

export interface CatalogTask {
  code: string;
  label: string;
  frequency: TaskFrequency;
  /** The place the task belongs to, when his list is sorted by place. */
  place: string | null;
}

function list(
  prefix: string,
  frequency: TaskFrequency,
  place: string | null,
  labels: readonly string[],
): CatalogTask[] {
  return labels.map((label, index) => ({
    code: `${prefix}_${String(index + 1).padStart(2, "0")}`,
    label,
    frequency,
    place,
  }));
}

/** Organisations: «الخدمات اليومية / الأسبوعية / الشهرية/الدورية / الخاصة» (6.md section 11). */
export const ORGANISATION_TASKS: readonly CatalogTask[] = [
  ...list("ORG_D", "DAILY", null, [
    "كنس",
    "مسح",
    "إزالة الغبار",
    "تنظيف المكاتب",
    "تنظيف الأسطح",
    "تنظيف الممرات",
    "تنظيف السلالم",
    "تنظيف دورات المياه",
    "تفريغ النفايات",
    "تنظيف المطبخ/الاستراحة",
  ]),
  ...list("ORG_W", "WEEKLY", null, [
    "تنظيف الزجاج",
    "تنظيف الأبواب",
    "تنظيف الجدران",
    "تنظيف الزوايا",
    "تنظيف السلالم بعمق",
    "تنظيف المخازن",
    "تنظيف المساحات الخارجية",
  ]),
  ...list("ORG_M", "MONTHLY", null, [
    "تنظيف شامل",
    "تنظيف الواجهات",
    "تنظيف النوافذ بالكامل",
    "تنظيف عميق للأرضيات",
    "تنظيف مناطق يصعب الوصول إليها",
    "تنظيف موسمي",
  ]),
  ...list("ORG_S", "SPECIAL", null, [
    "بعد الأشغال",
    "قبل الافتتاح",
    "بعد مناسبة",
    "بعد الانتقال",
    "تنظيف طارئ",
    "خدمة إضافية حسب الطلب",
  ]),
];

/** Buildings and complexes: «الخدمة اليومية / الأسبوعية / الشهرية» and «خدمات إضافية» (8.md section 12). */
export const BUILDING_TASKS: readonly CatalogTask[] = [
  ...list("BLD_D", "DAILY", null, ["المداخل", "السلالم", "الممرات", "المصاعد", "إزالة النفايات", "المساحات الخارجية"]),
  ...list("BLD_W", "WEEKLY", null, [
    "تنظيف عميق للسلالم",
    "تنظيف النوافذ",
    "تنظيف الأبواب",
    "تنظيف الجدران",
    "تنظيف المرائب",
    "تنظيف الأقبية",
  ]),
  ...list("BLD_M", "MONTHLY", null, [
    "تنظيف شامل",
    "تنظيف الواجهات",
    "تنظيف النوافذ بالكامل",
    "تنظيف عميق للأرضيات",
    "تنظيف المناطق قليلة الاستخدام",
  ]),
  ...list("BLD_S", "SPECIAL", null, [
    "تنظيف بعد الأشغال",
    "تنظيف موسمي",
    "تنظيف طارئ",
    "تنظيف شامل قبل/بعد مناسبة",
    "خدمات أخرى",
  ]),
];

/** Buildings: «مهام التنظيف الأساسية», by place (9.md section 7). */
export const BUILDING_BASIC_TASKS: readonly CatalogTask[] = [
  ...list("BLD_B_FLOORS", "DAILY", "الأرضيات", ["كنس", "إزالة الغبار", "مسح", "إزالة البقع الظاهرة"]),
  ...list("BLD_B_STAIRS", "DAILY", "السلالم", ["كنس الدرج", "مسح الدرج", "تنظيف حواف الدرج", "تنظيف الدرابزين"]),
  ...list("BLD_B_CORRIDORS", "DAILY", "الممرات", ["كنس", "مسح", "إزالة الغبار", "تنظيف الزوايا"]),
  ...list("BLD_B_LIFTS", "DAILY", "المصاعد", [
    "تنظيف الأرضية",
    "تنظيف الأبواب",
    "تنظيف المرآة",
    "تنظيف الجدران الداخلية",
    "تنظيف لوحة التحكم",
  ]),
  ...list("BLD_B_ENTRANCES", "DAILY", "المداخل", ["تنظيف الباب", "تنظيف الزجاج", "تنظيف الأرضية", "إزالة الغبار"]),
  ...list("BLD_B_WASTE", "DAILY", "النفايات", [
    "جمع النفايات",
    "نقلها إلى نقطة التجميع المحددة",
    "تنظيف مكان الحاويات عند إدراجه في نطاق العقد",
  ]),
];

/** Homes: «المهام المطلوبة» of the worker's order (2.md section 17). */
export const HOUSING_ORDER_TASKS: readonly CatalogTask[] = list("HOM_T", "DAILY", null, [
  "إزالة الغبار",
  "تنظيف الأرضيات",
  "تنظيف المطبخ",
  "تنظيف الحمامات",
  "تنظيف النوافذ",
  "تنظيف الأبواب",
  "تنظيف الشرفات",
  "تنظيف الأثاث",
  "أخرى",
]);

/** Homes: «قائمة فحص التنظيف», by room (2.md section 18). */
export const HOUSING_CHECKLIST: readonly CatalogTask[] = [
  ...list("HOM_C_SALON", "DAILY", "الصالون", [
    "إزالة الغبار",
    "تنظيف الأرضية",
    "تنظيف الأثاث",
    "تنظيف النوافذ",
    "تنظيف الأبواب",
  ]),
  ...list("HOM_C_BEDROOMS", "DAILY", "غرف النوم", [
    "إزالة الغبار",
    "تنظيف الأرضيات",
    "ترتيب حسب الاتفاق",
    "تنظيف النوافذ",
  ]),
  ...list("HOM_C_KITCHEN", "DAILY", "المطبخ", [
    "الأسطح",
    "الحوض",
    "الأرضية",
    "الخزائن الخارجية",
    "الأجهزة حسب الاتفاق",
  ]),
  ...list("HOM_C_BATHROOM", "DAILY", "الحمام", ["المرحاض", "المغسلة", "المرآة", "الأرضية", "الجدران حسب الاتفاق"]),
  ...list("HOM_C_EXTRAS", "DAILY", "إضافات", ["الشرفات", "السلالم", "الزجاج", "السجاد", "الستائر", "أخرى"]),
];

/** Buildings: «المناطق المطلوب تنظيفها اليوم» (9.md section 5), the places a building's areas are picked from. */
export const BUILDING_AREAS: readonly { code: string; label: string }[] = [
  "المدخل الرئيسي",
  "المداخل الثانوية",
  "السلالم",
  "الممرات",
  "المصاعد",
  "الأبواب والمقابض",
  "صناديق البريد",
  "النوافذ المشتركة",
  "المرآب",
  "القبو",
  "الساحة الخارجية",
  "الأرصفة والمحيط الخارجي",
  "منطقة النفايات",
  "أخرى",
].map((label, index) => ({ code: `BLD_A_${String(index + 1).padStart(2, "0")}`, label }));

/** The rows of the floor and entrance table as his card prints it blank (9.md section 6). */
export const BLANK_FLOOR_TABLE: readonly string[] = [
  "المدخل 01",
  "الطابق 01",
  "الطابق 02",
  "الطابق 03",
  "الطابق 04",
  "الطابق 05",
  "الطابق 06",
  "مدخل 02",
  "مناطق أخرى",
];

/** Everything in the catalogue, for looking a code up. */
export const TASK_CATALOG: readonly CatalogTask[] = [
  ...ORGANISATION_TASKS,
  ...BUILDING_TASKS,
  ...BUILDING_BASIC_TASKS,
  ...HOUSING_ORDER_TASKS,
  ...HOUSING_CHECKLIST,
];

/**
 * The tasks a blank order of a division prints: his checklist by room for
 * homes, his basic tasks by place for buildings and complexes, his daily and
 * weekly services for organisations (his documents have no order for them).
 */
export function blankOrderTasks(division: Division): readonly CatalogTask[] {
  if (division === "HOUSING") return HOUSING_CHECKLIST;
  if (division === "ORGANISATION") {
    return ORGANISATION_TASKS.filter((task) => task.frequency === "DAILY" || task.frequency === "WEEKLY");
  }
  return BUILDING_BASIC_TASKS;
}
