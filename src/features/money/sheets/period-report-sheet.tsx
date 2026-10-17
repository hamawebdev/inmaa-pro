import {
  KeepTogether,
  PrintSheet,
  SHEET_MARGINS_CLEAR_OF_LETTERHEAD,
  SheetCell,
  SheetRow,
  SheetTable,
} from "@/components/print";
import { SERVICE_TYPE_AR } from "@/lib/options";

import type { IsoDate } from "../rules/dates";
import type { PeriodAnalytics, ProfitGroup } from "../services/analytics";
import type { PeriodReport } from "../services/reports";
import { DIVISIONS } from "../validators/option-codes";

import { CURRENCY, DIVISION_LABEL } from "./print-labels";
import { Amount, DateText, Gap, Num, SheetHeading } from "./sheet-parts";
import { TYPE } from "./sheet-style";

/**
 * «تقرير الفترة»: the reports screen on paper (features 22, 30, 39, 41), for the period chosen on screen:
 * the result per division, the indicators, the work of each worker, each contract's result and the
 * analytics by service type, zone and client, the cash flow. The cost columns print only for a reader
 * who holds `cost.read` (the analytics come without them otherwise). It names workers and clients:
 * printing it is a disclosure, recorded before it prints.
 */

export interface PeriodReportSheetData {
  report: PeriodReport;
  analytics: PeriodAnalytics;
  printedOn: IsoDate;
  /** The branch the report is of, when one was chosen; none for the whole centre. */
  branchName?: string | null;
}

const ROW = { ...TYPE.body, fontSize: "10.5pt" } as const;
const ROW_STRONG = { ...TYPE.label, fontSize: "10.5pt" } as const;
const HEAD = { ...TYPE.label, fontSize: "10.5pt" } as const;

/** A section title, kept with what follows it. */
function Title({ children }: { children: React.ReactNode }) {
  return <p style={{ ...TYPE.heading, margin: "4mm 0 2mm" }}>{children}</p>;
}

function Cells({ values, strong = false }: { values: readonly (number | null)[]; strong?: boolean }) {
  return (
    <>
      {values.map((value, index) => (
        <SheetCell key={index} align="end" style={strong ? ROW_STRONG : ROW}>
          {value === null ? "—" : <Amount value={value} />}
        </SheetCell>
      ))}
    </>
  );
}

function Head({ labels }: { labels: readonly string[] }) {
  return (
    <SheetRow heightMm={8}>
      {labels.map((label) => (
        <SheetCell key={label} shaded align="center" style={HEAD}>
          {label}
        </SheetCell>
      ))}
    </SheetRow>
  );
}

function GroupTable({ title, rows, seesCost }: { title: string; rows: readonly ProfitGroup[]; seesCost: boolean }) {
  if (rows.length === 0) return null;
  // A short table: its title never stays at the foot of a page without it.
  return (
    <KeepTogether>
      <Title>{title}</Title>
      <SheetTable
        columns={seesCost ? [79.3, 36, 36, 36] : [115.3, 72]}
        head={
          <Head
            labels={
              seesCost
                ? ["", `الإيراد (${CURRENCY})`, `التكلفة (${CURRENCY})`, `النتيجة (${CURRENCY})`]
                : ["", `الإيراد (${CURRENCY})`]
            }
          />
        }
      >
        {rows.map((row) => (
          <SheetRow key={row.key} heightMm={7}>
            <SheetCell style={ROW_STRONG}>{row.label}</SheetCell>
            <Cells values={seesCost ? [row.revenue, row.cost, row.result] : [row.revenue]} />
          </SheetRow>
        ))}
      </SheetTable>
    </KeepTogether>
  );
}

export function PeriodReportSheet({ data }: { data: PeriodReportSheetData }) {
  const { report, analytics } = data;
  const { result, counts } = report;
  const seesCost = analytics.seesCost;
  const zoneLabel = (label: string) => (label === "none" ? "دون منطقة" : label);

  return (
    <PrintSheet letterhead="client" margins={SHEET_MARGINS_CLEAR_OF_LETTERHEAD.client}>
      <SheetHeading
        title="تقرير الفترة"
        references={[
          {
            label: "الفترة",
            value: (
              <>
                من <DateText value={report.from} /> إلى <DateText value={report.to} />
              </>
            ),
          },
          ...(data.branchName ? [{ label: "الفرع", value: data.branchName }] : []),
          { label: "تاريخ الطبع", value: <DateText value={data.printedOn} /> },
        ]}
      />
      <Gap mm={4} />

      <Title>النتيجة حسب القسم</Title>
      <SheetTable
        columns={[61.3, 42, 42, 42]}
        head={<Head labels={["القسم", `المداخيل (${CURRENCY})`, `المصاريف (${CURRENCY})`, `النتيجة (${CURRENCY})`]} />}
      >
        {DIVISIONS.map((division) => (
          <SheetRow key={division} heightMm={7}>
            <SheetCell style={ROW_STRONG}>{DIVISION_LABEL[division]}</SheetCell>
            <Cells
              values={[
                result.byDivision[division].income,
                result.byDivision[division].expenses,
                result.byDivision[division].result,
              ]}
            />
          </SheetRow>
        ))}
        <SheetRow heightMm={7}>
          <SheetCell style={ROW_STRONG}>عام</SheetCell>
          <Cells values={[null, result.commonExpenses, -result.commonExpenses]} />
        </SheetRow>
        <SheetRow heightMm={8}>
          <SheetCell shaded style={ROW_STRONG}>
            المجموع
          </SheetCell>
          <Cells values={[result.totalIncome, result.totalExpenses, result.profit]} strong />
        </SheetRow>
      </SheetTable>

      <KeepTogether>
        <Title>المؤشرات</Title>
        <SheetTable columns={[61.3, 32.3, 61.4, 32.3]}>
          <SheetRow heightMm={7}>
            <SheetCell style={ROW_STRONG}>المفوتر</SheetCell>
            <Cells values={[report.invoiced]} />
            <SheetCell style={ROW_STRONG}>زيارات الفترة</SheetCell>
            <SheetCell align="center" style={ROW}>
              <Num>{counts.visits}</Num>
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={7}>
            <SheetCell style={ROW_STRONG}>المحصَّل</SheetCell>
            <Cells values={[report.received]} />
            <SheetCell style={ROW_STRONG}>المنفذة</SheetCell>
            <SheetCell align="center" style={ROW}>
              <Num>{counts.visitsDone}</Num>
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={7}>
            <SheetCell style={ROW_STRONG}>الديون اليوم</SheetCell>
            <Cells values={[report.outstanding]} />
            <SheetCell style={ROW_STRONG}>مؤجلة أو ملغاة أو بها مشكلة</SheetCell>
            <SheetCell align="center" style={ROW}>
              <Num>{counts.visitsNotDone}</Num>
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={7}>
            <SheetCell style={ROW_STRONG}>منها المتأخر</SheetCell>
            <Cells values={[report.overdue]} />
            <SheetCell style={ROW_STRONG}>أوامر مهمة لم تُسترجع</SheetCell>
            <SheetCell align="center" style={ROW}>
              <Num>{counts.ordersNotReturned}</Num>
            </SheetCell>
          </SheetRow>
        </SheetTable>
      </KeepTogether>

      {report.workers.length > 0 && (
        <>
          <Title>حسب العامل</Title>
          <SheetTable
            columns={[67.3, 22, 22, 22, 22, 32]}
            head={
              <Head labels={["العامل", "الزيارات", "الساعات", "التأخر", "التسليم", `ضائع أو تالف (${CURRENCY})`]} />
            }
          >
            {report.workers.map((worker) => (
              <SheetRow key={worker.workerId} heightMm={7}>
                <SheetCell style={ROW_STRONG}>
                  {worker.name} (<Num>{worker.number}</Num>)
                </SheetCell>
                <SheetCell align="center" style={ROW}>
                  <Num>{worker.visits}</Num>
                </SheetCell>
                <SheetCell align="center" style={ROW}>
                  <Num>{(worker.workedMin / 60).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}</Num>
                </SheetCell>
                <SheetCell align="center" style={ROW}>
                  {worker.lateArrivals > 0 ? <Num>{worker.lateArrivals}</Num> : "—"}
                </SheetCell>
                <SheetCell align="center" style={ROW}>
                  <Num>{worker.handOuts}</Num>
                </SheetCell>
                <Cells values={[worker.lostOrDamaged > 0 ? worker.lostOrDamaged : null]} />
              </SheetRow>
            ))}
          </SheetTable>
        </>
      )}

      {seesCost && analytics.contracts.length > 0 && (
        <>
          <Title>ربحية العقود</Title>
          <SheetTable
            columns={[55.3, 33, 33, 33, 33]}
            head={
              <Head
                labels={[
                  "الملف",
                  `الإيراد (${CURRENCY})`,
                  `التكلفة المقدرة (${CURRENCY})`,
                  `التكلفة الفعلية (${CURRENCY})`,
                  `النتيجة (${CURRENCY})`,
                ]}
              />
            }
          >
            {analytics.contracts.map((row) => (
              <SheetRow key={row.fileId} heightMm={7}>
                <SheetCell style={ROW_STRONG}>
                  {row.clientName} (<Num>{row.fileNumber}</Num>)
                </SheetCell>
                <Cells values={[row.revenue, row.estimatedCost, row.actualCost, row.result]} />
              </SheetRow>
            ))}
          </SheetTable>
        </>
      )}

      <GroupTable
        title="حسب نوع الخدمة"
        rows={analytics.byServiceType.map((row) => ({
          ...row,
          label: SERVICE_TYPE_AR[row.key as keyof typeof SERVICE_TYPE_AR] ?? row.label,
        }))}
        seesCost={seesCost}
      />
      <GroupTable
        title="حسب المنطقة"
        rows={analytics.byZone.map((row) => ({ ...row, label: zoneLabel(row.label) }))}
        seesCost={seesCost}
      />
      <GroupTable title="حسب العميل" rows={analytics.byClient} seesCost={seesCost} />

      {analytics.cashFlow.length > 0 && (
        <KeepTogether>
          <Title>التدفق النقدي</Title>
          <SheetTable
            columns={[39.3, 37, 37, 37, 37]}
            head={
              <Head
                labels={[
                  "الشهر",
                  `الداخل (${CURRENCY})`,
                  `الخارج (${CURRENCY})`,
                  `الصافي (${CURRENCY})`,
                  `الرصيد (${CURRENCY})`,
                ]}
              />
            }
          >
            {analytics.cashFlow.map((month) => (
              <SheetRow key={month.month} heightMm={7}>
                <SheetCell align="center" style={ROW_STRONG}>
                  <Num>{month.month.split("-").reverse().join("/")}</Num>
                </SheetCell>
                <Cells values={[month.moneyIn, month.moneyOut, month.net, month.running]} />
              </SheetRow>
            ))}
          </SheetTable>
        </KeepTogether>
      )}
    </PrintSheet>
  );
}
