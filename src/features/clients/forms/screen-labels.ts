import { FORM_KIND_OF, type FormKind, type OptionListName } from "../validators/option-lists";

import { FORM_DEFINITIONS } from "./definitions";
import type { FormRow } from "./types";
import type { FieldKey } from "./values";

/**
 * How his forms are laid out on screen: one card per heading of his, in his
 * order, and the message keys of the labels.
 *
 * Five answers are worded differently on sibling forms («اللقب والاسم»,
 * «اسم المؤسسة», «اسم المسئول»): their label has one key per wording, and
 * src/features/clients/messages.test.ts checks that the Arabic of each key is
 * the wording of every form that uses it.
 */

/** What the wording of a label follows, for the answers his forms word differently. */
const LABEL_VARIANTS: Partial<Record<FieldKey, "family" | "serviceType">> = {
  siteNumber: "family",
  clientName: "family",
  firstVisitDate: "family",
  firstDueDate: "serviceType",
  hasGuard: "serviceType",
};

/** The key of an answer's label under `FileForm.Labels`. */
export function labelKeyOf(kind: FormKind, key: FieldKey): string {
  const variant = LABEL_VARIANTS[key];
  if (variant === "family") return `${key}.${FORM_DEFINITIONS[kind].family}`;
  if (variant === "serviceType") return `${key}.${FORM_KIND_OF[kind].serviceType}`;
  return key;
}

export type CardId =
  | "basic"
  | "description"
  | "residentsInfo"
  | "buildingSpecs"
  | "provided"
  | "programmed"
  | "financial"
  | "residents";

/** His headings, and the card each one opens (its title's key under `FileForm.Cards`). */
export const HEADING_CARDS: Readonly<Record<string, { id: CardId; titleKey: string }>> = {
  "المعلومات الأساسية للسكن": { id: "basic", titleKey: "basic.HOUSING" },
  "المعلومات الأساسية للمؤسسة": { id: "basic", titleKey: "basic.ORGANISATION" },
  "المعلومات الأساسية للعميل": { id: "basic", titleKey: "basic.BUILDING" },
  "الوصف الفني للموقع": { id: "description", titleKey: "description" },
  "معلومات السكان": { id: "residentsInfo", titleKey: "residentsInfo" },
  "مواصفات العمارة": { id: "buildingSpecs", titleKey: "buildingSpecs" },
  "الخدمات المقدمة": { id: "provided", titleKey: "provided" },
  "نوع الخدمة المبرمجة": { id: "programmed", titleKey: "programmed.HOUSING" },
  "الخدمات المبرمجة": { id: "programmed", titleKey: "programmed.OTHER" },
  "الدراسة المالية": { id: "financial", titleKey: "financial" },
  "قائمة القاطنين بالعمارة": { id: "residents", titleKey: "residents" },
};

export interface ScreenCard {
  id: CardId;
  titleKey: string;
  /** The rows of his form under that heading that take an answer, in his order. */
  rows: FormRow[];
}

const CARDS = new Map<FormKind, ScreenCard[]>();

/** The cards of a form, in his order. The header (number and date) and the signature are not among them. */
export function screenCardsOf(kind: FormKind): ScreenCard[] {
  let cards = CARDS.get(kind);
  if (cards) return cards;
  cards = [];
  let current: ScreenCard | null = null;
  for (const row of FORM_DEFINITIONS[kind].rows) {
    if (row.role === "heading") {
      const card = HEADING_CARDS[row.label];
      if (!card) throw new Error(`clients: no card for the heading «${row.label}»`);
      current = { ...card, rows: [] };
      cards.push(current);
      continue;
    }
    if (current && row.key !== null && row.role !== "signature") current.rows.push(row);
  }
  CARDS.set(kind, cards);
  return cards;
}

/** The answers of the header, above his first heading: his number and his date. */
export function headerRowsOf(kind: FormKind): FormRow[] {
  const rows = FORM_DEFINITIONS[kind].rows;
  const first = rows.findIndex((row) => row.role === "heading");
  return rows.slice(0, first).filter((row) => row.key !== null);
}

/** The title in his form's box: «نوع الخدمة : عقد (عمارة)». */
export function formTitleOf(kind: FormKind): string {
  return FORM_DEFINITIONS[kind].rows.find((row) => row.role === "title")?.label ?? "";
}

/**
 * Where a list's codes are labelled on screen: Foundation's shared lists under
 * `Options.`, ours under `FileOptions.`. In Arabic a form shows his own words
 * from the definition instead, so a weekday reads «الاثنين» as his client forms
 * write it.
 */
export const LIST_NAMESPACES: Readonly<Record<OptionListName, string>> = {
  DIVISION: "Options.Division",
  SERVICE_TYPE: "Options.ServiceType",
  FILE_STATUS_TICK: "FileOptions.StatusTick",
  PROPERTY_TYPE_HOUSING: "FileOptions.PropertyTypeHousing",
  PROPERTY_TYPE_ORGANISATION: "FileOptions.PropertyTypeOrganisation",
  OWNERSHIP: "FileOptions.Ownership",
  SECTOR: "FileOptions.Sector",
  CONTRACTING_PARTY: "FileOptions.ContractingParty",
  CLEANLINESS: "Options.Cleanliness",
  YES_NO: "Options.YesNo",
  WASTE_DISPOSAL: "FileOptions.WasteDisposal",
  RESIDENT_TURNOVER: "FileOptions.ResidentTurnover",
  CONTRACT_KIND: "FileOptions.ContractKind",
  CONTRACT_DURATION: "FileOptions.ContractDuration",
  VISITS_PER_WEEK: "FileOptions.VisitsPerWeek",
  REQUEST_KIND: "FileOptions.RequestKind",
  WEEKDAY: "Options.Weekday",
  DAY_PERIOD: "Options.DayPeriod",
  BEARER: "Options.Bearer",
  PAYMENT_METHOD: "Options.PaymentMethod",
  PAYMENT_FREQUENCY: "Options.PaymentFrequency",
  TEAM_ACCESS: "Options.TeamAccess",
  PROVIDED_SERVICE: "Options.ProvidedService",
  PROGRAMMED_SERVICE: "Options.ProgrammedService",
};
