import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, FileText, Lock, RefreshCw, Trash2 } from "lucide-react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Amount, Nothing } from "@/features/people/components/figures";
import { ListTable } from "@/features/people/components/list-table";
import { isolate, useMay } from "@/features/people/components/may";
import { usePeopleDates } from "@/features/people/components/people-dates";
import { useReasonDialog } from "@/features/people/components/reason-dialog";
import { RUN_TONE } from "@/features/people/components/status-tones";
import {
  closePayRunAction,
  deletePayRunAction,
  getPayRunQuery,
  refreshPayRunAction,
  voidPayRunAction,
  type PayslipRow,
} from "@/features/people/services/pay-runs";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

function Total({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="text-xl font-bold">{children}</dd>
    </div>
  );
}

/**
 * One pay run: the payslips of a month, to check, correct and close. Section
 * «عمال النظافة», below the tab «الساعات والأجور». Owner: People.
 *
 * A draft is computed again whenever the hours change; closing it numbers the
 * run and its payslips and freezes them. A closed run is voided with a reason,
 * after its wages are.
 *
 * Closest academy screen: a group's page (a record's heading with its
 * actions, tiles of totals, the table of what belongs to it).
 */
export default function PayRunPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Pay");
  const dates = usePeopleDates();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const writesPay = useMay("pay.write");
  const [confirm, confirmDialog] = useConfirm();
  const [askReason, reasonDialog] = useReasonDialog();
  const [busy, setBusy] = React.useState(false);
  const { data: run, isError } = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "run", id],
    queryFn: () => getPayRunQuery({ payRunId: id }),
  });

  const back = { href: "/dashboard/hours-pay?view=pay", label: t("Runs.Back") };
  const act = async (work: () => Promise<{ success: boolean; error?: string }>, done: string) => {
    setBusy(true);
    const result = await work();
    setBusy(false);
    if (result.success) toast.success(done);
    else toast.error(errorMessage(result.error, t("Entry.Failed")));
    return result.success;
  };

  const columns = React.useMemo<ColumnDef<PayslipRow>[]>(
    () => [
      {
        id: "number",
        header: t("Runs.Number"),
        cell: ({ row }) =>
          row.original.number ? (
            <Ltr className="font-bold whitespace-nowrap tabular-nums">{row.original.number}</Ltr>
          ) : (
            <Nothing />
          ),
      },
      {
        id: "name",
        header: t("Table.Person"),
        cell: ({ row }) => (
          <Link
            to={`/dashboard/hours-pay/payslips/${row.original.id}`}
            className="font-bold whitespace-nowrap hover:underline"
          >
            {row.original.staffName}
          </Link>
        ),
      },
      { id: "gross", header: t("Slips.Gross"), cell: ({ row }) => <Amount value={row.original.grossAmount} /> },
      {
        id: "off",
        header: t("Slips.TakenOff"),
        cell: ({ row }) => (
          <Amount
            value={
              row.original.cnasAmount +
              row.original.irgAmount +
              row.original.advanceRepayment +
              row.original.otherDeductions
            }
          />
        ),
      },
      {
        id: "net",
        header: t("Slips.Net"),
        cell: ({ row }) => <Amount value={row.original.netAmount} className="font-bold" />,
      },
      {
        id: "state",
        header: t("Slips.State"),
        cell: ({ row }) => {
          const slip = row.original;
          if (slip.missing.includes("IRG")) return <StatusChip tone="warning" label={t("Slips.IrgToType")} />;
          if (slip.ordersNotTypedCount > 0) {
            return <StatusChip tone="warning" label={t("Slips.OrdersNotTyped", { count: slip.ordersNotTypedCount })} />;
          }
          if (run?.status !== "CLOSED") return <StatusChip tone="pending" label={t("Slips.Ready")} />;
          if (slip.paidAmount >= slip.netAmount) return <StatusChip tone="success" label={t("Slips.Paid")} />;
          if (slip.paidAmount > 0) return <StatusChip tone="info" label={t("Slips.PartPaid")} />;
          return <StatusChip tone="pending" label={t("Slips.ToPay")} />;
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/hours-pay/payslips/${row.original.id}`}>
                <FileText />
                {t("Slips.Open")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, run?.status],
  );

  if (!run) {
    return (
      <DetailScreen section="workers" title={t("Runs.Title")} back={back}>
        <p className="text-base text-muted-foreground">{t(isError ? "Runs.Missing" : "Loading")}</p>
      </DetailScreen>
    );
  }

  const close = async () => {
    const yes = await confirm({
      title: t("Runs.CloseTitle"),
      description: t("Runs.CloseDescription", { count: run.payslips.length }),
      confirmLabel: t("Runs.Close"),
    });
    if (yes) await act(() => closePayRunAction({ payRunId: run.id }), t("Runs.Closed"));
  };
  const remove = async () => {
    const yes = await confirm({
      title: t("Runs.DeleteTitle"),
      description: t("Runs.DeleteDescription"),
      confirmLabel: t("Runs.Delete"),
      tone: "danger",
    });
    if (yes && (await act(() => deletePayRunAction({ payRunId: run.id }), t("Runs.Deleted")))) navigate(back.href);
  };
  const voidRun = async () => {
    const answer = await askReason({
      title: t("Runs.VoidTitle", { number: isolate(run.number ?? "") }),
      description: t("Runs.VoidDescription"),
      reasonLabel: t("Entry.VoidReason"),
      confirmLabel: t("Runs.Void"),
      confirmTone: "destructive",
    });
    if (answer) await act(() => voidPayRunAction({ payRunId: run.id, reason: answer.reason }), t("Runs.Voided"));
  };

  const draft = run.status === "DRAFT";
  return (
    <DetailScreen
      section="workers"
      title={`${t(`Kinds.${run.staffKind}`)} · ${dates.month(run.month)}`}
      back={back}
      actions={
        writesPay && (
          <>
            {draft && (
              <>
                <Button variant="outline" disabled={busy} onClick={() => void remove()}>
                  <Trash2 />
                  {t("Runs.Delete")}
                </Button>
                <Button
                  variant="outline"
                  disabled={busy}
                  onClick={() => void act(() => refreshPayRunAction({ payRunId: run.id }), t("Runs.Refreshed"))}
                >
                  <RefreshCw />
                  {t("Runs.Refresh")}
                </Button>
                <Button disabled={busy} onClick={() => void close()}>
                  <Lock />
                  {t("Runs.Close")}
                </Button>
              </>
            )}
            {run.status === "CLOSED" && (
              <Button variant="outline" disabled={busy} onClick={() => void voidRun()}>
                <Ban />
                {t("Runs.Void")}
              </Button>
            )}
          </>
        )
      }
    >
      {confirmDialog}
      {reasonDialog}
      <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <StatusChip tone={RUN_TONE[run.status] ?? "neutral"} label={t(`RunStatuses.${run.status}`)} />
          {run.number && (
            <span className="text-base font-bold">{t("Runs.Numbered", { number: isolate(run.number) })}</span>
          )}
          {draft && <span className="text-base text-muted-foreground">{t("Runs.DraftHint")}</span>}
          {run.voidReason && <span className="text-base text-muted-foreground">{run.voidReason}</span>}
        </div>
        {/* Amounts are too long for the tiles of a list page at 1024 px: the totals are written as a record's facts. */}
        <Card>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Total label={t("Runs.Payslips")}>
                <Ltr className="tabular-nums">{run.payslips.length}</Ltr>
              </Total>
              <Total label={t("Runs.Gross")}>
                <Amount value={run.totals.gross} />
              </Total>
              <Total label={t("Runs.Net")}>
                <Amount value={run.totals.net} />
              </Total>
              <Total label={t("Runs.Paid")}>
                <Amount value={run.totals.paid} />
              </Total>
              <Total label={t("Runs.EmployerShare")}>
                <Amount value={run.totals.employerCnas} />
              </Total>
            </dl>
          </CardContent>
        </Card>
        <ListTable
          rows={run.payslips}
          columns={columns}
          text={(row) => `${row.staffName} ${row.staffNumber}`}
          searchPlaceholder={t("Slips.Search")}
          emptyMessage={t("Runs.NoPayslip")}
        />
      </div>
    </DetailScreen>
  );
}
