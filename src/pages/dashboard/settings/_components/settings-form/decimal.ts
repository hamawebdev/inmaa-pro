/**
 * Numbers as the office types them in a settings form, and back.
 *
 * Stored values are whole numbers in a small unit (centimes, basis points,
 * minutes, thousandths of a day); the form shows them in the unit people say
 * (dinars, percent, hours, days), with a comma before the decimals, as the
 * program writes amounts («195.650,00»). Both a comma and a dot are taken as
 * the decimal mark when typed; a dot followed by three digits is a thousands
 * mark («1.500» is fifteen hundred).
 */

/** The stored whole number as typed text: `scale` small units to one shown unit. */
export function toTyped(stored: number | null | undefined, scale: number): string {
  if (stored === null || stored === undefined) return "";
  const shown = stored / scale;
  if (Number.isInteger(shown)) return String(shown);
  return String(Math.round(shown * 1000) / 1000).replace(".", ",");
}

/**
 * Typed text to the stored whole number, or `undefined` when it is not a
 * number. Empty text is `null` ("not set").
 */
export function fromTyped(text: string, scale: number): number | null | undefined {
  let typed = text
    .trim()
    .replace(/\s+/g, "")
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660));
  if (typed === "") return null;
  if (typed.includes(",")) typed = typed.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(typed)) typed = typed.replace(/\./g, "");
  if (!/^-?\d+(\.\d+)?$/.test(typed)) return undefined;
  return Math.round(Number(typed) * scale);
}
