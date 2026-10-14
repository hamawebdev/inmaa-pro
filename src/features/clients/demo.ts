import type { RoleCode } from "@/lib/access/catalogue";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { dinarsToMoney, toQty } from "@/lib/units";
import type { DemoNames, DemoTools } from "@/testing/demo";

import type { FormValues } from "./forms/values";
import { saveCostStudy } from "./services/cost-study";
import { saveFirstVisit } from "./services/first-visits";
import { moveFileStage, registerFile, type RegisterFileInput } from "./services/files";
import { decideQuote, issueQuote, recordQuoteResult, saveQuote, submitQuote } from "./services/quotes";
import type { FileStage } from "./validators/option-lists";
import { emptyFirstVisit, type FirstVisitInput } from "./validators/first-visit";
import type { CostStudyInput, QuoteInput } from "./validators/pricing";

/**
 * Clients and contracts' demo data: one file per division, registered and
 * moved through the services, on the dates an office would have done it.
 *
 *  - `housingRequest`: a home on demand, priced after its first visit, its
 *    quote issued and waiting for the client's answer at «عرض سعر»;
 *  - `housingJob`: a home on demand whose quote was accepted: «متعاقد», its
 *    one visit to come;
 *  - `orgJob`: a clinic on demand whose quote was accepted, two days to come;
 *  - `housingContract`: a home under a one-month contract, priced by phone
 *    (it skips «الزيارة»);
 *  - `orgContract`: a company under a three-month contract;
 *  - `buildingContract`: a building under a one-year contract, with residents;
 *  - `complexContract`: a residential complex under a six-month contract.
 *
 * The four contracts and the two accepted jobs reach «متعاقد», which tells
 * Operations and Money (`file.contracted`). The three on-demand files have
 * their cost study and their quote, prepared, approved by the manager and
 * issued through the services. Invented people, places and numbers.
 */

/** Monday 12 October 2026, 09:00 at the centre, is the demo's present; every step below is before it. */
const at = (localDate: string, localTime = "09:00") => {
  const [hours, minutes] = localTime.split(":").map(Number);
  // The centre is at UTC+1 and keeps no summer time.
  return `${localDate}T${String(hours - 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
};

const BUILDING_SITE: FormValues = {
  equipmentStorage: true,
  storagePlace: "غرفة تحت السلم",
  wasteDisposal: ["CONTAINERS", "OTHER"],
  wasteDisposalOther: "خلف العمارة",
  cleanliness: "AVERAGE",
  cleanlinessNote: "غبار أشغال",
};

const HOUSING_REQUEST: FormValues = {
  siteNumber: "5",
  propertyType: "OTHER",
  propertyTypeOther: "طابق في منزل عائلي",
  clientName: "بن صالح كريمة",
  ownership: "OWNED",
  address: "حي 1000 مسكن، عمارة 5",
  commune: "عين مليلة",
  wilaya: "04",
  commonName: "منزل بن صالح قرب الملعب",
  phone: "0661 45 12 78",
  firstVisitDate: "2026-10-11",
  cleanliness: "POOR",
  cleanlinessNote: "بقايا أشغال الترميم",
  equipmentStorage: false,
  wasteDisposal: ["CONTAINERS"],
  buildArea: toQty(120),
  floors: 1,
  rooms: 4,
  majlis: 1,
  salons: 1,
  kitchens: 1,
  bathrooms: 1,
  balconies: 2,
  windows: 9,
  floorType: "بلاط",
  courtyardArea: toQty(15),
  providedServices: ["FLOORS", "KITCHEN", "WINDOWS", "BATHROOMS", "GLASS", "CUPBOARDS"],
  providedServicesCustom: ["إزالة بقع الطلاء", null, null],
  programmedServices: ["AFTER_RENOVATION", "DEEP"],
  requestKinds: ["COMPREHENSIVE", "DEEP"],
  executionDurationValue: toQty(1.5),
  executionDurationUnit: "DAYS",
  executionDays: ["SAT", "SUN"],
  period: "MORNING",
  periodFrom: "08:00",
  periodTo: "13:00",
  startDate: "2026-10-17",
  endDate: "2026-10-18",
  arrivalTime: "08:00",
  departureTime: "13:00",
  workersCount: 3,
  payerName: "بن صالح كريمة",
  payerPhone: "0661 45 12 78",
  materialsBearer: "CENTRE",
  materialsAmount: dinarsToMoney(3500),
  transportBearer: "CENTRE",
  transportAmount: dinarsToMoney(1000),
  paymentMethods: ["CASH"],
  totalAmount: dinarsToMoney(18000),
  firstDueDate: "2026-10-18",
  paymentPlace: "عند نهاية الأشغال",
  teamAccess: ["OPEN_DOOR"],
  hasGuard: false,
  securityInstructions: false,
  issuedDate: "2026-10-12",
};

const HOUSING_JOB: FormValues = {
  siteNumber: "14",
  propertyType: "APARTMENT",
  clientName: "مرابط فاطمة",
  ownership: "RENTED",
  address: "حي 5 جويلية، عمارة ب",
  commune: "أم البواقي",
  wilaya: "04",
  commonName: "شقة مرابط قرب البريد",
  phone: "0772 31 40 55",
  firstVisitDate: "2026-10-10",
  cleanliness: "AVERAGE",
  equipmentStorage: false,
  wasteDisposal: ["CONTAINERS"],
  buildArea: toQty(85),
  floors: 1,
  rooms: 3,
  salons: 1,
  kitchens: 1,
  bathrooms: 1,
  balconies: 1,
  windows: 6,
  floorType: "بلاط",
  providedServices: ["FLOORS", "KITCHEN", "WINDOWS", "BATHROOMS"],
  programmedServices: ["DEEP"],
  requestKinds: ["DEEP"],
  executionDurationValue: toQty(6),
  executionDurationUnit: "HOURS",
  executionDays: ["TUE"],
  period: "MORNING",
  periodFrom: "08:00",
  periodTo: "14:00",
  startDate: "2026-10-13",
  endDate: "2026-10-13",
  arrivalTime: "08:00",
  departureTime: "14:00",
  workersCount: 2,
  payerName: "مرابط فاطمة",
  payerPhone: "0772 31 40 55",
  materialsBearer: "CENTRE",
  materialsAmount: dinarsToMoney(1500),
  transportBearer: "CENTRE",
  transportAmount: dinarsToMoney(500),
  paymentMethods: ["CASH"],
  firstDueDate: "2026-10-13",
  paymentPlace: "عند نهاية الأشغال",
  teamAccess: ["OPEN_DOOR"],
  hasGuard: false,
  securityInstructions: false,
  issuedDate: "2026-10-11",
};

const ORG_JOB: FormValues = {
  siteNumber: "8",
  propertyType: "COMPANY",
  managerName: "حمدي رشيد",
  hasTradeRegister: true,
  address: "شارع أول نوفمبر، رقم 22",
  commune: "أم البواقي",
  wilaya: "04",
  commonName: "عيادة الشفاء",
  clientName: "عيادة الشفاء الطبية",
  sector: "PRIVATE",
  phone: "032 47 61 12",
  firstVisitDate: "2026-10-11",
  cleanliness: "POOR",
  cleanlinessNote: "بعد أشغال التهيئة",
  equipmentStorage: false,
  wasteDisposal: ["CONTAINERS"],
  buildArea: toQty(220),
  buildings: 1,
  offices: 6,
  halls: 1,
  toilets: 2,
  windows: 14,
  doors: 10,
  floorArea: toQty(200),
  floorType: "بلاط",
  entrances: 1,
  exits: 1,
  providedServices: ["FLOORS", "TOILETS", "WINDOWS", "GLASS", "OFFICES"],
  programmedServices: [],
  requestKinds: ["COMPREHENSIVE"],
  executionDurationValue: toQty(2),
  executionDurationUnit: "DAYS",
  executionDays: ["WED", "THU"],
  period: "MORNING",
  periodFrom: "08:00",
  periodTo: "14:00",
  startDate: "2026-10-14",
  endDate: "2026-10-15",
  arrivalTime: "08:00",
  departureTime: "14:00",
  workersCount: 3,
  payerName: "حمدي رشيد",
  payerPhone: "032 47 61 12",
  materialsBearer: "CENTRE",
  materialsAmount: dinarsToMoney(4000),
  transportBearer: "CENTRE",
  transportAmount: dinarsToMoney(1000),
  paymentMethods: ["BANK_TRANSFER"],
  firstDueDate: "2026-10-15",
  paymentPlace: "مقر العيادة",
  teamAccess: ["VIA_GUARD"],
  hasGuard: false,
  securityInstructions: false,
  issuedDate: "2026-10-11",
};

const HOUSING_CONTRACT: FormValues = {
  siteNumber: "27",
  propertyType: "VILLA",
  clientName: "بوزيد سليم",
  ownership: "RENTED",
  address: "حي النصر، طريق خنشلة",
  commune: "أم البواقي",
  wilaya: "04",
  commonName: "فيلا بوزيد قرب مسجد النور",
  phone: "0661 20 31 42",
  cleanliness: "GOOD",
  equipmentStorage: true,
  storagePlace: "غرفة تحت السلم",
  wasteDisposal: ["COLLECTION_POINT"],
  buildArea: toQty(180.5),
  floors: 2,
  rooms: 5,
  majlis: 1,
  salons: 2,
  kitchens: 1,
  bathrooms: 2,
  balconies: 3,
  windows: 14,
  floorType: "بلاط ورخام",
  gardenArea: toQty(60),
  courtyardArea: toQty(25),
  providedServices: ["FLOORS", "KITCHEN", "WINDOWS", "BATHROOMS", "GLASS", "CARPETS"],
  providedServicesCustom: ["تنظيف السلم", null, null],
  programmedServices: ["PERIODIC"],
  contractKind: "SHORT",
  contractDuration: "M1",
  visitsPerWeek: 1,
  executionDays: ["TUE"],
  period: "MORNING",
  periodFrom: "09:00",
  periodTo: "13:00",
  startDate: "2026-10-13",
  endDate: "2026-11-12",
  arrivalTime: "09:00",
  departureTime: "13:00",
  workersCount: 2,
  payerName: "بوزيد سليم",
  payerPhone: "0661 20 31 42",
  materialsBearer: "OWNER",
  transportBearer: "CENTRE",
  transportAmount: dinarsToMoney(800),
  paymentMethods: ["CASH"],
  totalAmount: dinarsToMoney(16000),
  firstDueDate: "2026-10-13",
  paymentPlace: "مقر المركز",
  paymentFrequency: "MONTHLY",
  teamAccess: ["OWN_KEY"],
  hasGuard: false,
  securityInstructions: false,
  issuedDate: "2026-10-08",
};

const ORG_CONTRACT: FormValues = {
  siteNumber: "3",
  propertyType: "COMPANY",
  managerName: "قاسمي نادية",
  hasTradeRegister: true,
  address: "المنطقة الصناعية، الطريق الوطني رقم 10",
  commune: "عين البيضاء",
  wilaya: "04",
  commonName: "مقر شركة الأوراس",
  clientName: "شركة الأوراس للتوزيع",
  sector: "PRIVATE",
  phone: "032 55 10 20",
  firstVisitDate: "2026-09-30",
  cleanliness: "AVERAGE",
  cleanlinessNote: "غبار أشغال",
  equipmentStorage: true,
  storagePlace: "مخزن الطابق الأرضي",
  wasteDisposal: ["CONTAINERS", "OTHER"],
  wasteDisposalOther: "خلف المبنى",
  buildArea: toQty(640),
  buildings: 1,
  offices: 12,
  halls: 2,
  stores: 3,
  toilets: 4,
  kitchens: 1,
  windows: 30,
  doors: 22,
  floorArea: toQty(600),
  floorType: "بلاط",
  carParks: 10,
  entrances: 2,
  exits: 2,
  extraLabel: "عدد الطوابق",
  extraValue: "2",
  providedServices: ["FLOORS", "TOILETS", "WINDOWS", "WASTE_SORTING", "GLASS", "OFFICES", "RECEPTION_HALL"],
  providedServicesCustom: [null, "تنظيف المصعد", null, null],
  programmedServices: ["PERIODIC"],
  programmedServicesCustom: ["تنظيف شهري للواجهات"],
  contractKind: "SHORT",
  contractDuration: "M3",
  visitsPerWeek: 5,
  executionDays: ["SAT", "SUN", "MON", "TUE", "WED"],
  period: "MORNING",
  periodFrom: "07:00",
  periodTo: "09:00",
  startDate: "2026-10-10",
  endDate: "2027-01-09",
  arrivalTime: "07:00",
  departureTime: "09:00",
  workersCount: 2,
  payerName: "مصلحة المحاسبة",
  payerPhone: "032 55 10 21",
  materialsBearer: "CENTRE",
  materialsAmount: dinarsToMoney(5000),
  transportBearer: "OWNER",
  paymentMethods: ["BANK_TRANSFER"],
  totalAmount: dinarsToMoney(60000),
  firstDueDate: "2026-11-10",
  paymentPlace: "مقر الشركة",
  paymentFrequency: "MONTHLY",
  teamAccess: ["VIA_GUARD"],
  hasGuard: true,
  securityInstructions: true,
  guardName: "عمار بن ساسي",
  guardPhone: "0770 12 34 56",
  issuedDate: "2026-10-06",
};

const BUILDING_CONTRACT: FormValues = {
  ...BUILDING_SITE,
  siteNumber: "B7",
  address: "حي 200 مسكن",
  commune: "أم البواقي",
  wilaya: "04",
  commonName: "عمارة الورود",
  contractingParty: "RESIDENTS_ASSOCIATION",
  clientName: "مرابط بلقاسم",
  capacity: "رئيس جمعية السكان",
  phone: "0550 11 22 33",
  firstVisitDate: "2026-09-16",
  occupiedApartments: 18,
  unoccupiedApartments: 2,
  approxResidents: 85,
  totalApartments: 20,
  residentTurnover: "LOW",
  entrances: 2,
  floors: 5,
  stairs: 2,
  apartments: 20,
  corridors: 10,
  lifts: 0,
  hasBasements: true,
  hasGreenSpaces: false,
  hasGarages: false,
  hasSharedRoofs: true,
  providedServices: ["FLOORS", "SWEEP_DUST", "CORRIDORS", "WASTE_SORTING", "MAILBOXES", "ENTRANCES"],
  programmedServices: ["PERIODIC"],
  programmedServicesCustom: ["تنظيف شهري للأقبية"],
  contractKind: "LONG",
  contractDuration: "Y1",
  visitsPerWeek: 2,
  executionDays: ["SUN", "WED"],
  period: "MORNING",
  periodFrom: "08:00",
  periodTo: "11:00",
  startDate: "2026-10-01",
  endDate: "2027-09-30",
  arrivalTime: "08:00",
  departureTime: "11:00",
  workersCount: 2,
  payerName: "أمين صندوق الجمعية",
  payerPhone: "0550 44 55 66",
  materialsBearer: "CENTRE",
  materialsAmount: dinarsToMoney(3500),
  transportBearer: "OWNER",
  paymentMethods: ["CASH"],
  totalAmount: dinarsToMoney(30000),
  firstDueDate: "2026-10-31",
  paymentPlace: "مقر المركز",
  paymentFrequency: "MONTHLY",
  teamAccess: ["BUILDING_MANAGER"],
  hasGuard: false,
  securityInstructions: false,
  issuedDate: "2026-09-24",
};

const COMPLEX_CONTRACT: FormValues = {
  ...BUILDING_SITE,
  storagePlace: "مستودع الإقامة",
  wasteDisposalOther: "عند مدخل الإقامة",
  siteNumber: "A1",
  address: "حي الياسمين، طريق قسنطينة",
  commune: "عين مليلة",
  wilaya: "04",
  commonName: "إقامة الياسمين",
  contractingParty: "OTHER",
  contractingPartyOther: "ديوان الترقية والتسيير العقاري",
  clientName: "لعموري حسان",
  capacity: "مسير الإقامة",
  phone: "032 42 18 90",
  firstVisitDate: "2026-09-23",
  occupiedApartments: 60,
  unoccupiedApartments: 4,
  approxResidents: 260,
  totalApartments: 64,
  residentTurnover: "MEDIUM",
  entrances: 4,
  floors: 4,
  stairs: 4,
  apartments: 64,
  corridors: 16,
  lifts: 0,
  hasBasements: false,
  hasGreenSpaces: true,
  hasGarages: true,
  hasSharedRoofs: true,
  providedServices: ["FLOORS", "COURTYARDS", "SWEEP_DUST", "CORRIDORS", "WASTE_SORTING", "ENTRANCES", "GARDENS"],
  programmedServices: ["PERIODIC", "COMPREHENSIVE_DEEP"],
  contractKind: "LONG",
  contractDuration: "M6",
  visitsPerWeek: 3,
  executionDays: ["SAT", "MON", "WED"],
  period: "MORNING",
  periodFrom: "08:00",
  periodTo: "12:00",
  startDate: "2026-10-03",
  endDate: "2027-04-02",
  arrivalTime: "08:00",
  departureTime: "12:00",
  workersCount: 4,
  payerName: "المصلحة المالية للديوان",
  payerPhone: "032 42 18 91",
  materialsBearer: "CENTRE",
  materialsAmount: dinarsToMoney(6000),
  transportBearer: "CENTRE",
  transportAmount: dinarsToMoney(2000),
  paymentMethods: ["POSTAL_TRANSFER"],
  totalAmount: dinarsToMoney(54000),
  firstDueDate: "2026-11-03",
  paymentPlace: "مقر الديوان",
  paymentFrequency: "MONTHLY",
  teamAccess: ["VIA_GUARD"],
  hasGuard: true,
  securityInstructions: false,
  guardName: "سعيدي مراد",
  guardPhone: "0699 33 21 10",
  issuedDate: "2026-10-01",
};

interface DemoStep {
  at: string;
  to: FileStage;
}

export interface DemoFile {
  /** The name the harness opens it by: `/dashboard/files/{clients.buildingContract}`. */
  name: string;
  /** Who typed it in. */
  by: RoleCode;
  registeredAt: string;
  input: RegisterFileInput;
  moves: readonly DemoStep[];
}

export const DEMO_FILES: readonly DemoFile[] = [
  {
    name: "buildingContract",
    by: "ADMINISTRATION",
    registeredAt: at("2026-09-14", "10:30"),
    input: {
      kind: "BUILDING_CONTRACT",
      values: BUILDING_CONTRACT,
      office: { source: "REP", priority: "NORMAL", amountBasis: "PER_PAYMENT_PERIOD", expensesIncluded: true },
      siteOffice: {
        landmark: "مقابل مدرسة الأمير عبد القادر",
        meetingPoint: "مدخل العمارة B7",
        receiverName: "مرابط بلقاسم",
        receiverRole: "رئيس جمعية السكان",
        receiverPhone: "0550 11 22 33",
        forbiddenCodes: ["RESIDENT_FLATS", "ELECTRIC_ROOMS"],
        instructionCodes: ["NO_MOVE_PROPERTY", "KEEP_QUIET", "WET_FLOOR_SIGNS"],
        ppeCodes: ["GLOVES", "WORKWEAR"],
      },
      residents: [
        { number: 1, name: "مرابط بلقاسم", phone: "0550 11 22 33", registeredDate: "2026-09-24" },
        { number: 2, name: "حداد فاطمة", phone: "0661 77 88 99", registeredDate: "2026-09-24" },
        { number: 3, name: "زروقي عبد القادر", registeredDate: "2026-09-24" },
        { number: 4, name: "بوعزيز سهام", phone: "0770 45 67 89", registeredDate: "2026-09-24" },
        { number: 5, name: "شريفي نور الدين", phone: "0559 98 76 54" },
        { number: 6, name: "عيساوي ليلى", registeredDate: "2026-10-05" },
      ],
    },
    moves: [
      { at: at("2026-09-16", "15:00"), to: "VISIT" },
      { at: at("2026-09-18", "11:00"), to: "QUOTE" },
      { at: at("2026-09-24", "10:00"), to: "CONTRACTED" },
    ],
  },
  {
    name: "complexContract",
    by: "ADMINISTRATION",
    registeredAt: at("2026-09-21", "09:30"),
    input: {
      kind: "COMPLEX_CONTRACT",
      values: COMPLEX_CONTRACT,
      office: { source: "PHONE", priority: "IMPORTANT", amountBasis: "PER_PAYMENT_PERIOD", expensesIncluded: true },
      siteOffice: { buildingsCount: 4, meetingPoint: "مكتب مسير الإقامة", keysHeld: false },
      residents: [
        { number: 1, name: "لعموري حسان", phone: "032 42 18 90", registeredDate: "2026-10-01" },
        { number: 2, name: "بن عيسى يمينة", phone: "0662 10 20 30", registeredDate: "2026-10-01" },
        { number: 3, name: "مزياني رابح", registeredDate: "2026-10-01" },
        { number: 4, name: "قرفي سعاد", phone: "0771 22 33 44" },
      ],
    },
    moves: [
      { at: at("2026-09-23", "14:00"), to: "VISIT" },
      { at: at("2026-09-25", "10:00"), to: "QUOTE" },
      { at: at("2026-10-01", "11:00"), to: "CONTRACTED" },
    ],
  },
  {
    name: "orgContract",
    by: "RECEPTION_SALES",
    registeredAt: at("2026-09-28", "08:45"),
    input: {
      kind: "ORG_CONTRACT",
      values: ORG_CONTRACT,
      office: { source: "VISIT", priority: "NORMAL", amountBasis: "PER_PAYMENT_PERIOD", expensesIncluded: true },
      siteOffice: {
        receiverName: "قاسمي نادية",
        receiverRole: "المديرة",
        receiverPhone: "032 55 10 20",
        forbiddenCodes: ["TECH_ROOMS", "ELECTRIC_ROOMS"],
        securityInstructionsText: "بطاقة الدخول عند الحارس، ولا يُدخل إلى غرفة الخوادم.",
        ppeCodes: ["GLOVES", "WORKWEAR", "BADGE"],
        allowedDays: ["SAT", "SUN", "MON", "TUE", "WED"],
        allowedFrom: "06:30",
        allowedTo: "10:00",
      },
    },
    moves: [
      { at: at("2026-09-30", "15:30"), to: "VISIT" },
      { at: at("2026-10-02", "10:00"), to: "QUOTE" },
      { at: at("2026-10-06", "09:30"), to: "CONTRACTED" },
    ],
  },
  {
    name: "housingContract",
    by: "RECEPTION_SALES",
    registeredAt: at("2026-10-03", "10:15"),
    input: {
      kind: "HOUSING_CONTRACT",
      values: HOUSING_CONTRACT,
      office: { source: "REFERRAL", priority: "NORMAL", amountBasis: "WHOLE_CONTRACT", expensesIncluded: true },
      siteOffice: {
        landmark: "قرب مسجد النور",
        keysHeld: true,
        keyCount: 1,
        keyHolderName: "بوزيد سليم",
        keyReceivedDate: "2026-10-08",
        womenOnly: true,
      },
    },
    // Priced by phone: no first visit.
    moves: [
      { at: at("2026-10-05", "11:00"), to: "QUOTE" },
      { at: at("2026-10-08", "16:00"), to: "CONTRACTED" },
    ],
  },
  {
    name: "housingRequest",
    by: "RECEPTION_SALES",
    registeredAt: at("2026-10-10", "09:20"),
    input: {
      kind: "HOUSING_REQUEST",
      values: HOUSING_REQUEST,
      office: { source: "PHONE", priority: "URGENT" },
      siteOffice: { landmark: "قرب الملعب البلدي", floorAndDoor: "الطابق الأول، الباب الأيمن" },
    },
    // Its quote takes it to «عرض سعر» (DEMO_QUOTES), where it waits for the client's answer.
    moves: [{ at: at("2026-10-11", "10:00"), to: "VISIT" }],
  },
  {
    name: "housingJob",
    by: "RECEPTION_SALES",
    registeredAt: at("2026-10-10", "11:00"),
    input: {
      kind: "HOUSING_REQUEST",
      values: HOUSING_JOB,
      office: { source: "PHONE", priority: "NORMAL" },
      siteOffice: { landmark: "قرب مكتب البريد", floorAndDoor: "الطابق الثالث" },
    },
    moves: [{ at: at("2026-10-10", "16:00"), to: "VISIT" }],
  },
  {
    name: "orgJob",
    by: "RECEPTION_SALES",
    registeredAt: at("2026-10-10", "14:30"),
    input: {
      kind: "ORG_REQUEST",
      values: ORG_JOB,
      office: { source: "VISIT", priority: "NORMAL" },
      siteOffice: { landmark: "مقابل الصيدلية المركزية" },
    },
    moves: [{ at: at("2026-10-11", "09:00"), to: "VISIT" }],
  },
];

const jobLine = (label: string, dinars: number): QuoteInput["lines"][number] => ({
  kind: "INITIAL_JOB",
  label,
  description: null,
  quantity: toQty(1),
  unit: null,
  unitPrice: dinarsToMoney(dinars),
});

const quoteOf = (date: string, lines: QuoteInput["lines"], more: Partial<QuoteInput>): QuoteInput => ({
  date,
  validUntil: null,
  includedText: null,
  excludedText: null,
  materialsIncluded: true,
  equipmentIncluded: true,
  workers: null,
  duration: null,
  visits: null,
  discount: 0,
  amountBasis: null,
  lines,
  ...more,
});

const studyOf = (workers: number, hours: number, materials: number, transport: number): CostStudyInput => ({
  workers,
  perVisitMin: hours * 60,
  visitsPerWeek: null,
  weeks: null,
  hourlyRate: dinarsToMoney(400),
  lines: [
    { code: "LABOUR", label: null, amount: 0, rateBp: null },
    { code: "MATERIALS", label: null, amount: dinarsToMoney(materials), rateBp: null },
    { code: "TRANSPORT", label: null, amount: dinarsToMoney(transport), rateBp: null },
    { code: "RESERVE", label: null, amount: 0, rateBp: 500 },
  ],
  marginPercent: 3000,
  discount: 0,
});

/** The first visits typed in from the supervisor's sheet (the inspector is People's demo supervisor). */
export const DEMO_FIRST_VISITS: ReadonlyArray<{ file: string; at: string; visit: FirstVisitInput }> = [
  {
    file: "housingRequest",
    at: at("2026-10-11", "15:00"),
    visit: {
      ...emptyFirstVisit("2026-10-11"),
      plannedTime: "10:30",
      doneDate: "2026-10-11",
      startTime: "10:30",
      endTime: "11:20",
      clientRepresentative: "بن صالح كريمة",
      firstResult: ["NEEDS_INITIAL_DEEP"],
      conditionFactors: ["CEMENT_PAINT_TRACES", "RECENT_WORKS"],
      spaces: [
        {
          label: "الغرف",
          countOrArea: "4",
          state: "POOR",
          workRequired: "إزالة بقع الطلاء وتنظيف عميق",
          frequency: null,
        },
        {
          label: "المطبخ",
          countOrArea: "1",
          state: "AVERAGE",
          workRequired: "تنظيف الخزائن والأرضية",
          frequency: null,
        },
        { label: "الحمام", countOrArea: "1", state: "POOR", workRequired: "إزالة الترسبات", frequency: null },
      ],
      estimatedWorkers: 3,
      perVisitMin: 600,
      daysNeeded: toQty(1.5),
      distanceKm: toQty(14),
      travelMin: 25,
      transportMeans: "CENTRE_VEHICLE",
      materialsAndEquipmentNeeds: "مكنسة كهربائية، مواد إزالة الطلاء",
      recommendation: ["EXTRA_TIME"],
      recommendationReason: "بقايا الطلاء كثيرة",
    },
  },
  {
    file: "orgJob",
    at: at("2026-10-11", "09:30"),
    visit: {
      ...emptyFirstVisit("2026-10-11"),
      doneDate: "2026-10-11",
      startTime: "08:30",
      endTime: "09:15",
      clientRepresentative: "حمدي رشيد",
      firstResult: ["SUITABLE"],
      conditionFactors: ["RECENT_WORKS"],
      spaces: [
        { label: "المكاتب", countOrArea: "6", state: "AVERAGE", workRequired: "تنظيف شامل", frequency: null },
        {
          label: "قاعة الانتظار",
          countOrArea: "40 م²",
          state: "POOR",
          workRequired: "غسل الأرضية والزجاج",
          frequency: null,
        },
      ],
      estimatedWorkers: 3,
      perVisitMin: 360,
      daysNeeded: toQty(2),
      recommendation: ["STANDARD_QUOTE"],
    },
  },
];

/**
 * The on-demand files' way to the client: the study, the quote prepared by
 * reception, approved by the manager, issued, and for two of them accepted,
 * which takes the file to «متعاقد».
 */
export const DEMO_QUOTES: ReadonlyArray<{
  file: string;
  study: CostStudyInput;
  quote: QuoteInput;
  preparedAt: string;
  approvedAt: string;
  issuedAt: string;
  accepted?: { at: string; date: string; note: string };
}> = [
  {
    file: "housingJob",
    study: studyOf(2, 6, 1500, 500),
    quote: quoteOf("2026-10-10", [jobLine("تنظيف عميق لشقة من ثلاث غرف", 9500)], {
      validUntil: "2026-10-25",
      includedText: "الأرضيات، المطبخ، الحمام، النوافذ",
      workers: 2,
      duration: "6 ساعات",
      visits: "1",
    }),
    preparedAt: at("2026-10-10", "16:30"),
    approvedAt: at("2026-10-10", "17:00"),
    issuedAt: at("2026-10-10", "17:10"),
    accepted: { at: at("2026-10-11", "10:30"), date: "2026-10-11", note: "وافقت بالهاتف" },
  },
  {
    file: "orgJob",
    study: studyOf(3, 12, 4000, 1000),
    quote: quoteOf(
      "2026-10-11",
      [
        jobLine("تنظيف شامل بعد أشغال التهيئة", 32000),
        {
          kind: "EXTRA",
          label: "تلميع الزجاج والواجهة الداخلية",
          description: null,
          quantity: toQty(14),
          unit: "نافذة",
          unitPrice: dinarsToMoney(250),
        },
      ],
      {
        validUntil: "2026-10-26",
        discount: dinarsToMoney(1500),
        includedText: "المكاتب، قاعة الانتظار، دورات المياه، الزجاج",
        excludedText: "الواجهة الخارجية",
        workers: 3,
        duration: "يومان",
        visits: "2",
      },
    ),
    preparedAt: at("2026-10-11", "10:00"),
    approvedAt: at("2026-10-11", "11:15"),
    issuedAt: at("2026-10-11", "11:30"),
    accepted: { at: at("2026-10-12", "08:40"), date: "2026-10-12", note: "وصل سند الطلب موقّعا" },
  },
  {
    file: "housingRequest",
    study: studyOf(3, 10, 3500, 1000),
    quote: quoteOf("2026-10-12", [jobLine("تنظيف شامل وعميق بعد الترميم", 18000)], {
      validUntil: "2026-10-27",
      includedText: "كل الغرف، المطبخ، الحمام، النوافذ، إزالة بقع الطلاء",
      workers: 3,
      duration: "يوم ونصف",
      visits: "2",
    }),
    preparedAt: at("2026-10-12", "08:10"),
    approvedAt: at("2026-10-12", "08:25"),
    issuedAt: at("2026-10-12", "08:30"),
  },
];

/**
 * Registers the files and takes each through its stages and its quote, every
 * step at its own time, in the order the office took them.
 */
export async function seedDemo(ex: Executor, _ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};
  const fileIds = new Map<string, string>();
  const quoteIds = new Map<string, string>();
  const reception = await tools.sessionOf("RECEPTION_SALES");
  const steps: Array<{ at: string; run: () => Promise<void> }> = [];

  for (const file of DEMO_FILES) {
    steps.push({
      at: file.registeredAt,
      run: async () => {
        const session = await tools.sessionOf(file.by);
        const registered = await registerFile(ex, tools.at(file.registeredAt, session), file.input);
        fileIds.set(file.name, registered.fileId);
        names[file.name] = registered.fileId;
        names[`${file.name}Client`] = registered.clientId;
        names[`${file.name}Site`] = registered.siteId;
      },
    });
    for (const move of file.moves) {
      steps.push({
        at: move.at,
        run: async () => {
          await moveFileStage(ex, tools.at(move.at), { fileId: fileIds.get(file.name)!, to: move.to as FileStage });
        },
      });
    }
  }

  for (const entry of DEMO_QUOTES) {
    const fileId = () => fileIds.get(entry.file)!;
    steps.push({
      at: entry.preparedAt,
      run: async () => {
        // The manager costs the job; reception prepares the quote and sends it to him.
        await saveCostStudy(ex, tools.at(entry.preparedAt), { fileId: fileId(), terms: entry.study });
        const ctx = tools.at(entry.preparedAt, reception);
        const saved = await saveQuote(ex, ctx, { fileId: fileId(), quote: entry.quote });
        quoteIds.set(entry.file, saved.quoteId);
        names[`${entry.file}Quote`] = saved.quoteId;
        await submitQuote(ex, ctx, { quoteId: saved.quoteId });
      },
    });
    steps.push({
      at: entry.approvedAt,
      run: async () => {
        await decideQuote(ex, tools.at(entry.approvedAt), {
          quoteId: quoteIds.get(entry.file)!,
          approve: true,
          note: "السعر مطابق للدراسة المالية",
        });
      },
    });
    steps.push({
      at: entry.issuedAt,
      run: async () => {
        await issueQuote(ex, tools.at(entry.issuedAt, reception), { quoteId: quoteIds.get(entry.file)! });
      },
    });
    const { accepted } = entry;
    if (accepted) {
      steps.push({
        at: accepted.at,
        run: async () => {
          await recordQuoteResult(ex, tools.at(accepted.at, reception), {
            quoteId: quoteIds.get(entry.file)!,
            result: "ACCEPTED",
            resultDate: accepted.date,
            note: accepted.note,
            contract: true,
          });
        },
      });
    }
  }

  for (const entry of DEMO_FIRST_VISITS) {
    steps.push({
      at: entry.at,
      run: async () => {
        const inspector = tools.names.people?.employeeSupervisor ?? null;
        const { firstVisitId } = await saveFirstVisit(ex, tools.at(entry.at, reception), {
          fileId: fileIds.get(entry.file)!,
          visit: { ...entry.visit, inspectorEmployeeId: inspector },
        });
        names[`${entry.file}FirstVisit`] = firstVisitId;
      },
    });
  }

  steps.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  for (const step of steps) await step.run();
  return names;
}
