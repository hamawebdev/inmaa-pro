import { Link } from "react-router-dom";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { SectionHeading } from "@/components/screen";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FigureStrip } from "@/features/money/components/figure-strip";
import { useDivisionLabel } from "@/features/money/components/labels";
import { MoneyValue } from "@/features/money/components/money-value";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import { hoursText } from "@/features/money/rules/hours";
import type { PeriodReport } from "@/features/money/services/reports";
import { DIVISIONS } from "@/features/money/validators/option-codes";
import { intlLocaleFor } from "@/i18n/config";
import { cn } from "@/lib/utils";
import { filePartHref } from "@/navigation/file-parts";

import { AccountantExport } from "./accountant-export";
import { AnalyticsView } from "./analytics-view";

/**
 * The report of the period, top to bottom as the manager reads it: what is
 * left, where it came from, how the work went, what the coming months look
 * like, and each file's account.
 *
 * «عام» is a line of its own: the rent and the telephone belong to none of his
 * four divisions, and spreading them would give each a result nobody decided.
 * A loss is written with its minus sign and in the alert colour.
 */
export function ReportView({ report, branchId = null }: { report: PeriodReport; branchId?: string | null }) {
  const t = useTranslations("Reports");
  const money = useMoneyText();
  const dates = useDateText();
  const divisionLabel = useDivisionLabel();
  const locale = intlLocaleFor(useLocale());
  const count = new Intl.NumberFormat(locale);
  const { result, counts, forecast } = report;

  const signed = (amount: number, strong = false) => (
    <span className={cn("whitespace-nowrap tabular-nums", strong && "font-bold", amount < 0 && "text-destructive")}>
      <Ltr>{money(amount)}</Ltr>
    </span>
  );

  return (
    <div className="space-y-8 tall:space-y-10">
      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("Result")}</SectionHeading>
        {/* A period's totals run to six and seven figures: the strip's type keeps them whole, as on the income screen. */}
        <FigureStrip
          figures={[
            { label: t("Income"), value: <MoneyValue amount={result.totalIncome} /> },
            { label: t("Expenses"), value: <MoneyValue amount={result.totalExpenses} /> },
            { label: t("Profit"), value: <MoneyValue amount={result.profit} /> },
          ]}
        />
      </section>

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("ByDivision")}</SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.Division")}</TableHead>
              <TableHead>{t("Income")}</TableHead>
              <TableHead>{t("Expenses")}</TableHead>
              <TableHead>{t("Table.Result")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {DIVISIONS.map((division) => (
              <TableRow key={division}>
                <TableCell className="font-bold">{divisionLabel(division)}</TableCell>
                <TableCell>{signed(result.byDivision[division].income)}</TableCell>
                <TableCell>{signed(result.byDivision[division].expenses)}</TableCell>
                <TableCell>{signed(result.byDivision[division].result, true)}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell className="font-bold">{divisionLabel("COMMON")}</TableCell>
              <TableCell className="text-muted-foreground">—</TableCell>
              <TableCell>{signed(result.commonExpenses)}</TableCell>
              <TableCell>{signed(-result.commonExpenses, true)}</TableCell>
            </TableRow>
            <TableRow className="bg-muted/50">
              <TableCell className="font-bold">{t("Table.Total")}</TableCell>
              <TableCell>{signed(result.totalIncome, true)}</TableCell>
              <TableCell>{signed(result.totalExpenses, true)}</TableCell>
              <TableCell>{signed(result.profit, true)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("Indicators")}</SectionHeading>
        <FigureStrip
          figures={[
            {
              label: t("Figures.Invoiced", { count: counts.invoices }),
              value: <MoneyValue amount={report.invoiced} />,
            },
            {
              label: t("Figures.Received", { count: counts.payments }),
              value: <MoneyValue amount={report.received} />,
            },
            { label: t("Figures.Outstanding"), value: <MoneyValue amount={report.outstanding} />, muted: true },
            { label: t("Figures.Overdue"), value: <MoneyValue amount={report.overdue} />, muted: true },
          ]}
        />
        <FigureStrip
          figures={[
            { label: t("Figures.Visits"), value: count.format(counts.visits) },
            { label: t("Figures.VisitsDone"), value: count.format(counts.visitsDone) },
            { label: t("Figures.VisitsNotDone"), value: count.format(counts.visitsNotDone), muted: true },
            { label: t("Figures.OrdersNotReturned"), value: count.format(counts.ordersNotReturned), muted: true },
          ]}
        />
      </section>

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("Forecast")}</SectionHeading>
        <p className="text-muted-foreground">
          {t("ForecastNote", {
            overdue: money(forecast.overdue),
            rest: money(forecast.restOfCurrentMonth),
            monthly: money(forecast.monthlyExpenses),
          })}
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.Month")}</TableHead>
              <TableHead>{t("Table.Receipts")}</TableHead>
              <TableHead>{t("Table.ExpectedExpenses")}</TableHead>
              <TableHead>{t("Table.Running")}</TableHead>
              <TableHead>{t("Table.IfRenewed")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {forecast.months.map((month) => (
              <TableRow key={month.month}>
                <TableCell className="font-bold whitespace-nowrap">{dates.month(month.month)}</TableCell>
                <TableCell>
                  {signed(month.receipts)}
                  {month.receiptsIfRenewed > 0 && (
                    <span className="block text-sm text-muted-foreground">
                      {t("PlusRenewals", { amount: money(month.receiptsIfRenewed) })}
                    </span>
                  )}
                </TableCell>
                <TableCell>{signed(month.expenses)}</TableCell>
                <TableCell>{signed(month.running, true)}</TableCell>
                <TableCell>{signed(month.runningIfRenewed)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("ByWorker")}</SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.Worker")}</TableHead>
              <TableHead>{t("Table.VisitsDone")}</TableHead>
              <TableHead>{t("Table.Hours")}</TableHead>
              <TableHead>{t("Table.Late")}</TableHead>
              <TableHead>{t("Table.HandOuts")}</TableHead>
              <TableHead>{t("Table.LostOrDamaged")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.workers.length === 0 ? (
              <TableEmpty colSpan={6}>{t("NoWorkers")}</TableEmpty>
            ) : (
              report.workers.map((worker) => (
                <TableRow key={worker.workerId}>
                  <TableCell>
                    <span className="block max-w-40 truncate leading-tight font-bold xl:max-w-64">{worker.name}</span>
                    <span className="block text-sm leading-tight text-muted-foreground">
                      <Ltr>{worker.number}</Ltr>
                    </span>
                  </TableCell>
                  <TableCell className="tabular-nums">{count.format(worker.visits)}</TableCell>
                  <TableCell className="tabular-nums">
                    <Ltr>{hoursText(worker.workedMin)}</Ltr>
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {worker.lateArrivals > 0 ? (
                      <span className="font-bold text-warning-ink">{count.format(worker.lateArrivals)}</span>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="tabular-nums">
                    {count.format(worker.handOuts)}
                    {worker.equipmentOut > 0 && (
                      <span className="block text-sm text-muted-foreground">
                        {t("StillOut", { count: worker.equipmentOut / 1000 })}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>{worker.lostOrDamaged > 0 ? signed(-worker.lostOrDamaged) : "—"}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <AnalyticsView from={report.from} to={report.to} branchId={branchId} />

      <AccountantExport from={report.from} to={report.to} />

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("ByFile")}</SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.File")}</TableHead>
              <TableHead>{t("Table.Division")}</TableHead>
              <TableHead>{t("Table.Invoiced")}</TableHead>
              <TableHead>{t("Table.Received")}</TableHead>
              <TableHead>{t("Table.Outstanding")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report.contracts.length === 0 ? (
              <TableEmpty colSpan={5}>{t("NoFiles")}</TableEmpty>
            ) : (
              report.contracts.map((line) => (
                <TableRow key={line.fileId}>
                  <TableCell>
                    <Link
                      to={filePartHref(line.fileId, "payments")}
                      className="block max-w-64 min-w-0 rounded-sm outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/30"
                    >
                      <span className="block truncate leading-tight font-bold">{line.clientName}</span>
                      <span className="block truncate text-sm leading-tight text-muted-foreground">
                        <Ltr>{line.fileNumber}</Ltr>
                      </span>
                    </Link>
                  </TableCell>
                  <TableCell>{divisionLabel(line.division)}</TableCell>
                  <TableCell>{signed(line.invoiced)}</TableCell>
                  <TableCell>{signed(line.received)}</TableCell>
                  <TableCell>{signed(line.outstanding, true)}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
