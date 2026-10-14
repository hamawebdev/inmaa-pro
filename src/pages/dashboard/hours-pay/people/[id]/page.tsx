import { useQuery } from "@tanstack/react-query";
import { Ban, BookOpen, HandCoins } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Amount, DayDate, Nothing } from "@/features/people/components/figures";
import { useMay } from "@/features/people/components/may";
import { usePeopleDates } from "@/features/people/components/people-dates";
import { SimpleTable } from "@/features/people/components/simple-table";
import { RUN_TONE } from "@/features/people/components/status-tones";
import { listPayslipsOfQuery } from "@/features/people/services/pay-runs";
import { getStaffLedgerQuery, listPayoutsQuery } from "@/features/people/services/payouts";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

import { PayItemsCard } from "../../_components/pay-items-card";
import { usePayEntries } from "../../_components/use-pay-entries";

/**
 * One person's pay: what he or she owes the centre line by line (advances,
 * damage, repayments), the payslips, and every payment made. Section «عمال
 * النظافة», below the tab «الساعات والأجور»; a worker's file and an employee's
 * file open it. Owner: People.
 *
 * Closest academy screen: an employee's debt ledger (finance): the balance,
 * then the lines, the last first.
 */
export default function StaffPayPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Pay");
  const methodLabel = useCodeLabel("Options.PaymentMethod");
  const dates = usePeopleDates();
  const writesPay = useMay("pay.write");
  const entries = usePayEntries();
  const key = [...pathKey("/dashboard/hours-pay"), "person", id];
  const ledger = useQuery({ queryKey: [...key, "ledger"], queryFn: () => getStaffLedgerQuery({ staffId: id }) });
  const payslips = useQuery({ queryKey: [...key, "payslips"], queryFn: () => listPayslipsOfQuery({ staffId: id }) });
  const payouts = useQuery({ queryKey: [...key, "payouts"], queryFn: () => listPayoutsQuery({ staffId: id }) });
  const back = { href: "/dashboard/hours-pay?view=advances", label: t("Ledger.Back") };

  if (!ledger.data) {
    return (
      <DetailScreen section="workers" title={t("Ledger.Title")} back={back}>
        <p className="text-base text-muted-foreground">{t(ledger.isError ? "Ledger.Missing" : "Loading")}</p>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      section="workers"
      title={ledger.data.name}
      back={back}
      actions={
        writesPay && (
          <>
            <Button variant="outline" onClick={() => void entries.debt(id)}>
              <BookOpen />
              {t("Entry.DebtTitle")}
            </Button>
            <Button variant="add" onClick={() => void entries.advance(id)}>
              <HandCoins />
              {t("Entry.AdvanceTitle")}
            </Button>
          </>
        )
      }
    >
      {entries.dialogs}
      <div className="space-y-5">
        <Card>
          <CardHeader>
            <CardTitle>{t("Ledger.Lines")}</CardTitle>
            <CardDescription>
              {t("Ledger.Owes")} <Amount value={ledger.data.balance} className="font-bold text-foreground" />
            </CardDescription>
          </CardHeader>
          <CardContent>
            <SimpleTable
              rows={ledger.data.lines}
              rowKey={(line) => line.id}
              emptyMessage={t("Ledger.None")}
              columns={[
                { header: t("Payouts.Date"), cell: (line) => <DayDate date={line.date} /> },
                {
                  header: t("Ledger.Reason"),
                  cell: (line) => (
                    <span>
                      {t(`DebtReasons.${line.reason}`)}
                      {(line.payoutNumber ?? line.payslipNumber) && (
                        <>
                          {" · "}
                          <Ltr className="tabular-nums">{line.payoutNumber ?? line.payslipNumber}</Ltr>
                        </>
                      )}
                    </span>
                  ),
                },
                { header: t("Entry.Note"), cell: (line) => line.note ?? <Nothing /> },
                {
                  header: t("Ledger.Added"),
                  numeric: true,
                  cell: (line) => (line.direction === "INCREASE" ? <Amount value={line.amount} /> : <Nothing />),
                },
                {
                  header: t("Ledger.TakenOff"),
                  numeric: true,
                  cell: (line) => (line.direction === "DECREASE" ? <Amount value={line.amount} /> : <Nothing />),
                },
                {
                  header: t("Ledger.Balance"),
                  numeric: true,
                  cell: (line) => <Amount value={line.balanceAfter} className="font-bold" />,
                },
              ]}
            />
          </CardContent>
        </Card>

        <PayItemsCard staffId={id} />

        <Card>
          <CardHeader>
            <CardTitle>{t("Ledger.Payslips")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleTable
              rows={payslips.data ?? []}
              rowKey={(slip) => slip.id}
              emptyMessage={t("Ledger.NoPayslip")}
              columns={[
                {
                  header: t("Runs.Month"),
                  cell: (slip) => (
                    <Link to={`/dashboard/hours-pay/payslips/${slip.id}`} className="font-bold hover:underline">
                      {dates.month(slip.month)}
                    </Link>
                  ),
                },
                {
                  header: t("Slips.Number"),
                  cell: (slip) => (slip.number ? <Ltr className="tabular-nums">{slip.number}</Ltr> : <Nothing />),
                },
                {
                  header: t("Runs.Status"),
                  cell: (slip) => (
                    <StatusChip tone={RUN_TONE[slip.status] ?? "neutral"} label={t(`RunStatuses.${slip.status}`)} />
                  ),
                },
                { header: t("Runs.Gross"), numeric: true, cell: (slip) => <Amount value={slip.grossAmount} /> },
                {
                  header: t("Runs.Net"),
                  numeric: true,
                  cell: (slip) => <Amount value={slip.netAmount} className="font-bold" />,
                },
                { header: t("Runs.Paid"), numeric: true, cell: (slip) => <Amount value={slip.paidAmount} /> },
              ]}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t("Payouts.Title")}</CardTitle>
          </CardHeader>
          <CardContent>
            <SimpleTable
              rows={payouts.data ?? []}
              rowKey={(payout) => payout.id}
              emptyMessage={t("Payouts.None")}
              columns={[
                { header: t("Payouts.Number"), cell: (payout) => <Ltr className="font-bold">{payout.number}</Ltr> },
                { header: t("Payouts.Date"), cell: (payout) => <DayDate date={payout.date} /> },
                { header: t("Payouts.Kind"), cell: (payout) => t(`PayoutKinds.${payout.kind}`) },
                { header: t("Payouts.Method"), cell: (payout) => methodLabel(payout.wageMethod) },
                {
                  header: t("Payouts.Amount"),
                  numeric: true,
                  cell: (payout) => (
                    <Amount value={payout.amount} className={payout.voided ? "line-through opacity-60" : "font-bold"} />
                  ),
                },
                {
                  header: "",
                  cell: (payout) =>
                    payout.voided ? (
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
      </div>
    </DetailScreen>
  );
}
