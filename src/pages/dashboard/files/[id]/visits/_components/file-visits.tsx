import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { CalendarPlus, ClipboardPen, Printer, TriangleAlert } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { DataTable, TablePager } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { VisitStatusChip } from "@/features/operations/components/visit-status-chip";
import { endTimeOf } from "@/features/operations/rules/visit-dates";
import { listFileVisitsQuery, type FileVisitLine } from "@/features/operations/services/board";
import {
  generateVisitsAction,
  previewVisitGenerationQuery,
  VISITS_PATH,
} from "@/features/operations/services/programme";
import type { VisitStatus } from "@/features/operations/validators/option-codes";
import { intlLocaleFor } from "@/i18n/config";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

import { ExtraVisitProposals } from "./extra-visit-proposals";
import { FutureVisitsUpdate } from "./future-visits-update";
import { WEEKDAYS } from "@/lib/options";

/**
 * A file's visits: its programme (what «أيام التنفيذ» and the two dates call
 * for, and what does not match) with the button that makes the missing
 * visits, then every visit of the file.
 */
export function FileVisits({ fileId }: { fileId: string }) {
  const t = useTranslations("FileVisits");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const weekdayLabel = useCodeLabel("Options.Weekday");
  const warningLabel = useCodeLabel("ProgrammeWarnings");
  const ruleLabel = useCodeLabel("WorkRules");
  const [making, setMaking] = React.useState(false);
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });

  const preview = useQuery({
    queryKey: [...pathKey(`/dashboard/files/${fileId}`), "programme"],
    queryFn: () => previewVisitGenerationQuery({ fileId }),
  });
  const visits = useQuery({
    queryKey: [...pathKey(`/dashboard/files/${fileId}`), "visits"],
    queryFn: () => listFileVisitsQuery({ fileId }),
  });

  const dateFormat = new Intl.DateTimeFormat(intlLocaleFor(locale), {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  const longDate = (date: string) => dateFormat.format(new Date(`${date}T00:00:00Z`));

  const makeVisits = async () => {
    setMaking(true);
    const result = await generateVisitsAction({ fileId });
    setMaking(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("GenerateFailed")));
      return;
    }
    toast.success(t("Generated", { count: result.data.created }));
    void preview.refetch();
    void visits.refetch();
  };

  const columns = React.useMemo<ColumnDef<FileVisitLine>[]>(
    () => [
      {
        id: "date",
        header: t("Date"),
        cell: ({ row }) => <span className="font-bold whitespace-nowrap">{longDate(row.original.visitDate)}</span>,
      },
      {
        id: "time",
        header: t("Time"),
        cell: ({ row }) => (
          <span className="whitespace-nowrap tabular-nums">
            <Ltr>
              {row.original.plannedStartTime} –{" "}
              {endTimeOf({ startTime: row.original.plannedStartTime, durationMin: row.original.plannedDurationMin })}
            </Ltr>
          </span>
        ),
      },
      {
        id: "number",
        header: t("Number"),
        cell: ({ row }) => <Ltr>{row.original.number}</Ltr>,
      },
      {
        id: "team",
        header: t("Team"),
        cell: ({ row }) => (
          <span className={row.original.seated < row.original.workersNeeded ? "font-semibold text-warning-ink" : ""}>
            <Ltr>
              {row.original.seated} / {row.original.workersNeeded}
            </Ltr>
          </span>
        ),
      },
      {
        id: "status",
        header: t("Status"),
        cell: ({ row }) => (
          <div className="flex flex-wrap items-center gap-2">
            <VisitStatusChip status={row.original.status as VisitStatus} />
            {row.original.entryState && (
              <StatusChip
                tone={row.original.entryState === "COMPLETE" ? "success" : "warning"}
                label={t(`Entry.${row.original.entryState}`)}
              />
            )}
          </div>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to={`${VISITS_PATH}/${row.original.id}`}>
                <ClipboardPen />
                <span className="sr-only xl:not-sr-only">{t("Open")}</span>
              </Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link to={`${VISITS_PATH}/${row.original.id}/print`}>
                <Printer />
                <span className="sr-only xl:not-sr-only">{t("Order")}</span>
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the date format follows the locale, already in `t`
    [t],
  );

  const table = useReactTable({
    data: visits.data ?? [],
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  if (preview.isError || visits.isError) {
    return (
      <ErrorState
        onRetry={() => {
          void preview.refetch();
          void visits.refetch();
        }}
      />
    );
  }

  const summary = preview.data;
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("ProgrammeTitle")}</CardTitle>
          <CardDescription>{t("ProgrammeHint")}</CardDescription>
          {mayWrite && summary?.canGenerate && (
            <CardAction className="flex flex-wrap gap-2">
              <FutureVisitsUpdate fileId={fileId} changed={summary.formChanged ?? false} />
              {summary.missing > 0 && (
                <Button variant="add" onClick={() => void makeVisits()} loading={making}>
                  <CalendarPlus />
                  {t("Generate", { count: summary.missing })}
                </Button>
              )}
            </CardAction>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {!summary ? (
            <Skeleton className="h-20 w-full" />
          ) : (
            <>
              <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="min-w-0">
                  <dt className="text-sm font-bold text-muted-foreground">{t("Planned")}</dt>
                  <dd className="text-lg font-bold">
                    <Ltr>{summary.planned}</Ltr>
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-bold text-muted-foreground">{t("FirstDate")}</dt>
                  <dd className="text-lg font-bold">{summary.firstDate ? longDate(summary.firstDate) : "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-bold text-muted-foreground">{t("LastDate")}</dt>
                  <dd className="text-lg font-bold">{summary.lastDate ? longDate(summary.lastDate) : "—"}</dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm font-bold text-muted-foreground">{t("ToMake")}</dt>
                  <dd className="text-lg font-bold">
                    <Ltr>{summary.missing}</Ltr>
                  </dd>
                </div>
              </dl>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((day, index) =>
                  summary.perWeekday[index] > 0 ? (
                    <StatusChip
                      key={day}
                      tone="neutral"
                      label={t("PerWeekday", { day: weekdayLabel(day), count: summary.perWeekday[index] })}
                    />
                  ) : null,
                )}
              </div>
              {summary.warnings.length > 0 && (
                <ul className="space-y-1">
                  {summary.warnings.map((warning) => (
                    <li key={warning} className="flex items-center gap-2 font-semibold text-warning-ink">
                      <TriangleAlert className="size-4 shrink-0" />
                      {warningLabel(warning)}
                    </li>
                  ))}
                </ul>
              )}
              {summary.restRotation && (
                <p className="text-sm text-muted-foreground">{t("RestRotation", { count: summary.restDays.length })}</p>
              )}
              {summary.seatsHeld.length > 0 && (
                <div className="space-y-1">
                  <p className="flex items-center gap-2 font-semibold text-warning-ink">
                    <TriangleAlert className="size-4 shrink-0" />
                    {t("SeatsHeld", { count: summary.seatsHeld.length })}
                  </p>
                  <ul className="space-y-0.5 ps-6 text-sm text-muted-foreground">
                    {summary.seatsHeld.slice(0, 5).map((held) => (
                      <li key={`${held.date}-${held.startTime}-${held.workerId}`}>
                        <Ltr>
                          {held.date} {held.startTime} · {held.number}
                        </Ltr>{" "}
                        · {held.codes.map((code) => ruleLabel(code)).join("، ")}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <ExtraVisitProposals fileId={fileId} mayWrite={mayWrite} />

      <div className="space-y-4">
        <DataTable
          table={table}
          columnCount={columns.length}
          emptyMessage={t(visits.isPending ? "Loading" : "NoVisits")}
        />
        <TablePager table={table} />
      </div>
    </div>
  );
}
