import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import { VisitEntryForm } from "@/features/operations/components/visit-entry/visit-entry-form";
import { VISITS_PATH } from "@/features/operations/services/programme";
import { getVisitEntryQuery } from "@/features/operations/services/visit-entry";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * One visit: where the office types the returned mission order from the sheet,
 * in one pass, and saves it once. Section «طلبات الخدمة», below «الزيارات».
 *
 * Closest academy screens: groups/[groupId]/page.tsx (a record's page with its
 * summary on top) and employees/new/page.tsx with its form (stacked cards,
 * Cancel and Save at the foot).
 */
export default function VisitPage() {
  const { id = "" } = useParams();
  const t = useTranslations("VisitEntry");
  const tNav = useTranslations("Nav");
  const clock = useCentreClock();
  const entry = useQuery({
    queryKey: pathKey(`${VISITS_PATH}/${id}`),
    queryFn: () => getVisitEntryQuery({ visitId: id }),
  });

  return (
    <DetailScreen
      section="requests"
      title={entry.data ? t("Title", { number: entry.data.visit.number }) : t("TitleLoading")}
      description={t("Description")}
      back={{ href: VISITS_PATH, label: tNav("Visits") }}
      actions={
        <Button asChild variant="info">
          <Link to={`${VISITS_PATH}/${id}/print`}>
            <Printer />
            {t("PrintOrder")}
          </Link>
        </Button>
      }
    >
      {entry.isError ? (
        <ErrorState onRetry={() => void entry.refetch()} />
      ) : entry.data ? (
        // A new visit is a new form: its defaults are read once, when it mounts.
        <VisitEntryForm key={entry.data.visit.id} data={entry.data} clock={clock} />
      ) : (
        <Skeleton className="h-96 w-full" />
      )}
    </DetailScreen>
  );
}
