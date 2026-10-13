import type { Executor, ServiceContext } from "@/lib/service/context";
import { getSetting, setSetting } from "@/lib/settings";

import { evaluateAlerts, type AlertState } from "./index";

/**
 * Which alerts are announced on the desktop, and when (DESIGN.md section 13).
 *
 * One notification per alert and per day: the first time in a day that an
 * alert concerns something, and again that day only if it has come to concern
 * more (a second contract ending is news; the same one, an hour later, is
 * not). What was announced is kept in the setting `system.alertsNotified`
 * (the alert's key, the day, the count), so closing and opening the program
 * does not repeat it.
 *
 * Nothing here shows anything: `announceAlerts` answers what to show, and the
 * shell hands it to the operating system (src/components/alert-notifier.tsx).
 * A notification is local to this PC; nothing is sent anywhere.
 */
export type Announced = Record<string, { date: string; count: number }>;

/** The alerts to announce now, given what was already announced. */
export function alertsToAnnounce(states: readonly AlertState[], announced: Announced, today: string): AlertState[] {
  return states.filter((state) => {
    if (state.count === null || state.count <= 0) return false;
    const last = announced[state.key];
    return !last || last.date !== today || state.count > last.count;
  });
}

/**
 * Counts the reader's alerts, answers those to announce, and remembers them
 * as announced. One transaction: an alert announced is an alert remembered.
 */
export async function announceAlerts(ex: Executor, ctx: ServiceContext): Promise<AlertState[]> {
  const states = await evaluateAlerts(ex, ctx);
  const announced = await getSetting(ex, "system.alertsNotified");
  const fresh = alertsToAnnounce(states, announced, ctx.today);
  if (fresh.length === 0) return [];
  const next: Announced = { ...announced };
  for (const state of fresh) next[state.key] = { date: ctx.today, count: state.count ?? 0 };
  await setSetting(ex, ctx, "system.alertsNotified", next);
  return fresh;
}
