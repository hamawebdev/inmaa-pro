import type { Executor } from "@/lib/service/context";
import { getSettings } from "@/lib/settings";

import type { StampSettings } from "../rules/stamp-duty";
import { MISSED_VISIT_RULES, type MissedVisitRule, type TaxMode } from "../validators/option-codes";

/**
 * The settings Money's documents are computed from, read in the action that
 * uses them and never kept: a rule changed in Settings applies to the next
 * invoice or payment, and never to one already written (which froze its own).
 */

export async function readStampSettings(ex: Executor): Promise<StampSettings> {
  const stamp = await getSettings(ex, [
    "stamp.enabled",
    "stamp.mode",
    "stamp.bands",
    "stamp.exemptBelow",
    "stamp.minimum",
    "stamp.maximum",
    "stamp.roundUpToDinar",
  ]);
  return {
    enabled: stamp["stamp.enabled"],
    mode: stamp["stamp.mode"],
    bands: stamp["stamp.bands"],
    exemptBelow: stamp["stamp.exemptBelow"],
    minimum: stamp["stamp.minimum"],
    maximum: stamp["stamp.maximum"],
    roundUpToDinar: stamp["stamp.roundUpToDinar"],
  };
}

export interface TaxSettings {
  /** Null until the centre says which regime it is under (asked at first run). */
  mode: TaxMode | null;
  vatRate: number;
  pricesIncludeVat: boolean;
  ifuMention: { ar: string; fr: string };
}

export async function readTaxSettings(ex: Executor): Promise<TaxSettings> {
  const tax = await getSettings(ex, ["tax.mode", "tax.vatRate", "tax.pricesIncludeVat", "tax.ifuMention"]);
  return {
    mode: tax["tax.mode"],
    vatRate: tax["tax.vatRate"],
    pricesIncludeVat: tax["tax.pricesIncludeVat"],
    ifuMention: tax["tax.ifuMention"],
  };
}

export interface MissedVisitSettings {
  rule: MissedVisitRule;
  fixedAmount: number | null;
  requireSignOff: boolean;
}

export async function readInvoiceSettings(ex: Executor): Promise<MissedVisitSettings> {
  const invoice = await getSettings(ex, [
    "invoice.missedVisitRule",
    "invoice.missedVisitAmount",
    "invoice.requireSignOff",
  ]);
  const rule = invoice["invoice.missedVisitRule"];
  return {
    rule: (MISSED_VISIT_RULES as readonly string[]).includes(rule) ? (rule as MissedVisitRule) : "BILL_DONE_ONLY",
    fixedAmount: invoice["invoice.missedVisitAmount"],
    requireSignOff: invoice["invoice.requireSignOff"],
  };
}
