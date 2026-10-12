import type { FormDefinition } from "../types";

import { BUILDING_CONTRACT } from "./building-contract";

/**
 * The complexes copy of the building contract (scope A1): his building sheet
 * with another title, «نوع الخدمة : عقد (تجمع سكني)». Nothing else changes:
 * «رقم العمارة», «مواصفات العمارة» and «قائمة القاطنين بالعمارة» stay as he wrote
 * them. He has named no suffix for its registration number, so the place after
 * the slash is a blank, as on his organisation and home forms.
 */
const TITLE = "نوع الخدمة : عقد (تجمع سكني)";

export const COMPLEX_CONTRACT: FormDefinition = {
  ...BUILDING_CONTRACT,
  kind: "COMPLEX_CONTRACT",
  registrationSuffix: null,
  rows: BUILDING_CONTRACT.rows.map((row) => (row.role === "title" ? { ...row, raw: TITLE, label: TITLE } : row)),
};
