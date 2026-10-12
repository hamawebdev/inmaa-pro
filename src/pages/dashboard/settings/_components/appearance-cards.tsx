import { Languages, Monitor, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LOCALES, type Locale } from "@/i18n/config";
import { useLocaleSwitcher } from "@/i18n/provider";
import { persistPreference } from "@/lib/preferences/preferences-storage";
import { THEME_MODE_OPTIONS, type ThemeMode } from "@/lib/preferences/theme";
import { usePreferencesStore } from "@/stores/preferences/preferences-provider";

/**
 * Language and appearance.
 *
 * Both save **immediately** on click, unlike the identity card above. That
 * asymmetry is deliberate and consistent throughout Settings: a card holding
 * several fields that are typed together commits behind a button, while a single
 * choice whose whole effect is visible the moment it is made commits on the
 * click. Putting a Save button under a theme toggle that has already changed the
 * screen just asks "save what?".
 *
 * Both are rendered as a row of buttons where the chosen one is filled and the
 * rest are outlined, rather than as a `Select`. There are three options each; a
 * dropdown would hide the alternatives behind a click for no gain, and the state
 * is readable across the room this way.
 */

const LOCALE_LABEL: Record<Locale, string> = {
  en: "English",
  ar: "العربية",
  fr: "Français",
};

const THEME_ICON: Record<ThemeMode, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
};

export function LanguageCard() {
  const t = useTranslations("Settings.Language");
  const { locale, setLocale } = useLocaleSwitcher();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Languages className="size-5" />
          {t("Title")}
        </CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-wrap gap-2 tall:gap-3">
        {LOCALES.map((code) => (
          <Button
            key={code}
            variant={locale === code ? "default" : "outline"}
            onClick={() => setLocale(code)}
            aria-pressed={locale === code}
          >
            {LOCALE_LABEL[code]}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}

export function AppearanceCard() {
  const t = useTranslations("Settings.Appearance");
  const tTheme = useTranslations("Settings");
  const themeMode = usePreferencesStore((s) => s.themeMode);
  const setThemeMode = usePreferencesStore((s) => s.setThemeMode);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Title")}</CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-wrap gap-2 tall:gap-3">
        {THEME_MODE_OPTIONS.map((option) => {
          const Icon = THEME_ICON[option.value];
          const active = themeMode === option.value;
          return (
            <Button
              key={option.value}
              variant={active ? "default" : "outline"}
              aria-pressed={active}
              onClick={() => {
                setThemeMode(option.value);
                // Persisted here rather than in the store, so the boot script in
                // index.html can read it back before first paint next launch.
                void persistPreference("theme_mode", option.value);
              }}
            >
              <Icon />
              {tTheme(`Theme${option.label}`)}
            </Button>
          );
        })}
      </CardContent>
    </Card>
  );
}
