import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { SampleNotice } from "@/features/operations/components/sample-notice";
import { InspectionSheet } from "@/features/operations/sheets/inspection-sheet";
import { sampleInspectionSheet } from "@/features/operations/sheets/samples";

/**
 * The supervisor's inspection sheet of one inspection, to print. Section
 * «طلبات الخدمة», below «الجودة والشكاوى».
 *
 * Closest academy screen: students/[id]/card/page.tsx (a page that shows what
 * will be printed, with the print button in its heading).
 *
 * Until the inspection service exists, the last part of the path chooses a
 * sample: `sample-building`, `returned-housing`, `blank-complex`…
 */
export default function InspectionSheetPrintPage() {
  const { id } = useParams();
  const t = useTranslations("OperationsSheets");
  const tNav = useTranslations("Nav");

  return (
    <DetailScreen
      section="requests"
      title={t("InspectionSheet.Title")}
      description={t("InspectionSheet.Description")}
      back={{ href: "/dashboard/quality", label: tNav("Quality") }}
      actions={<PrintButton />}
    >
      <SampleNotice />
      <InspectionSheet sheet={sampleInspectionSheet(id)} />
    </DetailScreen>
  );
}
