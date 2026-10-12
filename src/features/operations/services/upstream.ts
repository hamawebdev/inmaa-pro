import type { Executor } from "@/lib/service/context";
import type { LocalDate, LocalTime } from "@/lib/units";

/**
 * What Operations reads of other owners' rows, in one place.
 *
 * CONTRACTS.md section 3 names the read functions the owners will export
 * (`getFileForScheduling` and `getSiteForOrder` from Clients,
 * `listSchedulableWorkers` and `getStaffSummary` from People). Until they
 * exist, these read the columns section 2 lets Operations read, read-only, and
 * nothing else. When an owner's function lands, its reader here becomes a call
 * to it and nothing else in this folder changes.
 */

/** A set of ticks stored as a JSON array of codes. Empty or unreadable is no tick. */
export function parseCodes(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((code): code is string => typeof code === "string") : [];
  } catch {
    return [];
  }
}

// ── The file (Clients) ──────────────────────────────────────────────────────

/** The schedule fields of a file, exactly as typed, without any amount. */
export interface FileForScheduling {
  id: string;
  number: string;
  division: string;
  serviceType: string;
  stage: string;
  clientId: string;
  siteId: string;
  clientName: string;
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
  endedDate: LocalDate | null;
  closedAt: string | null;
}

const yesNo = (value: number | null) => (value === null ? null : value === 1);

/** Stands in for Clients' `getFileForScheduling(fileId)`. */
export async function readFileForScheduling(ex: Executor, fileId: string): Promise<FileForScheduling | null> {
  const row = await ex
    .selectFrom("File")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select([
      "File.id",
      "File.number",
      "File.division",
      "File.serviceType",
      "File.stage",
      "File.clientId",
      "File.siteId",
      "Client.name as clientName",
      "File.executionDays",
      "File.period",
      "File.periodFrom",
      "File.periodTo",
      "File.startDate",
      "File.endDate",
      "File.arrivalTime",
      "File.departureTime",
      "File.workersCount",
      "File.visitsPerWeek",
      "File.requestKinds",
      "File.executionDurationValue",
      "File.executionDurationUnit",
      "File.teamAccess",
      "File.hasGuard",
      "File.guardName",
      "File.guardPhone",
      "File.securityInstructions",
      "File.materialsBearer",
      "File.transportBearer",
      "File.equipmentStorage",
      "File.storagePlace",
      "File.endedDate",
      "File.closedAt",
    ])
    .where("File.id", "=", fileId)
    .where("File.deletedAt", "is", null)
    .executeTakeFirst();
  if (!row) return null;
  return {
    id: row.id,
    number: row.number,
    division: row.division,
    serviceType: row.serviceType,
    stage: row.stage,
    clientId: row.clientId,
    siteId: row.siteId,
    clientName: row.clientName,
    executionDays: parseCodes(row.executionDays),
    period: row.period,
    periodFrom: row.periodFrom,
    periodTo: row.periodTo,
    startDate: row.startDate,
    endDate: row.endDate,
    arrivalTime: row.arrivalTime,
    departureTime: row.departureTime,
    workersCount: row.workersCount,
    visitsPerWeek: row.visitsPerWeek,
    requestKinds: parseCodes(row.requestKinds),
    executionDuration: row.executionDurationValue === null ? null : row.executionDurationValue / 1000,
    executionDurationUnit: row.executionDurationUnit,
    teamAccess: parseCodes(row.teamAccess),
    hasGuard: yesNo(row.hasGuard),
    guardName: row.guardName,
    guardPhone: row.guardPhone,
    securityInstructions: yesNo(row.securityInstructions),
    materialsBearer: row.materialsBearer,
    transportBearer: row.transportBearer,
    equipmentStorage: yesNo(row.equipmentStorage),
    storagePlace: row.storagePlace,
    endedDate: row.endedDate,
    closedAt: row.closedAt,
  };
}

/** The service ticks of a file («الخدمات المقدمة», «الخدمات المبرمجة»), in print order. */
export interface FileServiceTick {
  list: string;
  code: string | null;
  customLabel: string | null;
}

export async function readFileServices(
  ex: Executor,
  fileIds: readonly string[],
): Promise<Map<string, FileServiceTick[]>> {
  const byFile = new Map<string, FileServiceTick[]>();
  if (fileIds.length === 0) return byFile;
  const rows = await ex
    .selectFrom("FileService")
    .select(["fileId", "list", "code", "customLabel"])
    .where("fileId", "in", [...new Set(fileIds)])
    .orderBy("fileId")
    .orderBy("list", "desc") // PROVIDED before PROGRAMMED
    .orderBy("sortOrder")
    .execute();
  for (const row of rows) {
    const list = byFile.get(row.fileId) ?? [];
    list.push({ list: row.list, code: row.code, customLabel: row.customLabel });
    byFile.set(row.fileId, list);
  }
  return byFile;
}

// ── The site (Clients) ──────────────────────────────────────────────────────

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
  personOnSite: PersonOnSite | null;
}

/** Stands in for Clients' `getSiteForOrder(siteId, fileId)`. */
export async function readSiteForOrder(
  ex: Executor,
  input: { siteId: string; securityTicked: boolean },
): Promise<SiteForOrder | null> {
  const site = await ex
    .selectFrom("Site")
    .innerJoin("Commune", "Commune.id", "Site.communeId")
    .leftJoin("Zone", "Zone.id", "Site.zoneId")
    .innerJoin("Client", "Client.id", "Site.clientId")
    .selectAll("Site")
    .select([
      "Commune.nameAr as communeName",
      "Commune.wilayaCode as wilayaCode",
      "Zone.name as zoneName",
      "Client.name as clientName",
      "Client.capacity as clientCapacity",
      "Client.managerName as clientManagerName",
      "Client.phone1 as clientPhone",
    ])
    .where("Site.id", "=", input.siteId)
    .executeTakeFirst();
  if (!site) return null;

  // The site's receiver when filled, else the site's coordinator, else the client (CONTRACTS.md section 3).
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
      : {
          name: site.clientManagerName ?? site.clientName,
          role: site.clientCapacity,
          phone: site.clientPhone,
        };
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
    zoneName: site.zoneName,
    allowedDays: parseCodes(site.allowedDays),
    allowedFrom: site.allowedFrom,
    allowedTo: site.allowedTo,
    forbiddenCodes: parseCodes(site.forbiddenCodes),
    forbiddenAreas: site.forbiddenAreas,
    doNotTouch: site.doNotTouch,
    valuables: site.valuables,
    instructionCodes: parseCodes(site.instructionCodes),
    specialInstructions: site.specialInstructions,
    securityInstructionsText: input.securityTicked ? site.securityInstructionsText : null,
    ppeCodes: parseCodes(site.ppeCodes),
    meetingPoint: site.meetingPoint,
    keysHeld: site.keysHeld === 1,
    keyHolderName: site.keyHolderName,
    sameWorkerRule: site.sameWorkerRule === 1,
    womenOnly: site.womenOnly === 1,
    requiredAbilityCodes: parseCodes(site.requiredAbilityCodes),
    photoConsent: site.photoConsent === 1,
    personOnSite,
  };
}

// ── Workers (People) ────────────────────────────────────────────────────────

/** Engagement states in which a worker may be given seats. */
export const SCHEDULABLE_ENGAGEMENTS = ["ON_TRIAL", "ACCEPTED"] as const;

/** A cleaning worker as scheduling sees her. Never anything of `StaffConfidential`. */
export interface SchedulableWorker {
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  sex: string;
  phone: string;
  zoneId: string | null;
  role: string | null;
  isReserve: boolean;
  weeklyCapacityMin: number;
  availableDays: string[];
  abilities: string[];
  engagementStatus: string;
}

/**
 * Stands in for People's `listSchedulableWorkers`. Without `ids`, the workers
 * that may be given seats; with them, those workers whatever their state (an
 * order names a worker who has left since).
 */
export async function readWorkers(ex: Executor, input: { ids?: readonly string[] } = {}): Promise<SchedulableWorker[]> {
  let query = ex
    .selectFrom("StaffMember")
    .select([
      "id",
      "number",
      "firstName",
      "lastName",
      "sex",
      "phone",
      "zoneId",
      "role",
      "isReserve",
      "weeklyCapacityMin",
      "availableDays",
      "abilities",
      "engagementStatus",
    ])
    .where("kind", "=", "WORKER");
  if (input.ids) {
    if (input.ids.length === 0) return [];
    query = query.where("id", "in", [...new Set(input.ids)]);
  } else {
    query = query.where("deletedAt", "is", null).where("engagementStatus", "in", [...SCHEDULABLE_ENGAGEMENTS]);
  }
  const rows = await query.orderBy("lastName").orderBy("firstName").execute();
  return rows.map((row) => ({
    id: row.id,
    number: row.number,
    firstName: row.firstName,
    lastName: row.lastName,
    sex: row.sex,
    phone: row.phone,
    zoneId: row.zoneId,
    role: row.role,
    isReserve: row.isReserve === 1,
    weeklyCapacityMin: row.weeklyCapacityMin,
    availableDays: parseCodes(row.availableDays),
    abilities: parseCodes(row.abilities),
    engagementStatus: row.engagementStatus,
  }));
}

/** Names of employees (supervisors), for labels. Stands in for People's `getStaffSummary`. */
export async function readStaffNames(
  ex: Executor,
  ids: readonly (string | null)[],
): Promise<Map<string, { firstName: string; lastName: string; phone: string }>> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  const names = new Map<string, { firstName: string; lastName: string; phone: string }>();
  if (wanted.length === 0) return names;
  const rows = await ex
    .selectFrom("StaffMember")
    .select(["id", "firstName", "lastName", "phone"])
    .where("id", "in", wanted)
    .execute();
  for (const row of rows) names.set(row.id, { firstName: row.firstName, lastName: row.lastName, phone: row.phone });
  return names;
}
