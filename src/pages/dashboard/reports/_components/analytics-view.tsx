import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { SectionHeading } from "@/components/screen";
import { StatusChip } from "@/components/status-chip";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDivisionLabel } from "@/features/money/components/labels";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import { getPeriodAnalyticsAction, type ProfitGroup } from "@/features/money/services/analytics";
import { REPORTS_PATH } from "@/features/money/services/paths";
import { intlLocaleFor } from "@/i18n/config";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { cn } from "@/lib/utils";

/**
 * The analytics of the period (features 30 and 41): each contract's revenue, cost and result for who
 * may see costs, then the same by service type, by zone and by client (the revenue alone for anybody
 * else), and the money in and out month by month. Read through an action: its reading of costs is
 * logged once a day.
 */
export function AnalyticsView({ from, to, branchId }: { from: string; to: string; branchId: string | null }) {
  const t = useTranslations("Analytics");
  const money = useMoneyText();
  const dates = useDateText();
  const divisionLabel = useDivisionLabel();
  const serviceLabel = useCodeLabel("Options.ServiceType");
  const percent = new Intl.NumberFormat(intlLocaleFor(useLocale()), { maximumFractionDigits: 1 });
  const { data } = useQuery({
    queryKey: [...pathKey(REPORTS_PATH), "analytics", from, to, branchId ?? ""],
    queryFn: async () => {
      const result = await getPeriodAnalyticsAction({ from, to, branchId });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
  if (!data) return null;

  const signed = (amount: number | null, strong = false) =>
    amount === null ? (
      <span className="text-muted-foreground">{t("NotSet")}</span>
    ) : (
      <span className={cn("whitespace-nowrap tabular-nums", strong && "font-bold", amount < 0 && "text-destructive")}>
        <Ltr>{money(amount)}</Ltr>
      </span>
    );

  const groupTable = (title: string, rows: readonly ProfitGroup[], labelOf: (row: ProfitGroup) => string) => (
    <section className="space-y-4 tall:space-y-5">
      <SectionHeading>{title}</SectionHeading>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <span className="sr-only">{title}</span>
            </TableHead>
            <TableHead>{t("Revenue")}</TableHead>
            {data.seesCost && <TableHead>{t("Cost")}</TableHead>}
            {data.seesCost && <TableHead>{t("Result")}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableEmpty colSpan={data.seesCost ? 4 : 2}>{t("Nothing")}</TableEmpty>
          ) : (
            rows.map((row) => (
              <TableRow key={row.key}>
                <TableCell className="font-bold">
                  <span className="block max-w-48 truncate xl:max-w-80">{labelOf(row)}</span>
                </TableCell>
                <TableCell>{signed(row.revenue)}</TableCell>
                {data.seesCost && <TableCell>{signed(row.cost)}</TableCell>}
                {data.seesCost && <TableCell>{signed(row.result, true)}</TableCell>}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </section>
  );

  return (
    <>
      {data.seesCost && (
        <section className="space-y-4 tall:space-y-5">
          <SectionHeading>{t("Contracts")}</SectionHeading>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Table.File")}</TableHead>
                <TableHead>{t("Revenue")}</TableHead>
                <TableHead>{t("Table.Estimate")}</TableHead>
                <TableHead>{t("Table.Actual")}</TableHead>
                <TableHead>{t("Result")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.contracts.length === 0 ? (
                <TableEmpty colSpan={5}>{t("Nothing")}</TableEmpty>
              ) : (
                data.contracts.map((row) => (
                  <TableRow key={row.fileId}>
                    <TableCell>
                      <span className="block max-w-36 truncate leading-tight font-bold xl:max-w-64">
                        {row.clientName}
                      </span>
                      <span className="block truncate text-sm leading-tight text-muted-foreground">
                        {divisionLabel(row.division)} · <Ltr>{row.fileNumber}</Ltr>
                      </span>
                    </TableCell>
                    <TableCell>{signed(row.revenue)}</TableCell>
                    <TableCell>{signed(row.estimatedCost)}</TableCell>
                    <TableCell>
                      {signed(row.actualCost)}
                      {row.hoursOverEstimate && (
                        <span className="mt-1 block">
                          <StatusChip tone="warning" label={t("HoursOver")} />
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      {signed(row.result, true)}
                      {row.resultRate !== null && (
                        <span className="block text-sm text-muted-foreground tabular-nums">
                          <Ltr>{percent.format(row.resultRate / 100)} %</Ltr>
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </section>
      )}

      {groupTable(t("ByServiceType"), data.byServiceType, (row) => serviceLabel(row.key))}
      {groupTable(t("ByZone"), data.byZone, (row) => (row.key === "none" ? t("NoZone") : row.label))}
      {groupTable(t("ByClient"), data.byClient, (row) => row.label)}

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("CashFlow")}</SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.Month")}</TableHead>
              <TableHead>{t("Table.In")}</TableHead>
              <TableHead>{t("Table.Out")}</TableHead>
              <TableHead>{t("Table.Net")}</TableHead>
              <TableHead>{t("Table.Running")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.cashFlow.map((month) => (
              <TableRow key={month.month}>
                <TableCell className="font-bold whitespace-nowrap">{dates.month(month.month)}</TableCell>
                <TableCell>{signed(month.moneyIn)}</TableCell>
                <TableCell>{signed(month.moneyOut)}</TableCell>
                <TableCell>{signed(month.net, true)}</TableCell>
                <TableCell>{signed(month.running)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
