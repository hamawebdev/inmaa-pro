import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { StatusChip } from "@/components/status-chip";
import { todayAtTheCentre } from "@/features/people/components/may";
import { getDecisionQuery } from "@/features/people/services/sanction-decisions";
import { SANCTIONS_PATH } from "@/features/people/services/sanctions";
import { emptyEmployeeValues, type EmployeeFormValues } from "@/features/people/validators/employee";
import { pathKey } from "@/lib/compat/revalidate";

import { EmployeeForm } from "../_components/employee-form";

/**
 * Registering a centre employee. Section «الموظفون», below the tab «الموظفون». Owner: People.
 *
 * Closest academy screen: the new-employee page (employees/new).
 *
 * `?decision=<id>` brings back a registration the manager was asked about,
 * with what was typed and his yes.
 */
export default function NewEmployeePage() {
  const t = useTranslations("Employees");
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
    decision && typeof decision.draftPayload === "object" ? (decision.draftPayload as Partial<EmployeeFormValues>) : {};
  const values: EmployeeFormValues = { ...emptyEmployeeValues(todayAtTheCentre()), ...draft };
  const resumable = !decision || (!used && (decision.status === "ALLOWED" || decision.status === "PENDING"));

  return (
    <DetailScreen
      section="employees"
      title={t("NewTitle")}
      back={{ href: "/dashboard/employees", label: tNav("EmployeesList") }}
    >
      {decision && (
        <div className="mb-6 flex flex-wrap items-center gap-3">
          <StatusChip
            tone={
              used
                ? "neutral"
                : decision.status === "ALLOWED"
                  ? "success"
                  : decision.status === "REFUSED"
                    ? "danger"
                    : "pending"
            }
            label={used ? tSanctions("Page.Used") : tSanctions(`DecisionStatuses.${decision.status}`)}
          />
        </div>
      )}
      {!waitingForDecision && resumable && (
        <EmployeeForm
          key={decisionId ?? "new"}
          mode={{ kind: "new", decisionId: decision?.status === "ALLOWED" ? decision.id : null }}
          defaultValues={values}
        />
      )}
    </DetailScreen>
  );
}
