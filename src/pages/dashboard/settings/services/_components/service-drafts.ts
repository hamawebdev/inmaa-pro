import type { ServiceDraft, SaveServiceCatalogueInput } from "@/features/core/services/service-catalogue";
import { DIVISIONS, type Division } from "@/lib/options";
import {
  SERVICE_LIST_CODES,
  type ServiceCatalogue,
  type ServiceLabels,
  type ServiceListCode,
} from "@/lib/options/service-catalogue";

/**
 * The editor of Settings › الخدمات works on a draft of both lists; nothing reaches the database until Save
 * (`saveServiceListsAction`). These are the draft's rules, pure so that they can be tested:
 *
 *  - a service's `places` are the divisions that offer it, each with its place (lower first);
 *  - a move swaps places with the neighbour in that division, so a removed service keeps its place for the
 *    old files that tick it;
 *  - what is added, given a division or restored goes after the last place of that division.
 */

export interface DraftService {
  /** The row's id, or "new-…" for a service added in this draft. */
  key: string;
  id?: string;
  code?: string;
  labels: ServiceLabels;
  isActive: boolean;
  places: Partial<Record<Division, number>>;
}

export type DraftLists = Readonly<Record<ServiceListCode, readonly DraftService[]>>;

/** The lists as saved, as a draft. */
export function draftsOf(catalogue: ServiceCatalogue): DraftLists {
  const of = (list: ServiceListCode): DraftService[] =>
    catalogue[list].map((entry) => ({
      key: entry.id,
      id: entry.id,
      code: entry.code,
      labels: { ...entry.labels },
      isActive: entry.isActive,
      places: Object.fromEntries(
        DIVISIONS.flatMap((division) => {
          const place = entry.places[division];
          return place?.isActive ? [[division, place.sortOrder]] : [];
        }),
      ),
    }));
  return { PROVIDED: of("PROVIDED"), PROGRAMMED: of("PROGRAMMED") };
}

const placeOf = (service: DraftService, division: Division) => service.places[division];

/** The services a division's forms offer, in its order. */
export function offeredIn(drafts: DraftLists, list: ServiceListCode, division: Division): DraftService[] {
  return drafts[list]
    .filter((service) => service.isActive && placeOf(service, division) !== undefined)
    .sort((a, b) => placeOf(a, division)! - placeOf(b, division)! || a.key.localeCompare(b.key));
}

/** The list's services that other divisions offer and this one does not. */
export function othersOf(drafts: DraftLists, list: ServiceListCode, division: Division): DraftService[] {
  return drafts[list].filter((service) => service.isActive && placeOf(service, division) === undefined);
}

/** The list's removed services. */
export function removedOf(drafts: DraftLists, list: ServiceListCode): DraftService[] {
  return drafts[list].filter((service) => !service.isActive);
}

/** The place after every service that has one in this division, removed ones included. */
function endOf(services: readonly DraftService[], division: Division): number {
  return services.reduce((last, service) => Math.max(last, (placeOf(service, division) ?? -1) + 1), 0);
}

function withList(drafts: DraftLists, list: ServiceListCode, services: DraftService[]): DraftLists {
  return { ...drafts, [list]: services };
}

function changeOne(
  drafts: DraftLists,
  list: ServiceListCode,
  key: string,
  change: (service: DraftService, all: readonly DraftService[]) => DraftService,
): DraftLists {
  return withList(
    drafts,
    list,
    drafts[list].map((service) => (service.key === key ? change(service, drafts[list]) : service)),
  );
}

/** Moves a service one place up (-1) or down (1) on a division's forms. */
export function moveService(
  drafts: DraftLists,
  list: ServiceListCode,
  division: Division,
  key: string,
  step: -1 | 1,
): DraftLists {
  const order = offeredIn(drafts, list, division);
  const at = order.findIndex((service) => service.key === key);
  const other = order[at + step];
  if (at < 0 || !other) return drafts;
  const mine = placeOf(order[at], division)!;
  const theirs = placeOf(other, division)!;
  return withList(
    drafts,
    list,
    drafts[list].map((service) =>
      service.key === key
        ? { ...service, places: { ...service.places, [division]: theirs } }
        : service.key === other.key
          ? { ...service, places: { ...service.places, [division]: mine } }
          : service,
    ),
  );
}

/** Adds a service to the divisions chosen, after their last one. */
export function addService(
  drafts: DraftLists,
  list: ServiceListCode,
  key: string,
  labels: ServiceLabels,
  divisions: readonly Division[],
): DraftLists {
  const places = Object.fromEntries(divisions.map((division) => [division, endOf(drafts[list], division)]));
  return withList(drafts, list, [...drafts[list], { key, labels, isActive: true, places }]);
}

/** Renames a service and gives it the divisions chosen: a new one goes last there, one left out drops it. */
export function updateService(
  drafts: DraftLists,
  list: ServiceListCode,
  key: string,
  labels: ServiceLabels,
  divisions: readonly Division[],
): DraftLists {
  return changeOne(drafts, list, key, (service, all) => ({
    ...service,
    labels,
    places: Object.fromEntries(
      DIVISIONS.filter((division) => divisions.includes(division)).map((division) => [
        division,
        placeOf(service, division) ?? endOf(all, division),
      ]),
    ),
  }));
}

/** Removes a service: no longer offered; the files that tick it keep it. */
export function removeService(drafts: DraftLists, list: ServiceListCode, key: string): DraftLists {
  return changeOne(drafts, list, key, (service) => ({ ...service, isActive: false }));
}

/** Offers a removed service again, last on each division that had it. */
export function restoreService(drafts: DraftLists, list: ServiceListCode, key: string): DraftLists {
  return changeOne(drafts, list, key, (service, all) => ({
    ...service,
    isActive: true,
    places: Object.fromEntries(
      DIVISIONS.filter((division) => placeOf(service, division) !== undefined).map((division) => [
        division,
        endOf(all, division),
      ]),
    ),
  }));
}

/** Offers a service of other divisions on this one too, last. */
export function addToDivision(drafts: DraftLists, list: ServiceListCode, key: string, division: Division) {
  return changeOne(drafts, list, key, (service, all) => ({
    ...service,
    places: { ...service.places, [division]: endOf(all, division) },
  }));
}

const same = (a: DraftService | undefined, b: DraftService) =>
  a !== undefined &&
  a.isActive === b.isActive &&
  a.labels.ar === b.labels.ar &&
  a.labels.fr === b.labels.fr &&
  a.labels.en === b.labels.en &&
  DIVISIONS.every((division) => placeOf(a, division) === placeOf(b, division));

/** How many services the draft adds or changes against the lists as saved. */
export function changeCount(base: DraftLists, draft: DraftLists): number {
  return SERVICE_LIST_CODES.reduce((count, list) => {
    const saved = new Map(base[list].map((service) => [service.key, service]));
    return count + draft[list].filter((service) => !same(saved.get(service.key), service)).length;
  }, 0);
}

/** What Save sends: each list the draft changed, whole. */
export function saveInputOf(base: DraftLists, draft: DraftLists): { lists: SaveServiceCatalogueInput[] } {
  const lists = SERVICE_LIST_CODES.filter((list) => {
    const saved = new Map(base[list].map((service) => [service.key, service]));
    return draft[list].some((service) => !same(saved.get(service.key), service));
  });
  return {
    lists: lists.map((list) => ({
      list,
      services: draft[list].map(
        (service): ServiceDraft => ({
          ...(service.id ? { id: service.id } : {}),
          labels: service.labels,
          isActive: service.isActive,
          places: service.places,
        }),
      ),
    })),
  };
}
