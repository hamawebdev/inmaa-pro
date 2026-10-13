import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { listHandOutsQuery } from "@/features/stock/services/handouts";
import { HANDOUTS_PATH } from "@/features/stock/services/paths";
import { useSectionLevel } from "@/hooks/use-session";
import { pathKey } from "@/lib/compat/revalidate";

import { HandoutsTable } from "./_components/handouts-table";

/**
 * Section «إدارة المخزون», tab «التسليم»: what left the store, for which job
 * and in whose hands, and what of it is still out.
 *
 * Closest academy screen: the expenses list (`/dashboard/expenses`): an "add"
 * button in the header, a search above a table, a row action. The list is the
 * newer generation's table.
 */
export default function HandoutsPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Handouts");
  const mayWrite = useSectionLevel("STOCK") === "WRITE";
  const { data: handouts } = useQuery({
    queryKey: pathKey(HANDOUTS_PATH),
    queryFn: () => listHandOutsQuery({}),
  });

  return (
    <SectionScreen
      section="stock"
      title={tNav("Handouts")}
      actions={
        mayWrite ? (
          <Button asChild variant="add">
            <Link to="/dashboard/handouts/new">
              <Plus />
              {t("New")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {handouts ? <HandoutsTable handouts={handouts} /> : <ScreenSkeleton />}
    </SectionScreen>
  );
}
