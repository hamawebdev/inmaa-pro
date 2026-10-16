import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { StatusChip } from "@/components/status-chip";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScreenDate } from "@/features/clients/components/screen-date";
import { fileQueryPath } from "@/features/clients/services/file-reads";
import { getFirstVisitsQuery } from "@/features/clients/services/first-visits";
import { emptyFirstVisit } from "@/features/clients/validators/first-visit";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useSectionLevel } from "@/hooks/use-session";
import { pathKey } from "@/lib/compat/revalidate";
import { cn } from "@/lib/utils";
import { fileHubHref } from "@/navigation/file-parts";
import { SECTION_ACCENT } from "@/navigation/sections";

import { ltr } from "../../_components/ltr-text";
import { useFileOpened } from "../../_components/use-file-opened";

import { FirstVisitForm } from "./_components/first-visit-form";

/**
 * «الزيارة الأولية» of a file (plan feature 3): its first visits, the newest
 * first, one open at a time; a new one is planned from here.
 *
 * Closest academy screen: the student's detail pages (students/[id]/…): a
 * detail screen with a back action, a switch between the records, the form.
 */
export default function FileInspectionPage() {
  const { id = "" } = useParams();
  const t = useTranslations("FirstVisits");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const { today } = useCentreClock();
  const writes = useSectionLevel("REQUESTS") === "WRITE";
  useFileOpened(id);
  const back = { href: fileHubHref(id), label: tNav("FileHub") };
  const [chosen, setChosen] = React.useState<string | null>(null);

  const visits = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "first-visits"],
    queryFn: () => getFirstVisitsQuery({ fileId: id }),
  });

  if (!visits.data) {
    return (
      <DetailScreen section="requests" title={tNav("FilePartInspection")} back={back}>
        {visits.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{tHub("NotFound")}</p>
        )}
      </DetailScreen>
    );
  }

  const data = visits.data;
  const open = chosen === "NEW" ? null : (data.visits.find((one) => one.id === chosen) ?? data.visits[0] ?? null);
  const fresh = chosen === "NEW" || data.visits.length === 0;
  const canWrite = writes && !data.file.closed;
  const accent = SECTION_ACCENT.requests;

  return (
    <DetailScreen
      section="requests"
      title={`${tNav("FilePartInspection")} · ${tHub("Title", { number: ltr(data.file.number) })}`}
      description={data.file.clientName}
      back={back}
      actions={
        canWrite && data.visits.length > 0 && !fresh ? (
          <Button type="button" variant="add" onClick={() => setChosen("NEW")}>
            <Plus />
            {t("NewVisit")}
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6">
        {data.visits.length > 1 && (
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            value={fresh ? "" : (open?.id ?? "")}
            onValueChange={(next) => next && setChosen(next)}
            className="max-w-full min-w-0 flex-wrap"
          >
            {data.visits.map((one) => (
              <ToggleGroupItem key={one.id} value={one.id} className={cn("px-5", accent.segment)}>
                <ScreenDate date={one.visit.doneDate ?? one.visit.plannedDate} />
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        )}
        {fresh && data.visits.length === 0 && (
          <Alert className="text-start">
            <AlertDescription className="text-base">{canWrite ? t("NoneYet") : t("None")}</AlertDescription>
          </Alert>
        )}
        {open && !fresh && (
          <div className="flex flex-wrap items-center gap-3">
            <StatusChip
              tone={open.visit.doneDate ? "success" : "pending"}
              label={open.visit.doneDate ? t("StateDone") : t("StatePlanned")}
            />
          </div>
        )}
        {(fresh ? canWrite : open !== null) && (
          <FirstVisitForm
            key={fresh ? "new" : `${open!.id}:${visits.dataUpdatedAt}`}
            fileId={id}
            siteId={data.file.siteId}
            division={data.file.division}
            firstVisitId={fresh ? null : open!.id}
            initial={fresh ? emptyFirstVisit(data.formVisitDate ?? today) : open!.visit}
            photos={fresh ? [] : open!.photos}
            photoConsent={data.photoConsent}
            inspectors={data.inspectors}
            writes={canWrite}
          />
        )}
      </div>
    </DetailScreen>
  );
}
