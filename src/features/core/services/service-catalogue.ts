import { sql } from "kysely";

import { requireCapability, requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { DIVISIONS, isOneOf, type Division } from "@/lib/options";
import {
  SERVICE_LIST_CODES,
  type CatalogueEntry,
  type ServiceCatalogue,
  type ServiceLabels,
  type ServiceListCode,
  type ServicePlace,
} from "@/lib/options/service-catalogue";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { normaliseName } from "@/lib/text/normalise";

/**
 * His two service lists, «الخدمات المقدمة» and «الخدمات المبرمجة» (the developer, 2026-10-22): the manager adds
 * a service, renames it in Arabic, French and English, removes it, chooses which divisions offer it and moves it
 * within a division, in Settings › الخدمات. Migration 0003 seeded the 48 of his forms.
 *
 *  - A rename shows on every file that ticks the service, signed ones included: it is the same service.
 *  - A removed service (`isActive` 0) is no longer offered on a new form; a file that ticks it keeps it, at its
 *    old place, on screen and on paper. Nothing is ever deleted (`noDelete`).
 *  - A service added here is coded `ADDED_<n>` in its list, never reused: the code is what `FileService` stores.
 *
 * Clients resolve their forms' service rows from `listServiceCatalogue` (src/features/clients/forms/catalogue.ts);
 * Operations name tasks with `serviceLabels`. Every screen reads the lists under `SERVICE_CATALOGUE_PATH`, so
 * the save's revalidation refreshes them all.
 */
export const SERVICE_CATALOGUE_PATH = "/dashboard/settings/services";

/** Longest name a service may have, in any language: a line of a column on his forms. */
export const SERVICE_LABEL_MAX = 80;

/** Both lists, every service (removed ones too), each with its three names and its place in each division. */
export async function listServiceCatalogue(ex: Executor): Promise<ServiceCatalogue> {
  const services = await ex
    .selectFrom("CatalogueService")
    .select(["id", "list", "code", "labelAr", "labelFr", "labelEn", "isActive"])
    .orderBy("createdAt")
    .orderBy(sql`rowid`)
    .execute();
  const places = await ex
    .selectFrom("CatalogueServiceDivision")
    .select(["serviceId", "division", "sortOrder", "isActive"])
    .execute();
  const byService = new Map<string, Partial<Record<Division, ServicePlace>>>();
  for (const place of places) {
    if (!isOneOf(DIVISIONS, place.division)) continue;
    const of = byService.get(place.serviceId) ?? {};
    of[place.division] = { sortOrder: place.sortOrder, isActive: place.isActive === 1 };
    byService.set(place.serviceId, of);
  }
  const catalogue: Record<ServiceListCode, CatalogueEntry[]> = { PROVIDED: [], PROGRAMMED: [] };
  for (const row of services) {
    if (!isOneOf(SERVICE_LIST_CODES, row.list)) continue;
    catalogue[row.list].push({
      id: row.id,
      list: row.list,
      code: row.code,
      labels: { ar: row.labelAr, fr: row.labelFr, en: row.labelEn },
      isActive: row.isActive === 1,
      places: byService.get(row.id) ?? {},
    });
  }
  return catalogue;
}

/** Each code's Arabic name, removed services included (old files still show them). */
export async function serviceLabels(ex: Executor, list: ServiceListCode): Promise<Map<string, string>> {
  const rows = await ex.selectFrom("CatalogueService").select(["code", "labelAr"]).where("list", "=", list).execute();
  return new Map(rows.map((row) => [row.code, row.labelAr]));
}

/** A service as the editor sends it back. */
export interface ServiceDraft {
  /** Absent for a service added in this edit. */
  id?: string;
  labels: ServiceLabels;
  /** False to remove it (it stays on the files that tick it), true to keep or restore it. */
  isActive: boolean;
  /**
   * The divisions that offer it, each with its place: lower first. A division left out no longer offers it.
   * Places are stored as sent, never renumbered, so a removed service keeps its place among the others: the
   * editor moves a service by swapping places with its neighbour and puts a new one after the last.
   */
  places: Partial<Record<Division, number>>;
}

export interface SaveServiceCatalogueInput {
  list: ServiceListCode;
  /** The whole list: every service it holds (removed ones too), and the new ones. */
  services: ServiceDraft[];
}

const clean = (value: string) => value.trim().replace(/\s+/g, " ");

function checkedLabels(labels: ServiceLabels): ServiceLabels {
  const out = { ar: clean(labels.ar ?? ""), fr: clean(labels.fr ?? ""), en: clean(labels.en ?? "") };
  if (!out.ar || !out.fr || !out.en) throw new ServiceError("A service needs its name in Arabic, French and English.");
  if ([out.ar, out.fr, out.en].some((label) => label.length > SERVICE_LABEL_MAX)) {
    throw new ServiceError("A service's name is at most 80 characters.");
  }
  return out;
}

/**
 * Saves one list as the editor left it: services added, renamed, removed or restored, their divisions and their
 * places. Only what changed is written, each change one CHANGE entry in the log. The manager's, or a role given
 * `settings.rules`.
 */
export async function saveServiceCatalogue(
  ex: Executor,
  ctx: ServiceContext,
  input: SaveServiceCatalogueInput,
): Promise<{ added: number; changed: number }> {
  requireSection(ctx, "SETTINGS", "WRITE");
  requireCapability(ctx, "settings.rules");
  if (!isOneOf(SERVICE_LIST_CODES, input.list)) throw new Error("core: unknown service list");
  const list = input.list;

  const before = (await listServiceCatalogue(ex))[list];
  const known = new Map(before.map((entry) => [entry.id, entry]));
  const sent = new Set<string>();
  for (const draft of input.services) {
    if (draft.id === undefined) continue;
    if (!known.has(draft.id) || sent.has(draft.id))
      throw new ServiceError("This list has changed. Reload it and try again.");
    sent.add(draft.id);
  }
  if (sent.size !== known.size) throw new ServiceError("This list has changed. Reload it and try again.");

  const drafts = input.services.map((draft) => {
    const labels = checkedLabels(draft.labels);
    for (const [division, at] of Object.entries(draft.places)) {
      if (!isOneOf(DIVISIONS, division)) throw new ServiceError("This division does not exist.");
      if (!Number.isInteger(at) || (at as number) < 0) throw new Error("core: a service's place is a whole number");
    }
    if (draft.isActive && Object.keys(draft.places).length === 0) {
      throw new ServiceError("Choose at least one division for each service.");
    }
    return { ...draft, labels };
  });

  const names = new Set<string>();
  for (const draft of drafts.filter((candidate) => candidate.isActive)) {
    const key = normaliseName(draft.labels.ar);
    if (names.has(key)) throw new ServiceError("Two services of this list have the same name.");
    names.add(key);
  }

  let nextAdded =
    Math.max(0, ...before.map((entry) => Number(/^ADDED_(\d+)$/.exec(entry.code)?.[1] ?? 0)).filter(Number.isFinite)) +
    1;
  let added = 0;
  let changed = 0;

  for (const draft of drafts) {
    const wanted = draft.places;
    const placesText = (of: Partial<Record<Division, number>>) =>
      DIVISIONS.filter((division) => of[division] !== undefined)
        .map((division) => `${division} ${(of[division] ?? 0) + 1}`)
        .join(", ");

    if (draft.id === undefined) {
      const id = newId();
      const code = `ADDED_${nextAdded++}`;
      await ex
        .insertInto("CatalogueService")
        .values({
          id,
          list,
          code,
          labelAr: draft.labels.ar,
          labelFr: draft.labels.fr,
          labelEn: draft.labels.en,
          isActive: draft.isActive ? 1 : 0,
          createdAt: ctx.now,
          updatedAt: ctx.now,
          createdByUserId: ctx.userId,
          updatedByUserId: ctx.userId,
        })
        .execute();
      for (const division of DIVISIONS) {
        const at = wanted[division];
        if (at === undefined) continue;
        await ex
          .insertInto("CatalogueServiceDivision")
          .values({
            id: newId(),
            serviceId: id,
            division,
            sortOrder: at,
            isActive: 1,
            createdAt: ctx.now,
            updatedAt: ctx.now,
          })
          .execute();
      }
      await logChange(ex, ctx, {
        owner: "FOUNDATION",
        action: "CREATE",
        entity: "CatalogueService",
        entityId: id,
        entityLabel: draft.labels.ar,
        changes: {
          list: [null, list],
          code: [null, code],
          labelAr: [null, draft.labels.ar],
          labelFr: [null, draft.labels.fr],
          labelEn: [null, draft.labels.en],
          places: [null, placesText(wanted)],
        },
      });
      added += 1;
      continue;
    }

    const entry = known.get(draft.id)!;
    const changes: Record<string, readonly [unknown, unknown]> = {};
    const { set, changes: labelChanges } = changedColumns(
      { labelAr: entry.labels.ar, labelFr: entry.labels.fr, labelEn: entry.labels.en },
      { labelAr: draft.labels.ar, labelFr: draft.labels.fr, labelEn: draft.labels.en },
    );
    Object.assign(changes, labelChanges ?? {});
    const activeChanged = entry.isActive !== draft.isActive;
    if (labelChanges || activeChanged) {
      await ex
        .updateTable("CatalogueService")
        .set({
          ...set,
          ...(activeChanged ? { isActive: draft.isActive ? 1 : 0 } : {}),
          updatedAt: ctx.now,
          updatedByUserId: ctx.userId,
        })
        .where("id", "=", entry.id)
        .execute();
    }
    if (activeChanged) changes.isActive = [entry.isActive, draft.isActive];

    const was: Partial<Record<Division, number>> = {};
    for (const division of DIVISIONS) {
      const place = entry.places[division];
      if (place?.isActive) was[division] = place.sortOrder;
    }
    for (const division of DIVISIONS) {
      const place = entry.places[division];
      const at = wanted[division];
      if (at === undefined) {
        if (place?.isActive) {
          await ex
            .updateTable("CatalogueServiceDivision")
            .set({ isActive: 0, updatedAt: ctx.now })
            .where("serviceId", "=", entry.id)
            .where("division", "=", division)
            .execute();
        }
        continue;
      }
      if (!place) {
        await ex
          .insertInto("CatalogueServiceDivision")
          .values({
            id: newId(),
            serviceId: entry.id,
            division,
            sortOrder: at,
            isActive: 1,
            createdAt: ctx.now,
            updatedAt: ctx.now,
          })
          .execute();
      } else if (!place.isActive || place.sortOrder !== at) {
        await ex
          .updateTable("CatalogueServiceDivision")
          .set({
            ...(place.isActive ? {} : { isActive: 1 }),
            ...(place.sortOrder !== at ? { sortOrder: at } : {}),
            updatedAt: ctx.now,
          })
          .where("serviceId", "=", entry.id)
          .where("division", "=", division)
          .execute();
      }
    }
    if (placesText(was) !== placesText(wanted)) changes.places = [placesText(was), placesText(wanted)];

    if (Object.keys(changes).length === 0) continue;
    await logChange(ex, ctx, {
      owner: "FOUNDATION",
      action: activeChanged && Object.keys(changes).length === 1 ? "STATUS_CHANGE" : "UPDATE",
      entity: "CatalogueService",
      entityId: entry.id,
      entityLabel: draft.labels.ar,
      changes,
    });
    changed += 1;
  }
  return { added, changed };
}

/** What the editor's Save sends: each list it changed, saved together, so that one press is one change or none. */
export async function saveServiceLists(
  ex: Executor,
  ctx: ServiceContext,
  input: { lists: SaveServiceCatalogueInput[] },
): Promise<{ added: number; changed: number }> {
  requireSection(ctx, "SETTINGS", "WRITE");
  requireCapability(ctx, "settings.rules");
  const lists = new Set(input.lists.map((entry) => entry.list));
  if (lists.size !== input.lists.length) throw new Error("core: a service list sent twice");
  let added = 0;
  let changed = 0;
  for (const entry of input.lists) {
    const done = await saveServiceCatalogue(ex, ctx, entry);
    added += done.added;
    changed += done.changed;
  }
  return { added, changed };
}

export const listServiceCatalogueQuery = query((ex: Executor) => listServiceCatalogue(ex));
export const saveServiceListsAction = action(saveServiceLists, { revalidate: [SERVICE_CATALOGUE_PATH] });
