import { useState } from "react";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import { useTranslations } from "use-intl";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

import { formatMoney } from "../rules/centimes";
import type { Bucket, Granularity } from "../rules/period";

import { useDateText, useMoneyText } from "./use-money-text";

type ChartType = "bar" | "line" | "area";

function toChartType(value: string): ChartType {
  return value === "line" || value === "area" ? value : "bar";
}

/**
 * Totals over the period, one bar a day (or a month over a long period).
 *
 * The academy's daily chart (finance/_components/shared/daily-bar-chart.tsx):
 * one series in `--chart-1`, a choice of bars, line or area, a tooltip with the
 * exact amount. Values stay in centimes; only the labels are dinars. The table
 * below the chart lists every amount, so nothing is readable on hover alone.
 */
export function PeriodChart({
  buckets,
  granularity,
  title,
}: {
  buckets: readonly Bucket[];
  granularity: Granularity;
  title: string;
}) {
  const t = useTranslations("MoneyCommon");
  const money = useMoneyText();
  const dates = useDateText();
  const [chartType, setChartType] = useState<ChartType>("bar");

  const data = buckets.map((bucket) => ({
    key: bucket.key,
    label: granularity === "day" ? dates.short(bucket.key) : dates.month(bucket.key),
    total: bucket.total,
  }));
  const config = { total: { label: t("Amount"), color: "var(--chart-1)" } };

  const axes = (
    <>
      <CartesianGrid vertical={false} strokeDasharray="3 3" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
      <YAxis
        tickLine={false}
        axisLine={false}
        width={72}
        tick={{ fontSize: 11 }}
        tickFormatter={(value) => formatMoney(Number(value))}
      />
      <ChartTooltip
        content={
          <ChartTooltipContent
            formatter={(value) => (
              <div className="flex w-full items-center justify-between gap-4">
                <span className="text-muted-foreground">{t("Total")}</span>
                <span className="font-medium tabular-nums">{money(Number(value))}</span>
              </div>
            )}
          />
        }
      />
    </>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-base">{title}</CardTitle>
        <Select value={chartType} onValueChange={(value) => setChartType(toChartType(value))}>
          <SelectTrigger size="sm" className="w-fit min-w-[150px]" aria-label={t("ChartType")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="bar">{t("BarChart")}</SelectItem>
            <SelectItem value="line">{t("LineChart")}</SelectItem>
            <SelectItem value="area">{t("AreaChart")}</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-muted-foreground">
            {t("NoDataForPeriod")}
          </div>
        ) : (
          <ChartContainer config={config} className="h-48 w-full">
            {chartType === "line" ? (
              <LineChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                {axes}
                <Line type="monotone" dataKey="total" stroke="var(--color-total)" strokeWidth={2} dot={false} />
              </LineChart>
            ) : chartType === "area" ? (
              <AreaChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                {axes}
                <Area
                  type="monotone"
                  dataKey="total"
                  fill="var(--color-total)"
                  fillOpacity={0.2}
                  stroke="var(--color-total)"
                />
              </AreaChart>
            ) : (
              <BarChart data={data} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                {axes}
                <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} maxBarSize={56} />
              </BarChart>
            )}
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
