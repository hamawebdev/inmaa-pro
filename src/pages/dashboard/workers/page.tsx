import { useQuery } from "@tanstack/react-query";
import { Plus, Printer, ShieldAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { listZonesQuery, PLACES_PATH } from "@/features/core/services/places";
import { useMay, useMayIn } from "@/features/people/components/may";
import { listDecisionsQuery } from "@/features/people/services/sanction-decisions";
import { SANCTIONS_PATH } from "@/features/people/services/sanctions";
import { listWorkersQuery } from "@/features/people/services/worker-reads";
import { pathKey } from "@/lib/compat/revalidate";

import { WorkersTable } from "./_components/workers-table";

/**
 * Section «عمال النظافة», tab «العمال»: the cleaning workers. Owner: People.
 *
 * Closest academy screen: the employees list (employees), whose header holds
 * the "add" button, with the newer generation's table (the attendance
 * overview). The header also leads to his blank form, and to the suspended and
 * penalised, where the manager's answers wait.
 */
export default function WorkersPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Workers");
  const { data: workers } = useQuery({
    queryKey: pathKey("/dashboard/workers"),
    queryFn: () => listWorkersQuery(undefined),
  });
  const { data: zones } = useQuery({
    queryKey: [...pathKey(PLACES_PATH), "zones"],
    queryFn: () => listZonesQuery(undefined),
  });
  const { data: waiting } = useQuery({
    queryKey: [...pathKey(SANCTIONS_PATH), "pending"],
    queryFn: () => listDecisionsQuery({ status: "PENDING" }),
  });
  const pending = waiting?.length ?? 0;
  const keepsFiles = useMay("staff.write");
  const writesWorkers = useMayIn("WORKERS", "WRITE");
  const canRegister = keepsFiles && writesWorkers;

  return (
    <SectionScreen
      section="workers"
      title={tNav("WorkersHeading")}
      description={t("Description")}
      actions={
        <div className="flex flex-wrap gap-3">
          <Button asChild variant={pending > 0 ? "warning" : "outline"}>
            <Link to={SANCTIONS_PATH}>
              <ShieldAlert />
              {pending > 0 ? t("SanctionsWaiting", { count: pending }) : t("Sanctions")}
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/dashboard/workers/print">
              <Printer />
              {t("BlankForm")}
            </Link>
          </Button>
          {canRegister && (
            <Button asChild variant="add">
              <Link to="/dashboard/workers/new">
                <Plus />
                {t("NewWorker")}
              </Link>
            </Button>
          )}
        </div>
      }
    >
      <WorkersTable rows={workers ?? []} zones={zones ?? []} />
    </SectionScreen>
  );
}
