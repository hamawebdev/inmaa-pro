import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { SAMPLE_WORKER_FORM } from "@/features/people/forms/worker-form-data";
import { fullName } from "@/features/people/sheets/print-values";
import type { WorkerSheetPart } from "@/features/people/sheets/worker-sheet-parts";

import { WorkerPrintScreen } from "../../_components/worker-print-screen";

/**
 * One worker's registration form, filled, to print, sign and stamp.
 * Section «عمال النظافة», below the tab «العمال». Owner: People.
 *
 * Closest academy screen: the ID card page (see WorkerPrintScreen).
 *
 * Until the worker files exist this page shows an invented worker whatever the
 * id in the address, and says so above the sheet. The service that reads a
 * record replaces `SAMPLE_WORKER_FORM` here, and the note goes.
 */
export default function WorkerFormPrintPage({ part = "all" }: { part?: WorkerSheetPart }) {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("WorkerPrint");
  const data = SAMPLE_WORKER_FORM;

  return (
    <WorkerPrintScreen
      base={`/dashboard/workers/${id}`}
      part={part}
      data={data}
      title={t("RecordTitle", { name: fullName(data.lastName, data.firstName) })}
      description={t("RecordDescription")}
      note={t("SampleNote")}
    />
  );
}
