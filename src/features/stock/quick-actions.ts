import { PackageOpen, PackagePlus, ShoppingCart } from "lucide-react";

import type { QuickAction } from "@/navigation/quick-actions";

/**
 * This folder's entries in the Ctrl+K palette's "quick actions" group.
 *
 *     { labelKey: "Workers.New", href: "/dashboard/workers/new", icon: Plus }
 *
 * `labelKey` is the full path of a message in this folder's message files.
 */
export const quickActions: readonly QuickAction[] = [
  { labelKey: "Handouts.New", href: "/dashboard/handouts/new", icon: PackageOpen },
  { labelKey: "ItemForm.AddItem", href: "/dashboard/inventory?new=1", icon: PackagePlus },
  { labelKey: "Purchases.New", href: "/dashboard/purchases/new", icon: ShoppingCart },
];
