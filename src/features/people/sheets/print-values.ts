/**
 * How a stored value is cut up to be written on his blanks.
 *
 * His date blanks have three parts and his phone blanks five, separated by
 * slashes. These functions give the parts; the sheet puts them on the paper.
 */

export interface DateParts {
  day: string;
  month: string;
  year: string;
}

/** `2026-10-11` as day, month and year, or null for an empty or unreadable date. */
export function dateParts(iso: string | null | undefined): DateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? "");
  if (!match) return null;
  return { day: match[3], month: match[2], year: match[1] };
}

/**
 * A phone number as the five pairs his blank has room for: `0661203142`
 * becomes 06, 61, 20, 31, 42. Spaces, dots and dashes are ignored.
 *
 * A number that is not ten digits (an older nine-digit landline, a number with
 * a country code) has no place in five pairs: it is returned whole, to be
 * written across the blank.
 */
export function phoneParts(phone: string | null | undefined): { pairs: string[] } | { whole: string } | null {
  const typed = (phone ?? "").trim();
  if (typed === "") return null;
  const digits = typed.replace(/[\s.\-/]/g, "");
  if (/^\d{10}$/.test(digits)) return { pairs: digits.match(/\d{2}/g) as string[] };
  return { whole: typed };
}

/** «اللقب والاسم»: the surname, then the first name. */
export function fullName(lastName: string | null | undefined, firstName: string | null | undefined): string {
  return [lastName, firstName]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(" ");
}

/** Two parts joined by his slash, as «البلدية / الولاية» is answered on one blank. */
export function slashed(first: string | null | undefined, second: string | null | undefined): string {
  return [first, second]
    .map((part) => (part ?? "").trim())
    .filter((part) => part !== "")
    .join(" / ");
}
