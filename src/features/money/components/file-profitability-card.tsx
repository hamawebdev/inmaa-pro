import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useCan } from "@/hooks/use-session";
import { pathKey } from "@/lib/compat/revalidate";

import { hoursText } from "../rules/hours";
import type { CostSide } from "../rules/profitability";
import { PAYMENTS_PATH } from "../services/paths";
import { getFileProfitabilityAction } from "../services/profitability";

import { MoneyValue } from "./money-value";
import { useDateText } from "./use-money-text";

/**
 * «ربحية العقد» (feature 30) of one file, for those who hold `cost.read`: the
 * estimate the price was set on beside what was done, and the two warnings
 * of the plan (hours over the estimate, a margin below zero). Drawn by the
 * file's part «التسديد»; the file hub may draw it too. Reading it is logged.
 * For anybody else it draws nothing at all.
 */
export function FileProfitabilityCard({ fileId }: { fileId: string }) {
  const seesCost = useCan("cost.read");
  if (!seesCost) return null;
  return <ProfitabilityCard fileId={fileId} />;
}

function ProfitabilityCard({ fileId }: { fileId: string }) {
  const t = useTranslations("Profitability");
  const dates = useDateText();
  const hours = (minutes: number) => <Ltr>{hoursText(minutes)}</Ltr>;
  const { data, error } = useQuery({
    queryKey: [...pathKey(PAYMENTS_PATH), "profitability", fileId],
    queryFn: async () => {
      const result = await getFileProfitabilityAction({ fileId });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    retry: false,
  });
  if (error) return null;
  if (!data) return null;
  const { result } = data;

  const row = (label: string, pick: (side: CostSide) => number | null) => (
    <TableRow>
      <TableCell className="font-bold">{label}</TableCell>
      <TableCell>{cell(pick(result.estimate))}</TableCell>
      <TableCell>{cell(pick(result.actual))}</TableCell>
    </TableRow>
  );
  const cell = (amount: number | null) =>
    amount === null ? <span className="text-muted-foreground">{t("NotSet")}</span> : <MoneyValue amount={amount} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-3">
          <span>{t("Title")}</span>
          <span className="text-base font-normal text-muted-foreground">
            {t("Period", { from: dates.long(data.from), to: dates.long(data.to) })}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          {result.flags.negativeMargin && <StatusChip tone="danger" label={t("Flags.NegativeMargin")} />}
          {result.flags.hoursOverEstimate && <StatusChip tone="warning" label={t("Flags.HoursOver")} />}
          {result.flags.hourlyCostMissing && <StatusChip tone="neutral" label={t("Flags.NoHourlyCost")} />}
          {!result.flags.negativeMargin && !result.flags.hoursOverEstimate && !result.flags.hourlyCostMissing && (
            <StatusChip tone="success" label={t("Flags.OnTrack")} />
          )}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <span className="sr-only">{t("Line")}</span>
              </TableHead>
              <TableHead>{t("Estimate")}</TableHead>
              <TableHead>{t("Actual")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-bold">{t("Hours")}</TableCell>
              <TableCell className="tabular-nums">{hours(result.estimate.minutes)}</TableCell>
              <TableCell className="tabular-nums">{hours(result.actual.minutes)}</TableCell>
            </TableRow>
            {row(t("Labour"), (side) => side.labour)}
            {row(t("Materials"), (side) => side.materials)}
            {row(t("Transport"), (side) => side.transport)}
            {row(t("Other"), (side) => side.other)}
            {row(t("Cost"), (side) => side.cost)}
            <TableRow className="bg-muted/50">
              <TableCell className="font-bold">{t("Revenue")}</TableCell>
              <TableCell>
                <MoneyValue amount={result.revenue} />
              </TableCell>
              <TableCell>
                <MoneyValue amount={result.revenue} />
              </TableCell>
            </TableRow>
            {row(t("Margin"), (side) => side.margin)}
          </TableBody>
        </Table>
        <p className="text-sm text-muted-foreground">{t("Visits", data.visits)}</p>
      </CardContent>
    </Card>
  );
}
