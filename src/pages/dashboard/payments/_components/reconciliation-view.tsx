import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import {
  listReconciliationDaysQuery,
  RECONCILIATION_PATH,
  reconciliationHref,
  type ReconciliationDay,
} from "@/features/money/services/reconciliation";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * «المطابقة اليومية»: each day's receipts, collector by collector, and
 * whether the day is closed. A day with blank receipts nobody accounted for
 * waits first; the home screen's tile opens here.
 */
export function ReconciliationView() {
  const t = useTranslations("Reconciliation");
  const money = useMoneyText();
  const dates = useDateText();
  const { data: days } = useQuery({
    queryKey: [...pathKey(RECONCILIATION_PATH), "days"],
    queryFn: () => listReconciliationDaysQuery(undefined),
  });
  if (!days) return <ScreenSkeleton />;

  const state = (day: ReconciliationDay) => {
    if (day.closed) {
      return day.closed.difference === 0 ? (
        <StatusChip tone="success" label={t("States.Closed")} />
      ) : (
        <StatusChip tone="danger" label={t("States.ClosedWithDifference")} />
      );
    }
    if (day.pending > 0) return <StatusChip tone="warning" label={t("States.Pending", { count: day.pending })} />;
    return <StatusChip tone="pending" label={t("States.ToClose")} />;
  };

  return (
    <div className="space-y-5">
      <h3 className="text-lg font-bold tall:text-xl">{t("DayCount", { count: days.length })}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Table.Date")}</TableHead>
            <TableHead>{t("Table.Collector")}</TableHead>
            <TableHead>{t("Table.Receipts")}</TableHead>
            <TableHead>{t("Table.Expected")}</TableHead>
            <TableHead>{t("Table.State")}</TableHead>
            <TableHead>
              <span className="sr-only">{t("Table.Actions")}</span>
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {days.length === 0 ? (
            <TableEmpty colSpan={6}>{t("NoDays")}</TableEmpty>
          ) : (
            days.map((day) => (
              <TableRow key={reconciliationHref(day)}>
                <TableCell className="font-bold whitespace-nowrap">{dates.long(day.date)}</TableCell>
                <TableCell>
                  <span className="block max-w-40 truncate xl:max-w-64">{day.collectorName ?? t("Office")}</span>
                </TableCell>
                <TableCell className="tabular-nums">{t("ReceiptCount", { count: day.receipts.length })}</TableCell>
                <TableCell className="font-bold whitespace-nowrap tabular-nums">{money(day.expectedCash)}</TableCell>
                <TableCell>{state(day)}</TableCell>
                <TableCell>
                  <div className="flex justify-end">
                    <Button asChild variant="outline" size="sm" title={t("Open")}>
                      <Link to={reconciliationHref(day)} aria-label={t("Open")}>
                        <ClipboardCheck />
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
    </div>
  );
}
