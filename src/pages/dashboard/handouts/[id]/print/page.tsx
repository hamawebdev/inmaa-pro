import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { getHandOutQuery, recordHandOutPrintedAction } from "@/features/stock/services/handouts";
import { HANDOUTS_PATH } from "@/features/stock/services/paths";
import { HandoutSlipSheet } from "@/features/stock/sheets/handout-slip-sheet";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The slip for one hand-out, for the worker to sign, from the stored hand-out
 * and its lines (services/handouts.ts).
 *
 * Closest academy screen: none hands anything out; the page follows the print
 * sample (settings/print-sample), below the hand-out it prints. The slip names
 * a worker: printing it is recorded first.
 */
export default function HandoutPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("StockPrint");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const { data } = useQuery({
    queryKey: [...pathKey(HANDOUTS_PATH), "slip", id],
    queryFn: () => getHandOutQuery({ handOutId: id }),
  });

  async function record() {
    const result = await recordHandOutPrintedAction({ handOutId: id });
    if (!result.success) toast.error(errorMessage(result.error, t("PrintNotRecorded")));
    return result.success;
  }

  return (
    <DetailScreen
      section="stock"
      title={data ? t("HandoutTitle", { number: data.slip.number }) : tNav("Handouts")}
      back={{ href: "/dashboard/handouts", label: tNav("Handouts") }}
      actions={data ? <PrintButton onPrint={record} /> : undefined}
    >
      {data ? <HandoutSlipSheet slip={data.slip} /> : <ScreenSkeleton />}
    </DetailScreen>
  );
}
