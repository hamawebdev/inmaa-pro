import { servicesOfDivision, type ServiceCatalogue } from "@/lib/options/service-catalogue";

import { CATALOGUE_LISTS, FORM_KIND_OF, isCatalogueList } from "../validators/option-lists";

import type {
  FormDefinition,
  FormOption,
  FormRow,
  ResolvedDefinition,
  ServiceRowSpec,
  SheetBlock,
  SheetCellDef,
} from "./types";
import type { FormValues } from "./values";

/**
 * His two service lists on his forms. The services are the manager's rows (Settings › الخدمات); a form
 * definition says only where its service rows sit on paper (`ServiceRowSpec`). `resolveDefinition` fills each
 * such row with what its division offers today, in the division's order, plus whatever the file already ticks
 * (a removed service stays on the files that have it, at its old place), and places them in his columns.
 *
 * Pure: the screen resolves with `useServiceCatalogue()`, a service with `listServiceCatalogue(ex)`, a test
 * with `catalogueFromSeed()` (his lists as migration 0003 seeded them, which reproduce his Word layout).
 */

/** What a file already ticks, by the answer that holds it. Absent: a new form or an empty one. */
export type KeptServices = Pick<FormValues, "providedServices" | "programmedServices"> | null | undefined;

/** The blank lines a row prints: a service row's from its spec (they never depend on the catalogue). */
export function blankCountOf(row: FormRow): number {
  if (row.services) return row.services.columns.reduce((count, column) => count + column.blanks.length, 0);
  return (row.options ?? []).filter((option) => option.free).length;
}

/**
 * How many services each column takes: the services and blank lines shared out evenly, earlier columns taking
 * the extra, each column then holding its share less its own blank lines. A column whose blank lines exceed its
 * share takes none, and the services it cannot hold go to the columns with room, last columns giving first.
 */
export function columnServiceCounts(services: number, blanks: readonly number[]): number[] {
  const columns = blanks.length;
  if (columns === 0) return [];
  const total = services + blanks.reduce((sum, count) => sum + count, 0);
  const counts = blanks.map((own, index) =>
    Math.max(0, Math.floor(total / columns) + (index < total % columns ? 1 : 0) - own),
  );
  let missing = services - counts.reduce((sum, count) => sum + count, 0);
  const cells = (index: number) => counts[index] + blanks[index];
  while (missing > 0) {
    let at = 0;
    for (let index = 1; index < columns; index += 1) if (cells(index) < cells(at)) at = index;
    counts[at] += 1;
    missing -= 1;
  }
  while (missing < 0) {
    let at = -1;
    for (let index = columns - 1; index >= 0; index -= 1) {
      if (counts[index] > 0 && (at === -1 || cells(index) > cells(at))) at = index;
    }
    counts[at] -= 1;
    missing += 1;
  }
  return counts;
}

interface Laid {
  options: FormOption[];
  /** Each column's [from, to) in `options`, first column first. */
  ranges: Array<[number, number]>;
}

function layRow(
  row: FormRow,
  spec: ServiceRowSpec,
  definition: FormDefinition,
  catalogue: ServiceCatalogue,
  keep: KeptServices,
): Laid {
  const list = CATALOGUE_LISTS[row.list as keyof typeof CATALOGUE_LISTS];
  const ticked =
    row.key && keep ? ((keep as Record<string, unknown>)[row.key] as readonly string[] | undefined) : undefined;
  const services = servicesOfDivision(catalogue, list, FORM_KIND_OF[definition.kind].division, ticked ?? []);
  const counts = columnServiceCounts(
    services.length,
    spec.columns.map((column) => column.blanks.length),
  );
  const options: FormOption[] = [];
  const ranges: Array<[number, number]> = [];
  let next = 0;
  spec.columns.forEach((column, index) => {
    const from = options.length;
    for (const service of services.slice(next, next + counts[index])) {
      options.push({
        raw: service.labels.ar,
        side: spec.sideOf?.[service.code] ?? spec.side,
        code: service.code,
        labels: service.labels,
        ...(service.offered ? {} : { removed: true }),
      });
    }
    next += counts[index];
    for (const blank of column.blanks) {
      options.push({ raw: "", free: true, side: blank.side, ...(blank.sameLine ? { sameLine: true } : {}) });
    }
    ranges.push([from, options.length]);
  });
  return { options, ranges };
}

function withRanges(sheet: SheetBlock[], laid: ReadonlyMap<string, Laid>): SheetBlock[] {
  const seen = new Map<string, number>();
  const cell = (definition: SheetCellDef): SheetCellDef => ({
    ...definition,
    parts: definition.parts.map((part) => {
      if (part.t !== "options") return part;
      const row = laid.get(part.row);
      if (!row) return part;
      const index = seen.get(part.row) ?? 0;
      seen.set(part.row, index + 1);
      const range = row.ranges[index];
      if (!range) throw new Error(`clients: the sheet has more columns for ${part.row} than its spec`);
      return { ...part, from: range[0], to: range[1] };
    }),
  });
  return sheet.map((block) =>
    block.t === "table" ? { ...block, rows: block.rows.map((row) => ({ ...row, cells: row.cells.map(cell) })) } : block,
  );
}

/**
 * The form with its service rows filled from his lists: the division's services in its order, the codes the
 * file already ticks kept at their place (marked `removed` when no longer offered), laid out in his columns.
 */
export function resolveDefinition(
  definition: FormDefinition,
  catalogue: ServiceCatalogue,
  keep?: KeptServices,
): ResolvedDefinition {
  const laid = new Map<string, Laid>();
  const rows = definition.rows.map((row) => {
    if (!row.services || !isCatalogueList(row.list)) return row;
    const placed = layRow(row, row.services, definition, catalogue, keep);
    laid.set(row.id, placed);
    return { ...row, options: placed.options };
  });
  return { ...definition, rows, sheet: withRanges(definition.sheet, laid), resolved: true };
}

/** The codes a file ticks in his two lists, to keep on its form whatever the catalogue says today. */
export function keptServicesOf(values: Partial<FormValues> | null | undefined): KeptServices {
  if (!values) return null;
  return { providedServices: values.providedServices ?? [], programmedServices: values.programmedServices ?? [] };
}

/** The services a resolved form offers today, by code: its service rows' options that are not kept-but-removed. */
export function offeredServiceCodes(definition: ResolvedDefinition): Set<string> {
  const codes = new Set<string>();
  for (const row of definition.rows) {
    if (!row.services) continue;
    for (const option of row.options ?? []) if (option.code !== undefined && !option.removed) codes.add(option.code);
  }
  return codes;
}
