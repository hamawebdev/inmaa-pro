import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { FontCalibration } from "@/components/print/font-calibration";
import { SampleSheet } from "@/features/core/sheets/sample-sheet";

/**
 * The sample sheet, and the pattern every printed sheet follows:
 *
 *  - the sheet itself is a component in `src/features/<folder>/sheets/`;
 *  - it is shown by a page whose path ends in `/print` (or `/print-<name>`
 *    when a record has several sheets), below the record it prints;
 *  - that page is a `DetailScreen` with `<PrintButton />` in its actions and
 *    the sheet as its content. The preview and the printing are the sheet's.
 */
export default function PrintSamplePage() {
  const t = useTranslations("PrintSample");
  const tNav = useTranslations("Nav");

  return (
    <DetailScreen
      section="settings"
      title={t("Title")}
      back={{ href: "/dashboard/settings", label: tNav("SettingsHeading") }}
      actions={<PrintButton />}
    >
      <SampleSheet />
      <FontCalibration />
    </DetailScreen>
  );
}
