/**
 * Search keys: the form in which a name or a phone number is compared.
 *
 * Arabic is typed in many equal ways: with or without vowel marks, with a
 * stretching character, with one of four alefs, with a final ya or an alef
 * maqsura, with a ta marbuta or a ha. Two spellings of one name must find each
 * other in «قديم», in list search and in the sanction check, so every stored
 * `...Key` column holds the name in this one form, rewritten on every save.
 *
 * Pure text handling: no imports, so scripts can use it too.
 */

/** Vowel marks, the superscript alef and the other combining marks of Arabic script. */
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭ]/g;
const TATWEEL = /ـ/g;

export function normaliseName(text: string | null | undefined): string {
  if (!text) return "";
  return (
    text
      .normalize("NFKC")
      .replace(MARKS, "")
      .replace(TATWEEL, "")
      // The alefs: أ إ آ ٱ
      .replace(/[أإآٱ]/g, "ا")
      // Hamza on a seat reads as its seat: ؤ, ئ
      .replace(/ؤ/g, "و")
      .replace(/ئ/g, "ي")
      // A hamza on the line is dropped: ء
      .replace(/ء/g, "")
      // Final ya and alef maqsura: ى
      .replace(/ى/g, "ي")
      // Ta marbuta and ha: ة
      .replace(/ة/g, "ه")
      .toLowerCase()
      // Anything that is not a letter or a digit separates words.
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
  );
}

/**
 * A phone number as digits only, in its national form: `+213 6 59 53 81 83`,
 * `00213659538183` and `0659 53 81 83` all become `0659538183`.
 */
export function phoneKey(text: string | null | undefined): string {
  if (!text) return "";
  // Arabic-Indic digits are typed as often as Western ones.
  const digits = text
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/\D/g, "");
  if (digits.startsWith("00213")) return `0${digits.slice(5)}`;
  if (digits.startsWith("213") && digits.length > 10) return `0${digits.slice(3)}`;
  return digits;
}

/**
 * Several numbers in one column, so that `LIKE '%|0659538183|%'` finds one
 * exactly: `|0659538183|032421500|`. Empty when there is none.
 */
export function phoneKeys(numbers: ReadonlyArray<string | null | undefined>): string {
  const keys = [...new Set(numbers.map(phoneKey).filter(Boolean))];
  return keys.length ? `|${keys.join("|")}|` : "";
}
