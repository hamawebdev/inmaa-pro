import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { ClipboardCheck } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { DateField } from "@/components/pickers";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import { isIsoDate } from "@/features/operations/rules/calendar";
import { listEmployeeChoicesQuery } from "@/features/operations/services/corrective-tasks";
import {
  createInspectionAction,
  INSPECTIONS_PATH,
  listInspectableFilesQuery,
} from "@/features/operations/services/inspections";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";

import { inspectionHref, isolate, useQualityDates } from "./quality-format";

/** No visit, or the supervisor of the plan or the zone: a Select item cannot carry an empty value. */
const NONE = "none";

/**
 * «تفتيش جديد»: an inspection the plan did not make (a complaint to check, a
 * site to look at between two planned visits): the file, the visit inspected
 * if there is one, its day and its supervisor. Saved, it opens the
 * inspection, where its sheet is printed and, later, typed in.
 *
 * Closest academy component: attendance/_components/add-absence-dialog.tsx.
 */
export function NewInspectionDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <NewInspectionForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function NewInspectionForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Inspections.New");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const dates = useQualityDates();
  const { today } = useCentreClock();
  const files = useQuery({
    queryKey: [...pathKey(INSPECTIONS_PATH), "inspections", "files"],
    queryFn: () => listInspectableFilesQuery(undefined),
  });
  const employees = useQuery({
    queryKey: [...pathKey(INSPECTIONS_PATH), "employees"],
    queryFn: () => listEmployeeChoicesQuery(undefined),
  });

  const [fileId, setFileId] = React.useState("");
  const [visitId, setVisitId] = React.useState(NONE);
  const [plannedDate, setPlannedDate] = React.useState(today);
  const [supervisorId, setSupervisorId] = React.useState(NONE);
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const file = files.data?.find((candidate) => candidate.id === fileId) ?? null;
  const visits = file?.visits ?? [];
  const dateOk = isIsoDate(plannedDate);
  const shows = (problem: "file" | "date") => tried && (problem === "file" ? !file : !dateOk);

  const chooseFile = (id: string) => {
    setFileId(id);
    // Today's visit of the file when it has one; else none.
    const next = files.data?.find((candidate) => candidate.id === id);
    const todays = next?.visits.find((visit) => visit.visitDate === today);
    setVisitId(todays?.id ?? NONE);
    setPlannedDate(todays?.visitDate ?? today);
  };
  const chooseVisit = (id: string) => {
    setVisitId(id);
    const visit = visits.find((candidate) => candidate.id === id);
    if (visit) setPlannedDate(visit.visitDate);
  };

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (!file || !dateOk) return;
    setBusy(true);
    const result = await createInspectionAction({
      fileId: file.id,
      visitId: visitId === NONE ? null : visitId,
      plannedDate,
      supervisorEmployeeId: supervisorId === NONE ? null : supervisorId,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Done", { number: isolate(result.data.number) }));
    onClose();
    navigate(inspectionHref(result.data.id));
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ClipboardCheck className="size-6 text-section-requests" />
          {t("Title")}
        </DialogTitle>
        <DialogDescription>{t("Description")}</DialogDescription>
      </DialogHeader>

      <form onSubmit={save} className="space-y-5" noValidate>
        <Field data-invalid={shows("file") || undefined}>
          <FieldLabel htmlFor="inspection-file">{t("File")}</FieldLabel>
          <Select value={fileId} onValueChange={chooseFile}>
            <SelectTrigger id="inspection-file" className="w-full" aria-invalid={shows("file") || undefined}>
              <SelectValue placeholder={files.data?.length === 0 ? t("NoFiles") : t("ChooseFile")} />
            </SelectTrigger>
            <SelectContent>
              {(files.data ?? []).map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  <bdi className="max-w-[18rem] truncate">{candidate.site}</bdi>
                  <span className="max-w-[10rem] truncate text-muted-foreground">
                    <bdi>{candidate.clientName}</bdi>
                  </span>
                  <Ltr className="text-muted-foreground">{candidate.number}</Ltr>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {shows("file") && <FieldError>{t("Required")}</FieldError>}
        </Field>

        <Field>
          <FieldLabel htmlFor="inspection-visit">{t("Visit")}</FieldLabel>
          <Select value={visitId} onValueChange={chooseVisit} disabled={!file}>
            <SelectTrigger id="inspection-visit" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>{t("NoVisit")}</SelectItem>
              {visits.map((visit) => (
                <SelectItem key={visit.id} value={visit.id}>
                  {dates.weekday(visit.visitDate)} <Ltr>{dates.short(visit.visitDate)}</Ltr>
                  <Ltr className="text-muted-foreground">
                    {visit.startTime} · {visit.number}
                  </Ltr>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t("VisitHint")}</FieldDescription>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field data-invalid={shows("date") || undefined}>
            <FieldLabel htmlFor="inspection-date">{t("PlannedDate")}</FieldLabel>
            <DateField
              id="inspection-date"
              value={plannedDate}
              onChange={setPlannedDate}
              aria-invalid={shows("date") || undefined}
            />
            {shows("date") && <FieldError>{t("Required")}</FieldError>}
          </Field>
          <Field>
            <FieldLabel htmlFor="inspection-supervisor">{t("Supervisor")}</FieldLabel>
            <Select value={supervisorId} onValueChange={setSupervisorId}>
              <SelectTrigger id="inspection-supervisor" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>{t("SupervisorAuto")}</SelectItem>
                {(employees.data ?? []).map((employee) => (
                  <SelectItem key={employee.id} value={employee.id}>
                    <bdi>{staffName(employee)}</bdi>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="success" loading={busy}>
            <ClipboardCheck />
            {t("Submit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
