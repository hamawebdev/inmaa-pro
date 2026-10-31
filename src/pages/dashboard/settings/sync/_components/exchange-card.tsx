import { ArrowDownUp, CircleAlert, Clock3, CloudUpload, History, TriangleAlert } from "lucide-react";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatCard } from "@/components/stat-card";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useInstantText } from "@/features/sync/use-instant-text";
import { clockDifferenceText, exchangeTone, isolate, problemTone } from "@/features/sync/view";
import type { SyncProblem, SyncStatus } from "@/lib/sync/services/types";
import { cn } from "@/lib/utils";

const CALLOUT: Record<StatusTone, string> = {
  danger: "border-destructive/35 bg-destructive/10 [&>svg]:text-destructive",
  warning: "border-warning-ink/35 bg-warning/10 [&>svg]:text-warning-ink",
  info: "border-info/35 bg-info/10 [&>svg]:text-info",
  success: "border-success/35 bg-success/10 [&>svg]:text-success",
  progress: "border-progress/35 bg-progress/10 [&>svg]:text-progress",
  pending: "border-border-strong bg-muted [&>svg]:text-foreground/75",
  neutral: "border-border bg-muted [&>svg]:text-muted-foreground",
};

/**
 * Where the exchange stands (DECISION section 7): one chip for the exchange,
 * then every problem in its own words with what to do, most serious first,
 * then the figures the office may be asked for on the phone.
 */
export function ExchangeCard({ status }: { status: SyncStatus }) {
  const t = useTranslations("Sync");
  const instant = useInstantText();
  const last = status.lastExchangeAt ? instant(status.lastExchangeAt) : null;
  const toSettle = status.heldCount + status.conflictCount + status.incidentCount;

  return (
    <Card data-sync-exchange>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="flex items-center gap-2">
            <ArrowDownUp className="size-5" />
            {t("Status.Title")}
          </span>
          <StatusChip tone={exchangeTone(status.exchange)} label={t(`Exchange.${status.exchange}`)} />
        </CardTitle>
        <CardDescription>{t("Status.Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        {status.problems.length > 0 && (
          <ul className="flex min-w-0 flex-col gap-3">
            {status.problems.map((problem) => (
              <ProblemLine key={problem} problem={problem} status={status} />
            ))}
          </ul>
        )}

        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={History}
            label={t("Status.LastExchange")}
            value={last ? <Ltr>{last.time}</Ltr> : t("Status.Never")}
            hint={last?.date}
          />
          <StatCard icon={CloudUpload} label={t("Status.Waiting")} value={<Ltr>{status.waitingCount}</Ltr>} />
          <StatCard icon={CircleAlert} label={t("Status.ToSettle")} value={<Ltr>{toSettle}</Ltr>} />
          <StatCard
            icon={Clock3}
            label={t("Status.ClockOff")}
            value={<Ltr>{status.clockOffsetMs === null ? "—" : clockDifferenceText(status.clockOffsetMs)}</Ltr>}
            hint={`${t("Status.Files")}: ${status.filesToSend} / ${status.filesToReceive}`}
          />
        </div>
      </CardContent>
    </Card>
  );
}

function ProblemLine({ problem, status }: { problem: SyncProblem; status: SyncStatus }) {
  const t = useTranslations("Sync");
  const instant = useInstantText();
  const tone = problemTone(problem);
  const count =
    problem === "HELD"
      ? status.heldCount
      : problem === "CONFLICTS"
        ? status.conflictCount
        : problem === "LEGAL_INCIDENT"
          ? status.incidentCount
          : problem === "FILES_MISSING"
            ? status.filesToReceive
            : status.waitingCount;
  // Isolated left to right inside the sentence, as `<Ltr>` does on its own.
  const time = isolate(status.limitRetryAt ? instant(status.limitRetryAt).time : "01:00");
  const difference = isolate(status.clockOffsetMs === null ? "—" : clockDifferenceText(status.clockOffsetMs));

  return (
    <li
      role={tone === "danger" ? "alert" : undefined}
      data-sync-problem={problem}
      className={cn("border-app flex min-w-0 items-start gap-3 rounded-xl p-4", CALLOUT[tone])}
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-base font-bold tall:text-lg">{t(`ProblemTitles.${problem}`)}</p>
        <p className="text-base leading-relaxed">{t(`ProblemHints.${problem}`, { count, time, difference })}</p>
      </div>
    </li>
  );
}
