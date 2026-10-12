import { Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { SAMPLE_WORKER_VALUES } from "@/features/people/forms/worker-values";

import { WorkerForm } from "../_components/worker-form";

/**
 * One cleaning worker's registration form, to read and change. Section «عمال
 * النظافة», below the tab «العمال». Owner: People.
 *
 * Closest academy screen: the employee file (employees/[id]): a strip of
 * badges and a print button above the same form as the new page.
 *
 * Until worker files exist this page shows an invented worker whatever the id
 * in the address, and says so. The service that reads a record replaces
 * `SAMPLE_WORKER_VALUES` and the number here, and the note goes.
 */
export default function WorkerPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Workers");
  const tForm = useTranslations("WorkerForm");
  const tNav = useTranslations("Nav");
  const values = SAMPLE_WORKER_VALUES;
  const number = "17/F";

  return (
    <DetailScreen
      section="workers"
      title={`${values.lastName} ${values.firstName}`}
      description={t("EditDescription")}
      back={{ href: "/dashboard/workers", label: tNav("WorkersList") }}
      actions={
        <Button asChild variant="outline">
          <Link to={`/dashboard/workers/${id}/print`}>
            <Printer />
            {t("PrintForm")}
          </Link>
        </Button>
      }
    >
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <span className="text-base font-bold">
          {tForm("Labels.regNumber")} <Ltr>{number}</Ltr>
        </span>
        {values.hiringDecision && <StatusChip tone="info" label={tForm(`Decisions.${values.hiringDecision}`)} />}
        <p className="text-base font-semibold text-warning-ink">{t("SampleNote")}</p>
      </div>
      <WorkerForm mode={{ kind: "edit", id, number }} defaultValues={values} />
    </DetailScreen>
  );
}
