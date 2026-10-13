import * as React from "react";

import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { FileText } from "lucide-react";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatPhone } from "@/features/people/components/format";
import { SanctionChip } from "@/features/people/components/sanction-chip";
import { STATUS_TONE } from "@/features/people/components/status-tones";
import type { WorkerListRow } from "@/features/people/services/worker-reads";
import { ENGAGEMENT_STATUSES, WORKER_ROLES } from "@/features/people/validators/staff-codes";
import { normaliseName, phoneKey } from "@/lib/text/normalise";

/**
 * The workers, to search and filter. Section «عمال النظافة», tab «العمال».
 *
 * Closest academy screen: the attendance overview
 * (attendance/_components/staff-attendance-overview.tsx), the newer list: a
 * search box, the table, the pager. The filters beside the search are the
 * employees list's (job position, status), here status, zone and «الصفة».
 */

const ALL = "all";
const TO_RENEW = "TO_RENEW";

export function WorkersTable({
  rows,
  zones,
}: {
  rows: WorkerListRow[];
  zones: ReadonlyArray<{ id: string; name: string }>;
}) {
  const t = useTranslations("Workers");
  const tOptions = useTranslations("Options");
  // A tile of the home screen opens the list already filtered: `?status=ON_TRIAL`, `?documents=TO_RENEW`.
  const [params] = useSearchParams();
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState(params.get("status") ?? ALL);
  const [zone, setZone] = React.useState(ALL);
  const [role, setRole] = React.useState(ALL);
  const [documents, setDocuments] = React.useState(params.get("documents") === TO_RENEW ? TO_RENEW : ALL);
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  const columns = React.useMemo<ColumnDef<WorkerListRow>[]>(
    () => [
      {
        id: "number",
        header: t("Table.Number"),
        cell: ({ row }) => <Ltr className="font-bold whitespace-nowrap tabular-nums">{row.original.number}</Ltr>,
      },
      {
        id: "name",
        header: t("Table.Name"),
        cell: ({ row }) => (
          <Link to={`/dashboard/workers/${row.original.id}`} className="font-bold whitespace-nowrap hover:underline">
            {row.original.lastName} {row.original.firstName}
          </Link>
        ),
      },
      {
        id: "role",
        header: t("Table.Role"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.role
              ? tOptions(`${row.original.sex === "FEMALE" ? "WorkerRoleFeminine" : "WorkerRole"}.${row.original.role}`)
              : "—"}
          </span>
        ),
      },
      {
        id: "zone",
        header: t("Table.Zone"),
        cell: ({ row }) => <span className="whitespace-nowrap">{row.original.zoneName ?? "—"}</span>,
      },
      {
        id: "phone",
        header: t("Table.Phone"),
        cell: ({ row }) => <Ltr className="whitespace-nowrap tabular-nums">{formatPhone(row.original.phone)}</Ltr>,
      },
      {
        id: "status",
        header: t("Table.Status"),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={STATUS_TONE[row.original.status]} label={t(`Statuses.${row.original.status}`)} />
            <SanctionChip kind="WORKER" state={row.original.sanction?.state} />
            {/* Documents to renew stand with her state: a column of their own made a French row wrap. */}
            {row.original.documentsToRenew > 0 && (
              <StatusChip
                tone="warning"
                label={t("Table.DocumentsToRenew", { count: row.original.documentsToRenew })}
              />
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/workers/${row.original.id}`}>
                <FileText />
                {t("Table.OpenFile")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, tOptions],
  );

  const filtered = React.useMemo(() => {
    const words = normaliseName(search);
    const digits = phoneKey(search);
    return rows.filter((worker) => {
      if (status !== ALL && worker.status !== status) return false;
      if (zone !== ALL && worker.zoneId !== zone) return false;
      if (role !== ALL && worker.role !== role) return false;
      if (documents === TO_RENEW && worker.documentsToRenew === 0) return false;
      if (!words && !digits) return true;
      const name = normaliseName(`${worker.lastName} ${worker.firstName} ${worker.fullNameLatin ?? ""}`);
      return (
        (words !== "" && words.split(" ").every((word) => name.includes(word))) ||
        (digits !== "" && (worker.phone.includes(digits) || String(worker.numberSeq) === digits))
      );
    });
  }, [rows, search, status, zone, role, documents]);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const filter = (
    value: string,
    onChange: (value: string) => void,
    label: string,
    options: ReadonlyArray<{ value: string; label: string }>,
  ) => (
    <Select
      value={value}
      onValueChange={(next) => {
        onChange(next);
        firstPage();
      }}
    >
      <SelectTrigger className="w-full sm:w-56" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{label}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
        <TableSearch
          className="w-full lg:max-w-sm lg:flex-1"
          placeholder={t("Table.SearchPlaceholder")}
          value={search}
          onChange={(value) => {
            setSearch(value);
            firstPage();
          }}
        />
        {filter(
          status,
          setStatus,
          t("Table.AllStatuses"),
          ENGAGEMENT_STATUSES.map((code) => ({ value: code, label: t(`Statuses.${code}`) })),
        )}
        {filter(
          zone,
          setZone,
          t("Table.AllZones"),
          zones.map((item) => ({ value: item.id, label: item.name })),
        )}
        {filter(
          role,
          setRole,
          t("Table.AllRoles"),
          WORKER_ROLES.map((code) => ({ value: code, label: tOptions(`WorkerRole.${code}`) })),
        )}
        {filter(documents, setDocuments, t("Table.AllDocuments"), [
          { value: TO_RENEW, label: t("Table.DocumentsToRenewOnly") },
        ])}
      </div>
      <p className="text-base text-muted-foreground">
        {t("Table.Count", { shown: filtered.length, total: rows.length })}
      </p>
      <DataTable table={table} columnCount={columns.length} emptyMessage={t("Table.Empty")} />
      <TablePager table={table} />
    </div>
  );
}
