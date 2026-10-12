import type {
  Ability,
  HealthCondition,
  HiringCriterion,
  HiringDecision,
  MaritalStatus,
  RegSuffix,
  StaffDocumentType,
  Weekday,
} from "@/features/people/validators/staff-codes";

/**
 * What the worker registration sheet prints: one plain object, with every
 * answer of his form and nothing else.
 *
 * The sheet is a picture of this object. A service will build it from a staff
 * record once the data model exists; until then the sample below stands in.
 * Every field can be empty, and an object with every field empty prints the
 * blank form the office hands out.
 *
 * Dates are `YYYY-MM-DD`. Lists hold the stored codes, in any order: the sheet
 * prints his options in his order and ticks the ones present.
 */
export interface WorkerFormData {
  /** «رقم التسجيل»: the number before the slash. */
  regNumber: string | null;
  /** The letter after the slash. Empty prints «/H/F» as on his blank form. */
  regSuffix: RegSuffix | null;
  /** «التاريخ» */
  registrationDate: string | null;

  /** «اللقب والاسم»: surname, then first name. */
  lastName: string | null;
  firstName: string | null;
  /** «باللغة الفرنسية» */
  fullNameLatin: string | null;
  /** «تاريخ الإزدياد» */
  birthDate: string | null;
  /** «البلدية / الولاية», beside the date of birth. */
  birthCommune: string | null;
  birthWilaya: string | null;
  /** «العنوان الشخصي» */
  address: string | null;
  /** «بلدية/ولاية إقامة» */
  residenceCommune: string | null;
  residenceWilaya: string | null;
  /** «الحالة الإجتماعية» */
  maritalStatus: MaritalStatus | null;
  /** «رقم الهاتف» */
  phone: string | null;

  /** «معلومات الطوارئ» */
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyAddress: string | null;
  emergencyPhone: string | null;

  /** «المستوى الدراسي», «اسم الشهادة» */
  educationLevel: string | null;
  certificateName: string | null;
  /** «هل عملت في المجال»: true «نعم», false «لا», null neither. */
  workedInFieldBefore: boolean | null;
  /** «اسم المؤسسة» */
  previousEmployer: string | null;

  /** «القدرة البدنية / هل لديك قدرة على» */
  abilities: readonly Ability[];
  /** «الأيام المتاحة» */
  availableDays: readonly Weekday[];
  /** «هل تعاني من», with the text written after «أخرى». */
  healthConditions: readonly HealthCondition[];
  healthOtherText: string | null;
  /** «الوثائق المسلمة» */
  documentsDelivered: readonly StaffDocumentType[];

  /** «تقييم مسئول الموارد البشرية (سري)»: each criterion out of 10, and «المجموع» out of 100. */
  hiringScores: Readonly<Partial<Record<HiringCriterion, number | null>>>;
  hiringTotal: number | null;
  /** «قرار الإدارة» */
  hiringDecision: HiringDecision | null;
  /** «حررت: بأم البواقي، بتاريخ»: the record's issue date. */
  issuedDate: string | null;
}

/** The blank form: nothing ticked, nothing written. */
export const EMPTY_WORKER_FORM: WorkerFormData = {
  regNumber: null,
  regSuffix: null,
  registrationDate: null,
  lastName: null,
  firstName: null,
  fullNameLatin: null,
  birthDate: null,
  birthCommune: null,
  birthWilaya: null,
  address: null,
  residenceCommune: null,
  residenceWilaya: null,
  maritalStatus: null,
  phone: null,
  emergencyName: null,
  emergencyRelation: null,
  emergencyAddress: null,
  emergencyPhone: null,
  educationLevel: null,
  certificateName: null,
  workedInFieldBefore: null,
  previousEmployer: null,
  abilities: [],
  availableDays: [],
  healthConditions: [],
  healthOtherText: null,
  documentsDelivered: [],
  hiringScores: {},
  hiringTotal: null,
  hiringDecision: null,
  issuedDate: null,
};

/**
 * An invented worker, for looking at the filled sheet until worker files
 * exist. Nobody real: the name, the numbers and the address are made up.
 */
export const SAMPLE_WORKER_FORM: WorkerFormData = {
  regNumber: "17",
  regSuffix: "F",
  registrationDate: "2026-10-11",
  lastName: "بوزيد",
  firstName: "سميرة",
  fullNameLatin: "BOUZID Samira",
  birthDate: "1994-03-17",
  birthCommune: "عين البيضاء",
  birthWilaya: "أم البواقي",
  address: "حي 200 مسكن، عمارة 12، رقم 5",
  residenceCommune: "أم البواقي",
  residenceWilaya: "أم البواقي",
  maritalStatus: "MARRIED",
  phone: "0661203142",
  emergencyName: "بوزيد نور الدين",
  emergencyRelation: "الزوج",
  emergencyAddress: "حي 200 مسكن، عمارة 12، رقم 5",
  emergencyPhone: "0550123456",
  educationLevel: "الثالثة ثانوي",
  certificateName: "شهادة تكوين مهني",
  workedInFieldBefore: true,
  previousEmployer: "مؤسسة النور للخدمات",
  abilities: ["CARRY_EQUIPMENT", "STAND_LONG_HOURS", "CLIMB_STAIRS", "WORK_UNDER_PRESSURE", "MOVE_BETWEEN_SITES"],
  availableDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
  healthConditions: ["OTHER"],
  healthOtherText: "حساسية من الغبار",
  documentsDelivered: ["ID_CARD_COPY", "BIRTH_CERT", "RESIDENCE_CERT", "MEDICAL_CERT", "CROSSED_CCP_CHEQUE"],
  hiringScores: {
    scoreAppearance: 8,
    scorePersonalHygiene: 9,
    scoreCommunication: 7,
    scoreDiscipline: 8,
    scoreExperience: 6,
    scoreQuickUnderstanding: 8,
    scorePhysicalFitness: 7,
    scoreWorkPressure: 7,
    scorePunctuality: 9,
    scoreTrustHonesty: 9,
  },
  hiringTotal: 78,
  hiringDecision: "ACCEPTED_ON_TRIAL",
  issuedDate: "2026-10-12",
};
