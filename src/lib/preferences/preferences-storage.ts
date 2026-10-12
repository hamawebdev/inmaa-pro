import { setLocalStorageValue } from "../local-storage.client";
import { PREFERENCE_PERSISTENCE, type PreferenceKey } from "./preferences-config";

/**
 * Kept async so the call sites ported from the web app (which awaited a Server
 * Action for cookie-backed prefs) don't have to change.
 */
export async function persistPreference(key: PreferenceKey, value: string) {
  if (PREFERENCE_PERSISTENCE[key] === "none") return;
  setLocalStorageValue(key, value);
}
