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
import { phoneText } from "@/lib/text/phone";
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
          // The number, and below it the day the file was registered.
          <div className="whitespace-nowrap">
            <Link
              to={fileHubHref(row.original.id)}
              className="block leading-tight font-bold text-section-requests hover:underline"
            >
              <Ltr>{row.original.number}</Ltr>
            </Link>
            <ScreenDate
              className="block text-sm leading-tight text-muted-foreground"
              date={row.original.registrationDate}
            />
          </div>
        ),
      },
      {
        id: "client",
        header: t("Columns.Client"),
        cell: ({ row }) => (
          <div className="max-w-44 min-w-28">
            <p className="truncate leading-tight font-bold">{row.original.clientName}</p>
            <p className="truncate text-sm leading-tight text-muted-foreground">
              <Ltr>{phoneText(row.original.phone)}</Ltr>
            </p>
          </div>
        ),
      },
      {
        id: "site",
        header: t("Columns.Site"),
        cell: ({ row }) => (
          <div className="max-w-36 min-w-24">
            <p className="truncate leading-tight">{row.original.siteName}</p>
            {row.original.communeName && (
              <p className="truncate text-sm leading-tight text-muted-foreground">{row.original.communeName}</p>
            )}
          </div>
        ),
      },
      {
        id: "status",
        header: t("Columns.Status"),
        cell: ({ row }) => (
          // The kind of service beside the chip where the division takes both: one column fewer.
          <div className="flex items-center gap-1.5 whitespace-nowrap">
            <StatusChip tone={stageTone(row.original.stage)} label={stageLabel(row.original.stage)} />
            {row.original.closed && <StatusChip tone="danger" label={t("Closed")} />}
            {withService && (
              <span className="text-sm text-muted-foreground">{serviceLabel(row.original.serviceType)}</span>
            )}
          </div>
        ),
      },
      {
        id: "period",
        header: t("Columns.Period"),
        cell: ({ row }) =>
          row.original.startDate ? (
            <div className="whitespace-nowrap">
              <ScreenDate className="block leading-tight" date={row.original.startDate} />
              <ScreenDate className="block text-sm leading-tight text-muted-foreground" date={row.original.endDate} />
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
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
