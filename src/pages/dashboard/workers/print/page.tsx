import { useTranslations } from "use-intl";

import { EMPTY_WORKER_FORM } from "@/features/people/forms/worker-form-data";
import type { WorkerSheetPart } from "@/features/people/sheets/worker-sheet-parts";

import { WorkerPrintScreen } from "../_components/worker-print-screen";

/**
 * The blank worker registration form, to print and hand to a candidate.
 * Section «عمال النظافة», below the tab «العمال». Owner: People.
 *
 * Closest academy screen: the ID card page (see WorkerPrintScreen).
 */
export default function WorkerBlankFormPage({ part = "all" }: { part?: WorkerSheetPart }) {
  const t = useTranslations("WorkerPrint");

  return (
    <WorkerPrintScreen
      base="/dashboard/workers"
      part={part}
      data={EMPTY_WORKER_FORM}
      title={t("BlankTitle")}
      description={t("BlankDescription")}
    />
  );
}
