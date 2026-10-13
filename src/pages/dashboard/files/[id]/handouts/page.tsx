import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Button } from "@/components/ui/button";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { listHandOutsQuery } from "@/features/stock/services/handouts";
import { HANDOUTS_PATH } from "@/features/stock/services/paths";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { fileHubHref } from "@/navigation/file-parts";
import { HandoutsTable } from "@/pages/dashboard/handouts/_components/handouts-table";

/**
 * A file's part «التسليم»: what was handed out for this job, to whom, and what
 * of it is still out. The same list as المخزون › التسليم, kept to this file;
 * a new hand-out starts from here with the file already chosen.
 *
 * Closest academy screen: a student's payments
 * (groups/[groupId]/students/[studentId]/payments): the ledger of one record,
 * a detail page with a back action to the hub and no tab strip. It reads the
 * store: an account the stock section is closed to is told so.
 */
export default function FileHandoutsPage() {
  const { id = "" } = useParams();
  const tNav = useTranslations("Nav");
  const t = useTranslations("FileHandouts");
  const errorMessage = useErrorMessage();
  const mayWrite = useSectionLevel("STOCK") === "WRITE";
  const { data, error } = useQuery({
    queryKey: [...pathKey(HANDOUTS_PATH), "file", id],
    queryFn: () => listHandOutsQuery({ fileId: id }),
    retry: false,
  });

  return (
    <DetailScreen
      section="requests"
      title={tNav("FilePartHandouts")}
      back={{ href: fileHubHref(id), label: tNav("FileHub") }}
      actions={
        mayWrite ? (
          <Button asChild variant="add">
            <Link to={`/dashboard/handouts/new?fileId=${encodeURIComponent(id)}`}>
              <Plus />
              {t("New")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {data ? (
        <HandoutsTable handouts={data} showJob={false} />
      ) : error ? (
        <p className="text-lg text-muted-foreground">{errorMessage(error.message, t("CouldNotLoad"))}</p>
      ) : (
        <ScreenSkeleton />
      )}
    </DetailScreen>
  );
}
