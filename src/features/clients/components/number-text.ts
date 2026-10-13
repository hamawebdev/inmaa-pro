import { normaliseTyped } from "@/features/clients/validators/file-screen";

/**
 * The whole numbers this program stores (centimes, thousandths, basis points,
 * minutes) as a field shows them and as a person types them.
 */

/** How a stored whole number is typed: its decimal places. */
export const NUMBER_PLACES = { count: 0, money: 2, qty: 3, percent: 2, hours: 2 } as const;
export type NumberKind = keyof typeof NUMBER_PLACES;

/** A stored number as the field shows it: digits, a comma before the decimals, no grouping. */
export function shownNumber(kind: NumberKind, value: number | null | undefined): string {
  if (value === null || value === undefined) return "";
  // Hours are stored as minutes; a percentage as basis points, which are hundredths already.
  const places = NUMBER_PLACES[kind];
  const units = kind === "hours" ? Math.round((value * 100) / 60) : value;
  if (places === 0) return String(units);
  const scale = 10 ** places;
  const whole = Math.floor(units / scale);
  const fraction = String(units % scale)
    .padStart(places, "0")
    .replace(/0+$/, "");
  return fraction ? `${whole},${fraction}` : String(whole);
}

/** What was typed as the stored number; null when empty, undefined when it is not a number. */
export function typedNumber(kind: NumberKind, typed: string): number | null | undefined {
  const text = normaliseTyped(typed);
  if (text === "") return null;
  const places = NUMBER_PLACES[kind];
  const match = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (!match || (match[2] ?? "").length > places) return undefined;
  const units = Number(match[1]) * 10 ** places + Number((match[2] ?? "").padEnd(places, "0") || "0");
  if (!Number.isSafeInteger(units)) return undefined;
  return kind === "hours" ? Math.round((units * 60) / 100) : units;
}
