import type { RouteObject } from "react-router-dom";

import ExpensesPage from "@/pages/dashboard/expenses/page";
import FileHandoutsPage from "@/pages/dashboard/files/[id]/handouts/page";
import FilePaymentsPage from "@/pages/dashboard/files/[id]/payments/page";
import HandoutPrintPage from "@/pages/dashboard/handouts/[id]/print/page";
import HandoutsPage from "@/pages/dashboard/handouts/page";
import IncomePage from "@/pages/dashboard/income/page";
import InventoryPage from "@/pages/dashboard/inventory/page";
import InvoicePrintPage from "@/pages/dashboard/invoices/[id]/print/page";
import InvoiceStatementPrintPage from "@/pages/dashboard/invoices/[id]/print-statement/page";
import InvoicesPage from "@/pages/dashboard/invoices/page";
import MaintenancePage from "@/pages/dashboard/maintenance/page";
import PaymentsPage from "@/pages/dashboard/payments/page";
import ReceiptPrintPage from "@/pages/dashboard/payments/receipts/[id]/print/page";
import ReminderPrintPage from "@/pages/dashboard/payments/reminders/[fileId]/print/page";
import PurchasesPage from "@/pages/dashboard/purchases/page";
import ReportsPage from "@/pages/dashboard/reports/page";

/**
 * Money and stock's routes: both sections, one owner, one list.
 *
 * Paths are relative to `/dashboard`. src/routes.tsx joins the five lists; no
 * owner edits another's. Write each `path` as a plain string literal: the test
 * in src/navigation/routes.test.ts reads this file as text to check that every
 * first path segment belongs to the owner CLAUDE.md names.
 */
export const moneyRoutes: RouteObject[] = [
  { path: "expenses", element: <ExpensesPage /> },
  { path: "income", element: <IncomePage /> },
  { path: "invoices", element: <InvoicesPage /> },
  { path: "payments", element: <PaymentsPage /> },
  { path: "reports", element: <ReportsPage /> },
  { path: "inventory", element: <InventoryPage /> },
  { path: "handouts", element: <HandoutsPage /> },
  { path: "purchases", element: <PurchasesPage /> },
  { path: "maintenance", element: <MaintenancePage /> },

  // Printed sheets. Each is a page below the record it prints.
  { path: "invoices/:id/print", element: <InvoicePrintPage /> },
  { path: "invoices/:id/print-statement", element: <InvoiceStatementPrintPage /> },
  { path: "payments/receipts/:id/print", element: <ReceiptPrintPage /> },
  { path: "payments/reminders/:fileId/print", element: <ReminderPrintPage /> },
  { path: "handouts/:id/print", element: <HandoutPrintPage /> },

  // Parts of a file. The list of parts is src/navigation/file-parts.ts.
  { path: "files/:id/handouts", element: <FileHandoutsPage /> },
  { path: "files/:id/payments", element: <FilePaymentsPage /> },
];
