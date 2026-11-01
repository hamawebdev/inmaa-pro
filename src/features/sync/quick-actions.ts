import { MonitorSmartphone, Smartphone } from "lucide-react";

import type { QuickAction } from "@/navigation/quick-actions";

/**
 * Ctrl+K: the second laptop and the director's phone, for whoever may write in Settings (the page itself asks
 * for `sync.manage`, and offers each only while the centre lacks it).
 */
export const quickActions: readonly QuickAction[] = [
  { labelKey: "Sync.Devices.Add", href: "/dashboard/settings/sync?add=1", icon: MonitorSmartphone },
  { labelKey: "Sync.Devices.AddPhone", href: "/dashboard/settings/sync?add=phone", icon: Smartphone },
];
