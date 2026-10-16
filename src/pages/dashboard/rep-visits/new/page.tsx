import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { getRepVisitQuery, REP_VISITS_PATH } from "@/features/clients/services/rep-visits";
import { pathKey } from "@/lib/compat/revalidate";

import { RepVisitForm } from "../_components/rep-visit-form";

/**
 * A new visit of the sales rep, typed in from his notes.
 *
 * Closest academy screen: the new-employee page (employees/new/page.tsx).
 */
export default function NewRepVisitPage() {
  const t = useTranslations("RepVisits");
  const tNav = useTranslations("Nav");
  const view = useQuery({
    queryKey: [...pathKey(REP_VISITS_PATH), "new"],
    queryFn: () => getRepVisitQuery({}),
  });
  return (
    <DetailScreen section="employees" title={t("NewTitle")} back={{ href: REP_VISITS_PATH, label: tNav("RepVisits") }}>
      {view.data ? <RepVisitForm view={view.data} /> : <Skeleton className="h-96 w-full" />}
    </DetailScreen>
  );
}
