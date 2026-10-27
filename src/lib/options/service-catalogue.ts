import { DIVISIONS, type Division } from "./index";
import { SEED_CATALOGUE, SERVICE_LIST_CODES, seedServiceId, type ServiceListCode } from "./service-catalogue-seed";

/**
 * His two service lists as the program reads them: «الخدمات المقدمة» (PROVIDED) and «الخدمات المبرمجة»
 * (PROGRAMMED). They are rows (`CatalogueService`, `CatalogueServiceDivision`), the manager's to edit in
 * Settings › الخدمات; this module is the shape every reader shares, and the pure rules over it.
 *
 *  - `listServiceCatalogue(ex)` / `useServiceCatalogue()` read it (src/features/core/services/service-catalogue.ts,
 *    src/hooks/use-service-catalogue.ts);
 *  - `servicesOfDivision` is what one division's forms list: the services it offers, in its order, and the
 *    removed ones a file still ticks, in their old place;
 *  - `catalogueFromSeed()` is his lists as migration 0003 seeded them, for a test that has no database.
 */
export { SERVICE_LIST_CODES, type ServiceListCode };

export interface ServiceLabels {
  ar: string;
  fr: string;
  en: string;
}

/** A service's place on one division's forms. */
export interface ServicePlace {
  /** Print order on that division's forms, 0 first. */
  sortOrder: number;
  /** False once the division no longer offers it; the place stays for the files that tick it. */
  isActive: boolean;
}

export interface CatalogueEntry {
  /** `CatalogueService.id`. */
  id: string;
  list: ServiceListCode;
  /** What `FileService.code` stores; never changes. */
  code: string;
  labels: ServiceLabels;
  /** False once removed: no longer offered anywhere; files that tick it keep it. */
  isActive: boolean;
  places: Partial<Record<Division, ServicePlace>>;
}

/** Both lists, each in the order its services were added. */
export type ServiceCatalogue = Readonly<Record<ServiceListCode, readonly CatalogueEntry[]>>;

/** A service as one division's forms list it. */
export interface DivisionService {
  code: string;
  labels: ServiceLabels;
  /** False for a removed service (or one the division no longer offers) that is listed because a file ticks it. */
  offered: boolean;
}

/** Whether a service is offered on a division's forms today. */
export function isOffered(entry: CatalogueEntry, division: Division): boolean {
  return entry.isActive && entry.places[division]?.isActive === true;
}

/**
 * What one division's forms list, in print order: the services it offers today, and the codes in `keep` (a
 * file's own ticks) even when removed since, each at its place. A kept code that never had a place there comes
 * last; one the catalogue does not know at all (a hand-written database) is left out: it has no name to show.
 */
export function servicesOfDivision(
  catalogue: ServiceCatalogue,
  list: ServiceListCode,
  division: Division,
  keep: Iterable<string> = [],
): DivisionService[] {
  const kept = new Set(keep);
  const listed = catalogue[list]
    .filter((entry) => isOffered(entry, division) || kept.has(entry.code))
    .map((entry) => ({ entry, place: entry.places[division], offered: isOffered(entry, division) }));
  listed.sort(
    (a, b) =>
      (a.place?.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.place?.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      Number(b.offered) - Number(a.offered) ||
      a.entry.code.localeCompare(b.entry.code),
  );
  return listed.map(({ entry, offered }) => ({ code: entry.code, labels: entry.labels, offered }));
}

/** A service's name in a language; the Arabic one is his and is what paper prints. */
export function serviceLabel(labels: ServiceLabels, locale: string): string {
  return locale === "fr" ? labels.fr : locale === "en" ? labels.en : labels.ar;
}

/** The entry of a code, removed services included. */
export function catalogueEntry(catalogue: ServiceCatalogue, list: ServiceListCode, code: string) {
  return catalogue[list].find((entry) => entry.code === code) ?? null;
}

/** His two lists exactly as migration 0003 seeded them: for tests and for anything that runs without a database. */
export function catalogueFromSeed(): ServiceCatalogue {
  const build = (list: ServiceListCode): CatalogueEntry[] =>
    SEED_CATALOGUE[list].services.map((service) => {
      const places: Partial<Record<Division, ServicePlace>> = {};
      for (const division of DIVISIONS) {
        const index = SEED_CATALOGUE[list].of[division].indexOf(service.code);
        if (index >= 0) places[division] = { sortOrder: index, isActive: true };
      }
      return {
        id: seedServiceId(list, service.code),
        list,
        code: service.code,
        labels: { ar: service.ar, fr: service.fr, en: service.en },
        isActive: true,
        places,
      };
    });
  return { PROVIDED: build("PROVIDED"), PROGRAMMED: build("PROGRAMMED") };
}
