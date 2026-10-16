import { useQuery } from "@tanstack/react-query";
import { ClipboardList, PackageSearch } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { useDateText } from "@/features/money/components/use-money-text";
import { COUNTS_PATH, listCountsQuery, openCountAction } from "@/features/stock/services/counts";
import { STOCK_KINDS, type StockKind } from "@/features/stock/validators/option-codes";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * «الجرد»: the counts of the store, and a new count of either kind. A count of
 * a kind already open is taken up again rather than opened twice.
 *
 * Closest academy screen: the attendance days list
 * (`/dashboard/employee-attendance`): one row per sheet, each opened to type
 * it. A detail page below «جرد المخزون», with its back action.
 */
export default function CountsPage() {
  const t = useTranslations("Counts");
  const tNav = useTranslations("Nav");
  const dates = useDateText();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const kindLabel = useCodeLabel("StockCodes.Kinds");
  const level = useSectionLevel("STOCK");
  const manages = useCan("stock.manage");
  const mayCount = level === "WRITE" && manages;
  const { data: counts } = useQuery({
    queryKey: pathKey(COUNTS_PATH),
    queryFn: () => listCountsQuery(undefined),
  });

  async function start(kind: StockKind) {
    const already = counts?.find((count) => count.kind === kind && count.status === "OPEN");
    if (already) {
      navigate(`${COUNTS_PATH}/${already.id}`);
      return;
    }
    const result = await openCountAction({ kind });
    if (!result.success) {
      toast.error(errorMessage(result.error, t("OpenFailed")));
      return;
    }
    navigate(`${COUNTS_PATH}/${result.data.id}`);
  }

  return (
    <DetailScreen
      section="stock"
      title={t("ListTitle")}
      description={t("ListDescription")}
      back={{ href: "/dashboard/inventory", label: tNav("Inventory") }}
      actions={
        mayCount ? (
          <div className="flex flex-wrap items-center gap-2">
            {STOCK_KINDS.map((kind) => (
              <Button key={kind} variant="add" onClick={() => void start(kind)}>
                <PackageSearch />
                {t("Start", { kind: kindLabel(kind) })}
              </Button>
            ))}
          </div>
        ) : undefined
      }
    >
      {!counts ? (
        <ScreenSkeleton />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.Number")}</TableHead>
              <TableHead>{t("Table.Kind")}</TableHead>
              <TableHead>{t("Table.Progress")}</TableHead>
              <TableHead>{t("Table.State")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("Table.Actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {counts.length === 0 ? (
              <TableEmpty colSpan={5}>{t("NoCounts")}</TableEmpty>
            ) : (
              counts.map((count) => (
                <TableRow key={count.id}>
                  <TableCell>
                    <p className="leading-tight font-bold tabular-nums">
                      <Ltr>{count.number}</Ltr>
                    </p>
                    <p className="text-sm leading-tight whitespace-nowrap text-muted-foreground">
                      {dates.long(count.date)}
                    </p>
                  </TableCell>
                  <TableCell>{kindLabel(count.kind)}</TableCell>
                  <TableCell className="tabular-nums">
                    {t("Typed", { typed: count.typed, lines: count.lines })}
                  </TableCell>
                  <TableCell>
                    <StatusChip
                      tone={count.status === "OPEN" ? "progress" : "success"}
                      label={t(`States.${count.status}`)}
                    />
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end">
                      <Button asChild variant="outline" size="sm" title={t("Open")}>
                        <Link to={`${COUNTS_PATH}/${count.id}`} aria-label={t("Open")}>
                          <ClipboardList />
                          <span className="hidden xl:inline">{t("Open")}</span>
                        </Link>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      )}
    </DetailScreen>
  );
}
