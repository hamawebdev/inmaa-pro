/**
 * Quantities are whole thousandths of their unit, everywhere: 13 visits is
 * 13 000, a litre and a half is 1 500. No quantity is a floating-point number.
 */

/** A quantity in thousandths of its unit. */
export type Thousandths = number;

export const THOUSANDTHS_PER_UNIT = 1000;

/**
 * A quantity as it is written on paper and on screen: `13`, `1,5`, `0,125`.
 * No trailing zeros, a comma before the decimals. Wrap the result in `<Ltr>`.
 */
export function formatQuantity(quantity: Thousandths): string {
  if (!Number.isSafeInteger(quantity)) throw new RangeError(`a quantity must be whole thousandths, got ${quantity}`);
  const abs = Math.abs(quantity);
  const whole = Math.floor(abs / THOUSANDTHS_PER_UNIT);
  const decimals = String(abs % THOUSANDTHS_PER_UNIT)
    .padStart(3, "0")
    .replace(/0+$/, "");
  const grouped = String(whole).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${quantity < 0 ? "-" : ""}${grouped}${decimals ? `,${decimals}` : ""}`;
}
