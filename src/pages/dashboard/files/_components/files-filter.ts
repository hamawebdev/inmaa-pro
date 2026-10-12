import { DIVISIONS_WITH_REQUESTS, type Division, type ServiceType } from "@/features/clients/validators/option-lists";
import { useSearchParams } from "@/lib/compat/navigation";
import { DIVISIONS, SERVICE_TYPES } from "@/lib/options";
import { FILES_PATH } from "@/navigation/file-parts";

/**
 * Which division and which kind of service the list of files shows: both live
 * in the address (`?division=BUILDING&service=CONTRACT`), so the way back from
 * a file lands on the same list.
 */

export const ALL = "ALL";

/** The list's address for a division and a kind of service. */
export function filesHref(division: Division, service: ServiceType | typeof ALL = ALL): string {
  const params = new URLSearchParams({ division });
  if (service !== ALL && DIVISIONS_WITH_REQUESTS.includes(division)) params.set("service", service);
  return `${FILES_PATH}?${params.toString()}`;
}

export function useFilesFilter() {
  const search = useSearchParams();
  const division = (DIVISIONS as readonly string[]).includes(search.get("division") ?? "")
    ? (search.get("division") as Division)
    : "HOUSING";
  const requested = search.get("service");
  const service =
    DIVISIONS_WITH_REQUESTS.includes(division) && (SERVICE_TYPES as readonly string[]).includes(requested ?? "")
      ? (requested as ServiceType)
      : ALL;
  return { division, service } as const;
}
