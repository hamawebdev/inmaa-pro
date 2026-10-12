import { Plus, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { PagePlaceholder } from "@/components/page-placeholder";
import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";

/**
 * Section «عمال النظافة», tab «العمال». Owner: People.
 *
 * The list itself waits for the worker files (a placeholder until then); its
 * two actions already work: register a new worker, print a blank form.
 * Closest academy screen: the employees list (employees), whose header holds
 * the "add" button.
 */
export default function WorkersPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Workers");

  return (
    <SectionScreen
      section="workers"
      title={tNav("WorkersHeading")}
      actions={
        <div className="flex flex-wrap gap-3">
          <Button asChild variant="outline">
            <Link to="/dashboard/workers/print">
              <Printer />
              {t("BlankForm")}
            </Link>
          </Button>
          <Button asChild variant="add">
            <Link to="/dashboard/workers/new">
              <Plus />
              {t("NewWorker")}
            </Link>
          </Button>
        </div>
      }
    >
      <PagePlaceholder owner="people" />
    </SectionScreen>
  );
}
