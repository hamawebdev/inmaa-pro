import type { LucideIcon } from "lucide-react";

import { quickActions as clients } from "@/features/clients/quick-actions";
import { quickActions as core } from "@/features/core/quick-actions";
import { quickActions as money } from "@/features/money/quick-actions";
import { quickActions as operations } from "@/features/operations/quick-actions";
import { quickActions as people } from "@/features/people/quick-actions";
import { quickActions as stock } from "@/features/stock/quick-actions";
import { quickActions as sync } from "@/features/sync/quick-actions";

/**
 * A "create" destination offered by the Ctrl+K palette: a new worker, a new
 * file. Each feature folder lists its own in `quick-actions.ts`; the palette
 * reads the joined list from here.
 */
export interface QuickAction {
  /** The full path of the label in the messages, e.g. "Workers.New". */
  labelKey: string;
  /** Where it goes, e.g. "/dashboard/workers/new". */
  href: string;
  icon: LucideIcon;
}

export const QUICK_ACTIONS: readonly QuickAction[] = [
  ...core,
  ...people,
  ...clients,
  ...operations,
  ...money,
  ...stock,
  ...sync,
];
