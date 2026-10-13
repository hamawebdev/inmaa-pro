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
import type { EmployeeListRow } from "@/features/people/services/employees";
import { JOB_POSITIONS } from "@/features/people/validators/staff-codes";
import { normaliseName, phoneKey } from "@/lib/text/normalise";
import { staffName } from "@/lib/text/names";

/**
 * The centre's employees, to search and filter. Section «الموظفون», tab «الموظفون».
 *
 * Closest academy screen: the employees list (employees/_components/
 * employees-table.tsx) for its columns and its two filters (job position,
 * status), drawn with the newer generation's table (the attendance overview).
 */

const ALL = "all";
const ENDING = "ENDING";

export function EmployeesTable({ rows }: { rows: EmployeeListRow[] }) {
  const t = useTranslations("Employees");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const [search, setSearch] = React.useState("");
  const [position, setPosition] = React.useState(ALL);
  const [status, setStatus] = React.useState(ALL);
  // The home screen's tile opens `?contract=ENDING`.
  const [params] = useSearchParams();
  const [contract, setContract] = React.useState(params.get("contract") === ENDING ? ENDING : ALL);
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));

  const columns = React.useMemo<ColumnDef<EmployeeListRow>[]>(
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
          <Link to={`/dashboard/employees/${row.original.id}`} className="font-bold hover:underline">
            {staffName(row.original)}
          </Link>
        ),
      },
      {
        id: "position",
        header: t("Table.Position"),
        cell: ({ row }) => (row.original.jobPosition ? t(`Positions.${row.original.jobPosition}`) : "—"),
      },
      {
        id: "phone",
        header: t("Table.Phone"),
        cell: ({ row }) => <Ltr className="whitespace-nowrap tabular-nums">{formatPhone(row.original.phone)}</Ltr>,
      },
      {
        id: "account",
        header: t("Table.Account"),
        cell: ({ row }) =>
          row.original.account ? <Ltr>{row.original.account}</Ltr> : <span className="text-muted-foreground">—</span>,
      },
      {
        id: "status",
        header: t("Table.Status"),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip
              tone={STATUS_TONE[row.original.status]}
              label={t(row.original.status === "LEFT" ? "Statuses.LEFT" : "Statuses.IN_POST")}
            />
            <SanctionChip kind="EMPLOYEE" state={row.original.sanction?.state} />
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end">
            <Button variant="outline" size="sm" asChild>
              <Link to={`/dashboard/employees/${row.original.id}`}>
                <FileText />
                {t("Table.OpenFile")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t],
  );

  const filtered = React.useMemo(() => {
    const words = normaliseName(search);
    const digits = phoneKey(search);
    return rows.filter((employee) => {
      if (position !== ALL && employee.jobPosition !== position) return false;
      if (status === "IN_POST" && employee.status === "LEFT") return false;
      if (status === "LEFT" && employee.status !== "LEFT") return false;
      if (contract === ENDING && !employee.contractEnding) return false;
      if (!words && !digits) return true;
      const name = normaliseName(`${staffName(employee)} ${employee.fullNameLatin ?? ""}`);
      return (
        (words !== "" && words.split(" ").every((word) => name.includes(word))) ||
        (digits !== "" && (employee.phone.includes(digits) || String(employee.numberSeq) === digits))
      );
    });
  }, [rows, search, position, status, contract]);

  const table = useReactTable({
    data: filtered,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

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
        <Select
          value={position}
          onValueChange={(value) => {
            setPosition(value);
            firstPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-64" aria-label={t("Table.AllPositions")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("Table.AllPositions")}</SelectItem>
            {JOB_POSITIONS.map((code) => (
              <SelectItem key={code} value={code}>
                {t(`Positions.${code}`)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={status}
          onValueChange={(value) => {
            setStatus(value);
            firstPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label={t("Table.AllStatuses")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("Table.AllStatuses")}</SelectItem>
            <SelectItem value="IN_POST">{t("Statuses.IN_POST")}</SelectItem>
            <SelectItem value="LEFT">{t("Statuses.LEFT")}</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={contract}
          onValueChange={(value) => {
            setContract(value);
            firstPage();
          }}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label={t("Table.AllContracts")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("Table.AllContracts")}</SelectItem>
            <SelectItem value={ENDING}>{t("Table.ContractsEnding")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <p className="text-base text-muted-foreground">
        {t("Table.Count", { shown: filtered.length, total: rows.length })}
      </p>
      <DataTable table={table} columnCount={columns.length} emptyMessage={t("Table.Empty")} />
      <TablePager table={table} />
    </div>
  );
}
