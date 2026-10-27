import type { Selectable, Updateable } from "kysely";

import type { DB } from "@/lib/db/schema";

import { FORM_DEFINITIONS } from "./definitions";
import { freeSlot, optionCode } from "./answers";
import { blankCountOf } from "./catalogue";
import type { FormRow, ResolvedDefinition } from "./types";
import type { FieldKey, FormValues, ResidentLine } from "./values";
import type { FormKind } from "../validators/option-lists";

/**
 * Where each answer of his sheets is kept, and the way back.
 *
 * A file's sheet is drawn from five tables: who the client is (`Client`), where
 * the site is (`Site` and its `Commune`), the header and the whole financial
 * study (`File`), the site description of the form's family
 * (`FileDescription`) and the two lists of services (`FileService`). Page 3 of
 * a building form is the site's `Resident` rows.
 *
 * Pure functions. A form writes only the answers it prints: a column another
 * form prints is left alone, which is how a housing request never empties the
 * «مدير/ مسير» of an organisation's client. A set of ticks is a JSON array of
 * codes, `[]` when nothing is ticked; a yes / no is 1, 0, or null when neither
 * box is ticked (docs/data-model/DESIGN.md section 3).
 */

export type FileRow = Selectable<DB["File"]>;
export type ClientRow = Selectable<DB["Client"]>;
export type SiteRow = Selectable<DB["Site"]>;
export type DescriptionRow = Selectable<DB["FileDescription"]>;
export type ServiceRow = Selectable<DB["FileService"]>;
export type ResidentRow = Selectable<DB["Resident"]>;

/** Who the client is: the answers kept on `Client`, and their column. */
export const CLIENT_COLUMNS = {
  clientName: "name",
  managerName: "managerName",
  capacity: "capacity",
  contractingParty: "contractingParty",
  contractingPartyOther: "contractingPartyOther",
  sector: "sector",
  hasTradeRegister: "hasTradeRegister",
  phone: "phone1",
} as const satisfies Partial<Record<FieldKey, keyof ClientRow>>;

/** Where the site is: the answers kept on `Site`. The commune and the wilaya are its `Commune` row. */
export const SITE_COLUMNS = {
  siteNumber: "siteNumber",
  commonName: "commonName",
  address: "address",
  propertyType: "propertyType",
  propertyTypeOther: "propertyTypeOther",
  ownership: "ownership",
} as const satisfies Partial<Record<FieldKey, keyof SiteRow>>;

/** The answers kept on `File` under their own name: the first visit, storage, waste, and the financial study. */
export const FILE_ANSWER_KEYS = [
  "firstVisitDate",
  "cleanliness",
  "cleanlinessNote",
  "equipmentStorage",
  "storagePlace",
  "wasteDisposal",
  "wasteDisposalOther",
  "contractKind",
  "contractKindNote",
  "contractDuration",
  "contractDurationNote",
  "visitsPerWeek",
  "paymentFrequency",
  "requestKinds",
  "requestKindNote",
  "executionDurationValue",
  "executionDurationUnit",
  "executionDays",
  "period",
  "periodFrom",
  "periodTo",
  "startDate",
  "endDate",
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
  "firstDueDate",
  "paymentPlace",
  "teamAccess",
  "hasGuard",
  "securityInstructions",
  "guardName",
  "guardPhone",
  "issuedDate",
] as const satisfies readonly (FieldKey & keyof FileRow)[];
export type FileAnswerKey = (typeof FILE_ANSWER_KEYS)[number];

/** «الوصف الفني للموقع», «معلومات السكان» and «مواصفات العمارة»: kept on `FileDescription` under their own name. */
export const DESCRIPTION_KEYS = [
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
] as const satisfies readonly (FieldKey & keyof DescriptionRow)[];
export type DescriptionKey = (typeof DESCRIPTION_KEYS)[number];

/** The two lists of `FileService`, and the answers that tick them. */
export const SERVICE_LISTS = {
  PROVIDED: { key: "providedServices", freeKey: "providedServicesCustom" },
  PROGRAMMED: { key: "programmedServices", freeKey: "programmedServicesCustom" },
} as const satisfies Record<string, { key: FieldKey; freeKey: FieldKey }>;
export type ServiceList = keyof typeof SERVICE_LISTS;

/** Several ticks: a JSON array of codes. */
const SET_KEYS: ReadonlySet<FieldKey> = new Set([
  "wasteDisposal",
  "requestKinds",
  "executionDays",
  "paymentMethods",
  "teamAccess",
]);

/** A yes / no: 1, 0 or null. */
const YES_NO_KEYS: ReadonlySet<FieldKey> = new Set([
  "hasTradeRegister",
  "equipmentStorage",
  "hasGuard",
  "securityInstructions",
  "hasBasements",
  "hasGreenSpaces",
  "hasGarages",
  "hasSharedRoofs",
]);

/** The header and what the program ticks: read from the file, never written from the form. */
const HEADER_KEYS: ReadonlySet<FieldKey> = new Set([
  "registrationNumber",
  "registrationDate",
  "dossierNumber",
  "statusTicks",
]);

/**
 * What the sheet of a signed contract prints from `Client` and `Site`, frozen at
 * «متعاقد» in `File.partySnapshot`, so a signed contract never reprints under a
 * name that did not sign it (DESIGN.md section 17).
 */
export const PARTY_KEYS = [
  "dossierNumber",
  "clientName",
  "managerName",
  "capacity",
  "contractingParty",
  "contractingPartyOther",
  "sector",
  "hasTradeRegister",
  "phone",
  "siteNumber",
  "commonName",
  "address",
  "commune",
  "wilaya",
  "propertyType",
  "propertyTypeOther",
  "ownership",
] as const satisfies readonly FieldKey[];
export type PartyKey = (typeof PARTY_KEYS)[number];
export type PartySnapshot = Partial<Pick<FormValues, PartyKey>>;

// ── Which answers a form has ─────────────────────────────────────────────────

function keysOfRow(row: FormRow): FieldKey[] {
  return [row.key, row.noteKey, row.otherKey, row.freeKey, row.pairKey, row.labelKey].filter(
    (key): key is FieldKey => key !== null && key !== undefined,
  );
}

const PRINTED = new Map<FormKind, ReadonlySet<FieldKey>>();

/** Every answer the sheet of this form prints, header included. */
export function printedKeys(kind: FormKind): ReadonlySet<FieldKey> {
  let keys = PRINTED.get(kind);
  if (!keys) {
    keys = new Set(FORM_DEFINITIONS[kind].rows.flatMap(keysOfRow));
    PRINTED.set(kind, keys);
  }
  return keys;
}

/** The row of a form that ticks a list of services, if the form prints that list. */
export function serviceRowOf(kind: FormKind, list: ServiceList): FormRow | undefined {
  return FORM_DEFINITIONS[kind].rows.find((row) => row.key === SERVICE_LISTS[list].key);
}

// ── From the stored rows to his sheet ────────────────────────────────────────

function parseSet(text: string | null): string[] | undefined {
  if (text === null) return undefined;
  const value: unknown = JSON.parse(text);
  if (!Array.isArray(value) || !value.every((code) => typeof code === "string")) {
    throw new Error(`clients: a set of ticks is not a list of codes: ${text}`);
  }
  return value;
}

function readValue(key: FieldKey, stored: unknown): unknown {
  if (stored === null || stored === undefined) return undefined;
  if (SET_KEYS.has(key)) return parseSet(stored as string);
  if (YES_NO_KEYS.has(key)) return stored === 1 || stored === true;
  if (typeof stored === "string" && stored === "") return undefined;
  return stored;
}

export interface StoredFile {
  kind: FormKind;
  file: Pick<FileRow, "number" | "registrationDate" | "partySnapshot" | "lockedAt"> & Partial<FileRow>;
  client: Partial<ClientRow> & Pick<ClientRow, "number">;
  site: Partial<SiteRow>;
  commune: { nameAr: string; wilayaCode: string } | null;
  description: Partial<DescriptionRow> | null;
  services: readonly Pick<ServiceRow, "list" | "code" | "customLabel" | "blankSlot" | "sortOrder">[];
}

/** The services of one list as his sheet holds them: the codes ticked, and the text on each blank line. */
function servicesOf(kind: FormKind, list: ServiceList, rows: StoredFile["services"]): Partial<FormValues> {
  const row = serviceRowOf(kind, list);
  if (!row) return {};
  const mine = rows.filter((service) => service.list === list).sort((a, b) => a.sortOrder - b.sortOrder);
  const blanks = blankCountOf(row);
  const custom: (string | null)[] = Array.from({ length: blanks }, () => null);
  for (const service of mine) {
    if (service.blankSlot !== null && service.blankSlot >= 1 && service.blankSlot <= blanks) {
      custom[service.blankSlot - 1] = service.customLabel;
    }
  }
  const { key, freeKey } = SERVICE_LISTS[list];
  return {
    [key]: mine.filter((service) => service.code !== null).map((service) => service.code as string),
    ...(blanks > 0 ? { [freeKey]: custom } : {}),
  };
}

/**
 * What a stored file's sheet says: every answer its form prints, the header
 * included. «حالة الملف» is not here: it depends on the client's sanction,
 * which is People's to say (see ../rules/status-ticks.ts).
 *
 * Once the file is signed (`lockedAt`), who the client is and where the site is
 * come from the snapshot taken at «متعاقد», not from the client's record today.
 */
export function formValuesOf(stored: StoredFile): FormValues {
  const printed = printedKeys(stored.kind);
  const values: Record<string, unknown> = {
    registrationNumber: stored.file.number,
    registrationDate: stored.file.registrationDate,
    dossierNumber: stored.client.number,
  };

  for (const [key, column] of Object.entries(CLIENT_COLUMNS) as [FieldKey, keyof ClientRow][]) {
    if (printed.has(key)) values[key] = readValue(key, stored.client[column]);
  }
  for (const [key, column] of Object.entries(SITE_COLUMNS) as [FieldKey, keyof SiteRow][]) {
    if (printed.has(key)) values[key] = readValue(key, stored.site[column]);
  }
  if (printed.has("commune") && stored.commune) {
    values.commune = stored.commune.nameAr;
    values.wilaya = stored.commune.wilayaCode;
  }
  for (const key of FILE_ANSWER_KEYS) {
    if (printed.has(key)) values[key] = readValue(key, stored.file[key]);
  }
  if (stored.description) {
    for (const key of DESCRIPTION_KEYS) {
      if (printed.has(key)) values[key] = readValue(key, stored.description[key]);
    }
  }
  Object.assign(values, servicesOf(stored.kind, "PROVIDED", stored.services));
  Object.assign(values, servicesOf(stored.kind, "PROGRAMMED", stored.services));

  if (stored.file.lockedAt && stored.file.partySnapshot) {
    const snapshot = JSON.parse(stored.file.partySnapshot) as PartySnapshot;
    for (const key of PARTY_KEYS) {
      if (key === "dossierNumber" || printed.has(key)) values[key] = snapshot[key];
    }
  }

  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== undefined)) as FormValues;
}

/** The party values of a sheet, as `File.partySnapshot` keeps them. */
export function partySnapshotOf(values: FormValues): PartySnapshot {
  return Object.fromEntries(
    PARTY_KEYS.filter((key) => values[key] !== undefined).map((key) => [key, values[key]]),
  ) as PartySnapshot;
}

/**
 * The lines page 3 of a building form prints: the residents still there on the
 * day of printing (no `leftDate`, or one after that day), in `number` order.
 */
export function residentLinesOf(residents: readonly ResidentRow[], printDay: string): ResidentLine[] {
  return residents
    .filter((resident) => resident.deletedAt === null && (resident.leftDate === null || resident.leftDate > printDay))
    .sort((a, b) => a.number - b.number)
    .map((resident) => ({
      number: resident.number,
      name: resident.name,
      ...(resident.phone ? { phone: resident.phone } : {}),
      ...(resident.registeredDate ? { registeredDate: resident.registeredDate } : {}),
    }));
}

// ── From his sheet to the stored rows ────────────────────────────────────────

/** A text as typed, trimmed; blank is null. */
export function textOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text === "" ? null : text;
}

function writeValue(key: FieldKey, value: unknown): unknown {
  if (SET_KEYS.has(key)) return JSON.stringify(Array.isArray(value) ? value : []);
  if (YES_NO_KEYS.has(key)) return value === undefined || value === null ? null : value ? 1 : 0;
  if (typeof value === "string") return textOrNull(value);
  if (typeof value === "number") return value;
  return null;
}

export type ClientAnswers = Partial<
  Pick<Updateable<DB["Client"]>, (typeof CLIENT_COLUMNS)[keyof typeof CLIENT_COLUMNS]>
>;
export type SiteAnswers = Partial<Pick<Updateable<DB["Site"]>, (typeof SITE_COLUMNS)[keyof typeof SITE_COLUMNS]>>;
export type FileAnswers = Partial<Pick<Updateable<DB["File"]>, FileAnswerKey>>;
export type DescriptionAnswers = Partial<Pick<Updateable<DB["FileDescription"]>, DescriptionKey>>;

export interface ServiceDraft {
  list: ServiceList;
  code: string | null;
  customLabel: string | null;
  /** Which blank line of the list, from 1; null for a printed option. */
  blankSlot: number | null;
  /** Its place among the options of that form as the catalogue lists them today. Never a change in itself. */
  sortOrder: number;
}

export interface StoredAnswers {
  client: ClientAnswers;
  site: SiteAnswers;
  /** The commune as typed, and the wilaya's code: the service finds or adds the `Commune` row. */
  place: { communeName: string | null; wilayaCode: string | null } | null;
  file: FileAnswers;
  description: DescriptionAnswers;
  /** Every service the sheet ticks or writes, for each list the form prints. */
  services: ServiceDraft[];
  /** The lists this form prints: the others are left alone. */
  serviceLists: ServiceList[];
}

function serviceDrafts(row: FormRow, list: ServiceList, values: FormValues): ServiceDraft[] {
  const ticked = new Set((values[SERVICE_LISTS[list].key] as readonly string[] | undefined) ?? []);
  const lines = (values[SERVICE_LISTS[list].freeKey] as readonly (string | null)[] | undefined) ?? [];
  const drafts: ServiceDraft[] = [];
  (row.options ?? []).forEach((option, index) => {
    if (option.free) {
      const slot = freeSlot(row, index);
      const text = textOrNull(lines[slot]);
      if (text !== null) drafts.push({ list, code: null, customLabel: text, blankSlot: slot + 1, sortOrder: index });
      return;
    }
    const code = optionCode(row.list!, option);
    if (code !== null && ticked.has(code)) {
      drafts.push({ list, code, customLabel: null, blankSlot: null, sortOrder: index });
    }
  });
  return drafts;
}

/**
 * The stored form of a sheet's answers: one patch per table, holding every
 * answer the form prints and nothing else. A blank answer is null (or `[]` for
 * a set), so a save empties what the office emptied. The form is resolved
 * against his service lists (`resolveDefinition`, with the file's own ticks
 * kept): a service it does not list is not stored.
 */
export function storedAnswersOf(definition: ResolvedDefinition, values: FormValues): StoredAnswers {
  const kind = definition.kind;
  const printed = printedKeys(kind);
  const pick = <K extends FieldKey>(key: K) => writeValue(key, values[key]);

  const client: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(CLIENT_COLUMNS) as [FieldKey, string][]) {
    if (printed.has(key)) client[column] = pick(key);
  }
  const site: Record<string, unknown> = {};
  for (const [key, column] of Object.entries(SITE_COLUMNS) as [FieldKey, string][]) {
    if (printed.has(key)) site[column] = pick(key);
  }
  const file: Record<string, unknown> = {};
  for (const key of FILE_ANSWER_KEYS) {
    if (printed.has(key)) file[key] = pick(key);
  }
  const description: Record<string, unknown> = {};
  for (const key of DESCRIPTION_KEYS) {
    if (printed.has(key)) description[key] = pick(key);
  }

  const services: ServiceDraft[] = [];
  const serviceLists: ServiceList[] = [];
  for (const list of Object.keys(SERVICE_LISTS) as ServiceList[]) {
    const row = definition.rows.find((candidate) => candidate.key === SERVICE_LISTS[list].key);
    if (!row) continue;
    serviceLists.push(list);
    services.push(...serviceDrafts(row, list, values));
  }

  return {
    client: client as ClientAnswers,
    site: site as SiteAnswers,
    place: printed.has("commune")
      ? { communeName: textOrNull(values.commune), wilayaCode: textOrNull(values.wilaya) }
      : null,
    file: file as FileAnswers,
    description: description as DescriptionAnswers,
    services,
    serviceLists,
  };
}

/** Whether an answer is part of the header or ticked by the program: never written from the form. */
export function isHeaderKey(key: FieldKey): boolean {
  return HEADER_KEYS.has(key);
}
