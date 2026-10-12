import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { HandoutSlipSheet } from "@/features/stock/sheets/handout-slip-sheet";
import { sampleHandout } from "@/features/stock/sheets/samples";

/**
 * The slip for one hand-out, for the worker to sign.
 *
 * Closest academy screen: none hands anything out; the page follows the print
 * sample (settings/print-sample), below the hand-out it prints.
 *
 * Until hand-outs can be recorded, `:id` picks a sample: `sample` (equipment
 * and materials for a job) or `sample-kit` (a worker's own kit).
 */
export default function HandoutPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("StockPrint");
  const tNav = useTranslations("Nav");
  const slip = sampleHandout(id);

  return (
    <DetailScreen
      section="stock"
      title={t("HandoutTitle", { number: slip.number })}
      description={t("SampleNote")}
      back={{ href: "/dashboard/handouts", label: tNav("Handouts") }}
      actions={<PrintButton />}
    >
      <HandoutSlipSheet slip={slip} />
    </DetailScreen>
  );
}
