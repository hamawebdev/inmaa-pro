import { evaluateAlerts } from "@/lib/alerts";
import { pathKey } from "@/lib/compat/revalidate";
import { query } from "@/lib/service/action";

/** Every alert the signed-in reader may see, counted now. What the home screen and the notifications read. */
export const evaluateAlertsQuery = query(evaluateAlerts);

/** The key the alert tiles are kept under: refreshed with the home screen, and read by the notifications. */
export const ALERTS_QUERY_KEY = [...pathKey("/dashboard/home"), "alerts"] as const;
