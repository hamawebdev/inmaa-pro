/**
 * How People's screens write a stored value.
 */

/** A phone number in the groups it is read aloud in: `0661 20 31 42`, `032 41 50 00`. Always inside `<Ltr>`. */
export function formatPhone(digits: string | null | undefined): string {
  if (!digits) return "";
  if (/^\d{10}$/.test(digits)) return digits.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4");
  if (/^\d{9}$/.test(digits)) return digits.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4");
  return digits;
}

/** Dinars as typed («1500», «1500,50») to whole centimes, or null when it is not an amount. */
export function centimesOf(text: string): number | null {
  const value = Number(text.replace(",", ".").trim());
  if (text.trim() === "" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

/** Minutes as hours and minutes, «7:30», for a table cell (inside `<Ltr>`). */
export function formatMinutes(value: number): string {
  const sign = value < 0 ? "-" : "";
  const whole = Math.abs(value);
  return `${sign}${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
}

/** Thousandths of a day as days, «2,5». */
export const formatDays = (thousandths: number) => String(thousandths / 1000).replace(".", ",");

/** The month before, or after, a month written `YYYY-MM`. */
export function shiftMonth(month: string, by: number): string {
  const [year, number] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year, number - 1 + by, 1));
  return date.toISOString().slice(0, 7);
}

/** The first and last day of a month written `YYYY-MM`. */
export function monthBounds(month: string): { from: string; to: string } {
  const [year, number] = month.split("-").map(Number);
  return { from: `${month}-01`, to: new Date(Date.UTC(year, number, 0)).toISOString().slice(0, 10) };
}
