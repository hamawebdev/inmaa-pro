import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Calculator, FileText } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Amount, Nothing } from "@/features/people/components/figures";
import { ListTable } from "@/features/people/components/list-table";
import { useMay } from "@/features/people/components/may";
import { MonthSwitch } from "@/features/people/components/month-switch";
import { usePeopleDates } from "@/features/people/components/people-dates";
import { RUN_TONE } from "@/features/people/components/status-tones";
import { listPayRunsQuery, preparePayRunAction, type PayRunRow } from "@/features/people/services/pay-runs";
import type { StaffKind } from "@/features/people/validators/staff-codes";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The monthly pay runs (feature 38): one for the cleaning workers and one for
 * the centre's employees. A month is prepared as a draft, corrected, then
 * closed; a closed run is numbered and no longer changes.
 *
 * Closest academy screen: the payouts list (finance), with the newer table.
 */
export function PayRunsView({
  month,
  thisMonth,
  onMonthChange,
}: {
  month: string;
  thisMonth: string;
  onMonthChange: (month: string) => void;
}) {
  const t = useTranslations("Pay");
  const dates = usePeopleDates();
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const writesPay = useMay("pay.write");
  const [busy, setBusy] = React.useState(false);
  const { data, isPending } = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "runs"],
    queryFn: () => listPayRunsQuery({}),
  });
  const rows = React.useMemo(() => data ?? [], [data]);

  const prepare = async (staffKind: StaffKind) => {
    setBusy(true);
    const result = await preparePayRunAction({ staffKind, month });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Runs.PrepareFailed")));
      return;
    }
    toast.success(t("Runs.Prepared", { count: result.data.payslips }));
    navigate(`/dashboard/hours-pay/runs/${result.data.payRunId}`);
  };

  const columns = React.useMemo<ColumnDef<PayRunRow>[]>(
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
        id: "month",
        header: t("Runs.Month"),
        cell: ({ row }) => (
          <Link
            to={`/dashboard/hours-pay/runs/${row.original.id}`}
            className="font-bold whitespace-nowrap hover:underline"
          >
            {dates.month(row.original.month)}
          </Link>
        ),
      },
      {
        id: "kind",
        header: t("Runs.Kind"),
        cell: ({ row }) => <span className="whitespace-nowrap">{t(`KindsShort.${row.original.staffKind}`)}</span>,
      },
      {
        id: "status",
        header: t("Runs.Status"),
        cell: ({ row }) => (
          <StatusChip
            tone={RUN_TONE[row.original.status] ?? "neutral"}
            label={t(`RunStatuses.${row.original.status}`)}
          />
        ),
      },
      {
        id: "net",
        header: t("Runs.Net"),
        cell: ({ row }) => <Amount value={row.original.net} className="font-bold" />,
      },
      { id: "paid", header: t("Runs.Paid"), cell: ({ row }) => <Amount value={row.original.paid} /> },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/hours-pay/runs/${row.original.id}`}>
                <FileText />
                {t("Runs.Open")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, dates],
  );

  return (
    <div className="space-y-5">
      <MonthSwitch month={month} thisMonth={thisMonth} onChange={onMonthChange}>
        {writesPay && (
          <>
            <Button variant="add" disabled={busy} onClick={() => void prepare("WORKER")}>
              <Calculator />
              {t("Runs.PrepareWorkers")}
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => void prepare("EMPLOYEE")}>
              <Calculator />
              {t("Runs.PrepareEmployees")}
            </Button>
          </>
        )}
      </MonthSwitch>
      <p className="text-base text-muted-foreground">{t("Runs.Hint")}</p>
      <ListTable rows={rows} columns={columns} emptyMessage={t(isPending ? "Loading" : "Runs.None")} />
    </div>
  );
}
