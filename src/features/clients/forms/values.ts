import type { Money, Qty } from "@/lib/units";

import type { FileStatusTick, OptionCode } from "../validators/option-lists";

/**
 * What one of his sheets says about a file: a plain object, one property per
 * blank or group of tick boxes on the five forms. A sheet is a pure picture of
 * it. Every property is optional: the empty form is `{}`.
 *
 * Amounts and areas are in the data model's units, so that a service can hand
 * over what it reads and a dinar amount cannot be printed as centimes: amounts
 * in centimes (`Money`), areas and durations in thousandths of their unit
 * (`Qty`). Dates are "YYYY-MM-DD", times "HH:MM". A choice holds the code of
 * the ticked option (`../validators/option-lists`), several choices a list of
 * codes, a yes / no a Boolean (left out when neither box is ticked).
 */

/** One line of «قائمة القاطنين بالعمارة». */
export interface ResidentLine {
  number?: number;
  name: string;
  phone?: string;
  /** «تاريخ التسجيل». */
  registeredDate?: string;
}

export interface FormValues {
  // The lines above the first table.
  /** «رقم التسجيل» as the program writes it: "31/BLC", or "31" for a form without a suffix. */
  registrationNumber?: string;
  registrationDate?: string;

  // المعلومات الأساسية
  dossierNumber?: string;
  siteNumber?: string;
  /** The eight boxes of «حالة الملف», as `statusTicks()` (../rules/status-ticks) gives them. */
  statusTicks?: readonly FileStatusTick[];
  propertyType?: OptionCode<"PROPERTY_TYPE_HOUSING"> | OptionCode<"PROPERTY_TYPE_ORGANISATION">;
  propertyTypeOther?: string;
  /** «اللقب والاسم», «اسم المؤسسة» or «اسم المسئول», by form. */
  clientName?: string;
  ownership?: OptionCode<"OWNERSHIP">;
  managerName?: string;
  hasTradeRegister?: boolean;
  sector?: OptionCode<"SECTOR">;
  contractingParty?: OptionCode<"CONTRACTING_PARTY">;
  contractingPartyOther?: string;
  capacity?: string;
  address?: string;
  /** The commune's name, as printed. */
  commune?: string;
  /** The wilaya's code ("04"), from the list in src/lib/geo/wilayas.ts. Its name is printed. */
  wilaya?: string;
  commonName?: string;
  phone?: string;
  firstVisitDate?: string;
  cleanliness?: OptionCode<"CLEANLINESS">;
  cleanlinessNote?: string;
  equipmentStorage?: boolean;
  storagePlace?: string;
  wasteDisposal?: readonly OptionCode<"WASTE_DISPOSAL">[];
  wasteDisposalOther?: string;

  // الوصف الفني للموقع (homes and organisations)
  buildArea?: Qty;
  floors?: number;
  rooms?: number;
  majlis?: number;
  salons?: number;
  kitchens?: number;
  bathrooms?: number;
  balconies?: number;
  windows?: number;
  floorType?: string;
  gardenArea?: Qty;
  courtyardArea?: Qty;
  buildings?: number;
  offices?: number;
  halls?: number;
  stores?: number;
  toilets?: number;
  doors?: number;
  floorArea?: Qty;
  carParks?: number;
  entrances?: number;
  exits?: number;
  /** The unlabelled pair at the end of the organisations' description. */
  extraLabel?: string;
  extraValue?: string;

  // معلومات السكان and مواصفات العمارة (buildings and complexes)
  occupiedApartments?: number;
  unoccupiedApartments?: number;
  approxResidents?: number;
  totalApartments?: number;
  residentTurnover?: OptionCode<"RESIDENT_TURNOVER">;
  stairs?: number;
  apartments?: number;
  corridors?: number;
  lifts?: number;
  hasBasements?: boolean;
  hasGreenSpaces?: boolean;
  hasGarages?: boolean;
  hasSharedRoofs?: boolean;

  // الخدمات المقدمة and الخدمات المبرمجة
  providedServices?: readonly OptionCode<"PROVIDED_SERVICE">[];
  /** What is written on the blank lines, in print order (blank slot 1 first); null leaves a line blank. */
  providedServicesCustom?: readonly (string | null)[];
  programmedServices?: readonly OptionCode<"PROGRAMMED_SERVICE">[];
  programmedServicesCustom?: readonly (string | null)[];

  // الدراسة المالية
  contractKind?: OptionCode<"CONTRACT_KIND">;
  contractKindNote?: string;
  contractDuration?: OptionCode<"CONTRACT_DURATION">;
  contractDurationNote?: string;
  visitsPerWeek?: number;
  requestKinds?: readonly OptionCode<"REQUEST_KIND">[];
  requestKindNote?: string;
  /** «مدة التنفيذ», in thousandths of the unit beside it. */
  executionDurationValue?: Qty;
  executionDurationUnit?: "HOURS" | "DAYS";
  executionDays?: readonly OptionCode<"WEEKDAY">[];
  period?: OptionCode<"DAY_PERIOD">;
  periodFrom?: string;
  periodTo?: string;
  startDate?: string;
  endDate?: string;
  arrivalTime?: string;
  departureTime?: string;
  workersCount?: number;
  payerName?: string;
  payerPhone?: string;
  materialsBearer?: OptionCode<"BEARER">;
  materialsAmount?: Money;
  transportBearer?: OptionCode<"BEARER">;
  transportAmount?: Money;
  paymentMethods?: readonly OptionCode<"PAYMENT_METHOD">[];
  totalAmount?: Money;
  firstDueDate?: string;
  paymentPlace?: string;
  paymentFrequency?: OptionCode<"PAYMENT_FREQUENCY">;
  teamAccess?: readonly OptionCode<"TEAM_ACCESS">[];
  hasGuard?: boolean;
  securityInstructions?: boolean;
  guardName?: string;
  guardPhone?: string;
  /** «حررت: بأم البواقي، بتاريخ». Blank on an empty form. */
  issuedDate?: string;

  // قائمة القاطنين بالعمارة
  residents?: readonly ResidentLine[];
}

/** A property a row of a form can be bound to. */
export type FieldKey = Exclude<keyof FormValues, "residents">;
