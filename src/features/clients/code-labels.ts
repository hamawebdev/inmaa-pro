import type { CodeLabelCase } from "@/i18n/code-labels";

import {
  CLOSE_REASONS,
  codesOf,
  END_KINDS,
  FORM_KINDS,
  PRIORITIES,
  REQUEST_SOURCES,
  type OptionListName,
} from "./validators/option-lists";
import { COST_LINES, QUOTE_LINE_KINDS, QUOTE_RESULTS, QUOTE_STATUSES } from "./validators/pricing";

/**
 * The stored codes this folder shows through `useCodeLabel`, each paired with
 * the message namespace that labels them.
 *
 *     ["Workers.Genders", WORKER_GENDERS]
 *
 * src/i18n/code-labels.test.ts fails when a code has no label in one of the
 * three languages, which is what stops "FULL_DAY" appearing on an Arabic screen.
 *
 * The lists his forms share with other owners are labelled by Foundation under
 * `Options.` (src/lib/options); ours are under `FileOptions.`.
 */
const OURS: ReadonlyArray<[string, OptionListName]> = [
  ["FileOptions.StatusTick", "FILE_STATUS_TICK"],
  ["FileOptions.PropertyTypeHousing", "PROPERTY_TYPE_HOUSING"],
  ["FileOptions.PropertyTypeOrganisation", "PROPERTY_TYPE_ORGANISATION"],
  ["FileOptions.Ownership", "OWNERSHIP"],
  ["FileOptions.Sector", "SECTOR"],
  ["FileOptions.ContractingParty", "CONTRACTING_PARTY"],
  ["FileOptions.WasteDisposal", "WASTE_DISPOSAL"],
  ["FileOptions.ResidentTurnover", "RESIDENT_TURNOVER"],
  ["FileOptions.ContractKind", "CONTRACT_KIND"],
  ["FileOptions.ContractDuration", "CONTRACT_DURATION"],
  ["FileOptions.VisitsPerWeek", "VISITS_PER_WEEK"],
  ["FileOptions.RequestKind", "REQUEST_KIND"],
];

export const codeLabelCases: readonly CodeLabelCase[] = [
  ["FileForms.Kinds", FORM_KINDS],
  ...OURS.map(([namespace, list]): CodeLabelCase => [namespace, codesOf(list)]),
  ["FileOptions.RequestSource", REQUEST_SOURCES],
  ["FileOptions.Priority", PRIORITIES],
  ["FileOptions.CloseReason", CLOSE_REASONS],
  ["FileOptions.EndKind", END_KINDS],
  ["FileOptions.CostLine", COST_LINES],
  ["FileOptions.QuoteStatus", QUOTE_STATUSES],
  ["FileOptions.QuoteResult", QUOTE_RESULTS],
  ["FileOptions.QuoteLineKind", QUOTE_LINE_KINDS],
];
