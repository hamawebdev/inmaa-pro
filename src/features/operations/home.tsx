import type { HomeSlots } from "@/lib/home/slots";

import { HomeDayBoard, TodayTiles } from "./components/home/home-slots";

/**
 * What the home screen shows about the day (src/lib/home/slots.ts): today's
 * visits counted by status, three tiles to a row, and the day board.
 */
export const homeSlots: HomeSlots = { today: TodayTiles, board: HomeDayBoard };
