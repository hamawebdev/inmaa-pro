import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { FolderOpen, Plus } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  COMPLAINT_LIST_STATES,
  complaintPath,
  listComplaintsQuery,
  type ComplaintLine,
  type ComplaintListState,
} from "@/features/operations/services/complaints";
import { useSectionLevel } from "@/hooks/use-session";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useSearchParams } from "@/lib/compat/navigation";
import { normaliseName } from "@/lib/text/normalise";

import { qualityHref } from "../quality-views";
import { ComplaintStatusChip, CounterChip, CounterNote, Moment } from "./complaint-bits";
import { qualityKey } from "./complaint-format";
import { NewComplaintDialog } from "./new-complaint-dialog";

/** The list in the address: `?view=complaints&state=late`, as the alert tile opens it. Open by default. */
function readState(search: URLSearchParams): ComplaintListState {
  const state = search.get("state");
  return (COMPLAINT_LIST_STATES as readonly string[]).includes(state ?? "") ? (state as ComplaintListState) : "open";
}

/** «شكوى جديدة», in the heading row, for whoever may write the requests. */
export function ComplaintsActions() {
  const t = useTranslations("Complaints");
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const [open, setOpen] = React.useState(false);
  if (!mayWrite) return null;
  return (
    <>
      <Button variant="add" onClick={() => setOpen(true)}>
        <Plus />
        {t("New.Button")}
      </Button>
      <NewComplaintDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

/**
 * «الشكاوى» (#18): the complaints log, each with its number, its client, its
 * kind, when it came in, its counter against the target and its status. The
 * row opens the complaint's page, where it is answered and settled.
 *
 * Closest academy screen: the attendance overviews
 * (attendance/_components/staff-absence-overview.tsx): the search, a filter
 * beside it, the table with chips, a row button to the record.
 */
export function ComplaintsView() {
  const t = useTranslations("Complaints");
  const kindLabel = useCodeLabel("Complaints.Kinds");
  const channelLabel = useCodeLabel("Complaints.Channels");
  const navigate = useNavigate();
  const state = readState(useSearchParams());
  const list = useQuery({
    queryKey: qualityKey("complaints", state),
    queryFn: () => listComplaintsQuery({ state }),
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
      const text = normaliseName([line.client.name, line.file?.siteName ?? "", line.description].join(" "));
      return (
        (words !== "" && words.split(" ").every((word) => text.includes(word))) ||
        (typed !== "" && (line.number.includes(typed) || (line.file?.number ?? "").includes(typed)))
      );
    });
  }, [lines, search]);

  const columns = React.useMemo<ColumnDef<ComplaintLine>[]>(
    () => [
      {
        id: "number",
        header: t("Columns.Number"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <span className="block font-bold">
              <Ltr>{row.original.number}</Ltr>
            </span>
            <Moment at={row.original.received} className="block text-xs leading-4 text-muted-foreground" />
          </div>
        ),
      },
      {
        id: "client",
        header: t("Columns.Client"),
        cell: ({ row }) => {
          const { client, file } = row.original;
          const second = file ? [file.number, file.siteName].filter(Boolean).join(" · ") : client.number;
          return (
            <div className="max-w-56 min-w-0">
              <bdi className="block truncate font-bold" title={client.name}>
                {client.name}
              </bdi>
              <bdi className="block truncate text-xs leading-4 text-muted-foreground" title={second}>
                {second}
              </bdi>
            </div>
          );
        },
      },
      {
        id: "kind",
        header: t("Columns.Kind"),
        cell: ({ row }) => (
          <div className="max-w-48 min-w-0">
            <span className="block truncate font-bold">{kindLabel(row.original.kind)}</span>
            <span className="block truncate text-xs leading-4 text-muted-foreground">
              {channelLabel(row.original.channel)}
            </span>
          </div>
        ),
      },
      {
        id: "counter",
        header: t("Columns.Counter"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <CounterChip counter={row.original.counter} />
            <CounterNote counter={row.original.counter} className="mt-1" />
          </div>
        ),
      },
      {
        id: "status",
        header: t("Columns.Status"),
        cell: ({ row }) => <ComplaintStatusChip status={row.original.status} />,
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={complaintPath(row.original.id)} title={t("Open")}>
                <FolderOpen />
                <span className="sr-only 2xl:not-sr-only">{t("Open")}</span>
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, kindLabel, channelLabel],
  );

  const table = useReactTable({
    data: shown,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  if (list.isError) return <ErrorState onRetry={() => void list.refetch()} />;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <TableSearch
          className="w-full lg:max-w-sm lg:flex-1"
          placeholder={t("Search")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            firstPage();
          }}
        />
        <Select
          value={state}
          onValueChange={(next) => {
            navigate(qualityHref("complaints", { state: next === "open" ? null : next }), { replace: true });
            firstPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-64" aria-label={t("StatesLabel")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMPLAINT_LIST_STATES.map((code) => (
              <SelectItem key={code} value={code}>
                {t(`States.${code}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={t(list.isPending ? "Loading" : lines.length === 0 ? `Empty.${state}` : "NoMatch")}
      />
      <TablePager table={table} />
    </div>
  );
}
