import { DatabaseBackup } from "lucide-react";

import type { RegisterAlert } from "@/lib/alerts";
import { addDays } from "@/lib/clock";
import type { Executor, ServiceContext } from "@/lib/service/context";

/**
 * Foundation's alert: no copy of the database for too long (`backup.stale`).
 *
 * One record at most: the centre's data. It counts when no backup has
 * succeeded in the last `alerts.backupStaleDays` days, the day itself
 * included; a restore or a failed copy is not a backup.
 */
export async function countStaleBackup(ex: Executor, ctx: ServiceContext, input: { days: number }): Promise<number> {
  const since = ctx.toInstant(addDays(ctx.today, -Math.max(0, input.days - 1)), "00:00" as never);
  const recent = await ex
    .selectFrom("BackupRun")
    .select("id")
    .where("ok", "=", 1)
    .where("kind", "in", ["AUTO", "MANUAL"])
    .where("startedAt", ">=", since)
    .limit(1)
    .executeTakeFirst();
  return recent ? 0 : 1;
}

export function registerAlerts(register: RegisterAlert) {
  register({
    key: "backup.stale",
    section: "settings",
    severity: "warning",
    name: "BackupStale",
    icon: DatabaseBackup,
    leadSetting: "alerts.backupStaleDays",
    capability: "backup.run",
    route: "/dashboard/settings?tab=backup",
    count: (ex, ctx, { days }) => countStaleBackup(ex, ctx, { days: days ?? 3 }),
  });
}
