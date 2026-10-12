import { FORM_DEFINITIONS } from "../forms/definitions";
import type { FieldKey, FormValues } from "../forms/values";
import type { FormKind } from "../validators/option-lists";

/**
 * What the «قديم» control copies into a new file, and what it leaves blank
 * (his red note: «يضغط على زر قديم ☐ و يتم ملئها … تلقائيا»; scope section 3).
 *
 * It fills "the basic information and the site description":
 *
 *  - who the client is, whatever site is chosen;
 *  - where the site is and what it is made of, when one of the client's sites
 *    is chosen: taken from that site's latest file.
 *
 * It leaves blank everything that belongs to the new job: the registration
 * number and date, the first visit and the cleanliness found that day, the two
 * lists of services, the whole financial study with its payer and guard, and
 * the date of issue.
 *
 * A renewal (a new sheet for the same contract) starts from the same copy and
 * adds the services and the financial study, without their dates.
 *
 * Every answer of every form is in exactly one of the four lists below; the
 * test fails when a new one is in none.
 */

/** Who the client is. */
export const CLIENT_KEYS: readonly FieldKey[] = [
  "dossierNumber",
  "clientName",
  "managerName",
  "capacity",
  "contractingParty",
  "contractingPartyOther",
  "sector",
  "hasTradeRegister",
  "phone",
];

/** Where the site is and what it is made of. */
export const SITE_KEYS: readonly FieldKey[] = [
  "siteNumber",
  "address",
  "commune",
  "wilaya",
  "commonName",
  "propertyType",
  "propertyTypeOther",
  "ownership",
  "equipmentStorage",
  "storagePlace",
  "wasteDisposal",
  "wasteDisposalOther",
  // الوصف الفني للموقع
  "buildArea",
  "floors",
  "rooms",
  "majlis",
  "salons",
  "kitchens",
  "bathrooms",
  "balconies",
  "windows",
  "floorType",
  "gardenArea",
  "courtyardArea",
  "buildings",
  "offices",
  "halls",
  "stores",
  "toilets",
  "doors",
  "floorArea",
  "carParks",
  "entrances",
  "exits",
  "extraLabel",
  "extraValue",
  // معلومات السكان and مواصفات العمارة
  "occupiedApartments",
  "unoccupiedApartments",
  "approxResidents",
  "totalApartments",
  "residentTurnover",
  "stairs",
  "apartments",
  "corridors",
  "lifts",
  "hasBasements",
  "hasGreenSpaces",
  "hasGarages",
  "hasSharedRoofs",
];

/** The services and the terms of the job: copied by a renewal only. */
export const JOB_KEYS: readonly FieldKey[] = [
  "providedServices",
  "providedServicesCustom",
  "programmedServices",
  "programmedServicesCustom",
  "contractKind",
  "contractKindNote",
  "contractDuration",
  "contractDurationNote",
  "visitsPerWeek",
  "requestKinds",
  "requestKindNote",
  "executionDurationValue",
  "executionDurationUnit",
  "executionDays",
  "period",
  "periodFrom",
  "periodTo",
  "arrivalTime",
  "departureTime",
  "workersCount",
  "payerName",
  "payerPhone",
  "materialsBearer",
  "materialsAmount",
  "transportBearer",
  "transportAmount",
  "paymentMethods",
  "totalAmount",
  "paymentPlace",
  "paymentFrequency",
  "teamAccess",
  "hasGuard",
  "securityInstructions",
  "guardName",
  "guardPhone",
];

/** Never copied: each file has its own. */
export const NEVER_COPIED_KEYS: readonly FieldKey[] = [
  "registrationNumber",
  "registrationDate",
  "statusTicks",
  "firstVisitDate",
  "cleanliness",
  "cleanlinessNote",
  "startDate",
  "endDate",
  "firstDueDate",
  "issuedDate",
];

/** Every answer one of a form's rows is bound to. */
export function answersOf(kind: FormKind): Set<FieldKey> {
  const keys = new Set<FieldKey>();
  for (const row of FORM_DEFINITIONS[kind].rows) {
    for (const key of [row.key, row.noteKey, row.otherKey, row.freeKey, row.pairKey, row.labelKey]) {
      if (key) keys.add(key);
    }
  }
  return keys;
}

export interface ReturningFill {
  /** The form of the new file. */
  kind: FormKind;
  /** The values of the file copied from: the latest file of the chosen site, or of the client when the site is new. */
  previous: FormValues;
  /** "same": one of the client's sites was chosen. "new": the client has a new site. */
  site: "same" | "new";
  /** "renewal" adds the services and the terms of the job. */
  purpose: "returning" | "renewal";
}

/**
 * The values a new file starts with. Only what the new form prints is copied,
 * so a client known from a home file can open an organisation file.
 */
export function returningClientFill({ kind, previous, site, purpose }: ReturningFill): FormValues {
  const copied: FieldKey[] = [...CLIENT_KEYS];
  if (site === "same") copied.push(...SITE_KEYS);
  if (site === "same" && purpose === "renewal") copied.push(...JOB_KEYS);

  const printed = answersOf(kind);
  const filled: Record<string, unknown> = {};
  for (const key of copied) {
    const value: unknown = previous[key];
    if (printed.has(key) && value !== undefined) filled[key] = value;
  }
  // The residents belong to the site, not to the file.
  if (site === "same" && previous.residents && FORM_DEFINITIONS[kind].family === "BUILDING") {
    filled.residents = previous.residents;
  }
  return filled as FormValues;
}
