import type { LOCALES } from "@/i18n/config";

/**
 * Narrows `useLocale()` from `string` to our own `Locale` union.
 *
 * `use-intl` types the active locale as `string` until the app declares
 * otherwise through this interface. Without it, every call site that hands the
 * locale to `intlLocaleFor`/`dateFnsLocaleFor` would need a cast, and a typo
 * would compile. With it, the compiler checks the locale end to end and the
 * `Record<Locale, …>` maps in config.ts become genuinely exhaustive.
 */
declare module "use-intl" {
  interface AppConfig {
    Locale: (typeof LOCALES)[number];
  }
}
