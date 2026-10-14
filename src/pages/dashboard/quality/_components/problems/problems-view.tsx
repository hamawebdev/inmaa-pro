import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  getCoreRowModel,
  getPaginationRowModel,
  type PaginationState,
  useReactTable,
} from "@tanstack/react-table";
import {
  CircleCheckBig,
  CirclePlay,
  Forward,
  Hand,
  Hourglass,
  MessageSquareWarning,
  Plus,
  type LucideIcon,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { DataTable, TablePager, TableSearch } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import { complaintPath } from "@/features/operations/services/complaints";
import {
  NOT_CLOSED,
  PROBLEM_STATUSES,
  listProblemReportsQuery,
  takeProblemInHandAction,
  type ProblemLine,
  type ProblemStatus,
} from "@/features/operations/services/problem-reports";
import { PROBLEM_KINDS, type ProblemKind } from "@/features/operations/validators/option-codes";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useSearchParams } from "@/lib/compat/navigation";
import { normaliseName } from "@/lib/text/normalise";

import { useDates } from "../../../worker-attendance/_components/attendance-helpers";
import { qualityKey, workerName } from "../complaints/complaint-bits";
import { qualityHref } from "../quality-views";
import { CloseProblemDialog, HandOverDialog, LogProblemDialog, ToComplaintDialog } from "./problem-dialogs";

const ALL = "ALL";
const STATUS_FILTERS = [NOT_CLOSED, ...PROBLEM_STATUSES, ALL] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

/** The list in the address: `?view=problems&status=…&kind=…`; the reports not closed, of every kind, by default. */
function readFilters(search: URLSearchParams): { status: StatusFilter; kind: ProblemKind | null } {
  const status = search.get("status");
  const kind = search.get("kind");
  return {
    status: (STATUS_FILTERS as readonly string[]).includes(status ?? "") ? (status as StatusFilter) : NOT_CLOSED,
    kind: (PROBLEM_KINDS as readonly string[]).includes(kind ?? "") ? (kind as ProblemKind) : null,
  };
}

/** «تسجيل بلاغ», in the heading row, for whoever may write the requests. */
export function ProblemsActions() {
  const t = useTranslations("Problems");
  const clock = useCentreClock();
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const [open, setOpen] = React.useState(false);
  if (!mayWrite) return null;
  return (
    <>
      <Button variant="add" onClick={() => setOpen(true)}>
        <Plus />
        {t("Log.Button")}
      </Button>
      <LogProblemDialog open={open} onOpenChange={setOpen} today={clock.today} />
    </>
  );
}

const STATUS_LOOK: Record<ProblemStatus, { tone: StatusTone; icon: LucideIcon }> = {
  OPEN: { tone: "warning", icon: Hourglass },
  IN_PROGRESS: { tone: "progress", icon: CirclePlay },
  CLOSED: { tone: "success", icon: CircleCheckBig },
};

function ProblemStatusChip({ status }: { status: ProblemStatus }) {
  const label = useCodeLabel("Problems.Statuses");
  const look = STATUS_LOOK[status];
  return <StatusChip tone={look.tone} icon={look.icon} label={label(status)} />;
}

/**
 * «بلاغات المشاكل» (#14): what the workers ticked under «هل توجد مشكلة في
 * الموقع؟» on the returned orders, and what was phoned in. The office takes a
 * report in hand, hands it to the stock, the client files or HR, or closes it
 * with what was done; a resident's complaint becomes a complaint.
 *
 * Closest academy screen: the attendance overviews
 * (attendance/_components/staff-absence-overview.tsx): the search, the
 * filters beside it, the table with its chips and row buttons.
 */
export function ProblemsView() {
  const t = useTranslations("Problems");
  const tComplaints = useTranslations("Complaints");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const dates = useDates();
  const kindLabel = useCodeLabel("ProblemKinds");
  const viaLabel = useCodeLabel("Problems.Vias");
  const handedLabel = useCodeLabel("Problems.HandedTo");
  const statusLabel = useCodeLabel("Problems.Statuses");
  const mayWrite = useSectionLevel("REQUESTS") === "WRITE";
  const params = useSearchParams();
  const filters = readFilters(params);
  const list = useQuery({
    queryKey: qualityKey("problems", filters.status, filters.kind ?? ALL),
    queryFn: () =>
      listProblemReportsQuery({ status: filters.status === ALL ? null : filters.status, kind: filters.kind }),
  });
  const [search, setSearch] = React.useState("");
  const [pagination, setPagination] = React.useState<PaginationState>({ pageIndex: 0, pageSize: 25 });
  const firstPage = () => setPagination((current) => ({ ...current, pageIndex: 0 }));
  const go = (next: { status?: StatusFilter; kind?: ProblemKind | null }) => {
    const status = next.status ?? filters.status;
    const kind = next.kind === undefined ? filters.kind : next.kind;
    navigate(qualityHref("problems", { status: status === NOT_CLOSED ? null : status, kind }), { replace: true });
    firstPage();
  };

  const [confirm, confirmDialog] = useConfirm();
  const [handing, setHanding] = React.useState<ProblemLine | null>(null);
  const [closing, setClosing] = React.useState<ProblemLine | null>(null);
  const [converting, setConverting] = React.useState<ProblemLine | null>(null);

  const takeInHand = React.useCallback(
    async (line: ProblemLine) => {
      const yes = await confirm({
        title: t("TakeInHand.Title"),
        description: t("TakeInHand.Description", { kind: kindLabel(line.kind) }),
        confirmLabel: t("TakeInHand.Confirm"),
      });
      if (!yes) return;
      const answer = await takeProblemInHandAction({ problemReportId: line.id });
      if (!answer.success) toast.error(errorMessage(answer.error, t("TakeInHand.Failed")));
      else toast.success(t("TakeInHand.Done"));
    },
    [confirm, errorMessage, kindLabel, t],
  );

  const lines = React.useMemo(() => list.data ?? [], [list.data]);
  const shown = React.useMemo(() => {
    const words = normaliseName(search);
    const typed = search.trim();
    if (!words && !typed) return lines;
    return lines.filter((line) => {
      const text = normaliseName(
        [line.site.name ?? "", line.site.address, line.client.name, line.details ?? "", kindLabel(line.kind)].join(" "),
      );
      return (
        (words !== "" && words.split(" ").every((word) => text.includes(word))) ||
        (typed !== "" && (line.file.number.includes(typed) || (line.visit?.number ?? "").includes(typed)))
      );
    });
  }, [lines, search, kindLabel]);

  const columns = React.useMemo<ColumnDef<ProblemLine>[]>(
    () => [
      {
        id: "date",
        header: t("Columns.Date"),
        cell: ({ row }) => (
          <div className="min-w-0">
            <Ltr className="block font-bold whitespace-nowrap">
              {dates.short(row.original.occurredDate)}
              {row.original.occurredTime && ` ${row.original.occurredTime}`}
            </Ltr>
            <span className="block truncate text-sm text-muted-foreground">{viaLabel(row.original.reportedVia)}</span>
          </div>
        ),
      },
      {
        id: "site",
        header: t("Columns.Site"),
        cell: ({ row }) => {
          const { site, file, client } = row.original;
          const name = site.name ?? site.address;
          const second = `${file.number} · ${client.name}`;
          return (
            <div className="max-w-52 min-w-0">
              <bdi className="block truncate font-bold" title={name}>
                {name}
              </bdi>
              <bdi className="block truncate text-sm text-muted-foreground" title={second}>
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
          <div className="max-w-64 min-w-0">
            <span className="block truncate font-bold">{kindLabel(row.original.kind)}</span>
            {row.original.details ? (
              <bdi className="block truncate text-sm text-muted-foreground" title={row.original.details}>
                {row.original.details}
              </bdi>
            ) : (
              <span className="block text-sm text-muted-foreground">—</span>
            )}
          </div>
        ),
      },
      {
        id: "status",
        header: t("Columns.Status"),
        cell: ({ row }) => {
          const line = row.original;
          const note = line.complaint ? (
            <Link to={complaintPath(line.complaint.id)} className="underline-offset-4 hover:underline">
              {t("BecameComplaint")} <Ltr>{line.complaint.number}</Ltr>
            </Link>
          ) : line.handedTo ? (
            t("HandedToNote", { to: handedLabel(line.handedTo) })
          ) : line.status === "CLOSED" ? (
            (line.actionTaken ?? "")
          ) : line.assignedTo ? (
            workerName(line.assignedTo)
          ) : null;
          return (
            <div className="max-w-56 min-w-0">
              <ProblemStatusChip status={line.status} />
              {note && (
                <bdi
                  className="mt-1 block truncate text-sm text-muted-foreground"
                  title={typeof note === "string" ? note : undefined}
                >
                  {note}
                </bdi>
              )}
            </div>
          );
        },
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => {
          const line = row.original;
          if (!mayWrite || line.status === "CLOSED") return null;
          const buttons: Array<{ key: string; label: string; icon: LucideIcon; onClick: () => void }> = [];
          if (line.status === "OPEN") {
            buttons.push({ key: "take", label: t("Actions.TakeInHand"), icon: Hand, onClick: () => void takeInHand(line) });
          }
          if (!line.handedTo) {
            buttons.push({ key: "hand", label: t("Actions.HandOver"), icon: Forward, onClick: () => setHanding(line) });
          }
          if (line.kind === "RESIDENT_COMPLAINT" && !line.complaint) {
            buttons.push({
              key: "complaint",
              label: t("Actions.ToComplaint"),
              icon: MessageSquareWarning,
              onClick: () => setConverting(line),
            });
          }
          buttons.push({ key: "close", label: t("Actions.Close"), icon: CircleCheckBig, onClick: () => setClosing(line) });
          return (
            <div className="flex items-center justify-end gap-2">
              {buttons.map(({ key, label, icon: Icon, onClick }) => (
                <Button key={key} variant="outline" size="sm" onClick={onClick} title={label}>
                  <Icon />
                  <span className="sr-only 2xl:not-sr-only">{label}</span>
                </Button>
              ))}
            </div>
          );
        },
      },
    ],
    [t, dates, kindLabel, viaLabel, handedLabel, mayWrite, takeInHand],
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
        <Select value={filters.status} onValueChange={(next) => go({ status: next as StatusFilter })}>
          <SelectTrigger className="w-full sm:w-56" aria-label={t("Columns.Status")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_FILTERS.map((code) => (
              <SelectItem key={code} value={code}>
                {code === NOT_CLOSED ? t("Filters.NotClosed") : code === ALL ? t("Filters.All") : statusLabel(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.kind ?? ALL}
          onValueChange={(next) => go({ kind: next === ALL ? null : (next as ProblemKind) })}
        >
          <SelectTrigger className="w-full sm:w-56" aria-label={t("Columns.Kind")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("Filters.AllKinds")}</SelectItem>
            {PROBLEM_KINDS.map((code) => (
              <SelectItem key={code} value={code}>
                {kindLabel(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <DataTable
        table={table}
        columnCount={columns.length}
        emptyMessage={
          list.isPending ? tComplaints("Loading") : lines.length === 0 ? t("Empty") : tComplaints("NoMatch")
        }
      />
      <TablePager table={table} />

      <HandOverDialog report={handing} onOpenChange={(open) => !open && setHanding(null)} />
      <CloseProblemDialog report={closing} onOpenChange={(open) => !open && setClosing(null)} />
      <ToComplaintDialog report={converting} onOpenChange={(open) => !open && setConverting(null)} />
      {confirmDialog}
    </div>
  );
}
