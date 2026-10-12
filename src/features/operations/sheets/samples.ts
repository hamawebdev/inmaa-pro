import { SEED_INSPECTION_CRITERIA } from "../catalog/inspection-criteria";
import { inspectionTotal } from "../rules/inspection-score";
import { DIVISIONS, type Division } from "../validators/option-codes";

import type {
  CallListData,
  InspectionSheetData,
  MissionOrderData,
  OrderReturn,
  SupervisorDaySheetData,
} from "./sheet-data";

/**
 * Sample objects for Operations' four sheets, until the services that read the
 * database exist. The print pages show them; the people and places are made up.
 *
 * A page chooses its object by the last part of its path:
 *
 *   sample-<division>    a filled sheet, as it leaves the office
 *   returned-<division>  the same with what came back typed in
 *   blank-<division>     an empty sheet, to fill by hand
 *
 * `<division>` is housing, organisation, building or complex. The day sheet
 * and the call list have no division: sample or blank.
 */

export type SampleKind = "sample" | "returned" | "blank";

export function parseSampleKey(key: string | undefined): { kind: SampleKind; division: Division } {
  const [kindPart = "", divisionPart = ""] = (key ?? "").split("-");
  const kind: SampleKind = kindPart === "blank" || kindPart === "returned" ? kindPart : "sample";
  const division = DIVISIONS.find((code) => code.toLowerCase() === divisionPart.toLowerCase()) ?? "HOUSING";
  return { kind, division };
}

const SUPERVISOR = { name: "سميرة حداد", phone: "0661 20 31 42" };

// ── Mission orders ──────────────────────────────────────────────────────────

function blankOrder(division: Division): MissionOrderData {
  return {
    division,
    number: null,
    issuedOn: null,
    visitDate: null,
    startTime: null,
    endTime: null,
    jobDay: null,
    dayRank: null,
    site: { label: null, address: null, commune: null, landmark: null, directions: null },
    contact: { name: null, role: null, phone: null, meetingPoint: null, receiver: null },
    access: { ways: [], guardName: null, guardPhone: null },
    team: [],
    supervisor: { name: null, phone: null },
    taskGroups: [],
    specialTasks: [],
    areas: [],
    forbidden: { places: [], details: null },
    instructions: { codes: [], extra: null, ppe: [], safetyNotes: null },
    materialsBy: null,
    handouts: [],
    returned: null,
  };
}

const HOUSING_ORDER: MissionOrderData = {
  division: "HOUSING",
  number: "000124/2026",
  issuedOn: "2026-10-11",
  visitDate: "2026-10-12",
  startTime: "09:00",
  endTime: "14:00",
  jobDay: null,
  dayRank: { no: 1, count: 2 },
  site: {
    label: "شقة في الطابق الثالث (F4)",
    address: "حي المجاهدين، عمارة 4، الباب 12",
    commune: "أم البواقي",
    landmark: "مقابل الصيدلية المركزية",
    directions: "المدخل الثاني على اليمين، بدون مصعد",
  },
  contact: {
    name: "ليلى حمدي",
    role: "صاحبة السكن",
    phone: "0770 11 22 33",
    meetingPoint: "عند باب الشقة",
    receiver: "ليلى حمدي",
  },
  access: { ways: [], guardName: null, guardPhone: null },
  team: [
    { name: "أمال بن علي", number: "012/F", role: "TEAM_LEADER", sex: "FEMALE" },
    { name: "نادية قاسمي", number: "027/F", role: "CLEANER", sex: "FEMALE" },
  ],
  supervisor: SUPERVISOR,
  taskGroups: [
    {
      place: "الصالون",
      tasks: [
        { label: "إزالة الغبار", frequency: "DAILY" },
        { label: "تنظيف الأرضية", frequency: "DAILY" },
        { label: "تنظيف الأثاث", frequency: "DAILY" },
        { label: "تنظيف النوافذ", frequency: "DAILY" },
      ],
    },
    {
      place: "غرف النوم",
      tasks: [
        { label: "إزالة الغبار", frequency: "DAILY" },
        { label: "تنظيف الأرضيات", frequency: "DAILY" },
        { label: "ترتيب حسب الاتفاق", frequency: "DAILY" },
      ],
    },
    {
      place: "المطبخ",
      tasks: [
        { label: "الأسطح", frequency: "DAILY" },
        { label: "الحوض", frequency: "DAILY" },
        { label: "الأرضية", frequency: "DAILY" },
        { label: "الخزائن الخارجية", frequency: "DAILY" },
      ],
    },
    {
      place: "الحمام",
      tasks: [
        { label: "المرحاض", frequency: "DAILY" },
        { label: "المغسلة", frequency: "DAILY" },
        { label: "المرآة", frequency: "DAILY" },
        { label: "الأرضية", frequency: "DAILY" },
      ],
    },
    { place: "إضافات", tasks: [{ label: "الشرفات", frequency: "DAILY" }] },
  ],
  specialTasks: ["تنظيف الفرن من الداخل", "تنظيف الثلاجة"],
  areas: [],
  forbidden: { places: [], details: "غرفة المكتب مغلقة ولا تُفتح. عدم لمس الوثائق الموضوعة في الصالون." },
  instructions: {
    codes: ["NO_TOUCH_DOCS", "NO_UNAPPROVED_PRODUCTS", "NO_MIXING", "REPORT_DAMAGE"],
    extra: "استعمال منظف خاص للأرضية الخشبية في غرف النوم.",
    ppe: ["GLOVES", "SHOES", "WORKWEAR", "BADGE"],
    safetyNotes: null,
  },
  materialsBy: "CENTRE",
  handouts: [
    { item: "ممسحة", quantity: "2", condition: "GOOD" },
    { item: "دلو", quantity: "1", condition: "GOOD" },
    { item: "مكنسة", quantity: "1", condition: "GOOD" },
    { item: "منظف أرضيات", quantity: "1 ل", condition: null },
    { item: "منظف زجاج", quantity: "1", condition: null },
    { item: "قفازات", quantity: "2", condition: null },
  ],
  returned: null,
};

const HOUSING_RETURN: OrderReturn = {
  departureChecks: [true, true, true, true, true, true, true, true],
  problemOnSite: true,
  problemKinds: ["PRIOR_DAMAGE", "EXTRA_SERVICE"],
  problemDetails: "خدش قديم في باب خزانة المطبخ. العميلة تطلب تنظيف السجاد في زيارة أخرى.",
  completion: "PARTIAL",
  completionPercent: 90,
  incompleteReason: "الشرفة مغلقة ولم يتوفر المفتاح.",
  needsExtraVisit: false,
  needsSupervisor: false,
  signoff: {
    status: "ACCEPTED_WITH_NOTES",
    name: "ليلى حمدي",
    role: "صاحبة السكن",
    date: "2026-10-12",
    notes: "العمل جيد. تبقى الشرفة للمرة القادمة.",
    wantsOtherService: true,
    otherService: "تنظيف السجاد",
    ratings: { quality: 4, punctuality: 5, behaviour: 5, materials: 4, overall: 4 },
    wouldRecommend: true,
  },
};

const HOUSING_RETURNED_ORDER: MissionOrderData = {
  ...HOUSING_ORDER,
  team: [
    {
      ...HOUSING_ORDER.team[0],
      arrived: "09:05",
      workStart: "09:15",
      workEnd: "13:40",
      left: "13:50",
      lateReason: null,
    },
    {
      ...HOUSING_ORDER.team[1],
      arrived: "09:20",
      workStart: "09:25",
      workEnd: "13:40",
      left: "13:50",
      lateReason: "تأخر الحافلة",
    },
  ],
  taskGroups: HOUSING_ORDER.taskGroups.map((group) => ({
    ...group,
    tasks: group.tasks.map((task) => ({ ...task, done: group.place !== "إضافات" })),
  })),
  returned: HOUSING_RETURN,
};

const ORGANISATION_ORDER: MissionOrderData = {
  ...blankOrder("ORGANISATION"),
  number: "000125/2026",
  issuedOn: "2026-10-11",
  visitDate: "2026-10-12",
  startTime: "16:30",
  endTime: "18:30",
  dayRank: { no: 2, count: 2 },
  site: {
    label: "وكالة تأمينات – الطابق الأرضي",
    address: "شارع أول نوفمبر، رقم 24",
    commune: "أم البواقي",
    landmark: "بجانب مركز البريد",
    directions: "الدخول من الباب الخلفي بعد خروج الموظفين",
  },
  contact: {
    name: "مراد سعدي",
    role: "مسير الوكالة",
    phone: "0550 44 55 66",
    meetingPoint: "مكتب الاستقبال",
    receiver: "مراد سعدي",
  },
  access: { ways: ["OWN_KEY"], guardName: null, guardPhone: null },
  team: [{ name: "نادية قاسمي", number: "027/F", role: "CLEANER", sex: "FEMALE" }],
  supervisor: SUPERVISOR,
  taskGroups: [
    {
      place: "المكاتب",
      tasks: [
        { label: "كنس", frequency: "DAILY" },
        { label: "مسح", frequency: "DAILY" },
        { label: "إزالة الغبار", frequency: "DAILY" },
        { label: "تنظيف المكاتب", frequency: "DAILY" },
        { label: "تفريغ النفايات", frequency: "DAILY" },
      ],
    },
    {
      place: "قاعة الاستقبال",
      tasks: [
        { label: "كنس", frequency: "DAILY" },
        { label: "مسح", frequency: "DAILY" },
        { label: "تنظيف الأسطح", frequency: "DAILY" },
        { label: "تنظيف الزجاج", frequency: "WEEKLY" },
      ],
    },
    {
      place: "دورات المياه",
      tasks: [
        { label: "تنظيف دورات المياه", frequency: "DAILY" },
        { label: "تنظيف الجدران", frequency: "WEEKLY", carried: true },
      ],
    },
    { place: "المطبخ/الاستراحة", tasks: [{ label: "تنظيف المطبخ/الاستراحة", frequency: "DAILY" }] },
    { place: null, tasks: [{ label: "تنظيف عميق للأرضيات", frequency: "MONTHLY" }] },
  ],
  specialTasks: [],
  forbidden: { places: ["TECH_ROOMS", "STORES"], details: "غرفة الأرشيف وخزانة الصندوق: يمنع الدخول." },
  instructions: {
    codes: ["NO_TOUCH_DOCS", "NO_UNAPPROVED_PRODUCTS", "NO_MIXING", "WET_FLOOR_SIGNS", "REPORT_DAMAGE"],
    extra: "عدم تحريك أجهزة الحاسوب والطابعات.",
    ppe: ["GLOVES", "WORKWEAR", "BADGE"],
    safetyNotes: "إغلاق الباب الخلفي بالمفتاح عند المغادرة.",
  },
  materialsBy: "OWNER",
  handouts: [
    { item: "ممسحة", quantity: "1", condition: "GOOD" },
    { item: "أكياس نفايات", quantity: "10", condition: null },
  ],
};

const BUILDING_ORDER: MissionOrderData = {
  ...blankOrder("BUILDING"),
  number: "000123/2026",
  issuedOn: "2026-10-11",
  visitDate: "2026-10-12",
  startTime: "08:00",
  endTime: "12:00",
  dayRank: { no: 1, count: 3 },
  site: {
    label: "عمارة النور (ب 12)",
    address: "حي 500 مسكن، عمارة ب 12",
    commune: "أم البواقي",
    landmark: "قرب مسجد الفتح",
    directions: "الدخول من جهة موقف السيارات",
  },
  contact: {
    name: "عبد القادر مرابط",
    role: "ممثل السكان",
    phone: "0770 12 34 56",
    meetingPoint: "المدخل الرئيسي",
    receiver: "عبد القادر مرابط",
  },
  access: { ways: ["VIA_GUARD"], guardName: "صالح بوعلام", guardPhone: "0661 98 76 54" },
  team: [
    { name: "كريم بوزيد", number: "008/H", role: "TEAM_LEADER", sex: "MALE" },
    { name: "أمال بن علي", number: "012/F", role: "CLEANER", sex: "FEMALE" },
    { name: "نادية قاسمي", number: "027/F", role: "CLEANER", sex: "FEMALE" },
  ],
  supervisor: SUPERVISOR,
  taskGroups: [
    {
      place: "الأرضيات",
      tasks: [
        { label: "كنس", frequency: "DAILY" },
        { label: "إزالة الغبار", frequency: "DAILY" },
        { label: "مسح", frequency: "DAILY" },
        { label: "إزالة البقع الظاهرة", frequency: "DAILY" },
      ],
    },
    {
      place: "السلالم",
      tasks: [
        { label: "كنس الدرج", frequency: "DAILY" },
        { label: "مسح الدرج", frequency: "DAILY" },
        { label: "تنظيف الدرابزين", frequency: "DAILY" },
        { label: "تنظيف عميق للسلالم", frequency: "WEEKLY" },
      ],
    },
    {
      place: "المصاعد",
      tasks: [
        { label: "تنظيف الأرضية", frequency: "DAILY" },
        { label: "تنظيف المرآة", frequency: "DAILY" },
        { label: "تنظيف لوحة التحكم", frequency: "DAILY" },
      ],
    },
    {
      place: "المداخل",
      tasks: [
        { label: "تنظيف الباب", frequency: "DAILY" },
        { label: "تنظيف الزجاج", frequency: "DAILY" },
        { label: "تنظيف الأرضية", frequency: "DAILY" },
      ],
    },
    {
      place: "النفايات",
      tasks: [
        { label: "جمع النفايات", frequency: "DAILY" },
        { label: "نقلها إلى نقطة التجميع المحددة", frequency: "DAILY" },
      ],
    },
    { place: null, tasks: [{ label: "تنظيف الواجهات", frequency: "MONTHLY" }] },
  ],
  specialTasks: ["تنظيف آثار الدهان في مدخل الطابق الثاني"],
  areas: [
    { label: "المدخل 01", requiredToday: "كنس ومسح وتنظيف الزجاج" },
    { label: "الطابق 01", requiredToday: "كنس ومسح" },
    { label: "الطابق 02", requiredToday: "كنس ومسح وإزالة آثار الدهان" },
    { label: "الطابق 03", requiredToday: "كنس ومسح" },
    { label: "الطابق 04", requiredToday: "كنس ومسح" },
    { label: "الطابق 05", requiredToday: "كنس ومسح" },
    { label: "المصعد", requiredToday: "تنظيف كامل" },
    { label: "المرآب", requiredToday: "كنس" },
    { label: "الساحة الخارجية", requiredToday: "جمع النفايات" },
    { label: "مناطق أخرى", requiredToday: null },
  ],
  forbidden: { places: ["RESIDENT_FLATS", "TECH_ROOMS", "ELECTRIC_ROOMS"], details: "غرفة العدادات في الطابق الأرضي." },
  instructions: {
    codes: ["NO_MOVE_PROPERTY", "NO_MIXING", "PROTECT_COMMON", "KEEP_QUIET", "WET_FLOOR_SIGNS", "REPORT_DAMAGE"],
    extra: "يبدأ العمل من الطابق الأخير نزولاً.",
    ppe: ["GLOVES", "SHOES", "WORKWEAR", "BADGE"],
    safetyNotes: "الانتباه إلى أرضية المدخل عند المطر.",
  },
  materialsBy: "CENTRE",
  handouts: [
    { item: "ممسحة", quantity: "3", condition: "GOOD" },
    { item: "دلو", quantity: "3", condition: "GOOD" },
    { item: "مكنسة", quantity: "3", condition: "NEEDS_MAINTENANCE" },
    { item: "منظف أرضيات", quantity: "2 ل", condition: null },
    { item: "منظف زجاج", quantity: "1", condition: null },
    { item: "أكياس نفايات", quantity: "20", condition: null },
    { item: "قفازات", quantity: "3", condition: null },
  ],
};

const COMPLEX_ORDER: MissionOrderData = {
  ...BUILDING_ORDER,
  division: "COMPLEX",
  number: "000126/2026",
  startTime: "13:30",
  endTime: "16:00",
  dayRank: { no: 3, count: 3 },
  site: {
    label: "تجمع سكني الياسمين – العمارتان أ وب",
    address: "حي الياسمين، طريق عين البيضاء",
    commune: "أم البواقي",
    landmark: "بعد محطة الوقود",
    directions: "البوابة الرئيسية ثم الساحة على اليسار",
  },
  contact: {
    name: "فاطمة زروقي",
    role: "مسيرة الإقامة",
    phone: "0550 22 33 44",
    meetingPoint: "مكتب التسيير",
    receiver: "فاطمة زروقي",
  },
  access: { ways: ["VIA_GUARD", "OPEN_DOOR"], guardName: "عمر شريف", guardPhone: "0661 55 44 33" },
  areas: [
    { label: "العمارة أ – المدخل", requiredToday: "كنس ومسح" },
    { label: "العمارة أ – الطوابق 1 إلى 4", requiredToday: "كنس ومسح السلالم والممرات" },
    { label: "العمارة ب – المدخل", requiredToday: "كنس ومسح" },
    { label: "العمارة ب – الطوابق 1 إلى 4", requiredToday: "كنس ومسح السلالم والممرات" },
    { label: "الساحة المشتركة", requiredToday: "كنس وجمع النفايات" },
    { label: "موقف السيارات", requiredToday: null },
  ],
  specialTasks: [],
};

const ORDERS: Record<Division, MissionOrderData> = {
  HOUSING: HOUSING_ORDER,
  ORGANISATION: ORGANISATION_ORDER,
  BUILDING: BUILDING_ORDER,
  COMPLEX: COMPLEX_ORDER,
};

export function sampleMissionOrder(key: string | undefined): MissionOrderData {
  const { kind, division } = parseSampleKey(key);
  if (kind === "blank") return blankOrder(division);
  if (kind === "returned") return division === "HOUSING" ? HOUSING_RETURNED_ORDER : ORDERS[division];
  return ORDERS[division];
}

// ── Inspection sheets ───────────────────────────────────────────────────────

function blankInspection(division: Division): InspectionSheetData {
  return {
    division,
    number: null,
    plannedDate: null,
    supervisorName: null,
    site: { label: null, address: null, commune: null },
    orderNumber: null,
    team: [],
    criteria: SEED_INSPECTION_CRITERIA[division].map(({ code, label }) => ({ code, label })),
    threshold: 80,
    result: null,
  };
}

function plannedInspection(division: Division): InspectionSheetData {
  const order = ORDERS[division];
  return {
    ...blankInspection(division),
    number: "000031/2026",
    plannedDate: order.visitDate,
    supervisorName: SUPERVISOR.name,
    site: { label: order.site.label, address: order.site.address, commune: order.site.commune },
    orderNumber: order.number,
    team: order.team.map((worker) => ({ name: worker.name ?? "" })),
  };
}

/** Marks that fall under 80: the returned sample shows a sheet that calls for a correction. */
const RETURNED_MARKS: Record<string, number | "n/a"> = {
  FLOORS: 7,
  STAIRS: 6,
  CORRIDORS: 8,
  LIFTS: "n/a",
  ENTRANCES: 8,
  WASTE: 9,
  INSTRUCTIONS: 8,
  APPEARANCE: 9,
  GLASS: 6,
  BATHROOMS: 7,
  ODOURS: 8,
  DUST: 7,
  EQUIPMENT: 9,
};

function returnedInspection(division: Division): InspectionSheetData {
  const planned = plannedInspection(division);
  const criteria = planned.criteria.map((criterion) => {
    const mark = RETURNED_MARKS[criterion.code] ?? 8;
    return {
      ...criterion,
      score: mark === "n/a" ? null : mark,
      notApplicable: mark === "n/a",
      note: criterion.code === "STAIRS" ? "غبار على الدرابزين في الطابقين 3 و4" : null,
    };
  });
  const total = inspectionTotal(
    criteria.map((criterion) => ({
      criterionCode: criterion.code,
      weight: 1,
      score: criterion.score,
      notApplicable: criterion.notApplicable,
    })),
  );
  return {
    ...planned,
    criteria,
    team: planned.team.map((worker, index) => ({
      ...worker,
      present: true,
      remark: index === 0 ? "ملتزم بالتعليمات" : null,
    })),
    result: {
      doneDate: planned.plannedDate,
      doneTime: "10:30",
      total,
      level: "GOOD",
      needsCorrection: true,
      action: "REDO_SERVICE",
      supervisorNotes: "يعاد تنظيف السلالم والدرابزين في الزيارة القادمة.",
      contactRemark: "لا ملاحظات أخرى.",
    },
  };
}

export function sampleInspectionSheet(key: string | undefined): InspectionSheetData {
  const { kind, division } = parseSampleKey(key);
  if (kind === "blank") return blankInspection(division);
  return kind === "returned" ? returnedInspection(division) : plannedInspection(division);
}

// ── The supervisor's day sheet ──────────────────────────────────────────────

const BLANK_DAY_SHEET: SupervisorDaySheetData = {
  supervisorName: null,
  date: null,
  zones: [],
  visits: [],
  absences: [],
  inspections: [],
  correctiveTasks: [],
  openIssues: [],
  workerPhones: [],
};

const DAY_SHEET: SupervisorDaySheetData = {
  supervisorName: SUPERVISOR.name,
  date: "2026-10-12",
  zones: ["أم البواقي", "عين البيضاء"],
  visits: [
    {
      startTime: "08:00",
      endTime: "12:00",
      orderNumber: "000123/2026",
      site: "عمارة النور (ب 12)",
      address: "حي 500 مسكن، أم البواقي",
      contactName: "عبد القادر مرابط",
      contactPhone: "0770 12 34 56",
      team: ["كريم بوزيد", "أمال بن علي", "نادية قاسمي"],
      vehicle: "سيارة المركز 1",
    },
    {
      startTime: "09:00",
      endTime: "14:00",
      orderNumber: "000124/2026",
      site: "شقة في الطابق الثالث (F4)",
      address: "حي المجاهدين، عمارة 4، أم البواقي",
      contactName: "ليلى حمدي",
      contactPhone: "0770 11 22 33",
      team: ["سعاد مزياني", "حورية عيساوي"],
      vehicle: null,
    },
    {
      startTime: "13:30",
      endTime: "16:00",
      orderNumber: "000126/2026",
      site: "تجمع سكني الياسمين",
      address: "حي الياسمين، طريق عين البيضاء",
      contactName: "فاطمة زروقي",
      contactPhone: "0550 22 33 44",
      team: ["كريم بوزيد", "أمال بن علي", "نادية قاسمي"],
      vehicle: "سيارة المركز 1",
    },
    {
      startTime: "16:30",
      endTime: "18:30",
      orderNumber: "000125/2026",
      site: "وكالة تأمينات",
      address: "شارع أول نوفمبر، رقم 24، أم البواقي",
      contactName: "مراد سعدي",
      contactPhone: "0550 44 55 66",
      team: ["نادية قاسمي"],
      vehicle: null,
    },
  ],
  absences: [
    { worker: "زهرة بلقاسم", replacement: "حورية عيساوي", site: "شقة في الطابق الثالث (F4)", startTime: "09:00" },
  ],
  inspections: [{ number: "000031/2026", site: "عمارة النور (ب 12)" }],
  correctiveTasks: [{ site: "تجمع سكني الياسمين", description: "إعادة تنظيف زجاج المدخل", dueDate: "2026-10-13" }],
  openIssues: [{ site: "عمارة النور (ب 12)", text: "شكوى من أحد السكان: ماء على أرضية الطابق الثاني بعد المسح." }],
  workerPhones: [
    { name: "كريم بوزيد", phone: "0661 10 20 30" },
    { name: "أمال بن علي", phone: "0770 40 50 60" },
    { name: "نادية قاسمي", phone: "0550 70 80 90" },
    { name: "سعاد مزياني", phone: "0661 21 43 65" },
    { name: "حورية عيساوي", phone: "0770 87 65 43" },
  ],
};

export function sampleDaySheet(key: string | undefined): SupervisorDaySheetData {
  return parseSampleKey(key).kind === "blank" ? BLANK_DAY_SHEET : DAY_SHEET;
}

// ── The client call list ────────────────────────────────────────────────────

const CALL_LIST: CallListData = {
  visitsDate: "2026-10-13",
  callDate: "2026-10-12",
  centrePhone: "0661 20 31 42",
  rows: [
    {
      client: "ليلى حمدي – شقة، حي المجاهدين",
      contactName: "ليلى حمدي",
      phones: ["0770 11 22 33"],
      startTime: "09:00",
      workersCount: 2,
      supervisorName: SUPERVISOR.name,
      purpose: "REMINDER",
    },
    {
      client: "وكالة تأمينات – شارع أول نوفمبر",
      contactName: "مراد سعدي",
      phones: ["0550 44 55 66", "032 55 10 20"],
      startTime: "16:30",
      workersCount: 1,
      supervisorName: SUPERVISOR.name,
      purpose: "REPLACEMENT_NOTICE",
    },
    {
      client: "عمارة النور (ب 12) – حي 500 مسكن",
      contactName: "عبد القادر مرابط",
      phones: ["0770 12 34 56"],
      startTime: "08:00",
      workersCount: 3,
      supervisorName: SUPERVISOR.name,
      purpose: "REMINDER",
    },
    {
      client: "فيلا – حي الأمير عبد القادر",
      contactName: "رشيد خلفاوي",
      phones: ["0661 33 22 11"],
      startTime: "10:00",
      workersCount: 2,
      supervisorName: "مليكة دراجي",
      purpose: "REMINDER",
    },
  ],
};

export function sampleCallList(key: string | undefined): CallListData {
  const { kind } = parseSampleKey(key);
  if (kind === "blank") return { visitsDate: null, callDate: null, centrePhone: null, rows: [] };
  if (kind === "returned") {
    const results = ["INFORMED", "NO_ANSWER", "INFORMED", "POSTPONE_REQUESTED"] as const;
    return { ...CALL_LIST, rows: CALL_LIST.rows.map((row, index) => ({ ...row, result: results[index] })) };
  }
  return CALL_LIST;
}
