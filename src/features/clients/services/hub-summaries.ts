import { getFileHandOutSummary } from "@/features/stock/services/recovery";
import { query } from "@/lib/service/action";

/**
 * The summaries the file hub's part tiles show, read through their owners'
 * functions (CONTRACTS.md section 3, "File hub and client card slots").
 */

/** «التسليم»: how many hand-outs, and what equipment is still out or at the site (Money's). */
export const getFileHandOutSummaryQuery = query(getFileHandOutSummary);
