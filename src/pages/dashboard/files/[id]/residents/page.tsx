import { useQuery } from "@tanstack/react-query";
import { Lock, Pencil, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ScreenDate } from "@/features/clients/components/screen-date";
import { countResidentsQuery } from "@/features/clients/services/contracts";
import { fileQueryPath, getFileHubQuery, openResidentListAction } from "@/features/clients/services/file-reads";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { pathKey } from "@/lib/compat/revalidate";
import { phoneText } from "@/lib/text/phone";
import { fileHubHref, filePartHref } from "@/navigation/file-parts";

import { ltr } from "../../_components/ltr-text";

/**
 * «القاطنون» of a building or a complex: «قائمة القاطنين بالعمارة», page 3 of
 * his building form. Read (and logged) only with `residents.read`; anybody
 * else sees how many there are. The list is changed on «الاستمارة».
 *
 * Closest academy screen: a group's students list (groups/[groupId]/page.tsx):
 * a detail screen with the list in a card and its actions in the heading row.
 */
export default function FileResidentsPage() {
  const { id = "" } = useParams();
  const t = useTranslations("ResidentsPart");
  const tForm = useTranslations("FileForm.Residents");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const reads = useCan("residents.read");
  const writes = useSectionLevel("REQUESTS") === "WRITE";
  const back = { href: fileHubHref(id), label: tNav("FileHub") };

  const hub = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "hub"],
    queryFn: () => getFileHubQuery({ fileId: id }),
  });
  const count = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "resident-count"],
    queryFn: () => countResidentsQuery({ fileId: id }),
  });
  const list = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "residents"],
    queryFn: async () => {
      const result = await openResidentListAction({ fileId: id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: reads,
  });

  const number = hub.data?.number;
  return (
    <DetailScreen
      section="requests"
      title={
        number ? `${tNav("FilePartResidents")} · ${tHub("Title", { number: ltr(number) })}` : tNav("FilePartResidents")
      }
      description={hub.data?.client.name}
      back={back}
      actions={
        reads ? (
          <>
            {writes && (
              <Button asChild variant="edit">
                <Link to={filePartHref(id, "form")}>
                  <Pencil />
                  {t("Change")}
                </Link>
              </Button>
            )}
            <Button asChild variant="info">
              <Link to={`${filePartHref(id, "residents")}/print`}>
                <Printer />
                {t("Print")}
              </Link>
            </Button>
          </>
        ) : undefined
      }
    >
      {!reads ? (
        <Alert className="text-start">
          <Lock />
          <AlertDescription className="text-base">
            {count.data === undefined ? t("Restricted") : t("RestrictedCount", { count: count.data })}
          </AlertDescription>
        </Alert>
      ) : list.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("Title", { count: list.data?.length ?? 0 })}</CardTitle>
          </CardHeader>
          <CardContent>
            {(list.data ?? []).length === 0 ? (
              <p className="text-muted-foreground">{t("Empty")}</p>
            ) : (
              // His four columns, one fixed cell each, so an empty phone or date keeps its own place (B-072).
              <div role="table" className="min-w-0 divide-y rounded-lg border">
                <div
                  role="row"
                  className="grid grid-cols-[4rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 bg-muted/50 px-4 py-3 text-sm font-semibold"
                >
                  <span role="columnheader">{tForm("Number")}</span>
                  <span role="columnheader">{tForm("Name")}</span>
                  <span role="columnheader">{tForm("Phone")}</span>
                  <span role="columnheader">{tForm("RegisteredDate")}</span>
                </div>
                {(list.data ?? []).map((resident) => (
                  <div
                    key={resident.id}
                    role="row"
                    className="grid grid-cols-[4rem_minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)] items-center gap-4 px-4 py-3"
                  >
                    <Ltr role="cell" className="font-bold tabular-nums">
                      {resident.number}
                    </Ltr>
                    <span role="cell" className="truncate font-medium">
                      {resident.name}
                    </span>
                    <span role="cell" className="truncate text-muted-foreground">
                      {resident.phone ? <Ltr className="tabular-nums">{phoneText(resident.phone)}</Ltr> : "—"}
                    </span>
                    <span role="cell" className="truncate text-muted-foreground">
                      {resident.registeredDate ? <ScreenDate date={resident.registeredDate} /> : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </DetailScreen>
  );
}
