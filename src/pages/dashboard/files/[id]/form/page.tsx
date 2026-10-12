import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { fileQueryPath, getFileFormQuery, openResidentListAction } from "@/features/clients/services/file-reads";
import { screenStateOf } from "@/features/clients/validators/file-screen";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { fileHubHref, filePartHref } from "@/navigation/file-parts";

import { FileForm } from "../../_components/file-form";
import { ltr } from "../../_components/ltr-text";
import { useFileOpened } from "../../_components/use-file-opened";

/**
 * «الاستمارة» of a stored file: his form with the file's answers, the office's
 * cards after it. A signed file keeps its sheet as it was signed: changing it
 * needs the manager and a reason (the save asks for it).
 *
 * Closest academy screen: the employee edit page (employees/[id]/page.tsx)
 * with the employee form.
 */
export default function FileFormPage() {
  const { id = "" } = useParams();
  const t = useTranslations("FileForm");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const kindLabel = useCodeLabel("FileForms.Kinds");
  useFileOpened(id);

  const form = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "form"],
    queryFn: () => getFileFormQuery({ fileId: id }),
  });
  // The residents are third-party data: read, and logged, only when the form shows them.
  const showsResidents = form.data?.residents === "ALLOWED";
  const residents = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "residents"],
    queryFn: async () => {
      const result = await openResidentListAction({ fileId: id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: showsResidents,
  });

  const data = form.data;
  const initial = React.useMemo(
    () =>
      data && (!showsResidents || residents.data)
        ? screenStateOf(data.kind, data.values, data.office, data.siteOffice, residents.data ?? [])
        : null,
    [data, showsResidents, residents.data],
  );

  const back = { href: fileHubHref(id), label: tNav("FileHub") };
  if (!data || !initial) {
    return (
      <DetailScreen section="requests" title={t("EditTitle")} back={back}>
        {form.isPending || (showsResidents && residents.isPending) ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{tHub("NotFound")}</p>
        )}
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      section="requests"
      title={`${t("EditTitle")} · ${tHub("Title", { number: ltr(data.number) })}`}
      description={kindLabel(data.kind)}
      back={back}
      actions={
        <Button asChild variant="outline">
          <Link to={`${filePartHref(id, "form")}/print`}>
            <Printer />
            {tHub("PrintForm")}
          </Link>
        </Button>
      }
    >
      <FileForm
        formKind={data.kind}
        mode={{
          kind: "edit",
          fileId: data.id,
          number: data.number,
          locked: data.locked,
          closed: data.closed,
          canEditLocked: data.canEditLocked,
        }}
        initial={initial}
        statusTicks={data.statusTicks}
        dossierNumber={data.values.dossierNumber ?? null}
        residents={data.residents}
      />
    </DetailScreen>
  );
}
