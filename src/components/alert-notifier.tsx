import * as React from "react";

import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { useTranslations } from "use-intl";

import { announceAlertsAction } from "@/features/core/services/alerts";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useSession } from "@/hooks/use-session";

/**
 * Desktop notifications for new alerts (plan feature 33's sibling: the alert
 * tiles, said aloud once).
 *
 * Mounted in the dashboard shell, so it exists only while somebody is signed
 * in. It asks which alerts are new for this reader when he signs in, when the
 * day changes, and every hour in between; each one becomes one notification of
 * the operating system, in the reader's language. The rule (once per alert
 * and day) is in src/lib/alerts/announce.ts.
 *
 * Local to this PC: the notification plugin talks to the desktop, not to a
 * network. If the system refuses notifications, the tiles on the home screen
 * still say everything; nothing is retried or shown in their place.
 */
const EVERY_MS = 60 * 60_000;

export function AlertNotifier() {
  const t = useTranslations("Alerts");
  const session = useSession();
  const { today } = useCentreClock();
  const userId = session?.userId ?? null;

  // The words follow the language: kept in a ref so that changing it does not announce again.
  const words = React.useRef(t);
  React.useEffect(() => {
    words.current = t;
  });

  React.useEffect(() => {
    if (!userId) return;
    let live = true;
    async function announce() {
      try {
        const result = await announceAlertsAction(undefined);
        if (!live || !result.success || result.data.length === 0) return;
        const allowed = (await isPermissionGranted()) || (await requestPermission()) === "granted";
        if (!allowed) return;
        for (const alert of result.data) {
          sendNotification({
            title: `${words.current(`${alert.name}.Title`)}: ${alert.count ?? ""}`.trim(),
            body: words.current(`${alert.name}.Hint`, { days: alert.leadDays ?? 0 }),
          });
        }
      } catch (error) {
        console.error("alerts: could not announce", error);
      }
    }
    void announce();
    const timer = window.setInterval(() => void announce(), EVERY_MS);
    return () => {
      live = false;
      window.clearInterval(timer);
    };
  }, [userId, today]);

  return null;
}
