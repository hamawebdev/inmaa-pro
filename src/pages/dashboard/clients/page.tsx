import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getPaginationRowModel,
  useReactTable,
  type ColumnDef,
  type PaginationState,
} from "@tanstack/react-table";
import { UserRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { Ltr } from "@/components/ltr";
import { SectionScreen } from "@/components/section-screen";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CLIENTS_PATH, listClientsQuery, type ClientListRow } from "@/features/clients/services/clients";
import type { Division } from "@/features/clients/validators/option-lists";
import { SanctionChip } from "@/features/people/components/sanction-chip";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { DIVISIONS } from "@/lib/options";
import { phoneText } from "@/lib/text/phone";

/**
 * «العملاء» (plan feature 1): every client the centre knows, with his
 * divisions, his files, whether he is suspended or penalised, and what an
 * organisation's invoice still lacks.
 *
 * Closest academy screen: the students list (students/page.tsx, newer
 * generation): a search box and a filter above a table with a row button and
 * a pager.
 */

const ALL = "ALL";

export default function ClientsPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Clients");
  const divisionLabel = useCodeLabel("Options.Division");
  const [search, setSearch] = React.useState("");
  const [division, setDivision] = React.useState<Division | typeof ALL>(ALL);
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const filter = { search: search.trim() || undefined, division: division === ALL ? undefined : division };
  const { data } = useQuery({
    queryKey: [...pathKey(CLIENTS_PATH), "list", filter],
    queryFn: () => listClientsQuery(filter),
  });
  const rows = React.useMemo<ClientListRow[]>(() => data ?? [], [data]);

  const columns = React.useMemo<ColumnDef<ClientListRow>[]>(
    () => [
      {
        id: "number",
        header: t("Columns.Number"),
        cell: ({ row }) => (
          <Link to={`${CLIENTS_PATH}/${row.original.id}`} className="font-bold text-section-requests hover:underline">
            <Ltr>{row.original.number}</Ltr>
          </Link>
        ),
      },
      {
        id: "name",
        header: t("Columns.Name"),
        cell: ({ row }) => (
          <div className="max-w-64 min-w-36">
            <p className="truncate font-bold">{row.original.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              <Ltr>{phoneText(row.original.phone)}</Ltr>
            </p>
          </div>
        ),
      },
      {
        id: "divisions",
        header: t("Columns.Divisions"),
        cell: ({ row }) => (
          <span className="block max-w-48 truncate">
            {row.original.divisions.map((code) => divisionLabel(code)).join("، ")}
          </span>
        ),
      },
      {
        id: "files",
        header: t("Columns.Files"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {t("FilesCount", { count: row.original.files, live: row.original.liveFiles })}
          </span>
        ),
      },
      {
        id: "state",
        header: t("Columns.State"),
        cell: ({ row }) => (
          <div className="flex flex-wrap gap-1.5">
            {row.original.sanction && <SanctionChip kind="CLIENT" state={row.original.sanction} />}
            {row.original.missingIdentifiers.length > 0 && <StatusChip tone="warning" label={t("MissingForInvoice")} />}
            {!row.original.sanction && row.original.missingIdentifiers.length === 0 && (
              <span className="text-muted-foreground">—</span>
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
              <Link to={`${CLIENTS_PATH}/${row.original.id}`}>
                <UserRound />
                {t("Open")}
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, divisionLabel],
  );

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  return (
    <SectionScreen section="requests" title={tNav("Clients")}>
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
          <Select
            value={division}
            onValueChange={(value) => {
              setDivision(value as Division | typeof ALL);
              setPagination((current) => ({ ...current, pageIndex: 0 }));
            }}
          >
            <SelectTrigger className="w-auto min-w-48" aria-label={t("Division")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("AllDivisions")}</SelectItem>
              {DIVISIONS.map((code) => (
                <SelectItem key={code} value={code}>
                  {divisionLabel(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DataTable table={table} columnCount={columns.length} emptyMessage={t("Empty")} />
        <TablePager table={table} />
      </div>
    </SectionScreen>
  );
}
