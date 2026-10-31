import { MonitorSmartphone } from "lucide-react";

import type { QuickAction } from "@/navigation/quick-actions";

/** Ctrl+K: the second laptop, for whoever may write in Settings (the page itself asks for `sync.manage`). */
export const quickActions: readonly QuickAction[] = [
  { labelKey: "Sync.Devices.Add", href: "/dashboard/settings/sync?add=1", icon: MonitorSmartphone },
];
