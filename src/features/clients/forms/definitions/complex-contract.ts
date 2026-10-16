import type { FormDefinition } from "../types";

import { BUILDING_CONTRACT } from "./building-contract";

/**
 * The complexes copy of the building contract (scope A1): his building sheet
 * with another title, «نوع الخدمة : عقد (تجمع سكني)». Nothing else changes:
 * «رقم العمارة», «مواصفات العمارة» and «قائمة القاطنين بالعمارة» stay as he wrote
 * them. Its file has no suffix (scope section 10, item 2): its registration
 * number prints alone, with no slash and no blank after it (ruling on B-002).
 */
const TITLE = "نوع الخدمة : عقد (تجمع سكني)";

export const COMPLEX_CONTRACT: FormDefinition = {
  ...BUILDING_CONTRACT,
  kind: "COMPLEX_CONTRACT",
  registrationSuffix: null,
  registrationSuffixPlace: false,
  rows: BUILDING_CONTRACT.rows.map((row) => (row.role === "title" ? { ...row, raw: TITLE, label: TITLE } : row)),
};
