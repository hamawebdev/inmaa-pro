import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { FolderOpen } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager } from "@/components/data-table-shell";
import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScreenDate } from "@/features/clients/components/screen-date";
import { listPendingQuotesQuery, type PendingQuoteRow } from "@/features/clients/services/quotes";
import { useMoneyText } from "@/hooks/use-money-text";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { cn } from "@/lib/utils";
import { FILES_PATH, filePartHref } from "@/navigation/file-parts";
import { SECTION_ACCENT } from "@/navigation/sections";

import { QUOTE_RESULT_TONE, quoteLabel } from "../[id]/quote/_components/quote-tone";

/**
 * «عروض أسعار تنتظر الجواب» (plan feature 29): the issued quotes still without
 * the client's answer, the last call and the next one. The home tile opens it
 * on the calls that are due (`?due=1`); each row opens the file's quote, where
 * a call is noted.
 *
 * Closest academy screen: the attendance family's lists (attendance/_components/
 * attendance-screen.tsx): a switch above a table with a row button and a pager.
 */
export default function PendingQuotesPage() {
  const t = useTranslations("PendingQuotes");
  const tNav = useTranslations("Nav");
  const resultLabel = useCodeLabel("FileOptions.QuoteResult");
  const money = useMoneyText();
  const [params] = useSearchParams();
  const [dueOnly, setDueOnly] = React.useState(params.get("due") === "1");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const { data } = useQuery({
    queryKey: [...pathKey(FILES_PATH), "pending-quotes", dueOnly],
    queryFn: () => listPendingQuotesQuery({ dueOnly }),
  });
  const rows = React.useMemo<PendingQuoteRow[]>(() => data ?? [], [data]);

  const columns = React.useMemo<ColumnDef<PendingQuoteRow>[]>(
    () => [
      {
        id: "quote",
        header: t("Columns.Quote"),
        cell: ({ row }) => (
          <div className="whitespace-nowrap">
            <Ltr className="font-bold tabular-nums">{quoteLabel(row.original)}</Ltr>
            <p className="text-sm text-muted-foreground">
              <ScreenDate date={row.original.issuedDate} />
            </p>
          </div>
        ),
      },
      {
        id: "client",
        header: t("Columns.Client"),
        cell: ({ row }) => (
          <div className="max-w-56 min-w-32">
            <p className="truncate font-bold">{row.original.clientName}</p>
            <p className="truncate text-sm text-muted-foreground">
              <Ltr>{row.original.phone}</Ltr>
            </p>
          </div>
        ),
      },
      {
        id: "answer",
        header: t("Columns.Answer"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            <StatusChip tone={QUOTE_RESULT_TONE[row.original.result]} label={resultLabel(row.original.result)} />
            {row.original.due && <StatusChip tone="warning" label={t("CallDue")} />}
          </div>
        ),
      },
      {
        id: "last",
        header: t("Columns.LastCall"),
        cell: ({ row }) =>
          row.original.lastFollowUp ? (
            <div className="max-w-56">
              <ScreenDate className="block whitespace-nowrap" date={row.original.lastFollowUp.date} />
              {row.original.lastFollowUp.note && (
                <p className="truncate text-sm text-muted-foreground">{row.original.lastFollowUp.note}</p>
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">{t("NoCallYet")}</span>
          ),
      },
      {
        id: "next",
        header: t("Columns.NextCall"),
        cell: ({ row }) =>
          (row.original.nextFollowUpDate ?? row.original.postponedUntil) ? (
            <ScreenDate
              className="whitespace-nowrap"
              date={row.original.nextFollowUpDate ?? row.original.postponedUntil}
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "total",
        header: t("Columns.Total"),
        cell: ({ row }) => <Ltr className="whitespace-nowrap tabular-nums">{money(row.original.total)}</Ltr>,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={filePartHref(row.original.fileId, "quote")}>
                <FolderOpen />
                {t("Open")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, resultLabel, money],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });
  const accent = SECTION_ACCENT.requests;

  return (
    <DetailScreen
      section="requests"
      title={t("Title")}
      description={t("Description")}
      back={{ href: FILES_PATH, label: tNav("Files") }}
    >
      <div className="space-y-5">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          value={dueOnly ? "DUE" : "ALL"}
          onValueChange={(next) => {
            if (!next) return;
            setDueOnly(next === "DUE");
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        >
          <ToggleGroupItem value="ALL" className={cn("px-5", accent.segment)}>
            {t("All")}
          </ToggleGroupItem>
          <ToggleGroupItem value="DUE" className={cn("px-5", accent.segment)}>
            {t("DueOnly")}
          </ToggleGroupItem>
        </ToggleGroup>
        <DataTable table={table} columnCount={columns.length} emptyMessage={dueOnly ? t("NoneDue") : t("None")} />
        <TablePager table={table} />
      </div>
    </DetailScreen>
  );
}
