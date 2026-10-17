import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Ban, HandCoins, PencilLine, Printer } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntryDialog } from "@/features/people/components/entry-dialog";
import { Amount, DayDate, Days, Duration, Nothing } from "@/features/people/components/figures";
import { centimesOf } from "@/features/people/components/format";
import { isolate, useMay } from "@/features/people/components/may";
import { usePeopleDates } from "@/features/people/components/people-dates";
import { SimpleTable } from "@/features/people/components/simple-table";
import { getPayslipQuery, updatePayslipAction, type PayslipFile } from "@/features/people/services/pay-runs";
import { useMoneyText } from "@/hooks/use-money-text";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

import { usePayEntries } from "../../_components/use-pay-entries";

/**
 * One payslip: what the month pays a person and why, the corrections the
 * office may type while the run is a draft (CNAS, IRG, the advance taken back,
 * a deduction, the recurring deductions of a short month, a correction of the
 * base with its reason), and, once the run is closed, the wage paid on it.
 *
 * Closest academy screen: a payout's page in finance (the facts of one
 * payment in cards, its lines in a table).
 */
function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-base font-bold">{children}</dd>
    </div>
  );
}

export default function PayslipPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Pay");
  const basisLabel = useCodeLabel("WorkerForm.PayBases");
  const methodLabel = useCodeLabel("Options.PaymentMethod");
  const dates = usePeopleDates();
  const errorMessage = useErrorMessage();
  const money = useMoneyText();
  const writesPay = useMay("pay.write");
  const [ask, entryDialog] = useEntryDialog();
  const entries = usePayEntries();
  const { data: slip, isError } = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "payslip", id],
    queryFn: () => getPayslipQuery({ payslipId: id }),
  });

  if (!slip) {
    return (
      <DetailScreen
        section="workers"
        title={t("Slips.Title")}
        back={{ href: "/dashboard/hours-pay?view=pay", label: t("Runs.Back") }}
      >
        <p className="text-base text-muted-foreground">{t(isError ? "Slips.Missing" : "Loading")}</p>
      </DetailScreen>
    );
  }

  const draft = slip.run.status === "DRAFT";
  const closed = slip.run.status === "CLOSED";
  const left = slip.netAmount - slip.paidAmount;
  const dinars = (centimes: number | undefined) => (centimes === undefined ? "" : String(centimes / 100));

  const correct = async () => {
    const number = (name: string, label: string, value: number | undefined, min?: string) =>
      ({
        kind: "number",
        name,
        label,
        step: "0.01",
        suffix: t("Entry.Dinars"),
        defaultValue: dinars(value),
        ...(min === undefined ? {} : { min }),
      }) as const;
    const values = await ask({
      title: t("Slips.CorrectTitle"),
      description: t("Slips.CorrectDescription"),
      confirmLabel: t("Slips.CorrectConfirm"),
      fields: [
        number("cnas", t("Slips.Cnas"), slip.typed.cnas),
        number("irg", t("Slips.Irg"), slip.typed.irg),
        number("advanceRepayment", t("Slips.Repayment"), slip.typed.advanceRepayment),
        number("deduction", t("Slips.Deduction"), slip.typed.deduction),
        // A wage per task has no hourly value: its overtime and rest-day premiums are priced here.
        ...(slip.payBasis === "PER_TASK"
          ? [
              number("overtime", t("Slips.OvertimeTyped"), slip.typed.overtime),
              number("restDayPremium", t("Slips.RestDayTyped"), slip.typed.restDayPremium),
            ]
          : []),
        {
          kind: "text",
          name: "deductionLabel",
          label: t("Slips.DeductionLabel"),
          defaultValue: slip.typed.deductionLabel,
        },
        number("recurringDeductions", t("Slips.RecurringDeductions"), slip.typed.recurringDeductions),
        // Signed: a rate typed too high is corrected downwards (PEO-08).
        number("baseCorrection", t("Slips.BaseCorrection"), slip.typed.baseCorrection, "-99999999"),
        {
          kind: "text",
          name: "baseCorrectionReason",
          label: t("Slips.BaseCorrectionReason"),
          defaultValue: slip.typed.baseCorrectionReason,
        },
      ],
    });
    if (!values) return;
    // An emptied field goes back to what the program computes.
    const typed = (text: string) => (text === "" ? null : centimesOf(text));
    const signed = (text: string | undefined) => {
      const value = Number((text ?? "").replace(",", ".").trim());
      return (text ?? "").trim() === "" || !Number.isFinite(value) ? null : Math.round(value * 100);
    };
    const result = await updatePayslipAction({
      payslipId: slip.id,
      cnas: typed(values.cnas),
      irg: typed(values.irg),
      advanceRepayment: typed(values.advanceRepayment),
      deduction: typed(values.deduction),
      ...(slip.payBasis === "PER_TASK"
        ? { overtime: typed(values.overtime ?? ""), restDayPremium: typed(values.restDayPremium ?? "") }
        : {}),
      deductionLabel: values.deductionLabel || null,
      recurringDeductions: typed(values.recurringDeductions ?? ""),
      baseCorrection: signed(values.baseCorrection),
      baseCorrectionReason: values.baseCorrectionReason || null,
    });
    if (result.success) toast.success(t("Slips.Corrected"));
    else toast.error(errorMessage(result.error, t("Entry.Failed")));
  };

  const quantity = (item: PayslipFile["items"][number]) => {
    if (item.quantity === null) return <Nothing />;
    const counted = item.type === "BASE" && (slip.payBasis === "DAILY" || slip.payBasis === "PER_TASK");
    return counted ? (
      <Days thousandths={item.quantity} />
    ) : (
      <Duration minutes={Math.round((item.quantity * 60) / 1000)} />
    );
  };

  return (
    <DetailScreen
      section="workers"
      title={`${t("Slips.Title")} · ${slip.staffName}`}
      back={{ href: `/dashboard/hours-pay/runs/${slip.run.id}`, label: t("Slips.Back") }}
      actions={
        <>
          {draft && writesPay && (
            <Button variant="edit" onClick={() => void correct()}>
              <PencilLine />
              {t("Slips.Correct")}
            </Button>
          )}
          {closed && writesPay && left > 0 && (
            <Button variant="add" onClick={() => void entries.payWage({ id: slip.id, staffId: slip.staffId, left })}>
              <HandCoins />
              {t("Slips.Pay")}
            </Button>
          )}
          {/* A draft prints marked «مسودة» and a voided one «ملغى», without the lines to sign (PEO-11). */}
          <Button variant="outline" asChild>
            <Link to={`/dashboard/hours-pay/payslips/${slip.id}/print`}>
              <Printer />
              {t("Slips.Print")}
            </Link>
          </Button>
        </>
      }
    >
      {entryDialog}
      {entries.dialogs}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          {slip.missing.includes("IRG") && <StatusChip tone="warning" label={t("Slips.IrgToType")} />}
          {slip.plannedSeats > 0 && (
            <StatusChip tone="warning" label={t("Slips.PlannedSeats", { count: slip.plannedSeats })} />
          )}
          {(slip.missing.includes("OVERTIME") || slip.missing.includes("REST_DAY")) && (
            <StatusChip tone="warning" label={t("Slips.PremiumsToPrice")} />
          )}
          {draft && slip.netAmount < 0 && <StatusChip tone="danger" label={t("Slips.NegativeNet")} />}
          {slip.ordersNotTypedCount > 0 && (
            <StatusChip tone="warning" label={t("Slips.OrdersNotTyped", { count: slip.ordersNotTypedCount })} />
          )}
          {closed &&
            (left <= 0 ? (
              <StatusChip tone="success" label={t("Slips.Paid")} />
            ) : (
              <StatusChip
                tone={slip.paidAmount > 0 ? "info" : "pending"}
                label={t("Slips.LeftToPay", { left: isolate(money(left)) })}
              />
            ))}
          {draft && <StatusChip tone="pending" label={t("RunStatuses.DRAFT")} />}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{t("Slips.Facts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label={t("Runs.Month")}>{dates.month(slip.run.month)}</Fact>
              <Fact label={t("Slips.Number")}>{slip.number ? <Ltr>{slip.number}</Ltr> : <Nothing />}</Fact>
              <Fact label={t("Slips.StaffNumber")}>
                <Ltr>{slip.staffNumber}</Ltr>
              </Fact>
              <Fact label={t("Slips.Role")}>{slip.positionOrRole ?? <Nothing />}</Fact>
              <Fact label={t("Slips.Basis")}>
                {basisLabel(slip.payBasis)} · <Amount value={slip.payRate} />
              </Fact>
              <Fact label={t("Slips.Days")}>
                <Days thousandths={slip.daysWorked} />
              </Fact>
              <Fact label={t("Slips.Hours")}>
                <Duration minutes={slip.normalMin + slip.overtimeMin} />
              </Fact>
              <Fact label={t("Slips.Overtime")}>
                <Duration minutes={slip.overtimeMin} />
              </Fact>
              <Fact label={t("Slips.RestDay")}>
                <Duration minutes={slip.restDayMin} />
              </Fact>
              <Fact label={t("Slips.Absence")}>
                <Duration minutes={slip.absenceMin} />
              </Fact>
              <Fact label={t("Slips.Late")}>
                <Duration minutes={slip.lateMin} />
              </Fact>
              <Fact label={t("Slips.LeaveEarned")}>
                <Days thousandths={slip.leaveAccruedDays} />
              </Fact>
              <Fact label={t("Slips.LeaveBalance")}>
                <Days thousandths={slip.leaveBalanceDays} />
              </Fact>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Slips.Lines")}</CardTitle>
            <CardDescription>{t("Slips.LinesHint")}</CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleTable
              rows={slip.items}
              rowKey={(item) => item.id}
              emptyMessage={t("Slips.NoLine")}
              columns={[
                { header: t("Slips.Line"), cell: (item) => item.label },
                { header: t("Slips.Quantity"), cell: quantity, numeric: true },
                {
                  header: t("Slips.Amount"),
                  numeric: true,
                  cell: (item) => (
                    <Amount value={item.amount} className={item.amount < 0 ? "text-destructive" : undefined} />
                  ),
                },
              ]}
              footer={[t("Slips.Net"), null, <Amount key="net" value={slip.netAmount} />]}
            />
            <dl className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Fact label={t("Slips.Gross")}>
                <Amount value={slip.grossAmount} />
              </Fact>
              <Fact label={t("Slips.ContributableBase")}>
                <Amount value={slip.contributableBase} />
              </Fact>
              <Fact label={t("Slips.TaxableBase")}>
                <Amount value={slip.taxableBase} />
              </Fact>
              <Fact label={t("Slips.EmployerCnas")}>
                <Amount value={slip.employerCnasAmount} />
              </Fact>
            </dl>
          </CardContent>
        </Card>

        {slip.seats.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>{t("Slips.Seats")}</CardTitle>
              <CardDescription>{t("Slips.SeatsHint")}</CardDescription>
            </CardHeader>
            <CardContent>
              <SimpleTable
                rows={slip.seats}
                rowKey={(seat) => seat.visitWorkerId}
                emptyMessage={t("Slips.NoLine")}
                columns={[
                  { header: t("Payouts.Date"), cell: (seat) => <DayDate date={seat.visitDate} /> },
                  { header: t("Slips.Hours"), cell: (seat) => <Duration minutes={seat.countedMin} />, numeric: true },
                  {
                    header: "",
                    cell: (seat) => (seat.isArrears ? <StatusChip tone="info" label={t("Slips.Arrears")} /> : null),
                  },
                ]}
              />
            </CardContent>
          </Card>
        )}

        {closed && (
          <Card>
            <CardHeader>
              <CardTitle>{t("Slips.Payments")}</CardTitle>
            </CardHeader>
            <CardContent>
              <SimpleTable
                rows={slip.payouts}
                rowKey={(payout) => payout.id}
                emptyMessage={t("Slips.NoPayment")}
                columns={[
                  { header: t("Payouts.Number"), cell: (payout) => <Ltr className="font-bold">{payout.number}</Ltr> },
                  { header: t("Payouts.Date"), cell: (payout) => <DayDate date={payout.date} /> },
                  { header: t("Payouts.Method"), cell: (payout) => methodLabel(payout.wageMethod) },
                  {
                    header: t("Payouts.Amount"),
                    numeric: true,
                    cell: (payout) => (
                      <Amount
                        value={payout.amount}
                        className={payout.voidedAt ? "line-through opacity-60" : "font-bold"}
                      />
                    ),
                  },
                  {
                    header: "",
                    cell: (payout) =>
                      payout.voidedAt ? (
                        <StatusChip tone="neutral" label={t("Payouts.Voided")} />
                      ) : writesPay ? (
                        <Button variant="outline" size="sm" onClick={() => void entries.voidPayout(payout)}>
                          <Ban />
                          {t("Payouts.Void")}
                        </Button>
                      ) : null,
                  },
                ]}
              />
            </CardContent>
          </Card>
        )}
      </div>
    </DetailScreen>
  );
}
