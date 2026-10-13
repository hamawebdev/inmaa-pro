import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { StatusChip } from "@/components/status-chip";
import { todayAtTheCentre } from "@/features/people/components/may";
import { DECISION_TONE } from "@/features/people/components/status-tones";
import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { getDecisionQuery } from "@/features/people/services/sanction-decisions";
import { SANCTIONS_PATH } from "@/features/people/services/sanctions";
import type { WorkerFormValues } from "@/features/people/validators/worker";
import { pathKey } from "@/lib/compat/revalidate";

import { WorkerForm } from "../_components/worker-form";

/**
 * Registering a new cleaning worker. Section «عمال النظافة», below the tab «العمال». Owner: People.
 *
 * Closest academy screen: the new-employee page (employees/new): a detail
 * screen with a back action, and the form as stacked cards. The title is his
 * form's own, «استمارة التسجيل بمركز إنماء».
 *
 * `?decision=<id>` brings back a registration the manager was asked about:
 * what was typed is on the screen again (never the health answers or the
 * score, which are typed again), and his yes travels with the save.
 */

export default function NewWorkerPage() {
  const tForm = useTranslations("WorkerForm");
  const t = useTranslations("Workers");
  const tSanctions = useTranslations("Sanctions");
  const tNav = useTranslations("Nav");
  const [params] = useSearchParams();
  const decisionId = params.get("decision");

  const { data: decision, isPending } = useQuery({
    queryKey: [...pathKey(SANCTIONS_PATH), "decision", decisionId],
    queryFn: () => getDecisionQuery({ decisionId: decisionId ?? "" }),
    enabled: decisionId !== null,
  });
  const waitingForDecision = decisionId !== null && isPending;
  const used = decision?.consumedAt != null;
  const draft =
    decision && typeof decision.draftPayload === "object" ? (decision.draftPayload as Partial<WorkerFormValues>) : {};
  const values: WorkerFormValues = { ...emptyWorkerValues(todayAtTheCentre()), ...draft };
  // His no, a withdrawn question or a yes already spent leave nothing to resume.
  const resumable = !decision || (!used && (decision.status === "ALLOWED" || decision.status === "PENDING"));

  return (
    <DetailScreen
      section="workers"
      title={tForm("Labels.formTitle")}
      back={{ href: "/dashboard/workers", label: tNav("WorkersList") }}
    >
      {decision && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <StatusChip
            tone={used ? "neutral" : DECISION_TONE[decision.status]}
            label={used ? tSanctions("Page.Used") : tSanctions(`DecisionStatuses.${decision.status}`)}
          />
          <p className="text-base text-muted-foreground">
            {t(`Resume.${used ? "USED" : decision.status}`, { name: decision.sanction.displayName })}
          </p>
        </div>
      )}
      {!waitingForDecision && resumable && (
        <WorkerForm
          key={decisionId ?? "new"}
          mode={{ kind: "new", decisionId: decision?.status === "ALLOWED" ? decision.id : null }}
          defaultValues={values}
        />
      )}
    </DetailScreen>
  );
}
