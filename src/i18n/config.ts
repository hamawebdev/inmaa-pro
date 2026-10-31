import type { Locale as DateFnsLocale } from "date-fns";
import { arDZ, enUS, fr } from "date-fns/locale";

import { MESSAGES as ASSEMBLED_MESSAGES } from "./catalogues";

export const LOCALES = ["en", "ar", "fr"] as const;
export type Locale = (typeof LOCALES)[number];

/**
 * The language the program opens in until the centre chooses another: Arabic,
 * worded as in the client's own forms. Also set in the boot script of
 * index.html, which runs before this module loads.
 *
 * English stays the *reference catalogue*: keys are written in English first,
 * the tests compare the other two against it, and the error lookup matches on
 * English sentences. That is a separate matter from which language is shown.
 */
export const DEFAULT_LOCALE: Locale = "ar";

/** Storage key. Also read synchronously by the boot script in index.html. */
export const LOCALE_STORAGE_KEY = "locale";

/** One catalogue per language, merged from every feature folder. See ./catalogues.ts. */
export const MESSAGES: Record<Locale, Record<string, unknown>> = ASSEMBLED_MESSAGES;

export const RTL_LOCALES: readonly Locale[] = ["ar"];

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function directionFor(locale: Locale): "ltr" | "rtl" {
  return RTL_LOCALES.includes(locale) ? "rtl" : "ltr";
}

/**
 * BCP 47 tags for `Intl` / `toLocaleString`. Every call site that formats a date
 * or a number must go through here — this used to be a `locale === "ar"` ternary
 * copied into 40-odd components, which meant French silently inherited the US
 * month-first date format. Typed as a `Record<Locale, …>` so a fourth locale
 * cannot be added without picking its tag.
 */
const INTL_LOCALES: Record<Locale, string> = {
  en: "en-US",
  ar: "ar-DZ",
  fr: "fr-DZ",
};

export function intlLocaleFor(locale: Locale): string {
  return INTL_LOCALES[locale];
}

/**
 * The date-fns locale object, for the pickers that take one (react-day-picker
 * reads month and weekday names off it rather than from `Intl`).
 */
const DATE_FNS_LOCALES: Record<Locale, DateFnsLocale> = {
  en: enUS,
  ar: arDZ,
  fr,
};

export function dateFnsLocaleFor(locale: Locale): DateFnsLocale {
  return DATE_FNS_LOCALES[locale];
}
