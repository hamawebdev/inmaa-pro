import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import { ClipboardCheck, Star, ThumbsUp } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useLocale, useTranslations } from "use-intl";

import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { StatCard } from "@/components/stat-card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import {
  RATING_CRITERIA,
  listRatingsQuery,
  type RatedVisit,
  type RatingAverage,
  type RatingCriterion,
  type RatingScores,
} from "@/features/operations/services/ratings";
import { intlLocaleFor } from "@/i18n/config";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useSearchParams } from "@/lib/compat/navigation";
import { normaliseName } from "@/lib/text/normalise";
import { cn } from "@/lib/utils";

import { PeriodSwitch } from "../../../worker-attendance/_components/attendance-bits";
import { useDates } from "../../../worker-attendance/_components/attendance-helpers";
import { monthOfDate, monthRange, shiftMonth } from "../../../worker-attendance/_components/attendance-params";
import { qualityKey, workerName } from "../complaints/complaint-format";
import { qualityHref } from "../quality-views";

/** The view's main button(s), drawn in the heading row. The ratings are typed on the visit's page: none here. */
export function RatingsActions() {
  return null;
}

const GROUPINGS = ["file", "worker", "visit"] as const;
type Grouping = (typeof GROUPINGS)[number];

/** A line of the table: a file's or a worker's averages, or one visit's own ratings. */
interface RatingRow {
  id: string;
  title: string;
  subtitle: string;
  /** Kept whole in reading order: a number, a date. */
  titleLtr?: boolean;
  visits: number | null;
  scores: RatingScores;
  /** A share for a group, yes or no for a visit. */
  recommend: { share: number | null; yes: number; answered: number } | { answer: boolean | null };
  search: string;
}

function readParams(search: URLSearchParams, thisMonth: string): { month: string; by: Grouping } {
  const month = search.get("month");
  const by = search.get("by");
  return {
    month: month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : thisMonth,
    by: (GROUPINGS as readonly string[]).includes(by ?? "") ? (by as Grouping) : "file",
  };
}

/** Below 3 out of 5 is weak, below 4 middling: the figure takes the warning's ink. */
const scoreInk = (score: number | null) =>
  score === null ? "text-muted-foreground" : score < 3 ? "text-destructive" : score < 4 ? "text-warning-ink" : "";

/**
 * «تقييم العملاء» (#15): what the clients rated on the orders they signed
 * («تقييم الخدمة من 1 إلى 5», «هل توصي بالمركز؟»), for a month: the averages
 * per file and per worker of each visit's team, weakest first, and each visit's
 * own ratings.
 *
 * Closest academy screen: the attendance overviews with the history's month
 * switch (attendance/_components/staff-absence-overview.tsx,
 * staff-check-history.tsx), with the home screen's figures (StatCard) above.
 */
export function RatingsView() {
  const t = useTranslations("Ratings");
  const tComplaints = useTranslations("Complaints");
  const locale = useLocale();
  const navigate = useNavigate();
  const dates = useDates();
  const divisionLabel = useCodeLabel("Options.Division");
  const clock = useCentreClock();
  const thisMonth = monthOfDate(clock.today);
  const { month, by } = readParams(useSearchParams(), thisMonth);
  const { from, to } = monthRange(month);
  const report = useQuery({
    queryKey: qualityKey("ratings", month),
    queryFn: () => listRatingsQuery({ from, to }),
  });
  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));
  const go = (next: { month?: string; by?: Grouping }) => {
    const nextMonth = next.month ?? month;
    const nextBy = next.by ?? by;
    navigate(
      qualityHref("ratings", {
        month: nextMonth === thisMonth ? null : nextMonth,
        by: nextBy === "file" ? null : nextBy,
      }),
      { replace: true },
    );
    firstPage();
  };

  const formats = React.useMemo(() => {
    const tag = intlLocaleFor(locale);
    const one = new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const percent = new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: 0 });
    return {
      score: (score: number | null) => (score === null ? "—" : one.format(score)),
      share: (share: number | null) => (share === null ? "—" : percent.format(share)),
    };
  }, [locale]);

  const rows = React.useMemo<RatingRow[]>(() => {
    const data = report.data;
    if (!data) return [];
    const group = (average: RatingAverage) => ({
      visits: average.visits,
      scores: average.averages,
      recommend: {
        share: average.recommendShare,
        yes: average.recommendYes,
        answered: average.recommendYes + average.recommendNo,
      },
    });
    if (by === "worker") {
      return data.workers.map((line) => ({
        id: line.worker.id,
        title: workerName(line.worker),
        subtitle: line.worker.number,
        ...group(line),
        search: `${workerName(line.worker)} ${line.worker.number}`,
      }));
    }
    if (by === "visit") {
      return data.visits.map((visit: RatedVisit) => ({
        id: visit.visitId,
        title: dates.short(visit.visitDate),
        titleLtr: true,
        subtitle: [visit.number, visit.clientName, visit.siteName].filter(Boolean).join(" · "),
        visits: null,
        scores: visit.ratings,
        recommend: { answer: visit.wouldRecommend },
        search: [visit.number, visit.clientName, visit.siteName ?? "", visit.file.number].join(" "),
      }));
    }
    return data.files.map((line) => ({
      id: line.file.id,
      title: line.clientName,
      subtitle: [line.file.number, line.siteName ?? divisionLabel(line.file.division)].join(" · "),
      ...group(line),
      search: [line.clientName, line.siteName ?? "", line.file.number].join(" "),
    }));
  }, [report.data, by, dates, divisionLabel]);

  const shown = React.useMemo(() => {
    const words = normaliseName(search);
    const typed = search.trim();
    if (!words && !typed) return rows;
    return rows.filter((row) => {
      const text = normaliseName(row.search);
      return (
        (words !== "" && words.split(" ").every((word) => text.includes(word))) ||
        (typed !== "" && row.search.includes(typed))
      );
    });
  }, [rows, search]);

  const columns = React.useMemo<ColumnDef<RatingRow>[]>(() => {
    const criterion = (key: RatingCriterion): ColumnDef<RatingRow> => ({
      id: key,
      // A short head, the whole name in its tooltip: five marks and the rest fit the box in every language.
      header: () => (
        <span className="whitespace-nowrap" title={t(`Criteria.${key}`)}>
          {t(`CriteriaShort.${key}`)}
        </span>
      ),
      cell: ({ row }) => (
        <Ltr className={cn("font-bold tabular-nums", scoreInk(row.original.scores[key]))}>
          {formats.score(row.original.scores[key])}
        </Ltr>
      ),
    });
    return [
      {
        id: "who",
        header: t(`Columns.${by}`),
        cell: ({ row }) => (
          <div className="max-w-40 min-w-0 xl:max-w-56">
            {row.original.titleLtr ? (
              <span className="block font-bold whitespace-nowrap">
                <Ltr>{row.original.title}</Ltr>
              </span>
            ) : (
              <bdi className="block truncate font-bold" title={row.original.title}>
                {row.original.title}
              </bdi>
            )}
            <bdi className="block truncate text-xs leading-4 text-muted-foreground" title={row.original.subtitle}>
              {row.original.subtitle}
            </bdi>
          </div>
        ),
      },
      ...(by === "visit"
        ? []
        : [
            {
              id: "visits",
              header: t("Columns.Visits"),
              cell: ({ row }) => <Ltr className="font-bold tabular-nums">{row.original.visits ?? "—"}</Ltr>,
            } satisfies ColumnDef<RatingRow>,
          ]),
      ...RATING_CRITERIA.map(criterion),
      {
        id: "recommend",
        header: () => (
          <span className="whitespace-nowrap" title={t("Columns.Recommend")}>
            {t("Columns.RecommendShort")}
          </span>
        ),
        cell: ({ row }) => {
          const recommend = row.original.recommend;
          if ("answer" in recommend) {
            return (
              <span className={cn("font-bold", recommend.answer === null && "text-muted-foreground")}>
                {recommend.answer === null ? "—" : recommend.answer ? t("Yes") : t("No")}
              </span>
            );
          }
          return (
            <div className="min-w-0">
              <span className="block font-bold tabular-nums">
                <Ltr>{formats.share(recommend.share)}</Ltr>
              </span>
              {recommend.answered > 0 && (
                <span className="block text-xs leading-4 text-muted-foreground tabular-nums">
                  <Ltr>
                    {recommend.yes}/{recommend.answered}
                  </Ltr>
                </span>
              )}
            </div>
          );
        },
      },
    ];
  }, [by, formats, t]);

  const table = useReactTable({
    data: shown,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    state: { pagination },
    onPaginationChange: setPagination,
  });

  const overall = report.data?.overall;
  return (
    <div className="space-y-5">
      <PeriodSwitch
        label={dates.month(month)}
        previousLabel={t("Month.Previous")}
        nextLabel={t("Month.Next")}
        onPrevious={() => go({ month: shiftMonth(month, -1) })}
        onNext={() => go({ month: shiftMonth(month, 1) })}
        presentLabel={month !== thisMonth ? t("Month.Current") : undefined}
        onPresent={() => go({ month: thisMonth })}
      />

      {report.isError ? (
        <ErrorState onRetry={() => void report.refetch()} />
      ) : (
        <>
          <div className="grid min-w-0 grid-cols-1 gap-5 md:grid-cols-3 tall:gap-6">
            <StatCard
              label={t("Stats.Overall")}
              value={<Ltr>{formats.score(overall?.averages.overall ?? null)}</Ltr>}
              hint={t("Stats.OutOfFive")}
              icon={Star}
              tone="requests"
            />
            <StatCard
              label={t("Stats.Visits")}
              value={<Ltr>{overall?.visits ?? 0}</Ltr>}
              hint={t("Stats.Rated", { count: overall?.rated ?? 0 })}
              icon={ClipboardCheck}
              tone="requests"
            />
            <StatCard
              label={t("Stats.Recommend")}
              value={<Ltr>{formats.share(overall?.recommendShare ?? null)}</Ltr>}
              hint={t("Stats.Answers", {
                yes: overall?.recommendYes ?? 0,
                count: (overall?.recommendYes ?? 0) + (overall?.recommendNo ?? 0),
              })}
              icon={ThumbsUp}
              tone="requests"
            />
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center">
            <TableSearch
              className="w-full lg:max-w-sm lg:flex-1"
              placeholder={t(`Search.${by}`)}
              value={search}
              onChange={(value) => {
                setSearch(value);
                firstPage();
              }}
            />
            <Select value={by} onValueChange={(next) => go({ by: next as Grouping })}>
              <SelectTrigger className="w-full sm:w-56" aria-label={t("ByLabel")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GROUPINGS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {t(`By.${code}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DataTable
            table={table}
            columnCount={columns.length}
            emptyMessage={
              report.isPending ? tComplaints("Loading") : rows.length === 0 ? t("Empty") : tComplaints("NoMatch")
            }
          />
          <TablePager table={table} />
        </>
      )}
    </div>
  );
}
