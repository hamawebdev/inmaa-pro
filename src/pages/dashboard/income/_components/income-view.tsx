import { useMemo } from "react";

import { useTranslations } from "use-intl";

import { SectionHeading } from "@/components/screen";
import { useDivisionLabel } from "@/features/money/components/labels";
import { ALL, useDivisionParam } from "@/features/money/components/division-param";
import { DivisionTabs } from "@/features/money/components/division-tabs";
import { DivisionTiles } from "@/features/money/components/division-tiles";
import { FigureStrip, type Figure } from "@/features/money/components/figure-strip";
import { PeriodChart } from "@/features/money/components/period-chart";
import { PeriodFilter } from "@/features/money/components/period-filter";
import { MoneyValue } from "@/features/money/components/money-value";
import type { BasisPoints } from "@/features/money/rules/centimes";
import type { IsoDate } from "@/features/money/rules/dates";
import {
  beforeTaxOf,
  divisionIncome,
  invoicedByDivision,
  matchesByPayment,
  outstandingByDivision,
  type IncomePayment,
  type InvoiceMatch,
} from "@/features/money/rules/income";
import { bucketTotals, granularityOf, isInPeriod, readPeriod } from "@/features/money/rules/period";
import { DIVISIONS, isDivision, type Division, type TaxMode } from "@/features/money/validators/option-codes";
import type { IncomeDueView, IncomeInvoiceView, IncomePaymentView } from "@/features/money/views";
import { useSearchParams } from "@/lib/compat/navigation";

import { IncomeTable } from "./income-table";

const NO_MATCHES: readonly InvoiceMatch[] = [];

/**
 * «المداخيل حسب القسم»: what each of his four divisions brought in over a
 * period. Income is money collected, counted on the day it was received;
 * stamp duty is never income (rules/income.ts).
 *
 * Closest academy screen: finance analytics (finance/page.tsx and
 * finance/_components/): the date presets, the overview figures, then segmented
 * tabs with a daily chart and a table. Here the figures are the four divisions
 * and their total, and the tabs are the divisions.
 */
export function IncomeView({
  payments,
  matches = NO_MATCHES,
  invoices,
  dues,
  taxMode,
  vatRate,
  today,
}: {
  payments: readonly IncomePaymentView[];
  /** How payments settle invoices (VAT only changes the split before tax). */
  matches?: readonly InvoiceMatch[];
  invoices: readonly IncomeInvoiceView[];
  dues: readonly IncomeDueView[];
  taxMode: TaxMode;
  vatRate: BasisPoints;
  today: IsoDate;
}) {
  const t = useTranslations("Income");
  const tCommon = useTranslations("MoneyCommon");
  const divisionLabel = useDivisionLabel();
  const search = useSearchParams();
  const period = readPeriod(search, today);
  const division = useDivisionParam(DIVISIONS);

  // Stored codes are checked once, here: a row of another division is not one of his four.
  const rows = useMemo(() => payments.filter((payment) => isDivision(payment.division)), [payments]);
  const byPayment = useMemo(() => matchesByPayment(matches), [matches]);

  const report = useMemo(
    () =>
      divisionIncome({
        payments: rows.map(
          (payment): IncomePayment => ({
            id: payment.id,
            division: payment.division as Division,
            receivedDate: payment.receivedDate,
            amount: payment.amount,
            stampDuty: payment.stampDuty,
            voided: false,
          }),
        ),
        matches,
        from: period.from,
        to: period.to,
        taxMode,
        vatRate,
      }),
    [rows, matches, period.from, period.to, taxMode, vatRate],
  );

  const invoiced = useMemo(
    () =>
      invoicedByDivision(
        invoices
          .filter((invoice) => isDivision(invoice.division))
          .map((invoice) => ({ ...invoice, division: invoice.division as Division })),
        period.from,
        period.to,
      ),
    [invoices, period.from, period.to],
  );
  const outstanding = useMemo(
    () =>
      outstandingByDivision(
        dues.filter((due) => isDivision(due.division)).map((due) => ({ ...due, division: due.division as Division })),
      ),
    [dues],
  );

  const inDivision = (code: string) => division === ALL || code === division;
  const shown = rows
    .filter((payment) => isInPeriod(payment.receivedDate, period) && inDivision(payment.division))
    .sort((a, b) => (a.receivedDate < b.receivedDate ? 1 : a.receivedDate > b.receivedDate ? -1 : 0));

  const figures = division === ALL ? report.total : report.byDivision[division];
  const sumOver = (pick: (code: Division) => number) =>
    division === ALL ? DIVISIONS.reduce((sum, code) => sum + pick(code), 0) : pick(division);

  const strip: Figure[] = [
    {
      label: taxMode === "VAT" ? t("Figures.CollectedBeforeTax") : t("Figures.Collected"),
      value: <MoneyValue amount={figures.collected} />,
    },
    ...(taxMode === "VAT"
      ? [{ label: t("Figures.VatCollected"), value: <MoneyValue amount={figures.vatCollected} /> }]
      : []),
    {
      label: taxMode === "VAT" ? t("Figures.InvoicedBeforeTax") : t("Figures.Invoiced"),
      value: <MoneyValue amount={sumOver((code) => invoiced[code].beforeTax)} />,
      muted: true,
    },
    {
      label: t("Figures.Outstanding"),
      value: <MoneyValue amount={sumOver((code) => outstanding[code])} />,
      muted: true,
    },
    { label: t("Figures.StampCollected"), value: <MoneyValue amount={figures.stampCollected} />, muted: true },
  ];

  const buckets = bucketTotals(
    shown.map((payment) => ({
      date: payment.receivedDate,
      amount: beforeTaxOf(payment, byPayment.get(payment.id) ?? [], taxMode, vatRate),
    })),
    period,
  );

  const label = (option: Division | typeof ALL) => (option === ALL ? tCommon("AllDivisions") : divisionLabel(option));
  const granularity = granularityOf(period);

  return (
    <div className="space-y-8 tall:space-y-10">
      <PeriodFilter period={period} today={today} />

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("Overview")}</SectionHeading>
        <DivisionTiles
          section="money"
          tiles={[
            { id: ALL, label: t("TotalIncome"), amount: report.total.collected },
            ...DIVISIONS.map((code) => ({
              id: code,
              label: divisionLabel(code),
              amount: report.byDivision[code].collected,
            })),
          ]}
        />
      </section>

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("ByDivision")}</SectionHeading>
        <DivisionTabs
          section="money"
          value={division}
          options={DIVISIONS}
          labelOf={label}
          ariaLabel={t("DivisionSwitch")}
        >
          <FigureStrip figures={strip} />
          <PeriodChart
            buckets={buckets}
            granularity={granularity}
            title={t(granularity === "day" ? "ChartDaily" : "ChartMonthly", { division: label(division) })}
          />
          <IncomeTable rows={shown} showDivision={division === ALL} />
        </DivisionTabs>
      </section>
    </div>
  );
}
