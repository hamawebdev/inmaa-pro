import { emit } from "@/lib/events";
import { logChange } from "@/lib/log";
import type { Executor, ServiceContext } from "@/lib/service/context";

/**
 * A site's zone follows its commune (scope A9). When Settings › قواعد العمل
 * puts a commune in another zone (Foundation's `remapCommune`), the sites of
 * that commune that were in its old zone move with it, and Operations is told
 * for each (`site.changed`). A site the office put in another zone stays there.
 */
export async function followZoneRemap(
  ex: Executor,
  ctx: ServiceContext,
  input: { communeId: string; fromZoneId: string | null; toZoneId: string },
): Promise<{ moved: number }> {
  let sites = ex
    .selectFrom("Site")
    .select(["id", "zoneId", "commonName", "address", "clientId"])
    .where("communeId", "=", input.communeId)
    .where("deletedAt", "is", null);
  sites = input.fromZoneId === null ? sites.where("zoneId", "is", null) : sites.where("zoneId", "=", input.fromZoneId);
  const found = await sites.orderBy("id").execute();

  for (const site of found) {
    // Only the column that changes.
    await ex
      .updateTable("Site")
      .set({ zoneId: input.toZoneId, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", site.id)
      .execute();
    await logChange(ex, ctx, {
      owner: "CLIENTS",
      action: "UPDATE",
      entity: "Site",
      entityId: site.id,
      entityLabel: site.commonName ?? site.address,
      subject: { kind: "CLIENT", id: site.clientId },
      changes: { zoneId: [site.zoneId, input.toZoneId] },
      context: { cause: "zone.remapped", communeId: input.communeId },
    });
    await emit(ex, ctx, "site.changed", { siteId: site.id, zoneChanged: true, profileChanged: false });
  }
  return { moved: found.length };
}
