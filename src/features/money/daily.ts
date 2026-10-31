import type { RegisterDaily } from "@/lib/daily";

import { rebalanceWaitingFiles } from "./services/credit";

/**
 * What Money does because the day changed (on the laptop that holds the
 * books: src/lib/daily runs the owners' days there only).
 *
 * Two laptops (coordinator's ruling): a due cut or cancelled on the laptop
 * without the books still holds the money paid on it; the books' laptop
 * moves that money to the file's other dues or to its credit. It does so
 * after each sync round too; this is the catch-up. Idempotent.
 */
export function registerDaily(daily: RegisterDaily) {
  daily("rebalance the files whose dues were cut on the other laptop", async (ex, ctx) => {
    await rebalanceWaitingFiles(ex, ctx);
  });
}
