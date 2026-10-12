import type { OnEvent } from "@/lib/events";

import { followZoneRemap } from "./services/sites";

/**
 * What Clients and contracts does when another owner's event says so
 * (docs/data-model/CONTRACTS.md section 4).
 *
 *  - `zone.remapped` (Foundation, Settings › قواعد العمل): the sites of that
 *    commune that were in its old zone move to the new one.
 *
 * `sanction.changed` (People) writes nothing here: the chip on the client card
 * and the two ticks of «حالة الملف» are read when they are shown.
 */
export function registerEvents(on: OnEvent) {
  on("zone.remapped", async (ex, ctx, payload) => {
    await followZoneRemap(ex, ctx, payload);
  });
}
