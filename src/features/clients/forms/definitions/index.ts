import { FORM_KINDS, type FormKind } from "../../validators/option-lists";
import type { FormDefinition, FormRow } from "../types";

import { BUILDING_CONTRACT } from "./building-contract";
import { COMPLEX_CONTRACT } from "./complex-contract";
import { HOUSING_CONTRACT } from "./housing-contract";
import { HOUSING_REQUEST } from "./housing-request";
import { ORG_CONTRACT } from "./org-contract";
import { ORG_REQUEST } from "./org-request";

/** His five forms and the complexes copy, by kind. */
export const FORM_DEFINITIONS: Record<FormKind, FormDefinition> = {
  HOUSING_REQUEST,
  HOUSING_CONTRACT,
  ORG_REQUEST,
  ORG_CONTRACT,
  BUILDING_CONTRACT,
  COMPLEX_CONTRACT,
};

/** A form's row by the Checker's id. Throws on an id the form does not have: a definition that names one is broken. */
export function rowOf(definition: FormDefinition, id: string): FormRow {
  const row = definition.rows.find((candidate) => candidate.id === id);
  if (!row) throw new Error(`The form ${definition.kind} has no row ${id}.`);
  return row;
}

export interface FormSection {
  heading: FormRow;
  rows: FormRow[];
}

/** The numbered sections of a form in his order, each with the rows under its heading. */
export function sectionsOf(definition: FormDefinition): FormSection[] {
  const sections: FormSection[] = [];
  for (const row of definition.rows) {
    if (row.role === "heading") sections.push({ heading: row, rows: [] });
    else if (sections.length > 0) sections[sections.length - 1].rows.push(row);
  }
  return sections;
}

/** A kind of form in a path: "HOUSING_REQUEST" is "housing-request". */
export function formKindSlug(kind: FormKind): string {
  return kind.toLowerCase().replaceAll("_", "-");
}

/** The kind of form a path names, or null. */
export function formKindFromSlug(slug: string): FormKind | null {
  return FORM_KINDS.find((kind) => formKindSlug(kind) === slug) ?? null;
}
