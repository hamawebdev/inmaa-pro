import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { CalendarPlus, FolderOpen, Plus, Printer } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import {
  INSPECTIONS_PATH,
  listInspectionsQuery,
  type InspectionLine,
} from "@/features/operations/services/inspections";
import { INSPECTION_FILTERS, type InspectionFilter } from "@/features/operations/validators/inspection";
import { useSectionLevel } from "@/hooks/use-session";
import { useSearchParams } from "@/lib/compat/navigation";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";
import { normaliseName } from "@/lib/text/normalise";
import { cn } from "@/lib/utils";

import { qualityHref } from "../quality-views";
import { InspectionStatusChip } from "./inspection-bits";
import { inspectionHref, inspectionSheetHref, useQualityDates } from "./quality-format";
import { NewInspectionDialog } from "./new-inspection-dialog";
import { PlanInspectionsDialog } from "./plan-dialog";

function readFilter(search: URLSearchParams): InspectionFilter {
  const state = search.get("state");
  return (INSPECTION_FILTERS as readonly string[]).includes(state ?? "") ? (state as InspectionFilter) : "planned";
}

/** What each filter asks of the list: the work to do earliest first, the record latest first. */
const FILTER_QUERY: Record<InspectionFilter, Parameters<typeof listInspectionsQuery>[0]> = {
  planned: { status: "PLANNED" },
  due: { due: true },
  done: { status: "DONE", latestFirst: true },
  missed: { status: "MISSED", latestFirst: true },
  all: { latestFirst: true },
};

/**
 * The view's buttons in the heading row: «تخطيط التفتيش» (the files' plans,
 * a few weeks ahead) and «تفتيش جديد» (one added by hand). Left out for a
 * reader of the section.
 */
export function InspectionsActions() {
  const t = useTranslations("Inspections");
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const [planning, setPlanning] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  if (!mayWrite) return null;
  return (
    <>
      <Button variant="outline" onClick={() => setPlanning(true)}>
        <CalendarPlus />
        {t("Plan.Button")}
      </Button>
      <Button variant="add" onClick={() => setAdding(true)}>
        <Plus />
        {t("New.Button")}
      </Button>
      <PlanInspectionsDialog open={planning} onOpenChange={setPlanning} />
      <NewInspectionDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

/**
 * «تفتيش المشرف»: the supervisor's inspections, planned, due, done or
 * missed, the filter kept in the address (`?state=due` is what the alert
 * tile opens). Each row opens the inspection, where its returned sheet is
 * typed, or its sheet to print.
 *
 * Closest academy screen: the attendance overviews
 * (attendance/_components/staff-absence-overview.tsx): a search and a filter
 * above a table, the state as a chip, the row's buttons at its end.
 */
export function InspectionsView() {
  const t = useTranslations("Inspections");
  const navigate = useNavigate();
  const dates = useQualityDates();
  const { today } = useCentreClock();
  const filter = readFilter(useSearchParams());
  const list = useQuery({
    queryKey: [...pathKey(INSPECTIONS_PATH), "inspections", filter],
    queryFn: () => listInspectionsQuery(FILTER_QUERY[filter]),
  });
  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  const lines = React.useMemo(() => list.data ?? [], [list.data]);
  const shown = React.useMemo(() => {
    const words = normaliseName(search);
    const typed = search.trim();
    if (!words && !typed) return lines;
    return lines.filter((line) => {
      const text = normaliseName(
        [line.site, line.clientName, line.commune, line.supervisor ? staffName(line.supervisor) : ""].join(" "),
      );
      return (
        (words !== "" && words.split(" ").every((word) => text.includes(word))) ||
        (typed !== "" && (line.number.includes(typed) || line.file.number.includes(typed)))
      );
    });
  }, [lines, search]);

  const columns = React.useMemo<ColumnDef<InspectionLine>[]>(
    () => [
      {
        id: "number",
        header: t("List.Columns.Number"),
        cell: ({ row }) => <Ltr className="font-semibold">{row.original.number}</Ltr>,
      },
      {
        id: "site",
        header: t("List.Columns.Site"),
        cell: ({ row }) => {
          const line = row.original;
          const title = [line.site, line.clientName, line.commune].filter(Boolean).join(" — ");
          return (
            <span className="block max-w-[10rem] truncate font-semibold xl:max-w-[16rem]" title={title}>
              <bdi>{line.site}</bdi>
            </span>
          );
        },
      },
      {
        id: "date",
        header: t("List.Columns.Date"),
        cell: ({ row }) => {
          const date = row.original.doneDate ?? row.original.plannedDate;
          return (
            <span className="whitespace-nowrap" title={dates.long(date)}>
              <Ltr>{dates.short(date)}</Ltr>
            </span>
          );
        },
      },
      {
        id: "supervisor",
        header: t("List.Columns.Supervisor"),
        cell: ({ row }) => {
          const supervisor = row.original.supervisor;
          if (!supervisor) return <span className="text-muted-foreground">{t("List.NoSupervisor")}</span>;
          const name = staffName(supervisor);
          return (
            <span className="block max-w-[8rem] truncate xl:max-w-[12rem]" title={name}>
              <bdi>{name}</bdi>
            </span>
          );
        },
      },
      {
        id: "status",
        header: t("List.Columns.Status"),
        cell: ({ row }) => (
          <InspectionStatusChip status={row.original.status} plannedDate={row.original.plannedDate} today={today} />
        ),
      },
      {
        id: "score",
        header: t("List.Columns.Score"),
        cell: ({ row }) => {
          const line = row.original;
          if (line.scoreTotal === null) return <span className="text-muted-foreground">—</span>;
          return (
            <Ltr
              className={cn("font-bold whitespace-nowrap", line.belowThreshold ? "text-destructive" : "text-success")}
              title={
                line.belowThreshold ? t("List.BelowThreshold", { threshold: line.thresholdUsed ?? 80 }) : undefined
              }
            >
              {line.scoreTotal}/100
            </Ltr>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={inspectionHref(row.original.id)} title={t("List.Open")}>
                <FolderOpen />
                <span className="sr-only 2xl:not-sr-only">{t("List.Open")}</span>
              </Link>
            </Button>
            {row.original.status !== "CANCELLED" && (
              <Button variant="outline" size="sm" asChild>
                <Link to={inspectionSheetHref(row.original.id)} title={t("List.Print")}>
                  <Printer />
                  <span className="sr-only 2xl:not-sr-only">{t("List.Print")}</span>
                </Link>
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t, dates, today],
  );

  const table = useReactTable({
    data: shown,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const setFilter = (next: InspectionFilter) => {
    navigate(qualityHref("inspections", { state: next === "planned" ? null : next }), { replace: true });
    firstPage();
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <TableSearch
          className="w-full lg:max-w-sm lg:flex-1"
          placeholder={t("List.Search")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            firstPage();
          }}
        />
        <Select value={filter} onValueChange={(next) => setFilter(next as InspectionFilter)}>
          <SelectTrigger className="w-full sm:w-56" aria-label={t("List.StateLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {INSPECTION_FILTERS.map((code) => (
              <SelectItem key={code} value={code}>
                {t(`List.States.${code}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <>
          <DataTable
            table={table}
            columnCount={columns.length}
            emptyMessage={t(
              list.isPending ? "List.Loading" : lines.length === 0 ? `List.None.${filter}` : "List.NoMatch",
            )}
          />
          <TablePager table={table} />
        </>
      )}
    </div>
  );
}
