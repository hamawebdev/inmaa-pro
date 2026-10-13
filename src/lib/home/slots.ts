import type { ComponentType } from "react";

/**
 * The home screen's slots.
 *
 * The home screen is Foundation's; what it shows about a day is Operations'.
 * So the screen has places, and a folder fills one from its own files, in
 * `src/features/<folder>/home.tsx`:
 *
 *     export const homeSlots: HomeSlots = { today: TodayTiles, board: HomeDayBoard };
 *
 *  - `today`: the tiles at the top (today's visits by status). Three to a row,
 *    in the academy's own classes, as its home and the alert tiles are laid
 *    out (the Checker's S-15):
 *    `grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3 tall:gap-6`;
 *  - `board`: the day board under the alert tiles.
 *
 * Each is a component that takes no props and reads what it shows. A slot
 * nobody fills is drawn by the home screen's own default
 * (src/pages/dashboard/home/_components). The alert tiles are not a slot: they
 * come from the alert registry (src/lib/alerts).
 */
export interface HomeSlots {
  today?: ComponentType;
  board?: ComponentType;
}

export const HOME_SLOT_NAMES = ["today", "board"] as const;

/** The slots the feature folders fill. The first folder to fill a slot has it. */
export function loadHomeSlots(): HomeSlots {
  const modules = import.meta.glob<{ homeSlots?: HomeSlots }>("../../features/*/home.tsx", { eager: true });
  const slots: HomeSlots = {};
  for (const file of Object.keys(modules).sort()) {
    const filled = modules[file].homeSlots;
    if (!filled) continue;
    for (const name of HOME_SLOT_NAMES) {
      if (filled[name] && !slots[name]) slots[name] = filled[name];
    }
  }
  return slots;
}
