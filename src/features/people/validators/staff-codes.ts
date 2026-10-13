/**
 * The stored codes of People's lists. This is the one file that names them.
 *
 * The codes are those of the data model's option list (OPTION-CODES): if one
 * is renamed, it is renamed here and nowhere else. Everything else in this
 * folder (the form, the sheets, the rules, the messages test) reads the lists
 * from here.
 *
 * The lists other owners use too (sex and the «/H/F» of a number, the worker's
 * role, abilities, weekdays) are Foundation's shared copies, re-exported.
 *
 * The order of each list is the order of his form.
 */

/** «/H/F» after the registration number, «الصفة», «القدرة البدنية», «الأيام المتاحة» (Saturday first). */
export {
  ABILITIES,
  REG_SUFFIX_OF_SEX,
  REG_SUFFIXES,
  SEXES,
  WEEKDAYS,
  WORKER_ROLES,
  type Ability,
  type RegSuffix,
  type Sex,
  type Weekday,
  type WorkerRole,
} from "@/lib/options";

export {
  ABSENCE_TYPES,
  LEAVE_TYPES,
  PAYMENT_METHODS,
  type AbsenceType,
  type LeaveType,
  type PaymentMethod,
} from "@/lib/options";

/** A centre employee or a cleaning worker: one table for both (A2). */
/**
 * The centre's wilaya, أم البواقي: the one whose 29 communes the program is
 * delivered with, so «بلدية/ولاية إقامة» offers them as a list. A commune of
 * another wilaya is typed, and kept the first time it is used.
 */
export const HOME_WILAYA_CODE = "04";

export const STAFF_KINDS = ["WORKER", "EMPLOYEE"] as const;
export type StaffKind = (typeof STAFF_KINDS)[number];

/** Where a person stands with the centre (People's wording: his forms have no status). */
export const ENGAGEMENT_STATUSES = ["CANDIDATE", "ON_TRIAL", "ACCEPTED", "REFUSED", "LEFT"] as const;
export type EngagementStatus = (typeof ENGAGEMENT_STATUSES)[number];

/** A centre employee's post (A2). Where a post and a login role mean the same job, they carry the same code. */
export const JOB_POSITIONS = [
  "MANAGER",
  "ADMINISTRATION",
  "SUPERVISOR",
  "HR_OFFICER",
  "OPERATIONS",
  "RECEPTION_SALES",
  "SALES_REP",
  "ACCOUNTANT",
  "STOREKEEPER",
  "OTHER",
] as const;
export type JobPosition = (typeof JOB_POSITIONS)[number];
/** The posts in Arabic, for paper (a payslip): the words of the screens' Arabic labels. */
export const JOB_POSITION_AR: Readonly<Record<JobPosition, string>> = {
  MANAGER: "المدير",
  ADMINISTRATION: "الإدارة",
  SUPERVISOR: "المشرف",
  HR_OFFICER: "مسئول الموارد البشرية",
  OPERATIONS: "مسؤول العمليات",
  RECEPTION_SALES: "مسؤول تجاري / استقبال",
  SALES_REP: "المندوب التجاري",
  ACCOUNTANT: "المحاسب",
  STOREKEEPER: "أمين المخزن",
  OTHER: "أخرى",
};

/** «نوع العقد» (#25). */
export const EMPLOYMENT_CONTRACTS = ["NONE", "CDD", "CDI"] as const;
export type EmploymentContract = (typeof EMPLOYMENT_CONTRACTS)[number];

/** Full or part time (the law: part time is at least half). */
export const WORK_TIMES = ["FULL_TIME", "PART_TIME"] as const;
export type WorkTime = (typeof WORK_TIMES)[number];

/** «هل تعاني من». NONE excludes the others; OTHER comes with a text. */
export const HEALTH_CONDITIONS = ["ASTHMA", "BACK", "HEART", "CHRONIC", "NONE", "OTHER"] as const;
export type HealthCondition = (typeof HEALTH_CONDITIONS)[number];

/** «الوثائق المسلمة» */
export const STAFF_DOCUMENT_TYPES = [
  "ID_CARD_COPY",
  "BIRTH_CERT",
  "RESIDENCE_CERT",
  "MEDICAL_CERT",
  "CROSSED_CCP_CHEQUE",
  "EXPERIENCE_CERT",
  "CRIMINAL_RECORD",
] as const;
export type StaffDocumentType = (typeof STAFF_DOCUMENT_TYPES)[number];

/** «قرار الإدارة» */
export const HIRING_DECISIONS = ["ACCEPTED", "ACCEPTED_ON_TRIAL", "REFUSED_FINAL"] as const;
export type HiringDecision = (typeof HIRING_DECISIONS)[number];

/**
 * The ten criteria of «تقييم مسئول الموارد البشرية (سري)», in his order. Each is
 * a column of the confidential part of a staff record, named as here.
 */
export const HIRING_CRITERIA = [
  "scoreAppearance",
  "scorePersonalHygiene",
  "scoreCommunication",
  "scoreDiscipline",
  "scoreExperience",
  "scoreQuickUnderstanding",
  "scorePhysicalFitness",
  "scoreWorkPressure",
  "scorePunctuality",
  "scoreTrustHonesty",
] as const;
export type HiringCriterion = (typeof HIRING_CRITERIA)[number];

/**
 * The seven criteria of his article 16, «يخضع العامل للتقييم بناءً على», in his
 * order. Each is a column of a periodic evaluation, named as here.
 */
export const EVALUATION_CRITERIA = [
  "scoreDiscipline",
  "scoreAttendance",
  "scoreCleaningQuality",
  "scoreClientRespect",
  "scoreEquipmentCare",
  "scoreSafety",
  "scoreProgramme",
] as const;
export type EvaluationCriterion = (typeof EVALUATION_CRITERIA)[number];

/** People's wording: his form leaves «الحالة الإجتماعية» as a dotted blank. */
export const MARITAL_STATUSES = ["SINGLE", "MARRIED", "DIVORCED", "WIDOWED"] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

/** A person under sanction: «موقف» (worker, employee) or «متوقف» (client), and «معاقب». */
export const SANCTION_STATES = ["SUSPENDED", "PENALISED"] as const;
export type SanctionState = (typeof SANCTION_STATES)[number];

export const SANCTION_SUBJECTS = ["WORKER", "EMPLOYEE", "CLIENT"] as const;
export type SanctionSubject = (typeof SANCTION_SUBJECTS)[number];

/** What a suspended-or-penalised match rests on. NAME_CONFIRMED is a name the clerk confirmed. */
export const MATCH_BASES = [
  "SAME_RECORD",
  "NATIONAL_ID",
  "PHONE",
  "NAME_AND_BIRTHDATE",
  "NAME_CONFIRMED",
  "TAX_NUMBER",
] as const;
export type MatchBasis = (typeof MATCH_BASES)[number];

/** What was being done when the check ran (OPTION-CODES, SANCTION_CONTEXT). */
export const SANCTION_CONTEXTS = [
  "WORKER_REGISTRATION",
  "EMPLOYEE_REGISTRATION",
  "CLIENT_FILE",
  "READMISSION",
  "IDENTITY_CHANGE",
] as const;
export type SanctionContext = (typeof SANCTION_CONTEXTS)[number];

/** The manager's answer to «هل نسمح له أم لا؟» (OPTION-CODES, DECISION_STATUS). */
export const DECISION_STATUSES = ["PENDING", "ALLOWED", "REFUSED", "CANCELLED"] as const;
export type DecisionStatus = (typeof DECISION_STATUSES)[number];

/** What a manager's yes was used for (OPTION-CODES, CONSUMED_ENTITY). */
export const CONSUMED_ENTITIES = ["STAFF_MEMBER", "FILE"] as const;
export type ConsumedEntity = (typeof CONSUMED_ENTITIES)[number];

/** How often a worker is paid (his study: «أسبوعيًا أو شهريًا»). */
export const PAY_PERIODS = ["WEEKLY", "MONTHLY"] as const;
export type PayPeriod = (typeof PAY_PERIODS)[number];

/** How a person is paid (plan question 11). */
export const PAY_BASES = ["MONTHLY", "DAILY", "HOURLY", "PER_TASK"] as const;
export type PayBasis = (typeof PAY_BASES)[number];

// ── Hours and pay (features 21 and 38) ──────────────────────────────────────

/** A correction of a person's minutes, by People. */
export const HOURS_ADJUSTMENT_KINDS = ["TRAINING", "OFFICE_WORK", "CORRECTION", "OTHER"] as const;
export type HoursAdjustmentKind = (typeof HOURS_ADJUSTMENT_KINDS)[number];

export const PAY_RUN_STATUSES = ["DRAFT", "CLOSED", "VOID"] as const;
export type PayRunStatus = (typeof PAY_RUN_STATUSES)[number];

/** The lines of a payslip, in the order they print. */
export const PAYSLIP_ITEM_TYPES = [
  "BASE",
  "OVERTIME_50",
  "REST_DAY_PREMIUM",
  "LEAVE_PAY",
  "ALLOWANCE",
  "BONUS",
  "ABSENCE",
  "CNAS",
  "IRG",
  "ADVANCE_REPAYMENT",
  "DEDUCTION",
  "OTHER",
] as const;
export type PayslipItemType = (typeof PAYSLIP_ITEM_TYPES)[number];

export const PAYSLIP_ITEM_SOURCES = ["PAY_ITEM", "DEBT_ENTRY", "HOURS", "MANUAL"] as const;
export type PayslipItemSource = (typeof PAYSLIP_ITEM_SOURCES)[number];

/** A recurring line of a person's pay. */
export const PAY_ITEM_TYPES = ["ALLOWANCE", "DEDUCTION"] as const;
export type PayItemType = (typeof PAY_ITEM_TYPES)[number];

export const PAYOUT_KINDS = ["ADVANCE", "WAGE", "OTHER"] as const;
export type PayoutKind = (typeof PAYOUT_KINDS)[number];

export const DEBT_DIRECTIONS = ["INCREASE", "DECREASE"] as const;
export type DebtDirection = (typeof DEBT_DIRECTIONS)[number];

export const DEBT_REASONS = [
  "ADVANCE",
  "DAMAGE",
  "LOSS",
  "OVERPAYMENT",
  "REPAID_ON_PAYSLIP",
  "REPAID_IN_CASH",
  "WRITTEN_OFF",
  "REVERSAL",
  "OTHER",
] as const;
export type DebtReason = (typeof DEBT_REASONS)[number];

// ── Centre employees' attendance ────────────────────────────────────────────

export const CHECK_TYPES = ["CHECK_IN", "CHECK_OUT"] as const;
export type CheckType = (typeof CHECK_TYPES)[number];

export const LEAVE_STATUSES = ["REQUESTED", "APPROVED", "REFUSED", "CANCELLED"] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];
