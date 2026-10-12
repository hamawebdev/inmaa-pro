import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  SETTINGS_QUERY_KEY,
  getAppSettings,
  saveAppSettings,
  type AppSettings,
} from "@/features/core/services/settings";

/**
 * App settings, as one cached object.
 *
 * `staleTime: Infinity` is inherited from the shared query client, which is
 * right here: nothing outside this app writes the manager's lock, so the cache
 * is only ever invalidated by our own mutation below.
 *
 * The route gate reads this on every navigation, so it must not be per-key —
 * one query for the whole set, one cache entry, no waterfall.
 */
export function useSettings() {
  return useQuery({
    queryKey: SETTINGS_QUERY_KEY,
    queryFn: getAppSettings,
  });
}

export function useSaveSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: AppSettings) => saveAppSettings(patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }),
  });
}
