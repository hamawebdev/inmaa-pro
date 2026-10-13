import { hiringTotal } from "@/features/people/rules/scores";
import { phoneDigits, scoresAsNumbers, type WorkerFormValues } from "@/features/people/validators/worker";
import {
  ABILITIES,
  HIRING_CRITERIA,
  HIRING_DECISIONS,
  HOME_WILAYA_CODE,
  MARITAL_STATUSES,
  PAY_BASES,
  PAY_PERIODS,
  REG_SUFFIX_OF_SEX,
  STAFF_DOCUMENT_TYPES,
  WEEKDAYS,
  WORKER_ROLES,
} from "@/features/people/validators/staff-codes";
import { findWilaya } from "@/lib/geo/wilayas";

import type { WorkerFormData } from "./worker-form-data";

/**
 * The registration screen's values: empty for a new worker, and the invented
 * worker the screens show until worker files exist (the same person as the
 * printed sample, `SAMPLE_WORKER_FORM`).
 */

const NO_SCORES = Object.fromEntries(
  HIRING_CRITERIA.map((criterion) => [criterion, ""]),
) as WorkerFormValues["hiringScores"];

/** One line per document of his list, in his order, none handed in. */
export const NO_DOCUMENTS: WorkerFormValues["documents"] = STAFF_DOCUMENT_TYPES.map((type) => ({
  type,
  delivered: false,
  expiryDate: "",
}));

export function emptyWorkerValues(today: string): WorkerFormValues {
  return {
    sex: undefined as unknown as WorkerFormValues["sex"],
    registrationDate: today,
    lastName: "",
    firstName: "",
    fullNameLatin: "",
    birthDate: "",
    birthPlace: "",
    birthWilayaCode: "",
    address: "",
    residenceCommuneId: "",
    residenceWilayaCode: HOME_WILAYA_CODE,
    residenceCommuneName: "",
    maritalStatus: undefined,
    phone: "",
    emergencyName: "",
    emergencyAddress: "",
    emergencyRelation: "",
    emergencyPhone: "",
    educationLevel: "",
    certificateName: "",
    workedInFieldBefore: undefined,
    previousEmployer: "",
    abilities: [],
    availableDays: [],
    healthConditions: [],
    healthOtherText: "",
    documents: NO_DOCUMENTS,
    hiringScores: NO_SCORES,
    hiringTotal: "",
    hiringDecision: undefined,
    issuedDate: "",
    nationalIdNumber: "",
    zoneId: "",
    role: "CLEANER",
    payBasis: undefined,
    payRate: "",
    payPeriod: undefined,
    weeklyCapacityHours: "40",
    canCollectCash: false,
    collectAuthFrom: "",
    collectAuthNote: "",
    cnasDeclared: false,
    cnasNumber: "",
  };
}

/** The invented worker: nobody real. */
export const SAMPLE_WORKER_VALUES: WorkerFormValues = {
  ...emptyWorkerValues("2026-10-11"),
  sex: "FEMALE",
  lastName: "بوزيد",
  firstName: "سميرة",
  fullNameLatin: "BOUZID Samira",
  birthDate: "1994-03-17",
  birthPlace: "عين البيضاء",
  birthWilayaCode: "04",
  address: "حي 200 مسكن، عمارة 12، رقم 5",
  // أم البواقي, as the Commune table is seeded.
  residenceCommuneId: "commune-0401",
  maritalStatus: "MARRIED",
  phone: "0661 20 31 42",
  emergencyName: "بوزيد نور الدين",
  emergencyAddress: "حي 200 مسكن، عمارة 12، رقم 5",
  emergencyRelation: "الزوج",
  emergencyPhone: "0550 12 34 56",
  educationLevel: "الثالثة ثانوي",
  certificateName: "شهادة تكوين مهني",
  workedInFieldBefore: "YES",
  previousEmployer: "مؤسسة النور للخدمات",
  abilities: ["CARRY_EQUIPMENT", "STAND_LONG_HOURS", "CLIMB_STAIRS", "WORK_UNDER_PRESSURE", "MOVE_BETWEEN_SITES"],
  availableDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
  healthConditions: ["OTHER"],
  healthOtherText: "حساسية من الغبار",
  documents: NO_DOCUMENTS.map((document) =>
    document.type === "MEDICAL_CERT"
      ? { ...document, delivered: true, expiryDate: "2027-03-31" }
      : {
          ...document,
          delivered: ["ID_CARD_COPY", "BIRTH_CERT", "RESIDENCE_CERT", "CROSSED_CCP_CHEQUE"].includes(document.type),
        },
  ),
  hiringScores: {
    scoreAppearance: "8",
    scorePersonalHygiene: "9",
    scoreCommunication: "7",
    scoreDiscipline: "8",
    scoreExperience: "6",
    scoreQuickUnderstanding: "8",
    scorePhysicalFitness: "7",
    scoreWorkPressure: "7",
    scorePunctuality: "9",
    scoreTrustHonesty: "9",
  },
  hiringDecision: "ACCEPTED_ON_TRIAL",
  issuedDate: "2026-10-12",
  role: "CLEANER",
  payBasis: "MONTHLY",
  payRate: "32000",
  payPeriod: "MONTHLY",
};

/** What a stored worker gives the screen: the record, her current documents, her last decision. Nothing restricted. */
export interface StoredWorker {
  sex: string;
  registrationDate: string;
  lastName: string;
  firstName: string;
  fullNameLatin: string | null;
  birthDate: string | null;
  birthPlace: string | null;
  birthWilayaCode: string | null;
  address: string | null;
  residenceCommuneId: string | null;
  maritalStatus: string | null;
  phone: string;
  emergencyName: string | null;
  emergencyRelation: string | null;
  emergencyAddress: string | null;
  emergencyPhone: string | null;
  educationLevel: string | null;
  certificateName: string | null;
  workedInFieldBefore: number | null;
  previousEmployer: string | null;
  abilities: string | null;
  availableDays: string | null;
  issuedDate: string | null;
  nationalIdNumber: string | null;
  zoneId: string | null;
  role: string | null;
  payBasis: string | null;
  payRate: number | null;
  payPeriod: string | null;
  weeklyCapacityMin: number;
  canCollectCash: number;
  collectAuthFrom: string | null;
  collectAuthNote: string | null;
  cnasDeclared: number;
  cnasNumber: string | null;
}

export interface StoredDocument {
  type: string;
  delivered: number;
  expiryDate: string | null;
}

const codes = <T extends string>(text: string | null, allowed: readonly T[]): T[] => {
  try {
    const parsed: unknown = text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? allowed.filter((code) => parsed.includes(code)) : [];
  } catch {
    return [];
  }
};

/** Dinars as typed again from centimes: `32000`, `450.5`. */
export function dinarsText(centimes: number | null): string {
  if (centimes === null) return "";
  const dinars = centimes / 100;
  return Number.isInteger(dinars) ? String(dinars) : dinars.toFixed(2).replace(/0$/, "");
}

/** Hours as typed again from minutes: `40`, `37.5`. */
export function hoursText(minutes: number): string {
  const hours = minutes / 60;
  return Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
}

export interface StoredCommune {
  wilayaCode: string;
  nameAr: string;
}

/**
 * The three values of «بلدية/ولاية إقامة» for a stored commune: picked from the
 * list when it is in the centre's wilaya, typed when it is in another.
 */
export function residenceValues(communeId: string | null, commune?: StoredCommune | null) {
  if (!communeId) return { residenceCommuneId: "", residenceWilayaCode: HOME_WILAYA_CODE, residenceCommuneName: "" };
  if (commune && commune.wilayaCode !== HOME_WILAYA_CODE) {
    return { residenceCommuneId: "", residenceWilayaCode: commune.wilayaCode, residenceCommuneName: commune.nameAr };
  }
  return { residenceCommuneId: communeId, residenceWilayaCode: HOME_WILAYA_CODE, residenceCommuneName: "" };
}

/**
 * The screen's values for a stored worker. Her health answers and her score are
 * left empty: they are shown only when someone allowed asks, and that is logged.
 */
export function valuesFromRecord(
  worker: StoredWorker,
  documents: readonly StoredDocument[],
  decision: string | null,
  /** The commune she lives in, as stored: its wilaya decides whether it is shown picked or typed. */
  commune?: StoredCommune | null,
): WorkerFormValues {
  const empty = emptyWorkerValues(worker.registrationDate);
  const text = (value: string | null) => value ?? "";
  const of = <T extends string>(value: string | null, allowed: readonly T[]) =>
    value !== null && (allowed as readonly string[]).includes(value) ? (value as T) : undefined;
  return {
    ...empty,
    sex: worker.sex as WorkerFormValues["sex"],
    lastName: worker.lastName,
    firstName: worker.firstName,
    fullNameLatin: text(worker.fullNameLatin),
    birthDate: text(worker.birthDate),
    birthPlace: text(worker.birthPlace),
    birthWilayaCode: text(worker.birthWilayaCode),
    address: text(worker.address),
    ...residenceValues(worker.residenceCommuneId, commune),
    maritalStatus: of(worker.maritalStatus, MARITAL_STATUSES),
    phone: worker.phone,
    emergencyName: text(worker.emergencyName),
    emergencyAddress: text(worker.emergencyAddress),
    emergencyRelation: text(worker.emergencyRelation),
    emergencyPhone: text(worker.emergencyPhone),
    educationLevel: text(worker.educationLevel),
    certificateName: text(worker.certificateName),
    workedInFieldBefore: worker.workedInFieldBefore === null ? undefined : worker.workedInFieldBefore ? "YES" : "NO",
    previousEmployer: text(worker.previousEmployer),
    abilities: codes(worker.abilities, ABILITIES),
    availableDays: codes(worker.availableDays, WEEKDAYS),
    documents: NO_DOCUMENTS.map((line) => {
      const held = documents.find((document) => document.type === line.type);
      return held ? { ...line, delivered: held.delivered === 1, expiryDate: text(held.expiryDate) } : line;
    }),
    hiringDecision: of(decision, HIRING_DECISIONS),
    issuedDate: text(worker.issuedDate),
    nationalIdNumber: text(worker.nationalIdNumber),
    zoneId: text(worker.zoneId),
    role: of(worker.role, WORKER_ROLES) ?? "CLEANER",
    payBasis: of(worker.payBasis, PAY_BASES),
    payRate: dinarsText(worker.payRate),
    payPeriod: of(worker.payPeriod, PAY_PERIODS),
    weeklyCapacityHours: hoursText(worker.weeklyCapacityMin),
    canCollectCash: worker.canCollectCash === 1,
    collectAuthFrom: text(worker.collectAuthFrom),
    collectAuthNote: text(worker.collectAuthNote),
    cnasDeclared: worker.cnasDeclared === 1,
    cnasNumber: text(worker.cnasNumber),
  };
}

export interface CommuneName {
  nameAr: string;
  wilayaCode: string;
}

/**
 * What his sheet prints, from the screen's values: the same answers, written
 * as his blanks take them. The number is given by the program on saving; the
 * residence commune is looked up by its id.
 */
export function printDataFromValues(
  values: WorkerFormValues,
  { regNumber, commune }: { regNumber: string | null; commune: (id: string) => CommuneName | undefined },
): WorkerFormData {
  // His two blanks: a commune of the centre's wilaya is looked up by its id, another is as typed.
  const wilayaCode = values.residenceWilayaCode || HOME_WILAYA_CODE;
  const picked =
    wilayaCode === HOME_WILAYA_CODE && values.residenceCommuneId ? commune(values.residenceCommuneId) : undefined;
  const typedCommune = wilayaCode === HOME_WILAYA_CODE ? "" : values.residenceCommuneName.trim();
  const residence = picked ?? (typedCommune ? { nameAr: typedCommune, wilayaCode } : undefined);
  const orNull = (text: string) => (text.trim() === "" ? null : text.trim());
  const scores = scoresAsNumbers(values.hiringScores);
  const computed = hiringTotal(scores);
  return {
    regNumber,
    regSuffix: values.sex ? REG_SUFFIX_OF_SEX[values.sex] : null,
    registrationDate: orNull(values.registrationDate),
    lastName: orNull(values.lastName),
    firstName: orNull(values.firstName),
    fullNameLatin: orNull(values.fullNameLatin),
    birthDate: orNull(values.birthDate),
    birthCommune: orNull(values.birthPlace),
    birthWilaya: findWilaya(values.birthWilayaCode)?.nameAr ?? null,
    address: orNull(values.address),
    residenceCommune: residence?.nameAr ?? null,
    residenceWilaya: residence ? (findWilaya(residence.wilayaCode)?.nameAr ?? null) : null,
    maritalStatus: values.maritalStatus ?? null,
    phone: orNull(phoneDigits(values.phone)),
    emergencyName: orNull(values.emergencyName),
    emergencyRelation: orNull(values.emergencyRelation),
    emergencyAddress: orNull(values.emergencyAddress),
    emergencyPhone: orNull(phoneDigits(values.emergencyPhone)),
    educationLevel: orNull(values.educationLevel),
    certificateName: orNull(values.certificateName),
    workedInFieldBefore: values.workedInFieldBefore === undefined ? null : values.workedInFieldBefore === "YES",
    previousEmployer: orNull(values.previousEmployer),
    abilities: values.abilities,
    availableDays: values.availableDays,
    healthConditions: values.healthConditions,
    healthOtherText: orNull(values.healthOtherText),
    documentsDelivered: values.documents.filter((document) => document.delivered).map((document) => document.type),
    hiringScores: scores,
    hiringTotal: computed.total ?? (values.hiringTotal === "" ? null : Number(values.hiringTotal)),
    hiringDecision: values.hiringDecision ?? null,
    issuedDate: orNull(values.issuedDate),
  };
}
