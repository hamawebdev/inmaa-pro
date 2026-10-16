import { fileSequenceKey, formatNumber } from "@/lib/numbering";

import type { FormDefinition } from "../forms/types";
import type { FormKind } from "../validators/option-lists";

/**
 * «رقم التسجيل»: a sequence, a slash, a suffix (scope P3, A6).
 *
 * The number itself is Foundation's (src/lib/numbering): one counter per kind
 * of form, never restarted, and a suffix per kind from the setting
 * `numbering.fileSuffix`, which starts as his: «BLC» on the building contract,
 * nothing on the four others until he names theirs. What is ours is how the
 * number sits on his sheet: his line has two places, one before the slash and
 * one after it.
 */

/** A file's registration number as the program writes it: "31/BLC", or "31" when its form has no suffix. */
export function formatRegistrationNumber(kind: FormKind, sequence: number, suffix: string): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1) {
    throw new RangeError("A registration sequence is a whole number from 1.");
  }
  return formatNumber(fileSequenceKey(kind), sequence, 0, { suffix: suffix.trim() });
}

export interface RegistrationPlaces {
  /** What is written before the slash; "" leaves his blank empty. */
  sequence: string;
  /**
   * What is written after the slash. `null` leaves his blank empty; a string is
   * written in its place, as «BLC» is printed on his building contract.
   */
  suffix: string | null;
}

/**
 * The two places of his line, for a file's number, or for an empty form when
 * there is none. The first slash separates them, so «H/F» stays one suffix.
 *
 * An empty form prints what his Word file prints: «BLC» after the slash on the
 * building contract, a blank on the others. A numbered file prints its own
 * number, which is the same unless the suffix was changed in the settings.
 */
/**
 * What follows the number on paper: nothing (the complexes copy, which has no
 * suffix: the coordinator's ruling on B-002), a slash and a blank (a suffix he
 * has not named), or the suffix joined to its slash («/BLC»).
 */
export function suffixPlaceOf(definition: FormDefinition, places: RegistrationPlaces): "NONE" | "BLANK" | "SUFFIX" {
  if (places.suffix !== null) return "SUFFIX";
  return definition.registrationSuffixPlace === false ? "NONE" : "BLANK";
}

export function registrationPlaces(definition: FormDefinition, number: string | undefined): RegistrationPlaces {
  if (number === undefined || number.trim() === "") {
    return { sequence: "", suffix: definition.registrationSuffix };
  }
  const slash = number.indexOf("/");
  if (slash < 0) return { sequence: number.trim(), suffix: null };
  const suffix = number.slice(slash + 1).trim();
  return { sequence: number.slice(0, slash).trim(), suffix: suffix === "" ? null : suffix };
}
