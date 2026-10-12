import type { RoleCode } from "@/lib/access/catalogue";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { dinarsToMoney, toQty } from "@/lib/units";
import type { DemoNames, DemoTools } from "@/testing/demo";

import type { FormValues } from "./forms/values";
import { moveFileStage, registerFile, type RegisterFileInput } from "./services/files";
import type { FileStage } from "./validators/option-lists";

/**
 * Clients and contracts' demo data: one file per division, registered and
 * moved through the services, on the dates an office would have done it.
 *
 *  - `housingRequest`: a home on demand, priced after its first visit, waiting
 *    at «عرض سعر» (an on-demand file needs an accepted quote to go further);
 *  - `housingContract`: a home under a one-month contract, priced by phone
 *    (it skips «الزيارة»);
 *  - `orgContract`: a company under a three-month contract;
 *  - `buildingContract`: a building under a one-year contract, with residents;
 *  - `complexContract`: a residential complex under a six-month contract.
 *
 * The four contracts reach «متعاقد», which tells Operations and Money
 * (`file.contracted`). Invented people, places and numbers.
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
    // Waits at «عرض سعر»: an on-demand file needs its quote accepted to go further.
    moves: [
      { at: at("2026-10-11", "10:00"), to: "VISIT" },
      { at: at("2026-10-12", "08:30"), to: "QUOTE" },
    ],
  },
];

/**
 * Registers the five files and moves each through its stages, every step on its
 * own date, in the order the office took them.
 */
export async function seedDemo(ex: Executor, _ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};
  const fileIds = new Map<string, string>();
  const steps = DEMO_FILES.flatMap((file) => [
    { at: file.registeredAt, file, to: null as FileStage | null },
    ...file.moves.map((move) => ({ at: move.at, file, to: move.to as FileStage | null })),
  ]).sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));

  for (const step of steps) {
    if (step.to === null) {
      const session = await tools.sessionOf(step.file.by);
      const registered = await registerFile(ex, tools.at(step.at, session), step.file.input);
      fileIds.set(step.file.name, registered.fileId);
      names[step.file.name] = registered.fileId;
      names[`${step.file.name}Client`] = registered.clientId;
      names[`${step.file.name}Site`] = registered.siteId;
    } else {
      await moveFileStage(ex, tools.at(step.at), { fileId: fileIds.get(step.file.name)!, to: step.to });
    }
  }
  return names;
}
