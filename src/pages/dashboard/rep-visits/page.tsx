import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { FolderOpen, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { SectionScreen } from "@/components/section-screen";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ScreenDate } from "@/features/clients/components/screen-date";
import { listRepVisitsQuery, REP_VISITS_PATH, type RepVisitListRow } from "@/features/clients/services/rep-visits";
import { useSectionLevel } from "@/hooks/use-session";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { cn } from "@/lib/utils";
import { SECTION_ACCENT } from "@/navigation/sections";

/**
 * «زيارات المندوب التجاري» (plan feature 40): the prospects the sales rep
 * visited, what came of each, and the call-backs that are due.
 *
 * Closest academy screen: the employees list (employees/page.tsx, newer
 * generation): a search box above a table with a row button and a pager.
 */
export default function RepVisitsPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("RepVisits");
  const divisionLabel = useCodeLabel("Options.Division");
  const interestLabel = useCodeLabel("FileOptions.Interest");
  const writes = useSectionLevel("EMPLOYEES") === "WRITE";
  const [search, setSearch] = React.useState("");
  const [due, setDue] = React.useState(false);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const filter = { search: search.trim() || undefined, due };
  const { data } = useQuery({
    queryKey: [...pathKey(REP_VISITS_PATH), "list", filter],
    queryFn: () => listRepVisitsQuery(filter),
  });
  const rows = React.useMemo<RepVisitListRow[]>(() => data ?? [], [data]);

  const columns = React.useMemo<ColumnDef<RepVisitListRow>[]>(
    () => [
      {
        id: "date",
        header: t("Columns.Date"),
        cell: ({ row }) => <ScreenDate className="whitespace-nowrap" date={row.original.date} />,
      },
      {
        id: "prospect",
        header: t("Columns.Prospect"),
        cell: ({ row }) => (
          <div className="max-w-64 min-w-36">
            <p className="truncate font-bold">{row.original.prospectName}</p>
            <p className="truncate text-sm text-muted-foreground">
              {divisionLabel(row.original.prospectKind)}
              {row.original.phone ? " · " : ""}
              {row.original.phone && <Ltr>{row.original.phone}</Ltr>}
            </p>
          </div>
        ),
      },
      {
        id: "rep",
        header: t("Columns.Rep"),
        cell: ({ row }) => <span className="block max-w-40 truncate">{row.original.repName}</span>,
      },
      {
        id: "interest",
        header: t("Columns.Interest"),
        cell: ({ row }) =>
          row.original.clientId ? (
            <StatusChip tone="success" label={t("Converted")} />
          ) : row.original.interest ? (
            <StatusChip
              tone={
                row.original.interest === "HIGH" ? "info" : row.original.interest === "NONE" ? "neutral" : "pending"
              }
              label={interestLabel(row.original.interest)}
            />
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "callBack",
        header: t("Columns.CallBack"),
        cell: ({ row }) =>
          row.original.callBackDate ? (
            <div className="flex flex-wrap items-center gap-2">
              <ScreenDate className="whitespace-nowrap" date={row.original.callBackDate} />
              {row.original.callBackDue && <StatusChip tone="warning" label={t("Due")} />}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={`${REP_VISITS_PATH}/${row.original.id}`}>
                <FolderOpen />
                {t("Open")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, divisionLabel, interestLabel],
  );
  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });
  const accent = SECTION_ACCENT.employees;

  return (
    <SectionScreen
      section="employees"
      title={tNav("RepVisits")}
      actions={
        writes ? (
          <Button asChild variant="add">
            <Link to={`${REP_VISITS_PATH}/new`}>
              <Plus />
              {t("New")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <TableSearch
            className="w-full max-w-sm"
            placeholder={t("SearchPlaceholder")}
            value={search}
            onChange={(value) => {
              setSearch(value);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
          />
          <ToggleGroup
            type="single"
            variant="outline"
            spacing={2}
            value={due ? "DUE" : "ALL"}
            onValueChange={(next) => next && setDue(next === "DUE")}
          >
            <ToggleGroupItem value="ALL" className={cn("px-5", accent.segment)}>
              {t("All")}
            </ToggleGroupItem>
            <ToggleGroupItem value="DUE" className={cn("px-5", accent.segment)}>
              {t("DueOnly")}
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
        <DataTable table={table} columnCount={columns.length} emptyMessage={t("Empty")} />
        <TablePager table={table} />
      </div>
    </SectionScreen>
  );
}
