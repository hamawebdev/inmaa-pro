import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import { Ban, BookOpen, HandCoins } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Amount, DayDate, Nothing } from "@/features/people/components/figures";
import { monthBounds } from "@/features/people/components/format";
import { ListTable } from "@/features/people/components/list-table";
import { useMay } from "@/features/people/components/may";
import { MonthSwitch } from "@/features/people/components/month-switch";
import { listDebtorsQuery, listPayoutsQuery, type DebtorRow, type PayoutRow } from "@/features/people/services/payouts";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

import { usePayEntries } from "./use-pay-entries";

/**
 * Advances and debts: who owes the centre what now, and the payments of the
 * month (advances, wages, others), each one voided with its reason, never
 * deleted.
 *
 * Closest academy screens: the debt ledger and the payouts list (finance).
 */
export function AdvancesView({
  month,
  thisMonth,
  onMonthChange,
}: {
  month: string;
  thisMonth: string;
  onMonthChange: (month: string) => void;
}) {
  const t = useTranslations("Pay");
  const methodLabel = useCodeLabel("Options.PaymentMethod");
  const writesPay = useMay("pay.write");
  const entries = usePayEntries({ withPeople: true });
  const { from, to } = monthBounds(month);
  const debtors = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "debtors"],
    queryFn: () => listDebtorsQuery(undefined),
  });
  const payouts = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "payouts", month],
    queryFn: () => listPayoutsQuery({ from, to }),
  });

  const debtorColumns = React.useMemo<ColumnDef<DebtorRow>[]>(
    () => [
      {
        id: "number",
        header: t("Table.Number"),
        cell: ({ row }) => <Ltr className="font-bold whitespace-nowrap tabular-nums">{row.original.number}</Ltr>,
      },
      {
        id: "name",
        header: t("Table.Person"),
        cell: ({ row }) => (
          <Link to={`/dashboard/hours-pay/people/${row.original.staffId}`} className="font-bold hover:underline">
            {row.original.name}
          </Link>
        ),
      },
      { id: "kind", header: t("Table.Kind"), cell: ({ row }) => t(`PersonKinds.${row.original.kind}`) },
      {
        id: "balance",
        header: t("Table.Owes"),
        cell: ({ row }) => <Amount value={row.original.balance} className="font-bold" />,
      },
      { id: "last", header: t("Table.LastLine"), cell: ({ row }) => <DayDate date={row.original.lastDate} /> },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/hours-pay/people/${row.original.staffId}`}>
                <BookOpen />
                {t("Table.Ledger")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  const voidPayout = entries.voidPayout;
  const payoutColumns = React.useMemo<ColumnDef<PayoutRow>[]>(
    () => [
      {
        id: "number",
        header: t("Payouts.Number"),
        cell: ({ row }) => <Ltr className="font-bold whitespace-nowrap tabular-nums">{row.original.number}</Ltr>,
      },
      { id: "date", header: t("Payouts.Date"), cell: ({ row }) => <DayDate date={row.original.date} /> },
      {
        id: "person",
        header: t("Table.Person"),
        cell: ({ row }) => (
          <Link to={`/dashboard/hours-pay/people/${row.original.staffId}`} className="font-bold hover:underline">
            {row.original.staffName}
          </Link>
        ),
      },
      {
        id: "kind",
        header: t("Payouts.Kind"),
        cell: ({ row }) => <span className="whitespace-nowrap">{t(`PayoutKinds.${row.original.kind}`)}</span>,
      },
      { id: "method", header: t("Payouts.Method"), cell: ({ row }) => methodLabel(row.original.wageMethod) },
      {
        id: "amount",
        header: t("Payouts.Amount"),
        cell: ({ row }) => (
          <Amount
            value={row.original.amount}
            className={row.original.voided ? "line-through opacity-60" : "font-bold"}
          />
        ),
      },
      {
        id: "state",
        header: "",
        cell: ({ row }) =>
          row.original.voided ? (
            <StatusChip tone="neutral" label={t("Payouts.Voided")} />
          ) : writesPay ? (
            <div className="flex items-center justify-end">
              <Button variant="outline" size="sm" onClick={() => void voidPayout(row.original)}>
                <Ban />
                {t("Payouts.Void")}
              </Button>
            </div>
          ) : (
            <Nothing />
          ),
      },
    ],
    [t, methodLabel, writesPay, voidPayout],
  );

  return (
    <div className="space-y-6">
      {entries.dialogs}
      <section className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{t("Debtors.Title")}</h2>
          {writesPay && (
            <Button variant="add" onClick={() => void entries.advance()}>
              <HandCoins />
              {t("Entry.AdvanceTitle")}
            </Button>
          )}
        </div>
        <ListTable
          rows={debtors.data ?? []}
          columns={debtorColumns}
          text={(row) => `${row.name} ${row.number}`}
          searchPlaceholder={t("Debtors.Search")}
          emptyMessage={t(debtors.isPending ? "Loading" : "Debtors.None")}
          pageSize={10}
        />
      </section>
      <section className="space-y-4">
        <h2 className="text-xl font-bold">{t("Payouts.Title")}</h2>
        <MonthSwitch month={month} thisMonth={thisMonth} onChange={onMonthChange} />
        <ListTable
          rows={payouts.data ?? []}
          columns={payoutColumns}
          emptyMessage={t(payouts.isPending ? "Loading" : "Payouts.None")}
        />
      </section>
    </div>
  );
}
