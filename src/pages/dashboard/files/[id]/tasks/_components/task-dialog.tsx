import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { ListPlus, Save } from "lucide-react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { useTranslations } from "use-intl";
import type { z } from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { ChoiceToggle } from "@/features/operations/components/choice-toggle";
import {
  addCatalogTasksAction,
  saveFileTaskAction,
  type CatalogChoice,
  type FileTaskLine,
  type FileTasksView,
} from "@/features/operations/services/file-tasks";
import { fileTaskSchema, TASK_PRIORITIES } from "@/features/operations/validators/file-task";
import { TASK_FREQUENCIES, type TaskFrequency } from "@/features/operations/validators/option-codes";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { WEEKDAYS } from "@/lib/options";

import { placeName, placeOfValue, placeValue, WHOLE_SITE } from "./task-format";

/** What the dialog is opened for: a new task (at a place, or the whole site), or one to change. */
export type TaskDialogTarget = { mode: "new"; areaId: string | null } | { mode: "edit"; task: FileTaskLine };

/**
 * Adds tasks to the file, or changes one.
 *
 * A new task is picked from his list for the division (several at once, in
 * his order, grouped as he groups them) or typed. Either way it is for the
 * whole site or for one place. A typed task, and any task changed, has its
 * frequency and the day that goes with it, its priority and a note.
 *
 * Closest academy screen: the program dialog of the classes section
 * (edu-programs/_components/teacher-program-dialog.tsx) for the form, and the
 * expense dialog (expenses/_components/expense-form-dialog.tsx) for a form of
 * several fields in a dialog. The content is mounted only while it is open, so
 * each opening starts afresh.
 */
export function TaskDialog({
  fileId,
  view,
  target,
  onClose,
}: {
  fileId: string;
  view: FileTasksView;
  target: TaskDialogTarget | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={target !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-3xl">
        {target && <TaskForm fileId={fileId} view={view} target={target} onDone={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

type How = "catalog" | "typed";

const typedSchema = fileTaskSchema.omit({ areaId: true });
type TypedValues = z.infer<typeof typedSchema>;

function startingValues(task: FileTaskLine | null): TypedValues {
  return {
    label: task?.label ?? "",
    frequency: task?.frequency ?? "DAILY",
    dayOfWeek: task?.dayOfWeek ?? null,
    dayOfMonth: task?.dayOfMonth ?? null,
    specialDate: task?.specialDate ?? null,
    priority: task?.priority ?? null,
    note: task?.note ?? "",
  };
}

/** His lines a place does not have yet. */
const availableAt = (catalog: readonly CatalogChoice[], areaId: string | null) =>
  catalog.filter((entry) => !entry.usedAt.includes(areaId));

function TaskForm({
  fileId,
  view,
  target,
  onDone,
}: {
  fileId: string;
  view: FileTasksView;
  target: TaskDialogTarget;
  onDone: () => void;
}) {
  const t = useTranslations("FileTasks");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const editing = target.mode === "edit" ? target.task : null;
  const [areaId, setAreaId] = React.useState<string | null>(
    editing ? editing.areaId : target.mode === "new" ? target.areaId : null,
  );
  const [how, setHow] = React.useState<How>(
    editing || availableAt(view.catalog, areaId).length === 0 ? "typed" : "catalog",
  );
  const [chosen, setChosen] = React.useState<ReadonlySet<string>>(new Set());
  const [busy, setBusy] = React.useState(false);

  const form = useForm<TypedValues>({ resolver: zodResolver(typedSchema), defaultValues: startingValues(editing) });

  const choosePlace = (value: string) => {
    const next = placeOfValue(value);
    setAreaId(next);
    // A line the new place already has is no longer offered: it is no longer chosen either.
    const offered = new Set(availableAt(view.catalog, next).map((entry) => entry.code));
    setChosen((current) => new Set([...current].filter((code) => offered.has(code))));
  };

  const addChosen = async () => {
    setBusy(true);
    const result = await addCatalogTasksAction({ fileId, codes: [...chosen], areaId });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("TasksAdded", { count: result.data.added }));
    onDone();
  };

  const saveTyped = form.handleSubmit(async (values) => {
    setBusy(true);
    const result = await saveFileTaskAction({ fileId, id: editing?.id ?? null, areaId, ...values });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("TaskSaved"));
    onDone();
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{editing ? t("EditTaskTitle") : t("AddTask")}</DialogTitle>
        <DialogDescription>{t("TaskDialogHint")}</DialogDescription>
      </DialogHeader>

      <div className="grid gap-5 sm:grid-cols-2">
        {!editing && (
          <Field>
            <FieldLabel>{t("HowToAdd")}</FieldLabel>
            <ChoiceToggle<How>
              value={how}
              onChange={(next) => next && setHow(next)}
              ariaLabel={t("HowToAdd")}
              options={[
                { value: "catalog", label: t("FromTaskList") },
                { value: "typed", label: t("AnotherTask") },
              ]}
            />
          </Field>
        )}
        <Field className={editing ? "sm:col-span-2" : undefined}>
          <FieldLabel htmlFor="task-place">{t("Place")}</FieldLabel>
          <Select value={placeValue(areaId)} onValueChange={choosePlace}>
            <SelectTrigger id="task-place">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={WHOLE_SITE}>{t("WholeSite")}</SelectItem>
              {view.areas.map((area) => (
                <SelectItem key={area.id} value={area.id}>
                  {placeName(area)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      {how === "catalog" && !editing ? (
        <CatalogPicker
          catalog={availableAt(view.catalog, areaId)}
          chosen={chosen}
          onChange={setChosen}
          footer={
            <DialogFooter>
              <Button type="button" variant="outline" onClick={onDone}>
                {tCommon("Cancel")}
              </Button>
              <Button
                type="button"
                variant="add"
                loading={busy}
                disabled={chosen.size === 0}
                onClick={() => void addChosen()}
              >
                <ListPlus />
                {t("AddChosen", { count: chosen.size })}
              </Button>
            </DialogFooter>
          }
        />
      ) : (
        <form id="file-task-form" onSubmit={saveTyped} noValidate className="space-y-5">
          <TypedTaskFields form={form} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onDone}>
              {tCommon("Cancel")}
            </Button>
            <Button type="submit" variant="success" loading={busy}>
              <Save />
              {tCommon("Save")}
            </Button>
          </DialogFooter>
        </form>
      )}
    </>
  );
}

/** His lines for the division, by frequency in his order, then under his headings. */
function CatalogPicker({
  catalog,
  chosen,
  onChange,
  footer,
}: {
  catalog: readonly CatalogChoice[];
  chosen: ReadonlySet<string>;
  onChange: (next: ReadonlySet<string>) => void;
  footer: React.ReactNode;
}) {
  const t = useTranslations("FileTasks");
  const frequencyLabel = useCodeLabel("TaskFrequencies");
  const toggle = (code: string, on: boolean) => {
    const next = new Set(chosen);
    if (on) next.add(code);
    else next.delete(code);
    onChange(next);
  };

  return (
    <>
      {catalog.length === 0 ? (
        <p className="text-base text-muted-foreground">{t("CatalogEmpty")}</p>
      ) : (
        <div className="space-y-6">
          {TASK_FREQUENCIES.map((frequency) => {
            const entries = catalog.filter((entry) => entry.frequency === frequency);
            if (entries.length === 0) return null;
            return (
              <fieldset key={frequency} className="min-w-0 space-y-3">
                <legend className="mb-3 text-lg font-bold">{frequencyLabel(frequency)}</legend>
                {byHeading(entries).map(([heading, lines]) => (
                  <div key={heading ?? ""} className="min-w-0 space-y-2">
                    {heading && (
                      <p className="text-sm font-bold text-muted-foreground">
                        <bdi>{heading}</bdi>
                      </p>
                    )}
                    <div className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
                      {lines.map((entry) => (
                        <label
                          key={entry.code}
                          className="flex min-w-0 cursor-pointer items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent"
                        >
                          <Checkbox
                            checked={chosen.has(entry.code)}
                            onCheckedChange={(on) => toggle(entry.code, on === true)}
                          />
                          <span className="min-w-0">
                            <bdi className="font-semibold">{entry.label}</bdi>
                            {entry.usedAt.length > 0 && (
                              <span className="block text-sm text-muted-foreground">{t("CatalogElsewhere")}</span>
                            )}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </fieldset>
            );
          })}
        </div>
      )}
      {footer}
    </>
  );
}

function byHeading(entries: readonly CatalogChoice[]): [string | null, CatalogChoice[]][] {
  const groups = new Map<string | null, CatalogChoice[]>();
  for (const entry of entries) groups.set(entry.heading, [...(groups.get(entry.heading) ?? []), entry]);
  return [...groups];
}

const FIRST_OF_WEEK = "first";

/** A typed task: its words, how often, the day that goes with it, its priority, a note. */
function TypedTaskFields({ form }: { form: UseFormReturn<TypedValues> }) {
  const t = useTranslations("FileTasks");
  const errorMessage = useErrorMessage();
  const frequencyLabel = useCodeLabel("TaskFrequencies");
  const weekdayLabel = useCodeLabel("Options.Weekday");
  const { control } = form;
  const frequency = form.watch("frequency");

  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <Controller
        control={control}
        name="label"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
            <FieldLabel htmlFor="task-label">{t("Task")}</FieldLabel>
            <Input
              id="task-label"
              {...field}
              placeholder={t("TaskPlaceholder")}
              aria-invalid={fieldState.invalid}
              autoFocus
            />
            <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
          </Field>
        )}
      />

      <Controller
        control={control}
        name="frequency"
        render={({ field }) => (
          <Field className="sm:col-span-2">
            <FieldLabel>{t("Frequency")}</FieldLabel>
            <ChoiceToggle<TaskFrequency>
              value={field.value}
              onChange={(next) => {
                if (!next) return;
                field.onChange(next);
                // Only the day that goes with the frequency is kept: a hidden one must not block the save.
                if (next !== "WEEKLY") form.setValue("dayOfWeek", null);
                if (next !== "MONTHLY") form.setValue("dayOfMonth", null);
                if (next !== "SPECIAL") form.setValue("specialDate", null);
              }}
              ariaLabel={t("Frequency")}
              options={TASK_FREQUENCIES.map((code) => ({ value: code, label: frequencyLabel(code) }))}
            />
            <FieldDescription className="text-start">{t(`FrequencyHint.${field.value}`)}</FieldDescription>
          </Field>
        )}
      />

      {frequency === "WEEKLY" && (
        <Controller
          control={control}
          name="dayOfWeek"
          render={({ field }) => (
            <Field>
              <FieldLabel htmlFor="task-weekday">{t("Weekday")}</FieldLabel>
              <Select
                value={field.value === null ? FIRST_OF_WEEK : String(field.value)}
                onValueChange={(value) => field.onChange(value === FIRST_OF_WEEK ? null : Number(value))}
              >
                <SelectTrigger id="task-weekday">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FIRST_OF_WEEK}>{t("WeeklyFirst")}</SelectItem>
                  {WEEKDAYS.map((day, index) => (
                    <SelectItem key={day} value={String(index)}>
                      {weekdayLabel(day)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          )}
        />
      )}

      {frequency === "MONTHLY" && (
        <Controller
          control={control}
          name="dayOfMonth"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="task-day-of-month">{t("DayOfMonth")}</FieldLabel>
              <Input
                id="task-day-of-month"
                className="no-spinner w-32"
                type="number"
                inputMode="numeric"
                min={1}
                max={31}
                value={field.value ?? ""}
                onChange={(event) => field.onChange(event.target.value === "" ? null : Number(event.target.value))}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />
      )}

      {frequency === "SPECIAL" && (
        <Controller
          control={control}
          name="specialDate"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="task-date">{t("SpecialDate")}</FieldLabel>
              <Input
                id="task-date"
                type="date"
                value={field.value ?? ""}
                onChange={(event) => field.onChange(event.target.value === "" ? null : event.target.value)}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />
      )}

      <Controller
        control={control}
        name="priority"
        render={({ field }) => (
          <Field className={frequency === "DAILY" ? "sm:col-span-2" : undefined}>
            <FieldLabel>{t("Priority")}</FieldLabel>
            <ChoiceToggle<string>
              value={field.value === null ? null : String(field.value)}
              onChange={(next) => field.onChange(next === null ? null : Number(next))}
              ariaLabel={t("Priority")}
              options={TASK_PRIORITIES.map((rank) => ({ value: String(rank), label: t("PriorityOption", { rank }) }))}
            />
          </Field>
        )}
      />

      <Controller
        control={control}
        name="note"
        render={({ field, fieldState }) => (
          <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
            <FieldLabel htmlFor="task-note">{t("Note")}</FieldLabel>
            <Textarea id="task-note" {...field} value={field.value ?? ""} rows={2} aria-invalid={fieldState.invalid} />
            <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
          </Field>
        )}
      />
    </div>
  );
}
