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
