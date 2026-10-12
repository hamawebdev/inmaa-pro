import type { RegisterDaily } from "@/lib/daily";

import { endExpiredContracts } from "./services/files";

/**
 * What Clients and contracts does when a day starts (src/lib/daily): a live
 * contract past «تاريخ النهاية» reaches «انتهاء التعاقد», EXPIRED or RENEWED.
 * Written on "before today", so the days the program was closed are caught up
 * and a second run changes nothing.
 */
export function registerDaily(daily: RegisterDaily) {
  daily("end contracts past their date", async (ex, ctx, { today }) => {
    await endExpiredContracts(ex, ctx, { upTo: today });
  });
}
