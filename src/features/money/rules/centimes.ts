/**
 * Money is whole centimes, everywhere.
 *
 * No amount in this program is a floating-point number of dinars: 45 000,00 DA
 * is the integer 4 500 000. Every rule in this folder takes and returns such
 * integers, and every division goes through `mulDivRound`, which computes
 * exactly and rounds once.
 *
 * Rounding is half away from zero ("half up" for what is owed, and its mirror
 * for a deduction, so that a line and the line that cancels it are the same
 * number with opposite signs).
 */

/** An amount in centimes. A plain integer: 1 DA = 100. */
export type Centimes = number;

/** Basis points: 19% = 1900. */
export type BasisPoints = number;

/** Centimes in one dinar. */
export const CENTIMES_PER_DINAR = 100;

/** Throws unless `value` is an integer JavaScript can hold exactly. */
export function assertInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`${name} must be a whole number, got ${String(value)}`);
  }
}

/**
 * `a × b ÷ c`, exact, rounded half away from zero.
 *
 * The product is formed without loss (it can exceed what a float holds
 * exactly: 99 999 999 999 centimes × a quantity in thousandths), then divided
 * once.
 */
export function mulDivRound(a: number, b: number, c: number): number {
  assertInteger(a, "a");
  assertInteger(b, "b");
  assertInteger(c, "c");
  if (c === 0) throw new RangeError("division by zero");

  const product = BigInt(a) * BigInt(b);
  const divisor = BigInt(c);
  const negative = product < 0n !== divisor < 0n;
  const absProduct = product < 0n ? -product : product;
  const absDivisor = divisor < 0n ? -divisor : divisor;

  let quotient = absProduct / absDivisor;
  if ((absProduct % absDivisor) * 2n >= absDivisor) quotient += 1n;

  const result = Number(negative ? -quotient : quotient);
  assertInteger(result, "result");
  return result === 0 ? 0 : result;
}

/** A percentage of an amount: `percentOf(4_000_000, 1900)` is 19% of 40 000,00 DA. */
export function percentOf(amount: Centimes, rate: BasisPoints): Centimes {
  return mulDivRound(amount, rate, 10_000);
}

export function sumCentimes(values: readonly Centimes[]): Centimes {
  let total = 0;
  for (const value of values) {
    assertInteger(value, "amount");
    total += value;
  }
  assertInteger(total, "sum");
  return total;
}

/**
 * Shares `total` between parts in proportion to `weights`.
 *
 * Every part but the last is rounded to the centime; the last takes what is
 * left, so the parts always add up to `total`. A weight of zero gets nothing.
 */
export function shareByWeights(total: Centimes, weights: readonly number[]): Centimes[] {
  assertInteger(total, "total");
  const sum = weights.reduce((acc, weight) => {
    assertInteger(weight, "weight");
    if (weight < 0) throw new RangeError("a weight cannot be negative");
    return acc + weight;
  }, 0);
  if (weights.length === 0) return [];
  if (sum === 0) return weights.map(() => 0);

  const lastWeighted = weights.reduce((last, weight, index) => (weight > 0 ? index : last), -1);
  let given = 0;
  return weights.map((weight, index) => {
    if (weight === 0) return 0;
    if (index === lastWeighted) return total - given;
    const part = mulDivRound(total, weight, sum);
    given += part;
    return part;
  });
}

/**
 * An amount as it is written, on screen and on paper, in every language:
 * `45.675,00`. The academy's format (its finance tiles print «195.650,00 دج»):
 * a dot between thousands, a comma before the centimes, always two decimals,
 * no currency word (the screen or the sheet adds «دج» / «DA» beside it).
 *
 * The one money format of the program (coordinator's ruling): nothing writes
 * an amount any other way. Wrap the result in `<Ltr>` where a minus sign could
 * move in Arabic.
 */
export function formatMoney(amount: Centimes): string {
  assertInteger(amount, "amount");
  const abs = Math.abs(amount);
  const dinars = Math.floor(abs / CENTIMES_PER_DINAR);
  const cents = abs % CENTIMES_PER_DINAR;
  const grouped = String(dinars).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${amount < 0 ? "-" : ""}${grouped},${String(cents).padStart(2, "0")}`;
}
