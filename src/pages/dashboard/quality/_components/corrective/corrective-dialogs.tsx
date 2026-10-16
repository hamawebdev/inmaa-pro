import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { CircleCheckBig, Play } from "lucide-react";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  completeCorrectiveTaskAction,
  CORRECTIVE_TASKS_PATH,
  listEmployeeChoicesQuery,
  startCorrectiveTaskAction,
  type CorrectiveTaskLine,
} from "@/features/operations/services/corrective-tasks";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";

import { useQualityDates } from "../inspections/quality-format";

/** Which dialog is open, and for which task. */
export type TaskDialog = { kind: "start" | "complete"; task: CorrectiveTaskLine } | null;

/**
 * The two small dialogs of a corrective task's row: «بدء» (who is responsible
 * takes it on) and «إنجاز» (what was done). Cancelling asks only for the
 * reason, in the reason dialog.
 *
 * Closest academy component: attendance/_components/add-absence-dialog.tsx.
 */
export function CorrectiveTaskDialogs({ dialog, onClose }: { dialog: TaskDialog; onClose: () => void }) {
  return (
    <Dialog open={dialog !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        {dialog?.kind === "start" && <StartForm task={dialog.task} onClose={onClose} />}
        {dialog?.kind === "complete" && <CompleteForm task={dialog.task} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

/** What the task is, as the dialogs recall it: the site, the action, the due date. */
function TaskSummary({ task }: { task: CorrectiveTaskLine }) {
  const actionLabel = useCodeLabel("Options.CorrectiveAction");
  const t = useTranslations("CorrectiveTasks");
  const dates = useQualityDates();
  return (
    <div className="border-app space-y-1 rounded-xl border-border p-4">
      <p className="font-bold">
        <bdi>{task.site}</bdi> · {actionLabel(task.action)}
      </p>
      <p className="text-base text-muted-foreground">
        <bdi>{task.description}</bdi>
      </p>
      <p className="text-sm text-muted-foreground">
        {t("List.Columns.Due")}: <Ltr>{dates.short(task.dueDate)}</Ltr>
      </p>
    </div>
  );
}

/** The person responsible: the employees in post, supervisors first. */
function ResponsibleField({
  value,
  onChange,
  invalid,
}: {
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
}) {
  const t = useTranslations("CorrectiveTasks.Dialog");
  const employees = useQuery({
    queryKey: [...pathKey(CORRECTIVE_TASKS_PATH), "employees"],
    queryFn: () => listEmployeeChoicesQuery(undefined),
  });
  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor="task-responsible">{t("Responsible")}</FieldLabel>
      <Select value={value || undefined} onValueChange={onChange}>
        <SelectTrigger id="task-responsible" className="w-full" aria-invalid={invalid || undefined}>
          <SelectValue placeholder={t("ChooseResponsible")} />
        </SelectTrigger>
        <SelectContent>
          {(employees.data ?? []).map((employee) => (
            <SelectItem key={employee.id} value={employee.id}>
              <bdi>{staffName(employee)}</bdi>
              <Ltr className="text-muted-foreground">{employee.number}</Ltr>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {invalid && <FieldError>{t("Required")}</FieldError>}
    </Field>
  );
}

function StartForm({ task, onClose }: { task: CorrectiveTaskLine; onClose: () => void }) {
  const t = useTranslations("CorrectiveTasks.Dialog");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [responsible, setResponsible] = React.useState(task.assignee?.id ?? "");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  async function start(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (!responsible) return;
    setBusy(true);
    const result = await startCorrectiveTaskAction({ taskId: task.id, assignedToEmployeeId: responsible });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Started"));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Play className="size-6 text-progress" />
          {t("StartTitle")}
        </DialogTitle>
        <DialogDescription>{t("StartDescription")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={start} className="space-y-5" noValidate>
        <TaskSummary task={task} />
        <ResponsibleField value={responsible} onChange={setResponsible} invalid={tried && !responsible} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="success" loading={busy}>
            <Play />
            {t("StartSubmit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}

function CompleteForm({ task, onClose }: { task: CorrectiveTaskLine; onClose: () => void }) {
  const t = useTranslations("CorrectiveTasks.Dialog");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [responsible, setResponsible] = React.useState(task.assignee?.id ?? "");
  const [result, setResult] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const missingResult = result.trim() === "";
  const missingResponsible = !responsible;

  async function complete(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (missingResult || missingResponsible) return;
    setBusy(true);
    const answer = await completeCorrectiveTaskAction({
      taskId: task.id,
      resultNote: result,
      assignedToEmployeeId: responsible,
    });
    setBusy(false);
    if (!answer.success) {
      toast.error(errorMessage(answer.error, t("Failed")));
      return;
    }
    toast.success(t("Completed"));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CircleCheckBig className="size-6 text-success" />
          {t("CompleteTitle")}
        </DialogTitle>
        <DialogDescription>{t("CompleteDescription")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={complete} className="space-y-5" noValidate>
        <TaskSummary task={task} />
        <Field data-invalid={(tried && missingResult) || undefined}>
          <FieldLabel htmlFor="task-result">{t("Result")}</FieldLabel>
          <Textarea
            id="task-result"
            rows={3}
            maxLength={1000}
            value={result}
            onChange={(event) => setResult(event.target.value)}
            aria-invalid={(tried && missingResult) || undefined}
          />
          {tried && missingResult && <FieldError>{t("Required")}</FieldError>}
        </Field>
        <ResponsibleField value={responsible} onChange={setResponsible} invalid={tried && missingResponsible} />
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="success" loading={busy}>
            <CircleCheckBig />
            {t("CompleteSubmit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
