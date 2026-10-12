import { assertInteger, CENTIMES_PER_DINAR, type Centimes } from "./centimes";

/**
 * An amount in Arabic words, as an invoice or a receipt must carry it:
 *
 *     4 216 246 → «اثنان وأربعون ألفًا ومائة واثنان وستون دينارًا جزائريًا وستة وأربعون سنتيمًا»
 *
 * The grammar that matters, in the nominative as a figure is read out:
 *
 *  - «دينار» and «سنتيم» are masculine, so three to ten are «ثلاثة … عشرة».
 *  - The counted noun follows the last two digits of the number:
 *    00 «دينار», 03–10 «دنانير», 11–99 «دينارًا»; one and two are said with the
 *    noun itself («دينار واحد», «ديناران»), also at the end of a larger number
 *    («ألف ودينار واحد»).
 *  - Thousands and millions behave the same way towards their own count:
 *    «ألف», «ألفان», «ثلاثة آلاف», «أحد عشر ألفًا», «مائة ألف».
 *  - A dual, or a word ending in tanwin, that stands directly before what it
 *    counts loses its ending: «ألفا دينار», «مائتا ألف», «اثنا عشر ألف دينار».
 *
 * Whole dinars from 0 to 999 999 999, and centimes. Zero centimes are left out.
 */

interface CountedNoun {
  /** After 00 and with one: «دينار». */
  singular: string;
  /** Exactly two: «ديناران». */
  dual: string;
  /** Three to ten: «دنانير». */
  plural: string;
  /** Eleven to ninety-nine: «دينارًا». */
  accusative: string;
}

const DINAR: CountedNoun = {
  singular: "دينار جزائري",
  dual: "ديناران جزائريان",
  plural: "دنانير جزائرية",
  accusative: "دينارًا جزائريًا",
};

const CENTIME: CountedNoun = {
  singular: "سنتيم",
  dual: "سنتيمان",
  plural: "سنتيمات",
  accusative: "سنتيمًا",
};

interface Scale {
  one: string;
  two: string;
  /** Two, directly before the noun. */
  twoConstruct: string;
  plural: string;
  accusative: string;
  /** Eleven to ninety-nine, directly before the noun. */
  accusativeConstruct: string;
}

const THOUSAND: Scale = {
  one: "ألف",
  two: "ألفان",
  twoConstruct: "ألفا",
  plural: "آلاف",
  accusative: "ألفًا",
  accusativeConstruct: "ألف",
};

const MILLION: Scale = {
  one: "مليون",
  two: "مليونان",
  twoConstruct: "مليونا",
  plural: "ملايين",
  accusative: "مليونًا",
  accusativeConstruct: "مليون",
};

const UNITS = ["", "واحد", "اثنان", "ثلاثة", "أربعة", "خمسة", "ستة", "سبعة", "ثمانية", "تسعة", "عشرة"];
const TEENS = [
  "أحد عشر",
  "اثنا عشر",
  "ثلاثة عشر",
  "أربعة عشر",
  "خمسة عشر",
  "ستة عشر",
  "سبعة عشر",
  "ثمانية عشر",
  "تسعة عشر",
];
const TENS = ["", "", "عشرون", "ثلاثون", "أربعون", "خمسون", "ستون", "سبعون", "ثمانون", "تسعون"];
const HUNDREDS = ["", "مائة", "مائتان", "ثلاثمائة", "أربعمائة", "خمسمائة", "ستمائة", "سبعمائة", "ثمانمائة", "تسعمائة"];
/** «مائتان» directly before what it counts. */
const HUNDREDS_CONSTRUCT = HUNDREDS.map((word) => (word === "مائتان" ? "مائتا" : word));

const AND = " و";

/** 1 to 99. */
function belowHundred(n: number): string {
  if (n <= 10) return UNITS[n];
  if (n < 20) return TEENS[n - 11];
  const unit = n % 10;
  const ten = TENS[Math.floor(n / 10)];
  return unit === 0 ? ten : `${UNITS[unit]}${AND}${ten}`;
}

/** 1 to 999. `construct` only changes a bare «مائتان». */
function belowThousand(n: number, construct = false): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return belowHundred(rest);
  if (rest === 0) return (construct ? HUNDREDS_CONSTRUCT : HUNDREDS)[hundreds];
  return `${HUNDREDS[hundreds]}${AND}${belowHundred(rest)}`;
}

/** `count` thousands or millions, 1 to 999. `construct`: the counted noun comes straight after. */
function scaled(count: number, scale: Scale, construct: boolean): string {
  if (count === 1) return scale.one;
  if (count === 2) return construct ? scale.twoConstruct : scale.two;

  const hundreds = Math.floor(count / 100);
  const rest = count % 100;
  if (rest === 0) return `${HUNDREDS_CONSTRUCT[hundreds]} ${scale.one}`;
  // «مائة ألف وألف»: said this way, 101 000 cannot be heard as 1 100.
  if (rest === 1) return `${HUNDREDS_CONSTRUCT[hundreds]} ${scale.one}${AND}${scale.one}`;
  if (rest === 2) {
    return `${HUNDREDS_CONSTRUCT[hundreds]} ${scale.one}${AND}${construct ? scale.twoConstruct : scale.two}`;
  }
  if (rest <= 10) return `${belowThousand(count)} ${scale.plural}`;
  return `${belowThousand(count)} ${construct ? scale.accusativeConstruct : scale.accusative}`;
}

/** The number alone, 1 to 999 999 999. `construct`: the counted noun comes straight after it. */
function numberWords(n: number, construct: boolean): string {
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const units = n % 1_000;

  const parts: string[] = [];
  if (millions > 0) parts.push(scaled(millions, MILLION, construct && thousands === 0 && units === 0));
  if (thousands > 0) parts.push(scaled(thousands, THOUSAND, construct && units === 0));
  if (units > 0) parts.push(belowThousand(units, construct));
  return parts.join(AND);
}

/** A number with what it counts: «ثلاثة دنانير جزائرية», «ألف ودينار جزائري واحد». */
function counted(n: number, noun: CountedNoun): string {
  if (n === 0) return `صفر ${noun.singular}`;
  if (n === 1) return `${noun.singular} واحد`;
  if (n === 2) return noun.dual;

  const lastTwo = n % 100;
  if (lastTwo === 1) return `${numberWords(n - 1, false)}${AND}${noun.singular} واحد`;
  if (lastTwo === 2) return `${numberWords(n - 2, false)}${AND}${noun.dual}`;
  if (lastTwo === 0) return `${numberWords(n, true)} ${noun.singular}`;
  if (lastTwo <= 10) return `${numberWords(n, false)} ${noun.plural}`;
  return `${numberWords(n, false)} ${noun.accusative}`;
}

/** The largest amount written in words: 999 999 999,99 DA. */
export const MAX_AMOUNT_IN_WORDS: Centimes = 99_999_999_999;

export function amountInWordsAr(amount: Centimes): string {
  assertInteger(amount, "amount");
  if (amount < 0 || amount > MAX_AMOUNT_IN_WORDS) {
    throw new RangeError("an amount in words must be between 0 and 999 999 999,99 DA");
  }
  const dinars = Math.floor(amount / CENTIMES_PER_DINAR);
  const centimes = amount % CENTIMES_PER_DINAR;

  if (centimes === 0) return counted(dinars, DINAR);
  if (dinars === 0) return counted(centimes, CENTIME);
  return `${counted(dinars, DINAR)}${AND}${counted(centimes, CENTIME)}`;
}
