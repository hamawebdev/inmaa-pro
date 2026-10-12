/**
 * The units the database counts in, as distinct types.
 *
 * No column holds a fraction. Money is whole centimes, a duration is whole
 * minutes, a quantity is thousandths of its unit, a rate is basis points. The
 * generated database types (src/lib/db/schema.ts) carry these brands, so that
 * a dinar amount cannot be saved into a centime column, or minutes into a
 * money column, without the compiler saying so.
 *
 * A branded value is made by one of the functions below, at the edge: where a
 * person typed it or where it is computed. Each refuses a value that is not a
 * whole number, which is also what the STRICT tables would refuse later, at a
 * less helpful moment.
 */

declare const unit: unique symbol;
type Branded<Base, Name extends string> = Base & { readonly [unit]: Name };

/** Whole centimes. 1 DA = 100. */
export type Money = Branded<number, "centimes">;
/** Whole minutes: every duration and every count of hours. */
export type Minutes = Branded<number, "minutes">;
/** Thousandths of the unit named beside the column: stock, m², days, km. */
export type Qty = Branded<number, "thousandths">;
/** Basis points: 1900 is 19%. */
export type BasisPoints = Branded<number, "basis points">;
/** A calendar date, `YYYY-MM-DD`, in the centre's own time. Never an instant. */
export type LocalDate = Branded<string, "local date">;
/** A clock time, `HH:MM`, 24 hours, in the centre's own time. */
export type LocalTime = Branded<string, "local time">;

function whole(value: number, what: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${what} must be a whole number.`);
  return value;
}

export const money = (centimes: number) => whole(centimes, "An amount in centimes") as Money;
export const minutes = (value: number) => whole(value, "A duration in minutes") as Minutes;
export const qty = (thousandths: number) => whole(thousandths, "A quantity in thousandths") as Qty;
export const basisPoints = (value: number) => whole(value, "A rate in basis points") as BasisPoints;

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

export function localDate(text: string): LocalDate {
  if (!DATE.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00Z`)))
    throw new Error("A date must be written YYYY-MM-DD.");
  return text as LocalDate;
}

export function localTime(text: string): LocalTime {
  if (!TIME.test(text)) throw new Error("A time must be written HH:MM.");
  return text as LocalTime;
}

// ── Conversions at the edge ────────────────────────────────────────────────

/** Dinars as typed (`450.5`) to centimes, rounding half up to the centime. */
export function dinarsToMoney(dinars: number): Money {
  return money(Math.round((dinars + Number.EPSILON) * 100));
}

export function moneyToDinars(amount: Money): number {
  return amount / 100;
}

/**
 * An amount as it is written, on screen and on paper, in every language:
 * `195.650,00`. The academy's format: a dot between thousands, a comma before
 * the centimes, always two decimals. It is the program's one money format (the
 * coordinator's ruling): nothing writes an amount any other way.
 *
 * No currency word: a screen adds the reader's («دج», «DA») with
 * `useMoneyText()`, a sheet adds `MONEY_UNIT_AR`, or `formatMoneyAr` gives both.
 * Digits read left to right: inside Arabic text the result goes in `<Ltr>`.
 */
export function formatMoney(amount: number): string {
  whole(amount, "An amount in centimes");
  const abs = Math.abs(amount);
  const dinars = Math.floor(abs / 100);
  const grouped = String(dinars).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `${amount < 0 ? "-" : ""}${grouped},${String(abs % 100).padStart(2, "0")}`;
}

/** The currency word on paper, which is always Arabic. */
export const MONEY_UNIT_AR = "دج";

/** An amount with its currency word as a printed sheet writes it: «195.650,00 دج». */
export const formatMoneyAr = (amount: number) => `${formatMoney(amount)} ${MONEY_UNIT_AR}`;

/** A percentage of an amount, rounded half up to the centime. */
export function percentOf(amount: Money, rate: BasisPoints): Money {
  return money(Math.floor((amount * rate + 5000) / 10000));
}

export const hoursToMinutes = (hours: number) => minutes(Math.round(hours * 60));
export const minutesToHours = (value: Minutes) => value / 60;

/** A quantity as typed (`2.5`) to thousandths. */
export const toQty = (value: number) => qty(Math.round(value * 1000));
export const fromQty = (value: Qty) => value / 1000;

export function addMoney(...amounts: Money[]): Money {
  return money(amounts.reduce<number>((sum, amount) => sum + amount, 0));
}
