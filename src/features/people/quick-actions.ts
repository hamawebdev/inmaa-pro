import type { QuickAction } from "@/navigation/quick-actions";

/**
 * This folder's entries in the Ctrl+K palette's "quick actions" group.
 *
 *     { labelKey: "Workers.New", href: "/dashboard/workers/new", icon: Plus }
 *
 * `labelKey` is the full path of a message in this folder's message files.
 */
export const quickActions: readonly QuickAction[] = [];
