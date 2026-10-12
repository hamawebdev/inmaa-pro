import { Briefcase, Building, Building2, House, Sigma, Store, type LucideIcon } from "lucide-react";

import { StatCard } from "@/components/stat-card";
import { useSearchParams } from "@/lib/compat/navigation";
import type { SectionId } from "@/navigation/sections";

import type { ExpenseDivision } from "../validators/option-codes";

import { ALL, divisionSearch } from "./division-param";

/** One icon per line, the same on every money screen. */
const ICONS: Record<ExpenseDivision | typeof ALL, LucideIcon> = {
  [ALL]: Sigma,
  HOUSING: House,
  ORGANISATION: Store,
  BUILDING: Building,
  COMPLEX: Building2,
  COMMON: Briefcase,
};

export interface DivisionTile {
  id: ExpenseDivision | typeof ALL;
  label: string;
  /** The figure as written, in the one money format: «277.238,46 دج». */
  value: string;
}

/**
 * A tile per division and one for the total, each opening its division below.
 *
 * The newer generation's `StatCard`, as on the academy's home screen, in three
 * columns: a money figure is long, and five or six to a row would cut it.
 */
export function DivisionTiles({ section, tiles }: { section: SectionId; tiles: readonly DivisionTile[] }) {
  const search = useSearchParams();
  return (
    <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 tall:gap-6">
      {tiles.map((tile) => (
        <StatCard
          key={tile.id}
          label={tile.label}
          value={tile.value}
          icon={ICONS[tile.id]}
          tone={section}
          href={`?${divisionSearch(search, tile.id)}`}
        />
      ))}
    </div>
  );
}
