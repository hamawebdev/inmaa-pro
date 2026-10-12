import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { DEFAULT_UTC_OFFSET_MIN, toLocal } from "@/lib/clock";

import { WorkerForm } from "../_components/worker-form";

/**
 * Registering a new cleaning worker. Section «عمال النظافة», below the tab «العمال». Owner: People.
 *
 * Closest academy screen: the new-employee page (employees/new): a detail
 * screen with a back action, and the form as stacked cards. The title is his
 * form's own, «استمارة التسجيل بمركز إنماء».
 */
export default function NewWorkerPage() {
  const tForm = useTranslations("WorkerForm");
  const t = useTranslations("Workers");
  const tNav = useTranslations("Nav");
  const today = toLocal(new Date(), DEFAULT_UTC_OFFSET_MIN).date;

  return (
    <DetailScreen
      section="workers"
      title={tForm("Labels.formTitle")}
      description={t("NewDescription")}
      back={{ href: "/dashboard/workers", label: tNav("WorkersList") }}
    >
      <WorkerForm mode={{ kind: "new" }} defaultValues={emptyWorkerValues(today)} />
    </DetailScreen>
  );
}
