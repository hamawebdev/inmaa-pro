import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";

import { booksState, requestBooks } from "./index";

/** What the screens call (Settings › المزامنة, the bar's sync menu). */
export const SYNC_SETTINGS_PATH = "/dashboard/settings/sync";

/** «طلب الدفاتر»: no input; answers `{ requested: true }`. */
export const requestBooksAction = action((ex: Executor, ctx: ServiceContext) => requestBooks(ex, ctx), {
  revalidate: [SYNC_SETTINGS_PATH],
});

/** Where the books are, or null before sync is set up. */
export const booksStateQuery = query((ex: Executor, ctx: ServiceContext) => booksState(ex, ctx));
