import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { getHandOutChoicesQuery } from "@/features/stock/services/handouts";
import { HANDOUTS_PATH } from "@/features/stock/services/paths";
import { pathKey } from "@/lib/compat/revalidate";
import { useSearchParams } from "@/lib/compat/navigation";

import { HandoutForm } from "./_components/handout-form";

/**
 * «تسليم جديد»: equipment and materials handed to a named worker, for a job
 * and one of its visits, or as the worker's own kit.
 *
 * Closest academy screen: the new-employee page (`/dashboard/employees/new`):
 * a detail screen with a form in cards and one save button. `?fileId=`,
 * `?visitId=` and `?workerId=` start the form from a file's part or a visit.
 */
export default function NewHandoutPage() {
  const t = useTranslations("HandoutForm");
  const tNav = useTranslations("Nav");
  const params = useSearchParams();
  const { data: choices } = useQuery({
    queryKey: [...pathKey(HANDOUTS_PATH), "choices"],
    queryFn: () => getHandOutChoicesQuery(undefined),
  });

  return (
    <DetailScreen
      section="stock"
      title={t("Title")}
      description={t("Description")}
      back={{ href: "/dashboard/handouts", label: tNav("Handouts") }}
    >
      {choices ? (
        <HandoutForm
          choices={choices}
          preset={{
            fileId: params.get("fileId") ?? "",
            visitId: params.get("visitId") ?? "",
            workerId: params.get("workerId") ?? "",
          }}
        />
      ) : (
        <ScreenSkeleton />
      )}
    </DetailScreen>
  );
}
