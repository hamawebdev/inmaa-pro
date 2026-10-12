import { FILES_PATH } from "@/navigation/file-parts";

/**
 * The screens Money's actions refresh. A screen's queries are keyed by its
 * path (`pathKey`), and an action names the paths it changed.
 */
export const INCOME_PATH = "/dashboard/income";
export const EXPENSES_PATH = "/dashboard/expenses";
export const INVOICES_PATH = "/dashboard/invoices";
export const PAYMENTS_PATH = "/dashboard/payments";
export const REPORTS_PATH = "/dashboard/reports";

/** Clients' files list and every file's hub: its «التسديد» tile reads the dues. */
export { FILES_PATH };

/** What an invoice, a payment or a due changes. */
export const MONEY_PATHS = [INCOME_PATH, INVOICES_PATH, PAYMENTS_PATH, FILES_PATH] as const;
