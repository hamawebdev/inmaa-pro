import { useQuery } from "@tanstack/react-query";

import { commands, type LicenseStatus } from "@/lib/bindings";

export const LICENSE_QUERY_KEY = ["license"] as const;

/**
 * The trial's remaining time, straight from Rust.
 *
 * Refetched on a timer so a Settings screen left open on the office desk all day
 * keeps telling the truth — the countdown is aged in Rust once a minute (see
 * `license::tick`), and without this the card would still be showing whatever it
 * read at breakfast.
 *
 * `staleTime` matches the interval: anything shorter would refetch on every
 * remount for a figure that changes once a minute, and anything longer would
 * make the interval itself pointless.
 */
const REFRESH_MS = 60_000;

export function useLicense() {
  return useQuery<LicenseStatus>({
    queryKey: LICENSE_QUERY_KEY,
    queryFn: () => commands.licenseStatus(),
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
  });
}
