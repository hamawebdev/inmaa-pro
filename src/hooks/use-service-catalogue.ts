import { useCallback } from "react";

import { useQuery } from "@tanstack/react-query";
import { useLocale } from "use-intl";

import { listServiceCatalogueQuery, SERVICE_CATALOGUE_PATH } from "@/features/core/services/service-catalogue";
import { pathKey } from "@/lib/compat/revalidate";
import {
  catalogueEntry,
  serviceLabel,
  type ServiceCatalogue,
  type ServiceListCode,
} from "@/lib/options/service-catalogue";

/**
 * His two service lists, «الخدمات المقدمة» and «الخدمات المبرمجة», as the manager last saved them in
 * Settings › الخدمات. `catalogue` is null until read; a form that lists services waits for it.
 *
 *     const services = useServiceCatalogue();
 *     services.label("PROVIDED", "FLOORS");   // «تنظيف الأرضيات», "Sols", "Floors": the reader's language
 *
 * `label` knows removed services too (old files still show them) and answers the code itself for one it has
 * never heard of. Saving the lists refreshes every screen that reads them.
 */
export function useServiceCatalogue(): {
  catalogue: ServiceCatalogue | null;
  label: (list: ServiceListCode, code: string) => string;
  isPending: boolean;
  error: Error | null;
} {
  const locale = useLocale();
  const query = useQuery({
    queryKey: pathKey(SERVICE_CATALOGUE_PATH),
    queryFn: () => listServiceCatalogueQuery(undefined),
  });
  const catalogue = query.data ?? null;
  const label = useCallback(
    (list: ServiceListCode, code: string) => {
      const entry = catalogue ? catalogueEntry(catalogue, list, code) : null;
      return entry ? serviceLabel(entry.labels, locale) : code;
    },
    [catalogue, locale],
  );
  return { catalogue, label, isPending: query.isPending, error: query.error };
}
