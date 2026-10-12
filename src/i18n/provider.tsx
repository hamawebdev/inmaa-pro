import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { IntlProvider } from "use-intl";

import { DirectionProvider } from "@/components/ui/direction";
import { getLocalStorageValue, setLocalStorageValue } from "@/lib/local-storage.client";

import { DEFAULT_LOCALE, directionFor, isLocale, LOCALE_STORAGE_KEY, MESSAGES, type Locale } from "./config";

type LocaleContextValue = {
  locale: Locale;
  setLocale: (locale: Locale) => void;
};

const LocaleContext = createContext<LocaleContextValue | null>(null);

function readInitialLocale(): Locale {
  const stored = getLocalStorageValue(LOCALE_STORAGE_KEY);
  return isLocale(stored) ? stored : DEFAULT_LOCALE;
}

/**
 * Replaces next-intl's NextIntlClientProvider. `use-intl` is the library
 * next-intl is built on and exposes the same useTranslations/useLocale/
 * useFormatter API, so every ported call site works unchanged.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(readInitialLocale);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("lang", locale);
    root.setAttribute("dir", directionFor(locale));
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    setLocalStorageValue(LOCALE_STORAGE_KEY, next);
    setLocaleState(next);
  }, []);

  const value = useMemo(() => ({ locale, setLocale }), [locale, setLocale]);

  return (
    <LocaleContext.Provider value={value}>
      <IntlProvider
        locale={locale}
        messages={MESSAGES[locale]}
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
        onError={(error) => {
          // Missing keys are worth seeing while developing, but must never take
          // the app down in a build the user is running offline.
          if (import.meta.env.DEV) console.warn("[i18n]", error.message);
        }}
      >
        {/* Radix reads the reading direction from this provider, not from
            <html dir>. Without it every Radix part (tab strips, tabs and the
            panels inside them, menus, selects) is laid out left to right in
            Arabic, which is what the academy app does. */}
        <DirectionProvider dir={directionFor(locale)}>{children}</DirectionProvider>
      </IntlProvider>
    </LocaleContext.Provider>
  );
}

/** Read or change the active locale. Used by the language card in Settings. */
export function useLocaleSwitcher(): LocaleContextValue {
  const context = useContext(LocaleContext);
  if (!context) throw new Error("Missing I18nProvider");
  return context;
}
