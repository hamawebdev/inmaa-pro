import { FilePlus2, HandCoins, ReceiptText } from "lucide-react";

import type { QuickAction } from "@/navigation/quick-actions";

/**
 * This folder's entries in the Ctrl+K palette's "quick actions" group.
 *
 * `labelKey` is the full path of a message in this folder's message files.
 * An expense is typed in a dialog, not on a page of its own: the address opens
 * it on «المصاريف حسب القسم»; so is a payment, on «التسديد والديون». Each
 * destination leaves its button out for a reader who may not use it, and the
 * service refuses him.
 */
export const quickActions: readonly QuickAction[] = [
  { labelKey: "ExpenseForm.AddExpense", href: "/dashboard/expenses?new=1", icon: ReceiptText },
  { labelKey: "Invoices.Issue", href: "/dashboard/invoices/new", icon: FilePlus2 },
  { labelKey: "Payments.Record", href: "/dashboard/payments?new=1", icon: HandCoins },
];
