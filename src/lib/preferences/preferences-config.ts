/**
 * How each preference should be saved.
 *
 * "localStorage"   → save on the client.
 * "none"           → no saving, resets on reload.
 *
 * The web app also had cookie-backed modes, because layout-critical prefs had to
 * be readable during SSR. There is no server here, so everything persists to
 * localStorage — which the boot script in index.html can also read
 * synchronously, before first paint.
 *
 * This used to carry seven keys: a theme preset, a font choice from a registry of
 * twenty, and four sidebar/layout switches. The sidebar they configured is gone,
 * and the design system now owns the palette and the typeface outright — a
 * swappable preset is exactly what let four pages drift into hard-coded hex in
 * the first place. What is left is the one preference a reader actually needs to
 * change: light or dark.
 */

import type { ThemeMode } from "./theme";

export type PreferencePersistence = "none" | "localStorage";

/** All available preference keys and their value types. */
export type PreferenceValueMap = {
  theme_mode: ThemeMode;
};

export type PreferenceKey = keyof PreferenceValueMap;

type PreferencePersistenceConfig = Record<PreferenceKey, PreferencePersistence>;

/** Default preference values on first load. */
export const PREFERENCE_DEFAULTS: PreferenceValueMap = {
  theme_mode: "system",
};

/**
 * How each preference is persisted.
 *
 * On a desktop app the window is long-lived and personal, so a preference that
 * reset on every launch would just read as a bug.
 */
export const PREFERENCE_PERSISTENCE: PreferencePersistenceConfig = {
  theme_mode: "localStorage",
};
