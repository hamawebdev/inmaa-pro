import type { CSSProperties, ReactNode } from "react";

import { Ltr } from "@/components/ltr";
import { KeepTogether, PrintSheet, SHEET_FONT, SheetCell, SheetRow, SheetTable } from "@/components/print";
import type { PayslipFile } from "@/features/people/services/pay-runs";
import { PAYMENT_METHOD_AR, type PaymentMethod } from "@/lib/options";
import { formatMoney, MONEY_UNIT_AR } from "@/lib/units";

/**
 * «كشف الراتب»: one person's payslip of a month, on the centre's letterhead,
 * to sign and stamp (feature 38).
 *
 * The client has no payslip of his own: this one is set in the type of his
 * worker form (Traditional Arabic for the text, Sakkal Majalla in the tables)
 * and in its manner, a shaded title row over each table. What a payslip must
 * show is the law's: the employer and the person, the month, what is earned
 * line by line, what is taken off (social security, income tax, advances),
 * and the net to pay.
 *
 * A pure picture of its data: the sheet is drawn twice, as the preview and as
 * the copy that prints.
 */

const MONTHS_AR = [
  "جانفي",
  "فيفري",
  "مارس",
  "أفريل",
  "ماي",
  "جوان",
  "جويلية",
  "أوت",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

const PAY_BASIS_AR: Record<string, string> = {
  MONTHLY: "راتب شهري",
  DAILY: "أجر يومي",
  HOURLY: "بالساعة",
  PER_TASK: "بالمهمة",
};

const cell: CSSProperties = { fontFamily: SHEET_FONT.sakkal, fontSize: "13pt", lineHeight: "6.4mm" };
const label: CSSProperties = { ...cell, fontWeight: 700 };
const title: CSSProperties = { ...cell, fontSize: "14pt", fontWeight: 700 };
const figure: CSSProperties = { ...cell, textAlign: "center" };

/** «12/10/2026» */
const dateAr = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}/${date.slice(0, 4)}`;
/** «7:30» */
const hours = (minutes: number) => `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
/** «2,5» */
const days = (thousandths: number) => String(thousandths / 1000).replace(".", ",");

function Money({ value }: { value: number }) {
  return <Ltr>{formatMoney(Math.abs(value))}</Ltr>;
}

function Row({ name, children, second }: { name: string; children: ReactNode; second?: [string, ReactNode] }) {
  return (
    <SheetRow heightMm={8}>
      <SheetCell style={label}>{name}</SheetCell>
      <SheetCell style={cell} colSpan={second ? 1 : 3}>
        {children}
      </SheetCell>
      {second && (
        <>
          <SheetCell style={label}>{second[0]}</SheetCell>
          <SheetCell style={cell}>{second[1]}</SheetCell>
        </>
      )}
    </SheetRow>
  );
}

export function PayslipSheet({ slip }: { slip: PayslipFile }) {
  const [year, month] = slip.run.month.split("-");
  const woman = slip.sex === "FEMALE";
  // The digits are kept left to right; the unit follows them as Arabic reads.
  const quantity = (item: PayslipFile["items"][number]) => {
    if (item.quantity === null) return null;
    const counted = item.type === "BASE" && (slip.payBasis === "DAILY" || slip.payBasis === "PER_TASK");
    return (
      <>
        <Ltr>{counted ? days(item.quantity) : hours(Math.round((item.quantity * 60) / 1000))}</Ltr>{" "}
        {counted ? (slip.payBasis === "DAILY" ? "يوم" : "مهمة") : "سا"}
      </>
    );
  };
  const takenOff = slip.items.filter((item) => item.amount < 0).reduce((sum, item) => sum - item.amount, 0);
  const lastPayout = slip.payouts.filter((payout) => payout.voidedAt === null).at(-1);
  const WIDTH = [44, 50, 42, 44] as const;
  const LINES = [84, 30, 33, 33] as const;

  return (
    <PrintSheet letterhead="worker">
      <div style={{ marginInline: "5mm" }}>
        <h1 style={{ textAlign: "center", fontSize: "20pt", fontWeight: 700, lineHeight: "11mm" }}>كشف الراتب</h1>
        <p
          style={{
            ...cell,
            display: "flex",
            justifyContent: "center",
            gap: "14mm",
            fontSize: "14pt",
            marginBottom: "3mm",
          }}
        >
          <span>
            لشهر {MONTHS_AR[Number(month) - 1]} <Ltr>{year}</Ltr>
          </span>
          {slip.number && (
            <span>
              رقم: <Ltr>{slip.number}</Ltr>
            </span>
          )}
        </p>

        <SheetTable columns={WIDTH}>
          <SheetRow heightMm={8}>
            <SheetCell shaded colSpan={4} align="center" style={title}>
              المستخدم والمعني{woman ? "ة" : ""}
            </SheetCell>
          </SheetRow>
          <Row
            name="المستخدم"
            second={["رقم المستخدم لدى الضمان الاجتماعي", <Ltr key="n">{slip.employer.cnasEmployerNumber}</Ltr>]}
          >
            {slip.employer.nameAr}، {slip.employer.city}
          </Row>
          <Row name="اللقب والاسم" second={["رقم التسجيل", <Ltr key="n">{slip.staffNumber}</Ltr>]}>
            {slip.staffName}
          </Row>
          <Row name="الوظيفة" second={["رقم الضمان الاجتماعي", <Ltr key="n">{slip.cnasNumber ?? ""}</Ltr>]}>
            {slip.positionOrRole ?? ""}
          </Row>
          <Row
            name="أساس الأجر"
            second={[
              "الفترة",
              <span key="p">
                من <Ltr>{dateAr(slip.run.periodStart)}</Ltr> إلى <Ltr>{dateAr(slip.run.periodEnd)}</Ltr>
              </span>,
            ]}
          >
            {PAY_BASIS_AR[slip.payBasis] ?? ""}: <Ltr>{formatMoney(slip.payRate)}</Ltr> {MONEY_UNIT_AR}
          </Row>
        </SheetTable>

        <SheetTable columns={[36, 36, 36, 36, 36]} style={{ marginTop: "4mm" }}>
          <SheetRow heightMm={8}>
            <SheetCell shaded align="center" style={label}>
              أيام العمل
            </SheetCell>
            <SheetCell shaded align="center" style={label}>
              ساعات العمل
            </SheetCell>
            <SheetCell shaded align="center" style={label}>
              الساعات الإضافية
            </SheetCell>
            <SheetCell shaded align="center" style={label}>
              ساعات يوم الراحة
            </SheetCell>
            <SheetCell shaded align="center" style={label}>
              الغيابات
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={8}>
            <SheetCell style={figure}>
              <Ltr>{days(slip.daysWorked)}</Ltr>
            </SheetCell>
            <SheetCell style={figure}>
              <Ltr>{hours(slip.normalMin + slip.overtimeMin)}</Ltr>
            </SheetCell>
            <SheetCell style={figure}>
              <Ltr>{hours(slip.overtimeMin)}</Ltr>
            </SheetCell>
            <SheetCell style={figure}>
              <Ltr>{hours(slip.restDayMin)}</Ltr>
            </SheetCell>
            <SheetCell style={figure}>
              <Ltr>{hours(slip.absenceMin)}</Ltr>
            </SheetCell>
          </SheetRow>
        </SheetTable>

        <SheetTable
          columns={LINES}
          style={{ marginTop: "4mm" }}
          head={
            <SheetRow heightMm={8}>
              <SheetCell shaded style={title}>
                البيان
              </SheetCell>
              <SheetCell shaded align="center" style={title}>
                العدد
              </SheetCell>
              <SheetCell shaded align="center" style={title}>
                المستحق ({MONEY_UNIT_AR})
              </SheetCell>
              <SheetCell shaded align="center" style={title}>
                المقتطع ({MONEY_UNIT_AR})
              </SheetCell>
            </SheetRow>
          }
        >
          {slip.items.map((item) => (
            <SheetRow key={item.id} heightMm={7.5}>
              <SheetCell style={cell}>{item.label}</SheetCell>
              <SheetCell style={figure}>{quantity(item)}</SheetCell>
              <SheetCell style={figure}>{item.amount >= 0 && <Money value={item.amount} />}</SheetCell>
              <SheetCell style={figure}>{item.amount < 0 && <Money value={item.amount} />}</SheetCell>
            </SheetRow>
          ))}
          <SheetRow heightMm={8}>
            <SheetCell style={label} colSpan={2}>
              المجموع
            </SheetCell>
            <SheetCell style={{ ...figure, fontWeight: 700 }}>
              <Money value={slip.grossAmount} />
            </SheetCell>
            <SheetCell style={{ ...figure, fontWeight: 700 }}>
              <Money value={takenOff} />
            </SheetCell>
          </SheetRow>
          <SheetRow heightMm={9}>
            <SheetCell shaded style={title} colSpan={2}>
              الصافي للدفع
            </SheetCell>
            <SheetCell shaded colSpan={2} align="center" style={{ ...title, fontSize: "15pt" }}>
              <Ltr>{formatMoney(slip.netAmount)}</Ltr> {MONEY_UNIT_AR}
            </SheetCell>
          </SheetRow>
        </SheetTable>

        <SheetTable columns={WIDTH} style={{ marginTop: "4mm" }}>
          <Row
            name="وعاء الاشتراك"
            second={["اشتراك المستخدم", <Ltr key="e">{formatMoney(slip.employerCnasAmount)}</Ltr>]}
          >
            <Ltr>{formatMoney(slip.contributableBase)}</Ltr>
          </Row>
          <Row
            name="العطلة المكتسبة هذا الشهر"
            second={["رصيد العطلة (يوم)", <Ltr key="b">{days(slip.leaveBalanceDays)}</Ltr>]}
          >
            <Ltr>{days(slip.leaveAccruedDays)}</Ltr> يوم
          </Row>
          <Row
            name="طريقة الدفع"
            second={["تاريخ الدفع", lastPayout ? <Ltr key="d">{dateAr(lastPayout.date)}</Ltr> : ""]}
          >
            {lastPayout ? (PAYMENT_METHOD_AR[lastPayout.wageMethod as PaymentMethod] ?? "") : ""}
          </Row>
        </SheetTable>

        <KeepTogether style={{ marginTop: "9mm" }}>
          <div style={{ display: "flex", justifyContent: "space-between", ...label, fontSize: "14pt" }}>
            <span style={{ width: "80mm", textAlign: "center" }}>إمضاء وختم المستخدم</span>
            <span style={{ width: "80mm", textAlign: "center" }}>إمضاء المعني{woman ? "ة" : ""}</span>
          </div>
          <div style={{ height: "24mm" }} />
        </KeepTogether>
      </div>
    </PrintSheet>
  );
}
