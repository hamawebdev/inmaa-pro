/**
 * A phone number as it is read aloud, on every screen and every sheet: ten
 * digits in groups of four, two, two and two (`0661 20 31 42`), nine in three,
 * two, two and two (`032 41 50 00`); anything else as it was stored.
 *
 *     <Ltr>{phoneText(worker.phone)}</Ltr>
 *
 * Always inside `<Ltr>`: in Arabic the groups would otherwise be read from the
 * right. Numbers are stored as digits only (`phoneKeys` in ./normalise.ts).
 */
export function phoneText(digits: string | null | undefined): string {
  if (!digits) return "";
  if (/^\d{10}$/.test(digits)) return digits.replace(/^(\d{4})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4");
  if (/^\d{9}$/.test(digits)) return digits.replace(/^(\d{3})(\d{2})(\d{2})(\d{2})$/, "$1 $2 $3 $4");
  return digits;
}
