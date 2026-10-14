import { useLocale, useTranslations } from "use-intl";

import { SectionHeading } from "@/components/screen";
import { useDivisionLabel } from "@/features/money/components/labels";
import { ALL, useDivisionParam } from "@/features/money/components/division-param";
import { DivisionTabs } from "@/features/money/components/division-tabs";
import { DivisionTiles } from "@/features/money/components/division-tiles";
import { FigureStrip, type Figure } from "@/features/money/components/figure-strip";
import { PeriodChart } from "@/features/money/components/period-chart";
import { PeriodFilter } from "@/features/money/components/period-filter";
import { MoneyValue } from "@/features/money/components/money-value";
import type { IsoDate } from "@/features/money/rules/dates";
import { expensesByDivision } from "@/features/money/rules/income";
import { bucketTotals, granularityOf, isInPeriod, readPeriod } from "@/features/money/rules/period";
import { EXPENSE_DIVISIONS, isExpenseDivision, type ExpenseDivision } from "@/features/money/validators/option-codes";
import type { ExpenseView } from "@/features/money/views";
import { intlLocaleFor } from "@/i18n/config";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useSearchParams } from "@/lib/compat/navigation";

import { ExpensesTable } from "./expenses-table";

/** Newest first; the same day keeps the order it came in. */
function newestFirst(a: ExpenseView, b: ExpenseView): number {
  return a.date < b.date ? 1 : a.date > b.date ? -1 : 0;
}

/**
 * «المصاريف حسب القسم»: what went out over a period, on each of his four
 * divisions and on «عام», the line for what belongs to none of them (rent,
 * telephone, the accountant).
 *
 * Closest academy screens: finance analytics (finance/_components/: the date
 * presets, the overview figures, segmented tabs with a daily chart and a
 * table) for the shape, and expenses (expenses/_components/) for the list and
 * its dialog. An expense counts on the day it was paid, as in the academy.
 */
export function ExpensesView({ expenses, today }: { expenses: readonly ExpenseView[]; today: IsoDate }) {
  const t = useTranslations("Expenses");
  const tCommon = useTranslations("MoneyCommon");
  const divisionLabel = useDivisionLabel();
  const categoryLabel = useCodeLabel("MoneyCodes.ExpenseCategories");
  const count = new Intl.NumberFormat(intlLocaleFor(useLocale()));
  const period = readPeriod(useSearchParams(), today);
  const division = useDivisionParam(EXPENSE_DIVISIONS);

  // Stored codes are checked once, here: a row on a line that is not his is not shown.
  const inPeriod = expenses.filter((row) => isExpenseDivision(row.division) && isInPeriod(row.date, period));
  const totals = expensesByDivision(
    inPeriod.map((row) => ({
      division: row.division as ExpenseDivision,
      date: row.date,
      amount: row.amount,
      deleted: false,
    })),
    period.from,
    period.to,
  );
  const total = EXPENSE_DIVISIONS.reduce((sum, code) => sum + totals[code], 0);

  const shown = inPeriod.filter((row) => division === ALL || row.division === division).sort(newestFirst);
  const shownTotal = shown.reduce((sum, row) => sum + row.amount, 0);
  const monthly = shown.filter((row) => row.recurrence === "MONTHLY").reduce((sum, row) => sum + row.amount, 0);

  // The category that took the most, for the strip: «أكبر بند».
  const byCategory = new Map<string, number>();
  for (const row of shown) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.amount);
  const [topCategory, topAmount] = [...byCategory].reduce<[string | null, number]>(
    (best, [code, amount]) => (amount > best[1] ? [code, amount] : best),
    [null, 0],
  );

  const strip: Figure[] = [
    { label: t("Figures.Total"), value: <MoneyValue amount={shownTotal} /> },
    { label: t("Figures.Monthly"), value: <MoneyValue amount={monthly} />, muted: true },
    { label: t("Figures.Count"), value: count.format(shown.length), muted: true },
    topCategory
      ? {
          label: t("Figures.TopCategory", { category: categoryLabel(topCategory) }),
          value: <MoneyValue amount={topAmount} />,
          muted: true,
        }
      : { label: t("Figures.NoTopCategory"), value: "—", muted: true },
  ];

  const label = (option: ExpenseDivision | typeof ALL) =>
    option === ALL ? tCommon("AllDivisions") : divisionLabel(option);
  const granularity = granularityOf(period);
  const buckets = bucketTotals(
    shown.map((row) => ({ date: row.date, amount: row.amount })),
    period,
  );

  return (
    <div className="space-y-8 tall:space-y-10">
      <PeriodFilter period={period} today={today} />

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("Overview")}</SectionHeading>
        <DivisionTiles
          section="money"
          tiles={[
            { id: ALL, label: t("TotalExpenses"), amount: total },
            ...EXPENSE_DIVISIONS.map((code) => ({
              id: code,
              label: divisionLabel(code),
              amount: totals[code],
            })),
          ]}
        />
      </section>

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("ByDivision")}</SectionHeading>
        <DivisionTabs
          section="money"
          value={division}
          options={EXPENSE_DIVISIONS}
          labelOf={label}
          ariaLabel={t("DivisionSwitch")}
        >
          <FigureStrip figures={strip} />
          <PeriodChart
            buckets={buckets}
            granularity={granularity}
            title={t(granularity === "day" ? "ChartDaily" : "ChartMonthly", { division: label(division) })}
          />
          <ExpensesTable
            rows={shown}
            showDivision={division === ALL}
            today={today}
            defaultDivision={division === ALL ? undefined : division}
          />
        </DivisionTabs>
      </section>
    </div>
  );
}
