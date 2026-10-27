import * as React from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { type ColumnDef, getCoreRowModel, type PaginationState, useReactTable } from "@tanstack/react-table";
import { Eye, FileDown } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { DataTable, TablePager } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { DateRangeField } from "@/components/pickers";
import { SectionScreen } from "@/components/section-screen";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  exportLogAction,
  listLogEntriesQuery,
  listLogFilterChoicesQuery,
  LOG_PATH,
  type LogFilters,
  type LogRow,
} from "@/features/core/services/log-screen";
import { useCan } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/access/catalogue";
import { pathKey } from "@/lib/compat/revalidate";
import { saveTextFile } from "@/server/exports";

/**
 * Settings › السجل: the access and change log (Law 18-07 art. 41 bis 3: the
 * operation, its reason, its date, its time and who did it).
 *
 * Closest academy screen: the attendance overview, the newer generation's
 * table with its filters above it and its pager below. Read-only, for
 * `log.read`; the log is never edited and never purged. An export is a
 * disclosure: it is written in the log it exports.
 */
const OPERATIONS = ["COLLECT", "CONSULT", "CHANGE", "DISCLOSE", "ERASE", "SECURITY"] as const;
const OPERATION_TONE: Record<string, StatusTone> = {
  COLLECT: "success",
  CONSULT: "info",
  CHANGE: "pending",
  DISCLOSE: "warning",
  ERASE: "danger",
  SECURITY: "neutral",
};
const PAGE_SIZE = 25;
/** The item «الجميع», «كل العمليات», «كل الأنواع» of a filter: no filter. The dropdown keeps "" for "nothing chosen". */
const ALL = "__all__";
const chosen = (value: string) => (value === ALL ? "" : value);

export default function SettingsLogPage() {
  const t = useTranslations("LogTab");
  const tSettings = useTranslations("Settings");
  const tNav = useTranslations("Nav");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const reads = useCan("log.read");
  const [filters, setFilters] = React.useState<LogFilters>({});
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: PAGE_SIZE });
  const [opened, setOpened] = React.useState<LogRow | null>(null);
  const [exporting, setExporting] = React.useState(false);

  const choices = useQuery({
    queryKey: [...pathKey(LOG_PATH), "choices"],
    queryFn: () => listLogFilterChoicesQuery(undefined),
    enabled: reads,
  });
  const entries = useQuery({
    queryKey: [...pathKey(LOG_PATH), filters, pagination.pageIndex],
    queryFn: () => listLogEntriesQuery({ filters, page: pagination.pageIndex, pageSize: PAGE_SIZE }),
    enabled: reads,
    placeholderData: keepPreviousData,
  });

  const change = (patch: Partial<LogFilters>) => {
    setFilters((current) => {
      const next = { ...current, ...patch };
      for (const key of Object.keys(next) as Array<keyof LogFilters>) if (!next[key]) delete next[key];
      return next;
    });
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  };

  /** A routine act carries its standard purpose as a code; a typed reason is shown as typed. */
  const reasonOf = React.useCallback(
    (row: LogRow) => {
      if (!row.reason.startsWith("STANDARD:")) return row.reason;
      const code = row.reason.slice("STANDARD:".length);
      return t.has(`Reasons.${code}`) ? t(`Reasons.${code}`) : t("Reasons.Routine");
    },
    [t],
  );
  const roleOf = React.useCallback(
    (code: string | null) =>
      code && (ROLE_CODES as readonly string[]).includes(code)
        ? (ROLE_LABELS[code as RoleCode][locale as "ar" | "fr" | "en"] ?? ROLE_LABELS[code as RoleCode].ar)
        : "",
    [locale],
  );

  const columns = React.useMemo<ColumnDef<LogRow>[]>(
    () => [
      {
        id: "when",
        header: t("Table.When"),
        cell: ({ row }) => (
          <Ltr className="whitespace-nowrap tabular-nums">
            {row.original.localDate} {row.original.localTime}
          </Ltr>
        ),
      },
      {
        id: "who",
        header: t("Table.Who"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span className="font-bold">
              {row.original.userName === "system" ? t("TheProgram") : row.original.userName}
            </span>
            <span className="text-sm text-muted-foreground">{roleOf(row.original.userRole)}</span>
          </div>
        ),
      },
      {
        id: "operation",
        header: t("Table.Operation"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col items-start gap-1">
            <StatusChip
              tone={OPERATION_TONE[row.original.operation] ?? "neutral"}
              label={
                t.has(`Operations.${row.original.operation}`)
                  ? t(`Operations.${row.original.operation}`)
                  : row.original.operation
              }
            />
            <span className="text-sm text-muted-foreground">
              {t.has(`Actions.${row.original.action}`) ? t(`Actions.${row.original.action}`) : row.original.action}
            </span>
          </div>
        ),
      },
      {
        id: "what",
        header: t("Table.What"),
        cell: ({ row }) => (
          <div className="flex min-w-0 flex-col">
            <span>{row.original.entityLabel ?? row.original.subjectLabel ?? "—"}</span>
            {row.original.entity && <Ltr className="text-sm text-muted-foreground">{row.original.entity}</Ltr>}
          </div>
        ),
      },
      {
        id: "whose",
        header: t("Table.Whose"),
        cell: ({ row }) =>
          row.original.subjectKind ? (
            <div className="flex min-w-0 flex-col">
              <span>{row.original.subjectLabel ?? "—"}</span>
              <span className="text-sm text-muted-foreground">
                {t.has(`Subjects.${row.original.subjectKind}`)
                  ? t(`Subjects.${row.original.subjectKind}`)
                  : row.original.subjectKind}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">—</span>
          ),
      },
      { id: "why", header: t("Table.Why"), cell: ({ row }) => reasonOf(row.original) },
      {
        id: "open",
        header: "",
        cell: ({ row }) =>
          row.original.changes || row.original.context || row.original.recipient ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="icon-sm"
                aria-label={t("Details")}
                onClick={() => setOpened(row.original)}
              >
                <Eye />
              </Button>
            </div>
          ) : null,
      },
    ],
    [t, reasonOf, roleOf],
  );

  const total = entries.data?.total ?? 0;
  const table = useReactTable({
    data: entries.data?.rows ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  async function exportNow() {
    setExporting(true);
    try {
      const outcome = await saveTextFile({
        title: t("Export"),
        defaultName: `inmaa-log-${new Date().toISOString().slice(0, 10)}.csv`,
        filterName: t("ExportKind"),
        extension: "csv",
        produce: async () => {
          const result = await exportLogAction({ filters });
          if (!result.success) {
            toast.error(errorMessage(result.error, t("ExportFailed")));
            return null;
          }
          return result.data.text;
        },
      });
      if (outcome.saved) toast.success(t("Exported", { path: outcome.path }));
      else if (!outcome.cancelled) {
        console.error("log: export failed", outcome.error);
        toast.error(t("ExportFailed"));
      }
    } finally {
      setExporting(false);
    }
  }

  return (
    <SectionScreen
      section="settings"
      title={tNav("SettingsLog")}
      description={tSettings("LogDescription")}
      actions={
        reads && (
          <Button variant="outline" onClick={() => void exportNow()} loading={exporting}>
            <FileDown />
            {t("Export")}
          </Button>
        )
      }
    >
      {!reads ? (
        <p className="text-lg text-muted-foreground">{t("ManagerOnly")}</p>
      ) : (
        <div className="space-y-5">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4" data-log-filters>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="log_user">{t("Filters.Person")}</Label>
              <Select value={filters.userId ?? ALL} onValueChange={(userId) => change({ userId: chosen(userId) })}>
                <SelectTrigger id="log_user" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("Filters.Everyone")}</SelectItem>
                  <SelectItem value="system">{t("TheProgram")}</SelectItem>
                  {(choices.data?.users ?? []).map((user) => (
                    <SelectItem key={user.id} value={user.id}>
                      {user.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="log_operation">{t("Filters.Operation")}</Label>
              <Select
                value={filters.operation ?? ALL}
                onValueChange={(operation) => change({ operation: chosen(operation) })}
              >
                <SelectTrigger id="log_operation" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("Filters.EveryOperation")}</SelectItem>
                  {OPERATIONS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {t(`Operations.${code}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="log_entity">{t("Filters.Entity")}</Label>
              <Select value={filters.entity ?? ALL} onValueChange={(entity) => change({ entity: chosen(entity) })}>
                <SelectTrigger id="log_entity" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>{t("Filters.EveryEntity")}</SelectItem>
                  {(choices.data?.entities ?? []).map((entity) => (
                    <SelectItem key={entity} value={entity}>
                      {entity}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid min-w-0 gap-1.5">
              {/* One period, applied on «تأكيد»; its «مسح» goes back to the whole log. */}
              <Label htmlFor="log_period">{t("Filters.Period")}</Label>
              <DateRangeField
                id="log_period"
                value={{ from: filters.from ?? "", to: filters.to ?? "" }}
                onChange={(period) => change({ from: period.from, to: period.to })}
                clearable
                align="end"
                className="w-full min-w-0 justify-start"
              />
            </div>
          </div>

          {entries.isError ? (
            <ErrorState onRetry={() => void entries.refetch()} />
          ) : (
            <>
              <p className="text-base text-muted-foreground tabular-nums">{t("Count", { count: total })}</p>
              <DataTable table={table} columnCount={columns.length} emptyMessage={t("Table.Empty")} />
              <TablePager table={table} />
            </>
          )}
        </div>
      )}

      <LogEntryDialog entry={opened} onClose={() => setOpened(null)} />
    </SectionScreen>
  );
}

/** What one entry holds besides its line: the fields that changed, old and new, and its details. */
function LogEntryDialog({ entry, onClose }: { entry: LogRow | null; onClose: () => void }) {
  const t = useTranslations("LogTab");
  const changes = parse<Record<string, [unknown, unknown]>>(entry?.changes);
  const context = parse<Record<string, unknown>>(entry?.context);
  const show = (value: unknown) =>
    value === null || value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value);
  return (
    <Dialog open={entry !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("Details")}</DialogTitle>
          <DialogDescription>
            <Ltr>
              #{entry?.chainSeq} · {entry?.localDate} {entry?.localTime}
            </Ltr>
          </DialogDescription>
        </DialogHeader>
        <div className="flex max-h-[60dvh] min-w-0 flex-col gap-5 overflow-y-auto">
          {entry?.recipient && (
            <p className="text-base">
              {t("Recipient")}: <Ltr className="break-all">{entry.recipient}</Ltr>
            </p>
          )}
          {changes && (
            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="text-lg font-bold">{t("Changes")}</h3>
              {Object.entries(changes).map(([field, [before, after]]) => (
                <div key={field} className="grid min-w-0 gap-1 border-b border-border/60 pb-2">
                  <Ltr className="font-mono text-sm text-muted-foreground">{field}</Ltr>
                  <p className="min-w-0 text-base break-words">
                    {before === "§" && after === "§" ? (
                      t("Withheld")
                    ) : (
                      <>
                        <span className="text-muted-foreground line-through">{show(before)}</span>
                        {" → "}
                        <span className="font-semibold">{show(after)}</span>
                      </>
                    )}
                  </p>
                </div>
              ))}
            </section>
          )}
          {context && (
            <section className="flex min-w-0 flex-col gap-2">
              <h3 className="text-lg font-bold">{t("Context")}</h3>
              <pre dir="ltr" className="max-w-full overflow-x-auto rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
                {JSON.stringify(context, null, 2)}
              </pre>
            </section>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function parse<T>(text: string | null | undefined): T | null {
  if (!text) return null;
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}
