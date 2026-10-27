import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { ArrowRight, ChevronLeft, ChevronRight, ClipboardPen, PhoneCall, Printer } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { DataTable } from "@/components/data-table-shell";
import { ErrorState } from "@/components/error-state";
import { Ltr } from "@/components/ltr";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { addDays } from "@/features/operations/rules/calendar";
import { listCallsForDayQuery, recordVisitCallAction, type CallLine } from "@/features/operations/services/calls";
import { VISITS_PATH } from "@/features/operations/services/paths";
import { CALL_RESULTS, type CallResult } from "@/features/operations/validators/option-codes";
import { useSectionLevel } from "@/hooks/use-session";
import { intlLocaleFor } from "@/i18n/config";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

const RESULT_TONE: Record<CallResult, StatusTone> = {
  INFORMED: "success",
  NO_ANSWER: "pending",
  POSTPONE_REQUESTED: "warning",
  CANCEL_REQUESTED: "danger",
};

/**
 * The calls to make about a day's visits (#16, F-16b), on the visits tab: each client on the day's call list,
 * whom to ask for and the numbers, and what came of the calls. A call's result is recorded with its dialog; a
 * client reached is «informed» on the visit. The day's list prints from here; a postponement or a
 * cancellation asked for is made on the visit's page.
 */
export function CallsView({ date }: { date: string }) {
  const t = useTranslations("Calls");
  const navigate = useNavigate();
  const locale = useLocale();
  const writes = useSectionLevel("REQUESTS") === "WRITE";
  const purposeLabel = useCodeLabel("Calls.Purposes");
  const resultLabel = useCodeLabel("Calls.Results");
  const [calling, setCalling] = React.useState<CallLine | null>(null);
  const list = useQuery({
    queryKey: [...pathKey(VISITS_PATH), "calls", date],
    queryFn: () => listCallsForDayQuery({ visitsDate: date }),
  });
  const dayLabel = new Intl.DateTimeFormat(intlLocaleFor(locale), {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "UTC",
  }).format(new Date(`${date}T00:00:00Z`));
  const goTo = (next: string) => navigate(`${VISITS_PATH}?list=calls&date=${next}`, { replace: true });

  const columns = React.useMemo<ColumnDef<CallLine>[]>(
    () => [
      {
        id: "time",
        header: t("Columns.Time"),
        cell: ({ row }) => (
          <span className="font-bold whitespace-nowrap tabular-nums">
            <Ltr>{row.original.startTime}</Ltr>
          </span>
        ),
      },
      {
        id: "client",
        header: t("Columns.Client"),
        cell: ({ row }) => (
          <div className="max-w-44 min-w-0 xl:max-w-72">
            <span className="block truncate font-bold" title={row.original.client}>
              <bdi>{row.original.client}</bdi>
            </span>
            <span className="block truncate text-xs leading-4 text-muted-foreground">
              <bdi>{[row.original.site, row.original.contactName].filter(Boolean).join(" · ")}</bdi>
            </span>
          </div>
        ),
      },
      {
        id: "phones",
        header: t("Columns.Phones"),
        cell: ({ row }) => (
          <div className="min-w-0 text-sm whitespace-nowrap">
            {row.original.phones.map((phone) => (
              <span key={phone} className="block">
                <Ltr>{phone}</Ltr>
              </span>
            ))}
          </div>
        ),
      },
      {
        id: "purpose",
        header: t("Columns.Purpose"),
        cell: ({ row }) => (
          <StatusChip
            tone={row.original.purpose === "REPLACEMENT_NOTICE" ? "warning" : "info"}
            label={purposeLabel(row.original.purpose)}
          />
        ),
      },
      {
        id: "result",
        header: t("Columns.Result"),
        cell: ({ row }) =>
          row.original.lastCall ? (
            <div className="min-w-0">
              <StatusChip
                tone={RESULT_TONE[row.original.lastCall.result]}
                label={resultLabel(row.original.lastCall.result)}
              />
              <span className="mt-1 block text-xs leading-4 text-muted-foreground">
                {t("CallsMade", { count: row.original.calls })} · <Ltr>{row.original.lastCall.at}</Ltr>
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">{t("NotCalled")}</span>
          ),
      },
      {
        id: "actions",
        header: "",
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-2">
            {writes && (
              <Button variant="outline" size="sm" title={t("Record")} onClick={() => setCalling(row.original)}>
                <PhoneCall />
                <span className="sr-only 2xl:not-sr-only">{t("Record")}</span>
              </Button>
            )}
            <Button variant="outline" size="sm" asChild title={t("OpenVisit")}>
              <Link to={`${VISITS_PATH}/${row.original.visitId}`}>
                <ClipboardPen />
                <span className="sr-only 2xl:not-sr-only">{t("OpenVisit")}</span>
              </Link>
            </Button>
          </div>
        ),
      },
    ],
    [t, purposeLabel, resultLabel, writes],
  );
  const table = useReactTable({ data: list.data ?? [], columns, getCoreRowModel: getCoreRowModel() });

  return (
    <div className="space-y-3 tall:space-y-5">
      <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        <Button variant="outline" size="sm" asChild>
          <Link to={VISITS_PATH}>
            <ArrowRight className="ltr:rotate-180" />
            {t("BackToBoard")}
          </Link>
        </Button>
        <div className="flex min-w-0 items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => goTo(addDays(date, -1))} title={t("PreviousDay")}>
            <ChevronLeft className="rtl:rotate-180" />
          </Button>
          <span className="min-w-48 text-center text-base font-bold">{t("Title", { day: dayLabel })}</span>
          <Button variant="outline" size="sm" onClick={() => goTo(addDays(date, 1))} title={t("NextDay")}>
            <ChevronRight className="rtl:rotate-180" />
          </Button>
        </div>
        <Button variant="info" size="sm" asChild className="ms-auto">
          <Link to={`${VISITS_PATH}/calls/${date}/print`}>
            <Printer />
            {t("Print")}
          </Link>
        </Button>
      </div>
      {list.isError ? (
        <ErrorState onRetry={() => void list.refetch()} />
      ) : (
        <DataTable table={table} columnCount={columns.length} emptyMessage={t(list.isPending ? "Loading" : "Empty")} />
      )}
      <CallDialog line={calling} onClose={() => setCalling(null)} />
    </div>
  );
}

function CallDialog({ line, onClose }: { line: CallLine | null; onClose: () => void }) {
  return (
    <Dialog open={line !== null} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {line && <CallForm key={line.visitId} line={line} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function CallForm({ line, onClose }: { line: CallLine; onClose: () => void }) {
  const t = useTranslations("Calls");
  const errorMessage = useErrorMessage();
  const resultLabel = useCodeLabel("Calls.Results");
  const [result, setResult] = React.useState<CallResult>("INFORMED");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    const answer = await recordVisitCallAction({
      visitId: line.visitId,
      purpose: line.purpose,
      result,
      contactName: line.contactName,
      phone: line.phones[0] ?? null,
      note,
    });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("Failed")));
      return;
    }
    toast.success(t("Saved"));
    onClose();
  };

  return (
    <form onSubmit={submit} className="space-y-5">
      <DialogHeader>
        <DialogTitle>{t("DialogTitle")}</DialogTitle>
        <DialogDescription>
          <bdi>{line.client}</bdi> · <Ltr>{line.startTime}</Ltr>
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="call-result">{t("Columns.Result")}</Label>
        <Select value={result} onValueChange={(value) => setResult(value as CallResult)}>
          <SelectTrigger id="call-result" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {CALL_RESULTS.map((code) => (
              <SelectItem key={code} value={code}>
                {resultLabel(code)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(result === "POSTPONE_REQUESTED" || result === "CANCEL_REQUESTED") && (
          <p className="text-sm text-muted-foreground">{t("ChangeOnVisit")}</p>
        )}
      </div>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="call-note">{t("Note")}</Label>
        <Textarea id="call-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
          {t("Back")}
        </Button>
        <Button type="submit" variant="success" loading={busy}>
          {t("Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
