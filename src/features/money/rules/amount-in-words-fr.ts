import { MAX_AMOUNT_IN_WORDS } from "./amount-in-words-ar";
import { assertInteger, CENTIMES_PER_DINAR, type Centimes } from "./centimes";

/**
 * An amount in French words, the second wording an Algerian invoice carries:
 *
 *     4 216 246 → « Quarante-deux mille cent soixante-deux dinars algériens et quarante-six centimes »
 *
 * Traditional spelling:
 *
 *  - « vingt et un », « soixante et onze », but « quatre-vingt-un » and
 *    « quatre-vingt-onze »;
 *  - « quatre-vingts » and « deux cents » take their s only when no numeral
 *    follows, so « quatre-vingt mille » and « deux cent mille », but
 *    « deux cents millions » (million is a noun);
 *  - « mille » never changes and is never « un mille »;
 *  - « un million de dinars » when nothing follows the millions.
 *
 * Same range as the Arabic. Zero centimes are left out.
 */

const UNITS = [
  "zéro",
  "un",
  "deux",
  "trois",
  "quatre",
  "cinq",
  "six",
  "sept",
  "huit",
  "neuf",
  "dix",
  "onze",
  "douze",
  "treize",
  "quatorze",
  "quinze",
  "seize",
  "dix-sept",
  "dix-huit",
  "dix-neuf",
];
const TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"];

/** 1 to 99. `final`: no numeral follows, so « quatre-vingts » keeps its s. */
function belowHundred(n: number, final: boolean): string {
  if (n < 20) return UNITS[n];
  if (n < 70) {
    const ten = TENS[Math.floor(n / 10)];
    const unit = n % 10;
    if (unit === 0) return ten;
    return unit === 1 ? `${ten} et un` : `${ten}-${UNITS[unit]}`;
  }
  if (n < 80) return n === 71 ? "soixante et onze" : `soixante-${UNITS[n - 60]}`;
  if (n === 80) return final ? "quatre-vingts" : "quatre-vingt";
  return `quatre-vingt-${UNITS[n - 80]}`;
}

/** 1 to 999. */
function belowThousand(n: number, final: boolean): string {
  const hundreds = Math.floor(n / 100);
  const rest = n % 100;
  if (hundreds === 0) return belowHundred(rest, final);
  const hundredWord = hundreds === 1 ? "cent" : `${UNITS[hundreds]} cent${rest === 0 && final ? "s" : ""}`;
  return rest === 0 ? hundredWord : `${hundredWord} ${belowHundred(rest, final)}`;
}

/** 1 to 999 999 999. */
function numberWords(n: number): string {
  const millions = Math.floor(n / 1_000_000);
  const thousands = Math.floor((n % 1_000_000) / 1_000);
  const units = n % 1_000;

  const parts: string[] = [];
  if (millions > 0) parts.push(millions === 1 ? "un million" : `${belowThousand(millions, true)} millions`);
  if (thousands > 0) parts.push(thousands === 1 ? "mille" : `${belowThousand(thousands, false)} mille`);
  if (units > 0) parts.push(belowThousand(units, true));
  return parts.join(" ");
}

function dinarsPhrase(dinars: number): string {
  if (dinars === 0) return "zéro dinar algérien";
  if (dinars === 1) return "un dinar algérien";
  // « un million de dinars », « deux millions de dinars »: a round number of millions.
  const link = dinars % 1_000_000 === 0 ? " de" : "";
  return `${numberWords(dinars)}${link} dinars algériens`;
}

function centimesPhrase(centimes: number): string {
  return centimes === 1 ? "un centime" : `${numberWords(centimes)} centimes`;
}

export function amountInWordsFr(amount: Centimes): string {
  assertInteger(amount, "amount");
  if (amount < 0 || amount > MAX_AMOUNT_IN_WORDS) {
    throw new RangeError("an amount in words must be between 0 and 999 999 999,99 DA");
  }
  const dinars = Math.floor(amount / CENTIMES_PER_DINAR);
  const centimes = amount % CENTIMES_PER_DINAR;

  let words: string;
  if (centimes === 0) words = dinarsPhrase(dinars);
  else if (dinars === 0) words = centimesPhrase(centimes);
  else words = `${dinarsPhrase(dinars)} et ${centimesPhrase(centimes)}`;

  return words.charAt(0).toUpperCase() + words.slice(1);
}
