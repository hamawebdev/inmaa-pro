import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { CalendarOff, CircleCheckBig, Repeat } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { datesBetween, isIsoDate, weekdayOf, weekdaysOfCodes } from "@/features/operations/rules/calendar";
import {
  ABSENCE_CATEGORIES,
  ABSENCE_TYPES,
  LEAVE_TYPES,
  recordWorkerAbsenceAction,
  type AbsenceCategory,
  type AbsenceType,
  type AbsenceVia,
  type LeaveType,
  type RecordedAbsence,
} from "@/features/operations/services/absences";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

import { useDates, workerName } from "./attendance-helpers";
import { dayQuery } from "./attendance-queries";

/** Who the absence is for and from which day, when the dialog is opened from a row; else today and nobody yet. */
export interface AbsenceRequest {
  workerId?: string;
  date: string;
}

/** The two halves of a day an absence of half a day takes («الصباحية / المسائية»). */
const HALVES = ["MORNING", "EVENING"] as const;
type Half = (typeof HALVES)[number];

/** How the office heard of it. NO_SHOW is written by the returned order, not here. */
const VIAS_OFFERED = ["PHONE", "IN_PERSON", "SUPERVISOR"] as const satisfies readonly AbsenceVia[];

/**
 * «تسجيل غياب»: an absence the worker or her supervisor reported. Saved, it
 * opens her seats on the visits it covers, and the dialog lists them, each
 * with the way to its visit, where the office chooses who replaces her. A leave
 * is recorded as asked for: HR decides on it, and nothing opens before.
 *
 * Closest academy component: attendance/_components/add-absence-dialog.tsx
 * (the person, the type, the hours only for HOURS, the reason, the details),
 * with his dates, the kind of absence and how it was reported added.
 */
export function AddAbsenceDialog({
  open,
  request,
  onOpenChange,
  onRecorded,
}: {
  open: boolean;
  request: AbsenceRequest;
  onOpenChange: (open: boolean) => void;
  /** After a save: refresh what shows absences. */
  onRecorded: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        {/* Radix unmounts the content on close: the form starts afresh on every opening. */}
        <AbsenceForm request={request} onClose={() => onOpenChange(false)} onRecorded={onRecorded} />
      </DialogContent>
    </Dialog>
  );
}

type Problem = "worker" | "dates" | "times" | "category" | "leaveType" | "days";

function AbsenceForm({
  request,
  onClose,
  onRecorded,
}: {
  request: AbsenceRequest;
  onClose: () => void;
  onRecorded: () => void;
}) {
  const t = useTranslations("WorkerAttendance.Dialog");
  const tAll = useTranslations("WorkerAttendance");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const typeLabel = useCodeLabel("Options.AbsenceType");
  const halfLabel = useCodeLabel("Options.DayPeriod");
  const leaveLabel = useCodeLabel("Options.LeaveType");
  const categoryLabel = useCodeLabel("WorkerAttendance.Categories");
  const viaLabel = useCodeLabel("WorkerAttendance.Vias");

  // The worker list and the two halves of the day: the records view's read of that day.
  const day = useQuery(dayQuery(request.date));
  const workers = React.useMemo(
    () =>
      (day.data?.rows ?? [])
        .map((row) => row.worker)
        .filter((worker) => worker.schedulable || worker.id === request.workerId),
    [day.data, request.workerId],
  );
  const periods = day.data?.periods;

  const [workerId, setWorkerId] = React.useState(request.workerId ?? "");
  const [startDate, setStartDate] = React.useState(request.date);
  const [endDate, setEndDate] = React.useState(request.date);
  const [type, setType] = React.useState<AbsenceType>("FULL_DAY");
  const [half, setHalf] = React.useState<Half>("MORNING");
  const [startTime, setStartTime] = React.useState("");
  const [endTime, setEndTime] = React.useState("");
  const [category, setCategory] = React.useState<AbsenceCategory | "">("");
  const [leaveType, setLeaveType] = React.useState<LeaveType | "">("");
  const [leaveDays, setLeaveDays] = React.useState("");
  const [via, setVia] = React.useState<AbsenceVia>("PHONE");
  const [reason, setReason] = React.useState("");
  const [details, setDetails] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<(RecordedAbsence & { leave: boolean }) | null>(null);

  const isLeave = category === "LEAVE";
  const datesOk = isIsoDate(startDate) && isIsoDate(endDate);
  // A leave counts its days; left blank, the working days of the range, the weekly rest day left out as People's
  // pay leaves it out (audit LAB-8), half of each for half days.
  const restWeekday = weekdaysOfCodes([day.data?.restDay ?? "FRI"])[0];
  const suggestedDays =
    datesOk && endDate >= startDate && type !== "HOURS"
      ? datesBetween(startDate, endDate).filter((date) => weekdayOf(date) !== restWeekday).length *
        (type === "HALF_DAY" ? 0.5 : 1)
      : 0;
  const days = leaveDays.trim() === "" ? suggestedDays : Number(leaveDays);

  const problems = new Set<Problem>();
  if (!workerId) problems.add("worker");
  if (!datesOk) problems.add("dates");
  if (type === "HOURS" && (!startTime || !endTime)) problems.add("times");
  if (!category) problems.add("category");
  if (isLeave && !leaveType) problems.add("leaveType");
  if (isLeave && (!Number.isFinite(days) || days < 0)) problems.add("days");
  const shows = (problem: Problem) => tried && problems.has(problem);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (problems.size > 0 || !category) return;
    const hours =
      type === "HOURS"
        ? { startTime, endTime }
        : type === "HALF_DAY" && periods
          ? { startTime: periods[half].from, endTime: periods[half].to }
          : { startTime: null, endTime: null };
    setBusy(true);
    const answer = await recordWorkerAbsenceAction({
      workerId,
      startDate,
      endDate,
      type,
      ...hours,
      category,
      leaveType: isLeave && leaveType ? leaveType : null,
      days: isLeave ? Math.round(days * 1000) : null,
      reportedVia: via,
      reason,
      details,
      status: isLeave ? "REQUESTED" : "RECORDED",
    });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("SaveFailed")));
      return;
    }
    toast.success(isLeave ? t("LeaveAsked") : t("Recorded"));
    setResult({ ...answer.data, leave: isLeave });
    onRecorded();
  }

  if (result) return <RecordedView result={result} onClose={onClose} />;

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarOff className="size-6 text-warning-ink" />
          {t("Title")}
        </DialogTitle>
        <DialogDescription>{t("Description")}</DialogDescription>
      </DialogHeader>

      <form onSubmit={save} className="space-y-5" noValidate>
        <Field data-invalid={shows("worker")}>
          <FieldLabel htmlFor="absence-worker">{tAll("Worker")}</FieldLabel>
          <Select value={workerId} onValueChange={setWorkerId}>
            <SelectTrigger id="absence-worker" className="w-full" aria-invalid={shows("worker")}>
              <SelectValue placeholder={t("ChooseWorker")} />
            </SelectTrigger>
            <SelectContent>
              {workers.map((worker) => (
                <SelectItem key={worker.id} value={worker.id}>
                  <bdi>{workerName(worker)}</bdi>
                  <Ltr className="text-muted-foreground">{worker.number}</Ltr>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {shows("worker") && <FieldError>{t("Required")}</FieldError>}
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={shows("dates")}>
            <FieldLabel htmlFor="absence-from">{t("From")}</FieldLabel>
            <Input
              id="absence-from"
              type="date"
              dir="ltr"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              aria-invalid={shows("dates")}
            />
          </Field>
          <Field data-invalid={shows("dates")}>
            <FieldLabel htmlFor="absence-to">{t("To")}</FieldLabel>
            <Input
              id="absence-to"
              type="date"
              dir="ltr"
              value={endDate}
              min={startDate}
              onChange={(event) => setEndDate(event.target.value)}
              aria-invalid={shows("dates")}
            />
          </Field>
          {shows("dates") && <FieldError className="sm:col-span-2">{t("Required")}</FieldError>}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field>
            <FieldLabel htmlFor="absence-type">{t("Type")}</FieldLabel>
            <Select value={type} onValueChange={(value) => setType(value as AbsenceType)}>
              <SelectTrigger id="absence-type" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_TYPES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {typeLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          {type === "HALF_DAY" && (
            <Field>
              <FieldLabel htmlFor="absence-half">{t("Half")}</FieldLabel>
              <Select value={half} onValueChange={(value) => setHalf(value as Half)}>
                <SelectTrigger id="absence-half" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {HALVES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {halfLabel(code)}
                      {periods && (
                        <Ltr className="text-muted-foreground">
                          {periods[code].from} – {periods[code].to}
                        </Ltr>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        </div>

        {type === "HOURS" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field data-invalid={shows("times")}>
              <FieldLabel htmlFor="absence-start">{t("StartTime")}</FieldLabel>
              <Input
                id="absence-start"
                type="time"
                dir="ltr"
                value={startTime}
                onChange={(event) => setStartTime(event.target.value)}
                aria-invalid={shows("times")}
              />
            </Field>
            <Field data-invalid={shows("times")}>
              <FieldLabel htmlFor="absence-end">{t("EndTime")}</FieldLabel>
              <Input
                id="absence-end"
                type="time"
                dir="ltr"
                value={endTime}
                onChange={(event) => setEndTime(event.target.value)}
                aria-invalid={shows("times")}
              />
            </Field>
            {shows("times") && <FieldError className="sm:col-span-2">{t("Required")}</FieldError>}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={shows("category")}>
            <FieldLabel htmlFor="absence-category">{t("Category")}</FieldLabel>
            <Select value={category} onValueChange={(value) => setCategory(value as AbsenceCategory)}>
              <SelectTrigger id="absence-category" className="w-full" aria-invalid={shows("category")}>
                <SelectValue placeholder={t("Choose")} />
              </SelectTrigger>
              <SelectContent>
                {ABSENCE_CATEGORIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {categoryLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {shows("category") && <FieldError>{t("Required")}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="absence-via">{t("ReportedVia")}</FieldLabel>
            <Select value={via} onValueChange={(value) => setVia(value as AbsenceVia)}>
              <SelectTrigger id="absence-via" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {VIAS_OFFERED.map((code) => (
                  <SelectItem key={code} value={code}>
                    {viaLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        {isLeave && (
          <div className="space-y-3">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field data-invalid={shows("leaveType")}>
                <FieldLabel htmlFor="absence-leave-type">{t("LeaveType")}</FieldLabel>
                <Select value={leaveType} onValueChange={(value) => setLeaveType(value as LeaveType)}>
                  <SelectTrigger id="absence-leave-type" className="w-full" aria-invalid={shows("leaveType")}>
                    <SelectValue placeholder={t("Choose")} />
                  </SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.filter((code) => code !== "SICK").map((code) => (
                      <SelectItem key={code} value={code}>
                        {leaveLabel(code)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {shows("leaveType") && <FieldError>{t("Required")}</FieldError>}
              </Field>
              <Field data-invalid={shows("days")}>
                <FieldLabel htmlFor="absence-leave-days">{t("LeaveDays")}</FieldLabel>
                <Input
                  id="absence-leave-days"
                  type="number"
                  dir="ltr"
                  inputMode="decimal"
                  min={0}
                  step={0.5}
                  value={leaveDays}
                  placeholder={String(suggestedDays)}
                  onChange={(event) => setLeaveDays(event.target.value)}
                  aria-invalid={shows("days")}
                />
                {shows("days") && <FieldError>{t("Required")}</FieldError>}
              </Field>
            </div>
            <FieldDescription>{t("LeaveHint")}</FieldDescription>
          </div>
        )}

        <Field>
          <FieldLabel htmlFor="absence-reason">{t("Reason")}</FieldLabel>
          <Input
            id="absence-reason"
            value={reason}
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="absence-details">{t("Details")}</FieldLabel>
          <Textarea
            id="absence-details"
            rows={2}
            value={details}
            maxLength={1000}
            onChange={(event) => setDetails(event.target.value)}
          />
        </Field>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="success" loading={busy}>
            <CalendarOff />
            {t("Save")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

/** What the absence did: the visits she leaves, each with the way to replace her; or nothing to do. */
function RecordedView({ result, onClose }: { result: RecordedAbsence & { leave: boolean }; onClose: () => void }) {
  const t = useTranslations("WorkerAttendance.Dialog");
  const tCommon = useTranslations("Common");
  const dates = useDates();
  const seats = result.seatsHit;
  const message = result.leave
    ? t("LeaveWaits")
    : seats.length > 0
      ? t("SeatsHit", { count: seats.length })
      : t("NoSeatHit");
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CircleCheckBig className="size-6 text-success" />
          {result.leave ? t("LeaveAsked") : t("Recorded")}
        </DialogTitle>
        <DialogDescription>{message}</DialogDescription>
      </DialogHeader>
      {seats.length > 0 && (
        <ul className="border-app divide-y divide-border rounded-lg border-border">
          {seats.map((seat) => (
            <li key={seat.seatId} className="flex min-w-0 flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <span className="block font-bold">
                  {dates.weekday(seat.visitDate)} <Ltr>{dates.short(seat.visitDate)}</Ltr>
                </span>
                <Ltr className="block text-sm text-muted-foreground">{seat.visitNumber}</Ltr>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link to={`/dashboard/visits/${seat.visitId}`}>
                  <Repeat />
                  {t("Replace")}
                </Link>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tCommon("Close")}
        </Button>
      </DialogFooter>
    </>
  );
}
