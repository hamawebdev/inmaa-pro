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
import { formatSheetDate } from "@/features/clients/forms/answers";
import { countResidentsQuery } from "@/features/clients/services/contracts";
import { fileQueryPath, getFileHubQuery, openResidentListAction } from "@/features/clients/services/file-reads";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { pathKey } from "@/lib/compat/revalidate";
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
              <ul className="divide-y">
                {(list.data ?? []).map((resident) => (
                  <li key={resident.id} className="flex min-w-0 flex-wrap items-baseline gap-x-6 gap-y-1 py-3">
                    <Ltr className="w-10 shrink-0 font-bold tabular-nums">{resident.number}</Ltr>
                    <span className="min-w-0 flex-1 truncate font-medium">{resident.name}</span>
                    {resident.phone && <Ltr className="text-muted-foreground tabular-nums">{resident.phone}</Ltr>}
                    {resident.registeredDate && (
                      <Ltr className="text-muted-foreground">{formatSheetDate(resident.registeredDate)}</Ltr>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </DetailScreen>
  );
}
