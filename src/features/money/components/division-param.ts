import { useSearchParams } from "@/lib/compat/navigation";

/** The value of the "all divisions" tab. */
export const ALL = "ALL";

/** The division the address names (`?division=BUILDING`), or all of them. */
export function useDivisionParam<T extends string>(options: readonly T[]): T | typeof ALL {
  const value = useSearchParams().get("division");
  return value !== null && (options as readonly string[]).includes(value) ? (value as T) : ALL;
}

/** The query that shows one division, or all of them, keeping the period. */
export function divisionSearch(search: URLSearchParams, division: string): string {
  const next = new URLSearchParams(search);
  if (division === ALL) next.delete("division");
  else next.set("division", division);
  return next.toString();
}
