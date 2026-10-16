import { can, requireCapability, sectionLevel } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { isWilayaCode } from "@/lib/geo/wilayas";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { normaliseName } from "@/lib/text/normalise";

/**
 * Communes and zones (docs/data-model/CONTRACTS.md section 3, Foundation).
 *
 * The worked example of a service: plain functions over `(ex, ctx, input)`,
 * the program's wrappers at the bottom, and places.test.ts beside it driving
 * the same functions on a real database.
 *
 * An address points at a `Commune` row and takes its wilaya from it. The
 * communes of أم البواقي are seeded; any other is added by the office from an
 * address field (`ensureCommune`). A commune's zone is the default zone of
 * every place in it: created, named after the commune, the first time a site
 * or a worker there is saved (`ensureZoneForCommune`), and changed only in
 * Settings › قواعد العمل (`remapCommune`), which tells Clients through the
 * event `zone.remapped` so that the sites of that commune follow.
 */

/** Where the pickers keep their lists. `revalidatePath(PLACES_PATH)` refreshes every one of them. */
export const PLACES_PATH = "/places";

export interface EnsureCommuneInput {
  wilayaCode: string;
  nameAr: string;
  nameFr?: string | null;
}

/**
 * The commune of that name in that wilaya, created when it is new. Two
 * spellings of one name are one commune: «ام البواقي» finds «أم البواقي».
 * Called by Clients and People inside their own save, and by the picker's "add".
 */
export async function ensureCommune(
  ex: Executor,
  ctx: ServiceContext,
  input: EnsureCommuneInput,
): Promise<{ id: string; created: boolean }> {
  const nameAr = input.nameAr.trim().replace(/\s+/g, " ");
  const nameKey = normaliseName(nameAr);
  if (!nameKey) throw new ServiceError("The commune name cannot be empty.");
  if (!isWilayaCode(input.wilayaCode)) throw new ServiceError("Choose a wilaya from the list.");

  const existing = await ex
    .selectFrom("Commune")
    .select("id")
    .where("wilayaCode", "=", input.wilayaCode)
    .where("nameKey", "=", nameKey)
    .executeTakeFirst();
  if (existing) return { id: existing.id, created: false };

  const id = newId();
  await ex
    .insertInto("Commune")
    .values({
      id,
      wilayaCode: input.wilayaCode,
      nameAr,
      nameFr: input.nameFr?.trim() || null,
      nameKey,
      zoneId: null,
      isSeeded: 0,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  return { id, created: true };
}

/**
 * The zone of a commune, created and named after it when it has none (A9).
 * Called when a site or a worker's residence is saved, in that transaction.
 */
export async function ensureZoneForCommune(
  ex: Executor,
  ctx: ServiceContext,
  input: { communeId: string },
): Promise<{ zoneId: string; created: boolean }> {
  const commune = await ex
    .selectFrom("Commune")
    .select(["id", "nameAr", "zoneId"])
    .where("id", "=", input.communeId)
    .executeTakeFirst();
  if (!commune) throw new ServiceError("This commune does not exist.");
  if (commune.zoneId) return { zoneId: commune.zoneId, created: false };

  const zoneId = newId();
  await ex
    .insertInto("Zone")
    .values({
      id: zoneId,
      name: commune.nameAr,
      branchId: ctx.branchId,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  // Only the columns that change: a save never names a column it does not mean to touch.
  await ex
    .updateTable("Commune")
    .set({ zoneId, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", commune.id)
    .execute();
  return { zoneId, created: true };
}

/**
 * Puts a commune in another zone (Settings › قواعد العمل). The places of that
 * commune that were in its old zone follow: Clients moves its sites in its
 * handler of `zone.remapped`, in this same transaction.
 */
export async function remapCommune(
  ex: Executor,
  ctx: ServiceContext,
  input: { communeId: string; toZoneId: string },
): Promise<{ changed: boolean }> {
  requireCapability(ctx, "settings.rules");

  const commune = await ex
    .selectFrom("Commune")
    .select(["id", "nameAr", "zoneId"])
    .where("id", "=", input.communeId)
    .executeTakeFirst();
  if (!commune) throw new ServiceError("This commune does not exist.");
  const zone = await ex
    .selectFrom("Zone")
    .select(["id", "name", "isActive"])
    .where("id", "=", input.toZoneId)
    .executeTakeFirst();
  if (!zone || !zone.isActive) throw new ServiceError("This zone does not exist or is not active.");
  if (commune.zoneId === zone.id) return { changed: false };

  await ex
    .updateTable("Commune")
    .set({ zoneId: zone.id, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", commune.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "FOUNDATION",
    action: "UPDATE",
    entity: "Commune",
    entityId: commune.id,
    entityLabel: commune.nameAr,
    changes: { zoneId: [commune.zoneId, zone.id] },
    context: { toZoneName: zone.name },
  });
  await emit(ex, ctx, "zone.remapped", { communeId: commune.id, fromZoneId: commune.zoneId, toZoneId: zone.id });
  return { changed: true };
}

/** The communes of a wilaya, for an address picker: seeded ones first, then by name. */
export async function listCommunes(ex: Executor, _ctx: ServiceContext, input: { wilayaCode: string; search?: string }) {
  let rows = ex
    .selectFrom("Commune")
    .select(["id", "wilayaCode", "nameAr", "nameFr", "zoneId", "isSeeded"])
    .where("wilayaCode", "=", input.wilayaCode)
    .where("isActive", "=", 1);
  const key = normaliseName(input.search);
  if (key) rows = rows.where("nameKey", "like", `%${key.replace(/[%_]/g, "")}%`);
  return rows.orderBy("isSeeded", "desc").orderBy("nameAr").execute();
}

/** The active zones, for a zone picker. */
export async function listZones(ex: Executor) {
  return ex.selectFrom("Zone").select(["id", "name", "branchId"]).where("isActive", "=", 1).orderBy("name").execute();
}

/**
 * The picker's «إضافة بلدية» (CommunePicker, the zones card). `ensureCommune`
 * is called by Clients and People inside their own saves, which check their
 * own rights; typed on its own it needs a right that types a place: the work
 * rules, or WRITE on a section whose forms hold an address (audit ACC-4).
 */
export async function addCommune(
  ex: Executor,
  ctx: ServiceContext,
  input: EnsureCommuneInput,
): Promise<{ id: string; created: boolean }> {
  const typesPlaces =
    can(ctx, "settings.rules") ||
    (["REQUESTS", "WORKERS", "EMPLOYEES"] as const).some((section) => sectionLevel(ctx, section) === "WRITE");
  if (!typesPlaces) throw new ServiceError("You do not have permission to do this.");
  return ensureCommune(ex, ctx, input);
}

// ── What the screens call ────────────────────────────────────────────────────

export const addCommuneAction = action(addCommune, { revalidate: [PLACES_PATH] });
export const remapCommuneAction = action(remapCommune, { revalidate: [PLACES_PATH, "/dashboard/settings"] });
export const listCommunesQuery = query(listCommunes);
export const listZonesQuery = query((ex: Executor) => listZones(ex));
