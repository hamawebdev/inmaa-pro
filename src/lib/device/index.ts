import { platform } from "@tauri-apps/plugin-os";

/**
 * What this device is, as the window knows it (docs/phone/BUILD.md contract 2.1).
 *
 * The **layout** follows the window's width (Tailwind's `md:`, 768 px), never this: a narrow
 * window on a laptop gets the phone's layout. What the device **may do** follows this: no
 * printing, no backup or restore, no copies saved outside, manager accounts only, joining
 * only (docs/phone/DECISION.md sections 3, 4 and 6).
 *
 * A service never reads it: tests run under Node, where there is no window. A service decides
 * by `thisDeviceKind(ex)` (`src/lib/sync/device.ts`), which the database knows once the phone
 * has joined. This answers before any join, so the first screen knows it is on a phone.
 */
export interface Device {
  /** True on Android (and iOS, should it ever be built). */
  isPhone: boolean;
  /** What `@tauri-apps/plugin-os` answers: "windows", "linux", "android"…, or "unknown" outside Tauri. */
  platform: string;
}

const PHONE_PLATFORMS: readonly string[] = ["android", "ios"];

export function isPhonePlatform(name: string): boolean {
  return PHONE_PLATFORMS.includes(name);
}

let known: Device | null = null;

/** The device, read once: the platform never changes while the program runs. */
export function thisDevice(): Device {
  if (known) return known;
  let name = "unknown";
  try {
    // Synchronous under Tauri: the plugin's internals are injected before the window's scripts.
    name = platform();
  } catch {
    // Not under Tauri (a test under Node, a plain browser): not a phone.
  }
  known = { isPhone: isPhonePlatform(name), platform: name };
  return known;
}

/** `{ isPhone, platform }` for a screen. Constant for the program's life, so it never re-renders anything. */
export function useDevice(): Device {
  return thisDevice();
}
