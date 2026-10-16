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
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { ScreenTabs } from "@/components/screen-tabs";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScreenDate } from "@/features/clients/components/screen-date";
import { listFilesQuery, type FileListRow } from "@/features/clients/services/file-reads";
import {
  DIVISIONS_WITH_REQUESTS,
  FILE_STAGES,
  type FileStage,
  type ServiceType,
} from "@/features/clients/validators/option-lists";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { DIVISIONS, SERVICE_TYPES } from "@/lib/options";
import { fileHubHref, FILES_PATH } from "@/navigation/file-parts";

import { ALL, filesHref, useFilesFilter } from "./files-filter";
import { stageTone } from "./stage-tone";

/**
 * «الملفات»: his four divisions as a switch, «نوع الخدمة» for the two that take
 * both, then the files of that division with their status chips.
 *
 * Closest academy screens: the groups' level switch
 * (groups/_components/groups-tabs.tsx), one level below the section strip, and
 * the attendance family's two-axis list (attendance/_components/
 * attendance-screen.tsx and staff-attendance-overview.tsx): two switches side
 * by side, a search box, a table with row buttons, a pager. Here both switches
 * live in the address (`?division=BUILDING&service=CONTRACT`), so the way back
 * from a file lands on the same list.
 */

export function FilesView() {
  const t = useTranslations("Files");
  const tNav = useTranslations("Nav");
  const divisionLabel = useCodeLabel("Options.Division");
  const serviceLabel = useCodeLabel("Options.ServiceType");
  const stageLabel = useCodeLabel("Options.FileStage");
  const { division, service, ids, stage: askedStage } = useFilesFilter();
  const [search, setSearch] = React.useState("");
  const [stage, setStage] = React.useState<FileStage | "CLOSED" | typeof ALL>(askedStage ?? ALL);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const filter = ids
    ? { ids, search: search.trim() || undefined }
    : {
        division,
        serviceType: service === ALL ? undefined : service,
        stage: stage === ALL ? undefined : stage,
        search: search.trim() || undefined,
      };
  const { data } = useQuery({
    queryKey: [...pathKey(FILES_PATH), "list", filter],
    queryFn: () => listFilesQuery(filter),
  });
  const rows = React.useMemo<FileListRow[]>(() => data ?? [], [data]);
  const withService = DIVISIONS_WITH_REQUESTS.includes(division);

  const columns = React.useMemo<ColumnDef<FileListRow>[]>(
    () => [
      {
        id: "number",
        header: t("Columns.Number"),
        cell: ({ row }) => (
          <Link to={fileHubHref(row.original.id)} className="font-bold text-section-requests hover:underline">
            <Ltr>{row.original.number}</Ltr>
          </Link>
        ),
      },
      {
        id: "client",
        header: t("Columns.Client"),
        cell: ({ row }) => (
          <div className="min-w-36">
            <p className="font-bold">{row.original.clientName}</p>
            <p className="text-sm text-muted-foreground">
              <Ltr>{row.original.phone}</Ltr>
            </p>
          </div>
        ),
      },
      {
        id: "site",
        header: t("Columns.Site"),
        cell: ({ row }) => (
          <div className="min-w-40">
            <p>{row.original.siteName}</p>
            {row.original.communeName && <p className="text-sm text-muted-foreground">{row.original.communeName}</p>}
          </div>
        ),
      },
      ...(withService
        ? [
            {
              id: "service",
              header: t("Columns.ServiceType"),
              cell: ({ row }) => <span className="whitespace-nowrap">{serviceLabel(row.original.serviceType)}</span>,
            } satisfies ColumnDef<FileListRow>,
          ]
        : []),
      {
        id: "status",
        header: t("Columns.Status"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            <StatusChip tone={stageTone(row.original.stage)} label={stageLabel(row.original.stage)} />
            {row.original.closed && <StatusChip tone="danger" label={t("Closed")} />}
          </div>
        ),
      },
      {
        id: "registered",
        header: t("Columns.Registered"),
        cell: ({ row }) => <ScreenDate className="whitespace-nowrap" date={row.original.registrationDate} />,
      },
      {
        id: "period",
        header: t("Columns.Period"),
        cell: ({ row }) =>
          row.original.startDate ? (
            // One date above the other: side by side they would push the row's button out of the window.
            <div className="leading-snug whitespace-nowrap">
              <ScreenDate className="block" date={row.original.startDate} />
              {row.original.endDate && (
                <ScreenDate className="block text-muted-foreground" date={row.original.endDate} />
              )}
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={fileHubHref(row.original.id)}>
                <FolderOpen />
                {t("Open")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, serviceLabel, stageLabel, withService],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const divisionItems = DIVISIONS.map((code) => ({
    id: code,
    label: divisionLabel(code),
    // Keep the kind of service when it applies to the division chosen.
    href: filesHref(code, service),
  }));
  const serviceItems = [ALL, ...SERVICE_TYPES].map((code) => ({
    id: code,
    label: code === ALL ? t("AllServiceTypes") : serviceLabel(code),
    href: filesHref(division, code as ServiceType | typeof ALL),
  }));

  return (
    <div className="space-y-5">
      {ids ? (
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
          <p className="text-base font-bold">{t("OnlyThese", { count: ids.length })}</p>
          <Button variant="outline" size="sm" asChild>
            <Link to={filesHref(division)}>{t("ShowAll")}</Link>
          </Button>
        </div>
      ) : (
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
          <ScreenTabs section="requests" items={divisionItems} value={division} ariaLabel={t("Divisions")} />
          {withService && (
            <ScreenTabs section="requests" items={serviceItems} value={service} ariaLabel={t("ServiceTypes")} />
          )}
        </div>
      )}

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
        <Select
          disabled={ids !== null}
          value={stage}
          onValueChange={(value) => {
            setStage(value as typeof stage);
            setPagination((current) => ({ ...current, pageIndex: 0 }));
          }}
        >
          <SelectTrigger className="w-auto min-w-48" aria-label={t("Stages")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("AllStages")}</SelectItem>
            {FILE_STAGES.map((code) => (
              <SelectItem key={code} value={code}>
                {stageLabel(code)}
              </SelectItem>
            ))}
            <SelectItem value="CLOSED">{t("Closed")}</SelectItem>
          </SelectContent>
        </Select>
        <p className="text-base text-muted-foreground sm:ms-auto" aria-live="polite">
          {t("Count", { count: rows.length })}
        </p>
      </div>

      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={search.trim() || stage !== ALL ? t("NoMatch") : t("Empty")}
      />
      <TablePager table={table} />
      <p className="sr-only">{tNav("Files")}</p>
    </div>
  );
}
