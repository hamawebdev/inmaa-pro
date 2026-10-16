import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Skeleton } from "@/components/ui/skeleton";
import { getRepVisitQuery, REP_VISITS_PATH } from "@/features/clients/services/rep-visits";
import { pathKey } from "@/lib/compat/revalidate";

import { RepVisitForm } from "../_components/rep-visit-form";

/**
 * One visit of the sales rep: what was typed, the call-back, the file it became.
 *
 * Closest academy screen: the employee edit page (employees/[id]/page.tsx).
 */
export default function RepVisitPage() {
  const { id = "" } = useParams();
  const t = useTranslations("RepVisits");
  const tNav = useTranslations("Nav");
  const view = useQuery({
    queryKey: [...pathKey(REP_VISITS_PATH), "visit", id],
    queryFn: () => getRepVisitQuery({ repVisitId: id }),
  });
  return (
    <DetailScreen
      section="employees"
      title={view.data?.visit.prospectName ?? t("Title")}
      description={t("Title")}
      back={{ href: REP_VISITS_PATH, label: tNav("RepVisits") }}
    >
      {view.data ? (
        <RepVisitForm key={view.dataUpdatedAt} view={view.data} />
      ) : view.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <p className="py-16 text-center text-base text-muted-foreground">{t("NotFound")}</p>
      )}
    </DetailScreen>
  );
}
