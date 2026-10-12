/**
 * The one appearance choice this app offers.
 *
 * There used to be a `ThemePreset` here as well — four swappable palettes backed
 * by src/styles/presets/*.css. They are gone with the redesign: the palette is
 * now a designed system with per-section hues, semantic action colours and
 * contrast ratios pinned to WCAG thresholds, none of which survives being
 * swapped out from under it. See the comments in src/index.css.
 */

export const THEME_MODE_OPTIONS = [
  { label: "Light", value: "light" },
  { label: "Dark", value: "dark" },
  { label: "System", value: "system" },
] as const;

export const THEME_MODE_VALUES = THEME_MODE_OPTIONS.map((o) => o.value);
export type ThemeMode = (typeof THEME_MODE_VALUES)[number];
export type ResolvedThemeMode = "light" | "dark";

/** Label key per mode, resolved against the `Settings` i18n namespace. */
export const THEME_MODE_LABEL_KEY: Record<ThemeMode, string> = {
  light: "ThemeLight",
  dark: "ThemeDark",
  system: "ThemeSystem",
};
