import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Save } from "lucide-react";
import { Controller, useForm, useWatch, type Control, type UseFormReturn } from "react-hook-form";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { PageActions } from "@/components/screen";
import { StatusChip } from "@/components/status-chip";
import { DateField, TimeField } from "@/components/pickers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ChoiceToggle, YesNoToggle } from "@/features/operations/components/choice-toggle";
import { Fact } from "@/features/operations/components/visit-entry/visit-entry-fields";
import { inspectionTotal } from "@/features/operations/rules/inspection-score";
import { listEmployeeChoicesQuery } from "@/features/operations/services/corrective-tasks";
import {
  INSPECTIONS_PATH,
  saveInspectionResultAction,
  type InspectionDetail,
  type InspectionPoint,
} from "@/features/operations/services/inspections";
import {
  INSPECTION_RESULT_ACTIONS,
  inspectionResultSchema,
  markOf,
  type InspectionResultValues,
} from "@/features/operations/validators/inspection";
import { QUALITY_LEVELS } from "@/features/operations/validators/option-codes";
import { useUnsavedChanges } from "@/hooks/use-unsaved-changes";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { staffName } from "@/lib/text/names";
import { cn } from "@/lib/utils";

import { qualityHref } from "../quality-views";
import { InspectionStatusChip } from "./inspection-bits";
import { useQualityDates } from "./quality-format";

/** The visit «none» and a supervisor not chosen: a Select item cannot carry an empty value. */
const NONE = "none";

type Values = InspectionResultValues;
type Person = { firstName: string; lastName: string; number: string };

/** The form's first values: what was typed, else the sheet as it went out (its day, its team, blank boxes). */
function formValuesOf(detail: InspectionDetail, today: string): Values {
  const { inspection } = detail;
  return {
    visitId: inspection.visitId ?? "",
    supervisorEmployeeId: inspection.supervisorEmployeeId ?? "",
    doneDate: inspection.doneDate ?? (inspection.plannedDate <= today ? inspection.plannedDate : today),
    doneAtTime: inspection.doneAtTime ?? "",
    marks: detail.points.map((point) => ({
      criterionCode: point.code,
      score: point.score === null ? "" : String(point.score),
      notApplicable: point.notApplicable,
      note: point.note ?? "",
    })),
    workers: detail.workers.map((worker) => ({
      workerId: worker.workerId,
      present: worker.present,
      remark: worker.remark ?? "",
    })),
    overallLevel: inspection.overallLevel,
    correctionNeeded: inspection.correctionNeeded,
    recommendedAction: inspection.recommendedAction,
    supervisorNotes: inspection.supervisorNotes ?? "",
    clientRemark: inspection.clientRemark ?? "",
  };
}

/** The score as the office will save it, worked out while it types: null until every point that applies has a mark. */
function totalOf(points: readonly InspectionPoint[], marks: Values["marks"]): number | null {
  return inspectionTotal(
    points.map((point, index) => {
      const mark = marks[index];
      return {
        criterionCode: point.code,
        weight: point.weight,
        score: mark && !mark.notApplicable ? markOf(mark.score) : null,
        notApplicable: mark?.notApplicable ?? false,
      };
    }),
  );
}

/**
 * The inspection page's form: the returned sheet typed in one pass, one card
 * per section of the paper in its order, one Save at the foot.
 *
 * Closest academy screen: the employee form
 * (employees/_components/employee-form.tsx): stacked cards of labelled
 * fields, Cancel and Save at the foot.
 */
export function InspectionForm({
  detail,
  today,
  readOnly = false,
}: {
  detail: InspectionDetail;
  today: string;
  /** A reader of the section, or a cancelled inspection: the sheet is shown, nothing is saved. */
  readOnly?: boolean;
}) {
  const t = useTranslations("Inspections.Form");
  const navigate = useNavigate();
  const errorMessage = useErrorMessage();
  const form = useForm<Values>({
    resolver: zodResolver(inspectionResultSchema),
    defaultValues: formValuesOf(detail, today),
    mode: "onBlur",
  });
  // With every default given, the watched values are always whole.
  const values = useWatch({ control: form.control }) as Values;
  const total = totalOf(detail.points, values.marks);
  const missing = detail.points.filter(
    (_, index) => !values.marks[index]?.notApplicable && markOf(values.marks[index]?.score ?? "") === null,
  ).length;
  useUnsavedChanges(form.formState.isDirty);

  const onSubmit = form.handleSubmit(
    async (submitted) => {
      const result = await saveInspectionResultAction({ inspectionId: detail.inspection.id, values: submitted });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      form.reset(submitted);
      const { total: saved, correctiveTask } = result.data;
      toast.success(correctiveTask?.created ? t("SavedWithTask", { total: saved }) : t("Saved", { total: saved }));
    },
    () => toast.error(t("FixMarkedFields")),
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      <fieldset disabled={readOnly} className="min-w-0 space-y-6">
        <DetailsCard detail={detail} form={form} today={today} />
        <MarksCard detail={detail} control={form.control} values={values} total={total} />
        <LevelCard control={form.control} />
        <WorkersCard detail={detail} control={form.control} values={values} />
        <CorrectionCard detail={detail} control={form.control} values={values} total={total} />
        <TextCard control={form.control} name="supervisorNotes" title={t("Cards.SupervisorNotes")} rows={3} />
        <TextCard control={form.control} name="clientRemark" title={t("Cards.ClientRemark")} rows={2} />
      </fieldset>

      <PageActions note={<SaveNote total={total} missing={missing} threshold={detail.threshold} />}>
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>
          {t("Cancel")}
        </Button>
        {!readOnly && (
          <Button type="submit" variant="success" loading={form.formState.isSubmitting}>
            <Save />
            {t("Save")}
          </Button>
        )}
      </PageActions>
    </form>
  );
}

// ── 1- بيانات التفتيش ───────────────────────────────────────────────────────

function DetailsCard({
  detail,
  form,
  today,
}: {
  detail: InspectionDetail;
  form: UseFormReturn<Values>;
  today: string;
}) {
  const t = useTranslations("Inspections.Form");
  const dates = useQualityDates();
  const divisionLabel = useCodeLabel("Options.Division");
  const errorMessage = useErrorMessage();
  const employees = useQuery({
    queryKey: [...pathKey(INSPECTIONS_PATH), "employees"],
    queryFn: () => listEmployeeChoicesQuery(undefined),
  });
  const { inspection, site, file } = detail;
  const where = [site.address, site.commune].filter(Boolean).join("، ");

  // The supervisor named on the inspection stays offered, whoever he is now.
  const supervisors = React.useMemo(() => {
    const list = (employees.data ?? []).map((employee) => ({ id: employee.id, name: staffName(employee) }));
    if (detail.supervisor && !list.some((person) => person.id === detail.supervisor?.id)) {
      list.unshift({ id: detail.supervisor.id, name: staffName(detail.supervisor) });
    }
    return list;
  }, [employees.data, detail.supervisor]);

  // A visit chosen brings its team: the lines already typed for one of its workers are kept.
  const chooseVisit = (next: string, onChange: (value: string) => void) => {
    onChange(next === NONE ? "" : next);
    const team = detail.visits.find((visit) => visit.id === next)?.team ?? [];
    const typed = form.getValues("workers");
    form.setValue(
      "workers",
      team.map(
        (member) =>
          typed.find((line) => line.workerId === member.workerId) ?? {
            workerId: member.workerId,
            present: null,
            remark: "",
          },
      ),
      { shouldDirty: true },
    );
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Cards.Details")}</CardTitle>
        <CardDescription>{t("Cards.DetailsHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <dl className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label={t("Fields.Number")}>
            <Ltr>{inspection.number}</Ltr>
          </Fact>
          <Fact label={t("Fields.PlannedDate")}>{dates.long(inspection.plannedDate)}</Fact>
          <Fact label={t("Fields.Status")}>
            <InspectionStatusChip status={inspection.status} plannedDate={inspection.plannedDate} today={today} />
          </Fact>
          <Fact label={t("Fields.Origin")}>{inspection.planned ? t("Fields.FromPlan") : t("Fields.ByHand")}</Fact>
          <Fact label={t("Fields.Site")} className="sm:col-span-2">
            <bdi>{site.label}</bdi>
            {where && (
              <span className="block font-normal text-muted-foreground">
                <bdi>{where}</bdi>
              </span>
            )}
          </Fact>
          <Fact label={t("Fields.File")}>
            <Ltr>{file.number}</Ltr>
            <span className="block font-normal text-muted-foreground">
              <bdi>{file.clientName}</bdi>
            </span>
          </Fact>
          <Fact label={t("Fields.Division")}>{divisionLabel(file.division)}</Fact>
        </dl>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Controller
            control={form.control}
            name="supervisorEmployeeId"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="inspection-supervisor">{t("Fields.Supervisor")}</FieldLabel>
                <Select value={field.value || undefined} onValueChange={field.onChange}>
                  <SelectTrigger id="inspection-supervisor" className="w-full">
                    <SelectValue placeholder={t("Fields.ChooseSupervisor")} />
                  </SelectTrigger>
                  <SelectContent>
                    {supervisors.map((person) => (
                      <SelectItem key={person.id} value={person.id}>
                        <bdi>{person.name}</bdi>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="visitId"
            render={({ field }) => (
              <Field>
                <FieldLabel htmlFor="inspection-visit">{t("Fields.Visit")}</FieldLabel>
                <Select value={field.value || NONE} onValueChange={(next) => chooseVisit(next, field.onChange)}>
                  <SelectTrigger id="inspection-visit" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NONE}>{t("Fields.NoVisit")}</SelectItem>
                    {detail.visits.map((visit) => (
                      <SelectItem key={visit.id} value={visit.id}>
                        <Ltr>{dates.short(visit.visitDate)}</Ltr>
                        <Ltr className="text-muted-foreground">{visit.number}</Ltr>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="doneDate"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="inspection-done-date">{t("Fields.DoneDate")}</FieldLabel>
                <DateField
                  id="inspection-done-date"
                  max={today}
                  {...field}
                  aria-invalid={fieldState.invalid || undefined}
                />
                <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
              </Field>
            )}
          />
          <Controller
            control={form.control}
            name="doneAtTime"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor="inspection-done-time">{t("Fields.DoneTime")}</FieldLabel>
                <TimeField
                  id="inspection-done-time"
                  clearable
                  {...field}
                  aria-invalid={fieldState.invalid || undefined}
                />
                <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
              </Field>
            )}
          />
        </div>
      </CardContent>
    </Card>
  );
}

// ── 2- عناصر التقييم ────────────────────────────────────────────────────────

function usePointLabel() {
  const locale = useLocale();
  return (point: InspectionPoint) =>
    locale === "fr" ? (point.labelFr ?? point.label) : locale === "en" ? (point.labelEn ?? point.label) : point.label;
}

const MARK_GRID =
  "grid items-center gap-x-4 gap-y-2 lg:grid-cols-[2rem_minmax(8rem,14rem)_6rem_minmax(7rem,auto)_minmax(0,1fr)]";

function MarksCard({
  detail,
  control,
  values,
  total,
}: {
  detail: InspectionDetail;
  control: Control<Values>;
  values: Values;
  total: number | null;
}) {
  const t = useTranslations("Inspections.Form");
  const errorMessage = useErrorMessage();
  const pointLabel = usePointLabel();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Cards.Marks")}</CardTitle>
        <CardDescription>{t("Cards.MarksHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div
          className={cn(
            MARK_GRID,
            "hidden border-b-2 border-border pb-2 text-sm font-bold text-muted-foreground lg:grid",
          )}
        >
          <span>{t("Fields.No")}</span>
          <span>{t("Fields.Point")}</span>
          <span>{t("Fields.Mark")}</span>
          <span>{t("Fields.NotApplicable")}</span>
          <span>{t("Fields.Note")}</span>
        </div>
        {detail.points.map((point, index) => {
          const notApplicable = values.marks[index]?.notApplicable === true;
          const label = pointLabel(point);
          return (
            <div key={point.code} className={cn(MARK_GRID, "border-b border-border pb-4 last:border-b-0")}>
              <Ltr className="font-bold text-muted-foreground">{index + 1}</Ltr>
              <span className="font-semibold">{label}</span>
              <Controller
                control={control}
                name={`marks.${index}.score`}
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid || undefined} className="gap-1">
                    <Input
                      {...field}
                      value={notApplicable ? "" : field.value}
                      type="number"
                      inputMode="numeric"
                      min={0}
                      max={10}
                      step={1}
                      dir="ltr"
                      disabled={notApplicable}
                      aria-label={`${label} — ${t("Fields.Mark")}`}
                      aria-invalid={fieldState.invalid || undefined}
                      className="w-24"
                    />
                    <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
                  </Field>
                )}
              />
              <Controller
                control={control}
                name={`marks.${index}.notApplicable`}
                render={({ field }) => (
                  <label className="flex cursor-pointer items-center gap-3">
                    <Checkbox
                      checked={field.value === true}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                      onBlur={field.onBlur}
                    />
                    <span className="text-base">{t("Fields.NotApplicable")}</span>
                  </label>
                )}
              />
              <Controller
                control={control}
                name={`marks.${index}.note`}
                render={({ field }) => (
                  <Input {...field} aria-label={`${label} — ${t("Fields.Note")}`} placeholder={t("Fields.Note")} />
                )}
              />
            </div>
          );
        })}
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3 rounded-xl bg-muted/60 px-4 py-3">
          <span className="font-bold">{t("Fields.Total")}</span>
          <Ltr className="text-2xl font-bold">{total === null ? "—" : `${total} / 100`}</Ltr>
          <ScoreChip total={total} threshold={detail.threshold} />
          <span className="text-sm text-muted-foreground">
            {t("Fields.ThresholdNote", { threshold: detail.threshold })}
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function ScoreChip({ total, threshold }: { total: number | null; threshold: number }) {
  const t = useTranslations("Inspections.Form");
  if (total === null) return <StatusChip tone="pending" label={t("Fields.TotalPending")} />;
  return total < threshold ? (
    <StatusChip tone="danger" label={t("Fields.Below", { threshold })} />
  ) : (
    <StatusChip tone="success" label={t("Fields.Above", { threshold })} />
  );
}

// ── 3- مستوى جودة العمل ─────────────────────────────────────────────────────

function LevelCard({ control }: { control: Control<Values> }) {
  const t = useTranslations("Inspections.Form");
  const levelLabel = useCodeLabel("Inspections.Levels");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Cards.Level")}</CardTitle>
        <CardDescription>{t("Cards.LevelHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <Controller
          control={control}
          name="overallLevel"
          render={({ field }) => (
            <ChoiceToggle
              value={field.value}
              onChange={field.onChange}
              options={QUALITY_LEVELS.map((level) => ({ value: level, label: levelLabel(level) }))}
              ariaLabel={t("Cards.Level")}
            />
          )}
        />
      </CardContent>
    </Card>
  );
}

// ── 4- ملاحظات حول العمال الحاضرين ──────────────────────────────────────────

function WorkersCard({
  detail,
  control,
  values,
}: {
  detail: InspectionDetail;
  control: Control<Values>;
  values: Values;
}) {
  const t = useTranslations("Inspections.Form");
  // Names of everyone the form may list: the workers typed before and the teams of the visits offered.
  const people = React.useMemo(() => {
    const map = new Map<string, Person>();
    for (const worker of detail.workers) map.set(worker.workerId, worker);
    for (const visit of detail.visits) for (const member of visit.team) map.set(member.workerId, member);
    return map;
  }, [detail]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Cards.Workers")}</CardTitle>
        <CardDescription>{t("Cards.WorkersHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {values.workers.length === 0 && <p className="text-base text-muted-foreground">{t("Fields.NoTeam")}</p>}
        {values.workers.map((line, index) => {
          const person = people.get(line.workerId);
          const name = person ? staffName(person) : "—";
          return (
            <div
              key={line.workerId}
              className="grid items-center gap-x-6 gap-y-3 border-b border-border pb-4 last:border-b-0 lg:grid-cols-[minmax(10rem,16rem)_auto_minmax(0,1fr)]"
            >
              <div className="min-w-0">
                <span className="block truncate font-bold" title={name}>
                  <bdi>{name}</bdi>
                </span>
                {person && <Ltr className="text-sm text-muted-foreground">{person.number}</Ltr>}
              </div>
              <Controller
                control={control}
                name={`workers.${index}.present`}
                render={({ field }) => (
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground">{t("Fields.Present")}</span>
                    <YesNoToggle
                      value={field.value}
                      onChange={field.onChange}
                      ariaLabel={`${name} — ${t("Fields.Present")}`}
                    />
                  </div>
                )}
              />
              <Controller
                control={control}
                name={`workers.${index}.remark`}
                render={({ field }) => (
                  <Input {...field} aria-label={`${name} — ${t("Fields.Remark")}`} placeholder={t("Fields.Remark")} />
                )}
              />
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── 5- الإجراء التصحيحي ─────────────────────────────────────────────────────

function CorrectionCard({
  detail,
  control,
  values,
  total,
}: {
  detail: InspectionDetail;
  control: Control<Values>;
  values: Values;
  total: number | null;
}) {
  const t = useTranslations("Inspections.Form");
  const actionLabel = useCodeLabel("Options.CorrectiveAction");
  const dates = useQualityDates();
  const task = detail.correctiveTask;
  const willMake = !task && ((total !== null && total < detail.threshold) || values.correctionNeeded === true);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Cards.Correction")}</CardTitle>
        <CardDescription>{t("Cards.CorrectionHint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_minmax(0,1fr)]">
          <Controller
            control={control}
            name="correctionNeeded"
            render={({ field }) => (
              <Field>
                <FieldLabel>{t("Fields.NeedsCorrection")}</FieldLabel>
                <YesNoToggle value={field.value} onChange={field.onChange} ariaLabel={t("Fields.NeedsCorrection")} />
              </Field>
            )}
          />
          <Controller
            control={control}
            name="recommendedAction"
            render={({ field }) => (
              <Field>
                <FieldLabel>{t("Fields.ProposedAction")}</FieldLabel>
                <ChoiceToggle
                  value={field.value}
                  onChange={field.onChange}
                  options={INSPECTION_RESULT_ACTIONS.map((code) => ({ value: code, label: actionLabel(code) }))}
                  ariaLabel={t("Fields.ProposedAction")}
                />
              </Field>
            )}
          />
        </div>
        {task ? (
          <div className="border-app flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border-border p-4">
            <p className="min-w-0 text-base">
              {t("TaskExists", { action: actionLabel(task.action) })}{" "}
              <Ltr className="font-bold">{dates.short(task.dueDate)}</Ltr>
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to={qualityHref("corrective")}>
                <ListChecks />
                {t("OpenTasks")}
              </Link>
            </Button>
          </div>
        ) : willMake ? (
          <p className="border-app rounded-xl border-warning-ink/35 bg-warning/15 p-4 text-base text-warning-ink">
            {t("TaskWillBeMade")}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}

// ── 6- ملاحظات المشرف, 7- ملاحظة المسؤول في الموقع ──────────────────────────

function TextCard({
  control,
  name,
  title,
  rows,
}: {
  control: Control<Values>;
  name: "supervisorNotes" | "clientRemark";
  title: string;
  rows: number;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <Controller
          control={control}
          name={name}
          render={({ field }) => <Textarea {...field} aria-label={title} rows={rows} maxLength={2000} />}
        />
      </CardContent>
    </Card>
  );
}

/** Beside the buttons: what is still blank, or the score that will be saved. */
function SaveNote({ total, missing, threshold }: { total: number | null; missing: number; threshold: number }) {
  const t = useTranslations("Inspections.Form");
  if (missing > 0) return <StatusChip tone="warning" label={t("MissingMarks", { count: missing })} />;
  return <ScoreChip total={total} threshold={threshold} />;
}
