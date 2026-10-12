import type { Executor, ServiceContext } from "@/lib/service/context";
import type { LocalDate, LocalTime } from "@/lib/units";

import { OPTION_LISTS, type FormKind } from "../validators/option-lists";

import { asFormKind } from "./file-records";

/**
 * What other owners read of a file and of its site (docs/data-model/
 * CONTRACTS.md section 3, Clients' exports). Plain reads over the caller's
 * `ex`, called from inside another owner's service: they check no section,
 * because the caller has checked its own, and an event handler (visits made
 * at «متعاقد») runs as whoever moved the file.
 *
 * The field names are the ones Operations already reads in its
 * `services/upstream.ts`, so its readers become calls to these.
 */

/** A set of ticks stored as a JSON array of codes. Empty or unreadable is no tick. */
function codes(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((code): code is string => typeof code === "string") : [];
  } catch {
    return [];
  }
}

const yesNo = (value: number | null) => (value === null ? null : value === 1);

/** One tick of «الخدمات المقدمة» or «الخدمات المبرمجة», with his words for it. */
export interface ScheduledService {
  list: "PROVIDED" | "PROGRAMMED";
  code: string | null;
  customLabel: string | null;
  /** His words: the option as his forms print it, or what the office wrote on a blank line. */
  labelAr: string;
}

/** The counts of «الوصف الفني للموقع», «معلومات السكان» and «مواصفات العمارة»: what areas are made from. */
export interface DescriptionCounts {
  family: string;
  floors: number | null;
  rooms: number | null;
  majlis: number | null;
  salons: number | null;
  kitchens: number | null;
  bathrooms: number | null;
  balconies: number | null;
  windows: number | null;
  buildings: number | null;
  offices: number | null;
  halls: number | null;
  stores: number | null;
  toilets: number | null;
  doors: number | null;
  carParks: number | null;
  entrances: number | null;
  exits: number | null;
  stairs: number | null;
  apartments: number | null;
  corridors: number | null;
  lifts: number | null;
  /** Areas in m², from thousandths. */
  buildArea: number | null;
  gardenArea: number | null;
  courtyardArea: number | null;
  floorArea: number | null;
  hasBasements: boolean | null;
  hasGreenSpaces: boolean | null;
  hasGarages: boolean | null;
  hasSharedRoofs: boolean | null;
  /** The site's office answer: the buildings of a residential complex. */
  buildingsCount: number | null;
}

/** The schedule fields of a file, exactly as typed, without any amount. */
export interface FileForScheduling {
  id: string;
  number: string;
  formKind: FormKind;
  division: string;
  serviceType: string;
  stage: string;
  clientId: string;
  clientNumber: string;
  siteId: string;
  clientName: string;
  /** «الصفة» (buildings) or «مدير/ مسير» (organisations), when his form asks it. */
  clientCapacity: string | null;
  clientManagerName: string | null;
  clientPhone: string;
  /** People's decision that allowed this registration despite a sanction, if any. */
  sanctionDecisionId: string | null;
  /** «نوع العقد» and «مدة العقد» on a contract. */
  contractKind: string | null;
  contractDuration: string | null;
  /** «أيام التنفيذ», codes SAT..THU. */
  executionDays: string[];
  /** «تحديد الفترة» with «من / إلى». */
  period: string | null;
  periodFrom: LocalTime | null;
  periodTo: LocalTime | null;
  startDate: LocalDate | null;
  endDate: LocalDate | null;
  /** «وقت الوصول» and «المغادرة». */
  arrivalTime: LocalTime | null;
  departureTime: LocalTime | null;
  /** «عدد العمال». */
  workersCount: number | null;
  /** «عدد الزيارات» on a contract. */
  visitsPerWeek: number | null;
  /** «نوع الطلب» on a request. */
  requestKinds: string[];
  /** «مدة التنفيذ» in its unit (hours or days), not in thousandths. */
  executionDuration: number | null;
  executionDurationUnit: string | null;
  /** «دخول الفريق», «يوجد حارس», «تعليمات أمنية». */
  teamAccess: string[];
  hasGuard: boolean | null;
  guardName: string | null;
  guardPhone: string | null;
  securityInstructions: boolean | null;
  /** Who brings the materials and the transport: «على عاتق المركز / صاحبها», never the amounts. */
  materialsBearer: string | null;
  transportBearer: string | null;
  equipmentStorage: boolean | null;
  storagePlace: string | null;
  /** «مكان التخلص من النفايات». */
  wasteDisposal: string[];
  wasteDisposalOther: string | null;
  description: DescriptionCounts | null;
  /** The service ticks, «الخدمات المقدمة» first, each list in his print order. */
  services: ScheduledService[];
  /** A short label for the day board: the planned services in his words, else the first services provided. */
  serviceLabel: string;
  endedDate: LocalDate | null;
  closedAt: string | null;
}

const PROVIDED_AR = new Map<string, string>(OPTION_LISTS.PROVIDED_SERVICE.map((entry) => [entry.code, entry.ar]));
const PROGRAMMED_AR = new Map<string, string>(OPTION_LISTS.PROGRAMMED_SERVICE.map((entry) => [entry.code, entry.ar]));
const fromQty = (value: number | null) => (value === null ? null : value / 1000);

/** The board's short label: the planned services, else the first three provided. */
function boardLabel(services: readonly ScheduledService[]): string {
  const programmed = services.filter((service) => service.list === "PROGRAMMED").map((service) => service.labelAr);
  if (programmed.length > 0) return programmed.join("، ");
  const provided = services.filter((service) => service.list === "PROVIDED").map((service) => service.labelAr);
  return provided.length > 3 ? `${provided.slice(0, 3).join("، ")}…` : provided.join("، ");
}

/**
 * A file as the schedule and the mission orders need it (CONTRACTS.md:
 * `getFileForScheduling(fileId)`): who, the schedule fields exactly as typed,
 * who bears materials and transport without the amounts, access, guard,
 * storage, waste, the description counts and the service ticks. Null when
 * there is no such file.
 */
export async function getFileForScheduling(
  ex: Executor,
  _ctx: ServiceContext,
  input: { fileId: string },
): Promise<FileForScheduling | null> {
  const row = await ex
    .selectFrom("File as f")
    .innerJoin("Client as c", "c.id", "f.clientId")
    .innerJoin("Site as s", "s.id", "f.siteId")
    .selectAll("f")
    .select([
      "c.number as clientNumber",
      "c.name as clientName",
      "c.capacity as clientCapacity",
      "c.managerName as clientManagerName",
      "c.phone1 as clientPhone",
      "s.buildingsCount",
    ])
    .where("f.id", "=", input.fileId)
    .where("f.deletedAt", "is", null)
    .executeTakeFirst();
  if (!row) return null;

  const [description, serviceRows] = await Promise.all([
    ex.selectFrom("FileDescription").selectAll().where("fileId", "=", row.id).executeTakeFirst(),
    ex
      .selectFrom("FileService")
      .select(["list", "code", "customLabel"])
      .where("fileId", "=", row.id)
      // PROVIDED before PROGRAMMED, each in his print order.
      .orderBy("list", "desc")
      .orderBy("sortOrder")
      .execute(),
  ]);

  const services = serviceRows.map((service): ScheduledService => {
    const list = service.list === "PROGRAMMED" ? "PROGRAMMED" : "PROVIDED";
    const words = service.code ? (list === "PROVIDED" ? PROVIDED_AR : PROGRAMMED_AR).get(service.code) : undefined;
    return {
      list,
      code: service.code,
      customLabel: service.customLabel,
      labelAr: service.customLabel ?? words ?? service.code ?? "",
    };
  });

  return {
    id: row.id,
    number: row.number,
    formKind: asFormKind(row.formKind),
    division: row.division,
    serviceType: row.serviceType,
    stage: row.stage,
    clientId: row.clientId,
    clientNumber: row.clientNumber,
    siteId: row.siteId,
    clientName: row.clientName,
    clientCapacity: row.clientCapacity,
    clientManagerName: row.clientManagerName,
    clientPhone: row.clientPhone,
    sanctionDecisionId: row.sanctionDecisionId,
    contractKind: row.contractKind,
    contractDuration: row.contractDuration,
    executionDays: codes(row.executionDays),
    period: row.period,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    startDate: row.startDate,
    endDate: row.endDate,
    arrivalTime: row.arrivalTime,
    departureTime: row.departureTime,
    workersCount: row.workersCount,
    visitsPerWeek: row.visitsPerWeek,
    requestKinds: codes(row.requestKinds),
    executionDuration: fromQty(row.executionDurationValue),
    executionDurationUnit: row.executionDurationUnit,
    teamAccess: codes(row.teamAccess),
    hasGuard: yesNo(row.hasGuard),
    guardName: row.guardName,
    guardPhone: row.guardPhone,
    securityInstructions: yesNo(row.securityInstructions),
    materialsBearer: row.materialsBearer,
    transportBearer: row.transportBearer,
    equipmentStorage: yesNo(row.equipmentStorage),
    storagePlace: row.storagePlace,
    wasteDisposal: codes(row.wasteDisposal),
    wasteDisposalOther: row.wasteDisposalOther,
    description: description
      ? {
          family: description.family,
          floors: description.floors,
          rooms: description.rooms,
          majlis: description.majlis,
          salons: description.salons,
          kitchens: description.kitchens,
          bathrooms: description.bathrooms,
          balconies: description.balconies,
          windows: description.windows,
          buildings: description.buildings,
          offices: description.offices,
          halls: description.halls,
          stores: description.stores,
          toilets: description.toilets,
          doors: description.doors,
          carParks: description.carParks,
          entrances: description.entrances,
          exits: description.exits,
          stairs: description.stairs,
          apartments: description.apartments,
          corridors: description.corridors,
          lifts: description.lifts,
          buildArea: fromQty(description.buildArea),
          gardenArea: fromQty(description.gardenArea),
          courtyardArea: fromQty(description.courtyardArea),
          floorArea: fromQty(description.floorArea),
          hasBasements: yesNo(description.hasBasements),
          hasGreenSpaces: yesNo(description.hasGreenSpaces),
          hasGarages: yesNo(description.hasGarages),
          hasSharedRoofs: yesNo(description.hasSharedRoofs),
          buildingsCount: row.buildingsCount,
        }
      : null,
    services,
    serviceLabel: boardLabel(services),
    endedDate: row.endedDate,
    closedAt: row.closedAt,
  };
}

/** The person the team reports to on site. */
export interface PersonOnSite {
  name: string;
  role: string | null;
  phone: string | null;
}

/** What an order and the schedule need of a site. */
export interface SiteForOrder {
  id: string;
  clientId: string;
  division: string;
  commonName: string | null;
  siteNumber: string | null;
  address: string;
  floorAndDoor: string | null;
  district: string | null;
  landmark: string | null;
  directions: string | null;
  communeName: string;
  wilayaCode: string;
  zoneId: string | null;
  zoneName: string | null;
  /** Micro-degrees, for the optional QR on the order (off by default), and the link the client shared, as text. */
  latitude: number | null;
  longitude: number | null;
  mapLink: string | null;
  buildingsCount: number | null;
  allowedDays: string[];
  allowedFrom: LocalTime | null;
  allowedTo: LocalTime | null;
  forbiddenCodes: string[];
  forbiddenAreas: string | null;
  doNotTouch: string | null;
  valuables: string | null;
  instructionCodes: string[];
  specialInstructions: string | null;
  /** Only when the file ticks «تعليمات أمنية: نعم». */
  securityInstructionsText: string | null;
  ppeCodes: string[];
  meetingPoint: string | null;
  keysHeld: boolean;
  keyHolderName: string | null;
  sameWorkerRule: boolean;
  womenOnly: boolean;
  requiredAbilityCodes: string[];
  photoConsent: boolean;
  personOnSite: PersonOnSite;
}

/**
 * A site as a mission order needs it (CONTRACTS.md: `getSiteForOrder(siteId,
 * fileId)`): how to find it, the hours allowed, the whole work-profile block,
 * the security text only when that file ticks «تعليمات أمنية: نعم», and the
 * person on site: the site's receiver when filled, else the site's
 * coordinator contact, else the client's name (or manager), «الصفة» and first
 * phone. Null when there is no such site.
 */
export async function getSiteForOrder(
  ex: Executor,
  _ctx: ServiceContext,
  input: { siteId: string; fileId: string },
): Promise<SiteForOrder | null> {
  const site = await ex
    .selectFrom("Site as s")
    .innerJoin("Commune as m", "m.id", "s.communeId")
    .leftJoin("Zone as z", "z.id", "s.zoneId")
    .innerJoin("Client as c", "c.id", "s.clientId")
    .selectAll("s")
    .select([
      "m.nameAr as communeName",
      "m.wilayaCode as wilayaCode",
      "z.name as zoneName",
      "c.name as clientName",
      "c.capacity as clientCapacity",
      "c.managerName as clientManagerName",
      "c.phone1 as clientPhone",
    ])
    .where("s.id", "=", input.siteId)
    .where("s.deletedAt", "is", null)
    .executeTakeFirst();
  if (!site) return null;

  const file = await ex
    .selectFrom("File")
    .select(["siteId", "securityInstructions"])
    .where("id", "=", input.fileId)
    .executeTakeFirst();
  if (!file || file.siteId !== site.id) throw new Error("clients: getSiteForOrder was given a file of another site");

  let personOnSite: PersonOnSite;
  if (site.receiverName) {
    personOnSite = { name: site.receiverName, role: site.receiverRole, phone: site.receiverPhone };
  } else {
    const coordinator = await ex
      .selectFrom("Contact")
      .select(["name", "role", "phone"])
      .where("siteId", "=", site.id)
      .where("isCoordinator", "=", 1)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    personOnSite = coordinator
      ? { name: coordinator.name, role: coordinator.role, phone: coordinator.phone }
      : { name: site.clientManagerName ?? site.clientName, role: site.clientCapacity, phone: site.clientPhone };
  }

  return {
    id: site.id,
    clientId: site.clientId,
    division: site.division,
    commonName: site.commonName,
    siteNumber: site.siteNumber,
    address: site.address,
    floorAndDoor: site.floorAndDoor,
    district: site.district,
    landmark: site.landmark,
    directions: site.directions,
    communeName: site.communeName,
    wilayaCode: site.wilayaCode,
    zoneId: site.zoneId,
    zoneName: site.zoneName ?? null,
    latitude: site.latitude,
    longitude: site.longitude,
    mapLink: site.mapLink,
    buildingsCount: site.buildingsCount,
    allowedDays: codes(site.allowedDays),
    allowedFrom: site.allowedFrom,
    allowedTo: site.allowedTo,
    forbiddenCodes: codes(site.forbiddenCodes),
    forbiddenAreas: site.forbiddenAreas,
    doNotTouch: site.doNotTouch,
    valuables: site.valuables,
    instructionCodes: codes(site.instructionCodes),
    specialInstructions: site.specialInstructions,
    securityInstructionsText: file.securityInstructions === 1 ? site.securityInstructionsText : null,
    ppeCodes: codes(site.ppeCodes),
    meetingPoint: site.meetingPoint,
    keysHeld: site.keysHeld === 1,
    keyHolderName: site.keyHolderName,
    sameWorkerRule: site.sameWorkerRule === 1,
    womenOnly: site.womenOnly === 1,
    requiredAbilityCodes: codes(site.requiredAbilityCodes),
    photoConsent: site.photoConsent === 1,
    personOnSite,
  };
}
