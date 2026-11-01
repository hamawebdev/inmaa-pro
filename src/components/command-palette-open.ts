/** The event «البحث عن شاشة» in the phone's «المزيد» sheet sends: a phone has no Ctrl+K. */
export const OPEN_EVENT = "inmaa:command-palette";

/** Opens the Ctrl+K list (src/components/command-palette.tsx), as the shortcut does. */
export function openCommandPalette(): void {
  window.dispatchEvent(new Event(OPEN_EVENT));
}
