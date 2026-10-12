import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Eye, Lock } from "lucide-react";
import { Controller, useForm, useWatch, type Control, type FieldPath, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCommunesQuery, listZonesQuery, PLACES_PATH } from "@/features/core/services/places";
import { isolate, useMay } from "@/features/people/components/may";
import { useSanctionGate } from "@/features/people/components/sanction-gate";
import { workerFormRowByKey, YES_NO } from "@/features/people/forms/worker-form";
import { WORKER_SCREEN_CARDS, type WorkerScreenCard } from "@/features/people/forms/worker-screen";
import { hiringTotal } from "@/features/people/rules/scores";
import { readWorkerRestrictedAction, type RestrictedPart } from "@/features/people/services/worker-reads";
import { registerWorkerAction, updateWorkerAction, workerIdentity } from "@/features/people/services/workers";
import {
  ABILITIES,
  HEALTH_CONDITIONS,
  HIRING_DECISIONS,
  MARITAL_STATUSES,
  PAY_BASES,
  PAY_PERIODS,
  SEXES,
  WEEKDAYS,
  WORKER_ROLES,
  type HealthCondition,
} from "@/features/people/validators/staff-codes";
import { scoresAsNumbers, workerFormSchema, type WorkerFormValues } from "@/features/people/validators/worker";
import { useErrorMessage } from "@/i18n/errors";
import type { Capability } from "@/lib/access/catalogue";
import { useRouter } from "@/lib/compat/navigation";
import { pathKey } from "@/lib/compat/revalidate";
import { WILAYAS } from "@/lib/geo/wilayas";
import { cn } from "@/lib/utils";

/**
 * The screen of his worker form: card by card in his order, then the
 * office-only card. It registers a new worker, and it is the same form on a
 * registered worker's file, to change.
 *
 * Closest academy screen: the employee form (pages/dashboard/employees/
 * _components/employee-form.tsx): stacked cards of labelled fields in two
 * columns, the required ones marked with a star, Cancel and Save at the foot.
 * What is new: his options as ticks and choices, a date of expiry beside each
 * document, and two restricted cards (health answers, the confidential score).
 *
 * On a registered worker's file the two restricted cards stay closed until
 * someone allowed asks to see them: each opening is a line in the log, and a
 * card left closed is not saved.
 *
 * Saving passes the suspended-or-penalised gate first (`useSanctionGate`): a
 * registration always, a change only when it touches who she is.
 *
 * The order of the cards and of the fields in them is data
 * (features/people/forms/worker-screen.ts), tested against his form. The labels
 * are his words in Arabic (tested), translated in French and English.
 */

type Mode =
  | {
      kind: "new";
      /** The manager's answer this registration came back with (a request resumed). */
      decisionId?: string | null;
    }
  | { kind: "edit"; id: string; number: string };

type Props = {
  mode: Mode;
  defaultValues: WorkerFormValues;
};

type Commune = { id: string; nameAr: string; nameFr: string | null };
type Zone = { id: string; name: string };
type Opened = Record<RestrictedPart, boolean>;

/** The wilaya whose communes «بلدية/ولاية إقامة» offers: the centre's. Another wilaya comes with Foundation's commune picker. */
const RESIDENCE_WILAYA = "04";

type FormControl = Control<WorkerFormValues>;
type Name = FieldPath<WorkerFormValues>;

const SPAN_BOTH = "sm:col-span-2";

/** What makes her who she is, for the check: a change to any of these is looked at like a registration. */
const identityKey = (values: WorkerFormValues) => JSON.stringify(workerIdentity(values));

export function WorkerForm({ mode, defaultValues }: Props) {
  const t = useTranslations("WorkerForm");
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [passGate, gateDialogs] = useSanctionGate();
  const form = useForm<WorkerFormValues>({ resolver: zodResolver(workerFormSchema), defaultValues });
  const { control, formState } = form;
  // A new worker's restricted cards are open, to fill. A registered worker's are opened on demand.
  const [opened, setOpened] = React.useState<Opened>({ HEALTH: mode.kind === "new", SCORE: mode.kind === "new" });

  const communes = useQuery({
    queryKey: [...pathKey(PLACES_PATH), "communes", RESIDENCE_WILAYA],
    queryFn: () => listCommunesQuery({ wilayaCode: RESIDENCE_WILAYA }),
  });
  const zones = useQuery({ queryKey: [...pathKey(PLACES_PATH), "zones"], queryFn: () => listZonesQuery(undefined) });

  const open = async (part: RestrictedPart) => {
    if (mode.kind !== "edit") return;
    const result = await readWorkerRestrictedAction({ id: mode.id, part });
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Restricted.OpenFailed")));
      return;
    }
    if (result.data.health) {
      form.setValue("healthConditions", result.data.health.healthConditions);
      form.setValue("healthOtherText", result.data.health.healthOtherText);
    }
    if (result.data.score) {
      form.setValue("hiringScores", result.data.score.hiringScores);
      form.setValue("hiringTotal", result.data.score.hiringTotal);
    }
    setOpened((current) => ({ ...current, [part]: true }));
  };

  const onSubmit = async (values: WorkerFormValues) => {
    if (mode.kind === "edit") {
      const passage =
        identityKey(values) === identityKey(defaultValues)
          ? { notTheSamePerson: false, decisionId: null }
          : await passGate({
              context: "IDENTITY_CHANGE",
              subjectKind: "WORKER",
              subjectId: mode.id,
              identity: workerIdentity(values),
              ignoreOwnRecord: true,
            });
      if (!passage) return;
      const result = await updateWorkerAction({
        id: mode.id,
        values,
        opened: { health: opened.HEALTH, score: opened.SCORE },
        ...passage,
      });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("Actions.SaveFailed")));
        return;
      }
      toast.success(t("Actions.Saved"));
      form.reset(values);
      return;
    }

    const passage = await passGate({
      context: "WORKER_REGISTRATION",
      subjectKind: "WORKER",
      identity: workerIdentity(values),
      decisionId: mode.decisionId,
      draftPayload: values,
      resumeRoute: "/dashboard/workers/new",
    });
    if (!passage) return;
    const result = await registerWorkerAction({ ...values, ...passage });
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Actions.SaveFailed")));
      return;
    }
    toast.success(t("Actions.Registered", { number: isolate(result.data.number) }));
    router.push(`/dashboard/workers/${result.data.id}`);
  };

  // Somebody who reads the section without keeping the files sees the form, and changes nothing.
  const readOnly = !useMay("staff.write");

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6" noValidate>
      <fieldset disabled={readOnly} className="m-0 min-w-0 space-y-6 border-0 p-0">
        {WORKER_SCREEN_CARDS.map((card) => (
          <ScreenCard
            key={card.id}
            card={card}
            opened={card.restricted ? opened[card.restricted] : true}
            onOpen={card.restricted ? () => open(card.restricted as RestrictedPart) : undefined}
          >
            {card.rows.map((key) => (
              <RowField
                key={key}
                rowKey={key}
                control={control}
                mode={mode}
                communes={communes.data ?? []}
                form={form}
              />
            ))}
          </ScreenCard>
        ))}

        <OfficeCard control={control} zones={zones.data ?? []} />
      </fieldset>

      <div
        className={cn(
          "flex flex-col-reverse items-stretch justify-end gap-3 sm:flex-row sm:items-center",
          readOnly && "hidden",
        )}
      >
        {mode.kind === "new" && (
          <Button type="button" variant="outline" onClick={() => router.back()}>
            {t("Actions.Cancel")}
          </Button>
        )}
        <Button type="submit" variant={mode.kind === "new" ? "default" : "success"} disabled={formState.isSubmitting}>
          {formState.isSubmitting ? t("Actions.Saving") : mode.kind === "new" ? t("Actions.Create") : t("Actions.Save")}
        </Button>
      </div>
      {gateDialogs}
    </form>
  );
}

/** Who may fill each restricted card: the capability that reads it. */
const RESTRICTED_CAPABILITY: Record<NonNullable<WorkerScreenCard["restricted"]>, Capability> = {
  HEALTH: "staff.health.read",
  SCORE: "staff.hiringScore.read",
};

/**
 * A card of his form: titled by his heading or by his label of the list it
 * holds. A restricted card says so; it is locked for an account that may not
 * read it, and on a registered worker's file it stays closed until asked for.
 */
function ScreenCard({
  card,
  opened,
  onOpen,
  children,
}: {
  card: WorkerScreenCard;
  opened: boolean;
  onOpen?: () => void;
  children: React.ReactNode;
}) {
  const t = useTranslations("WorkerForm");
  const titleKey = card.heading ?? (card.titledByFirstRow ? card.rows[0] : undefined);
  const holdsIt = useMay(RESTRICTED_CAPABILITY[card.restricted ?? "HEALTH"]);
  const locked = card.restricted !== undefined && !holdsIt;
  return (
    <Card id={`worker-card-${card.id}`}>
      {titleKey && (
        <CardHeader>
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-base">{t(`Labels.${titleKey}`)}</CardTitle>
            {card.restricted && <StatusChip tone="pending" icon={Lock} label={t("Restricted.Badge")} />}
          </div>
          {card.restricted && (
            <CardDescription>
              {t(`Restricted.${card.restricted}`)} {locked && t("Restricted.Locked")}
            </CardDescription>
          )}
        </CardHeader>
      )}
      <CardContent>
        {opened ? (
          <fieldset disabled={locked} className="m-0 grid min-w-0 grid-cols-1 gap-4 border-0 p-0 sm:grid-cols-2">
            {children}
          </fieldset>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-base text-muted-foreground">{t("Restricted.Closed")}</p>
            {!locked && (
              <Button type="button" variant="outline" size="sm" onClick={onOpen}>
                <Eye />
                {t("Restricted.Open")}
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** One row of his form, as the field its answer needs. */
function RowField({
  rowKey,
  control,
  mode,
  communes,
  form,
}: {
  rowKey: string;
  control: FormControl;
  mode: Mode;
  communes: readonly Commune[];
  form: UseFormReturn<WorkerFormValues>;
}) {
  const t = useTranslations("WorkerForm");
  const tOptions = useTranslations("Options");
  const locale = useLocale();
  const label = t(`Labels.${rowKey}`);
  const mayDecide = useMay("hiring.decide");
  const row = workerFormRowByKey(rowKey);

  switch (rowKey) {
    case "regNumber":
      return (
        <>
          <Field>
            <FieldLabel>{label}</FieldLabel>
            <p className="flex min-h-[52px] items-center rounded-md border border-dashed px-4 text-muted-foreground">
              {mode.kind === "edit" ? <Ltr className="text-foreground">{mode.number}</Ltr> : t("Fields.numberOnSave")}
            </p>
          </Field>
          <ChoiceField
            control={control}
            name="sex"
            label={t("Fields.sex")}
            description={t("Fields.sexHint")}
            options={SEXES.map((code) => ({ value: code, label: tOptions(`Sex.${code}`) }))}
          />
        </>
      );
    case "registrationDate":
    case "birthDate":
    case "issuedDate":
      return (
        <DateField control={control} name={rowKey as Name} label={rowKey === "birthDate" ? `${label} *` : label} />
      );
    case "fullName":
      return (
        <Field className={SPAN_BOTH}>
          <FieldLabel>{label} *</FieldLabel>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField control={control} name="lastName" label={t("Fields.lastName")} />
            <TextField control={control} name="firstName" label={t("Fields.firstName")} />
          </div>
        </Field>
      );
    case "fullNameLatin":
      return <TextField control={control} name="fullNameLatin" label={label} dir="ltr" />;
    case "birthPlace":
      return (
        <Field>
          <FieldLabel>{label}</FieldLabel>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <TextField control={control} name="birthPlace" label={t("Fields.birthCommune")} />
            <ChoiceField
              control={control}
              name="birthWilayaCode"
              label={t("Fields.birthWilaya")}
              options={WILAYAS.map((w) => ({
                value: w.code,
                label: `${w.code} ${locale === "ar" ? w.nameAr : w.nameFr}`,
              }))}
            />
          </div>
        </Field>
      );
    case "residence":
      return (
        <ChoiceField
          control={control}
          name="residenceCommuneId"
          label={label}
          options={communes.map((c) => ({ value: c.id, label: locale === "ar" ? c.nameAr : (c.nameFr ?? c.nameAr) }))}
        />
      );
    case "maritalStatus":
      return (
        <ChoiceField
          control={control}
          name="maritalStatus"
          label={label}
          options={MARITAL_STATUSES.map((code) => ({ value: code, label: t(`MaritalStatuses.${code}`) }))}
        />
      );
    case "phone":
    case "emergencyPhone":
      return (
        <TextField
          control={control}
          name={rowKey as Name}
          label={rowKey === "phone" ? `${label} *` : label}
          dir="ltr"
          inputMode="tel"
          placeholder={t("Placeholders.Phone")}
        />
      );
    case "workedInFieldBefore":
      return (
        <RadioField
          control={control}
          name="workedInFieldBefore"
          label={label}
          options={YES_NO.map((code) => ({ value: code, label: tOptions(`YesNo.${code}`) }))}
          inline
        />
      );
    case "previousEmployer":
      return <PreviousEmployerField control={control} label={label} />;
    case "abilities":
      return (
        <CheckGroup
          control={control}
          name="abilities"
          label={label}
          options={ABILITIES.map((code) => ({ value: code, label: tOptions(`Ability.${code}`) }))}
        />
      );
    case "availableDays":
      return (
        <CheckGroup
          control={control}
          name="availableDays"
          label={label}
          options={WEEKDAYS.map((code) => ({ value: code, label: tOptions(`Weekday.${code}`) }))}
        />
      );
    case "healthConditions":
      return <HealthField control={control} />;
    case "documentsDelivered":
      return <DocumentsField control={control} />;
    case "hiringTotal":
      return <TotalField control={control} form={form} label={label} />;
    case "hiringDecision":
      return (
        <RadioField
          control={control}
          name="hiringDecision"
          label={label}
          options={HIRING_DECISIONS.map((code) => ({ value: code, label: t(`Decisions.${code}`) }))}
          // The card is titled with this label already.
          hideLabel
          disabled={!mayDecide}
          description={mayDecide ? undefined : t("Fields.decisionLocked")}
        />
      );
    default:
      if (row.answer === "score") return <ScoreField control={control} form={form} name={rowKey} />;
      return <TextField control={control} name={rowKey as Name} label={label} />;
  }
}

function TextField({
  control,
  name,
  label,
  dir,
  inputMode,
  placeholder,
  description,
  disabled,
  className,
}: {
  control: FormControl;
  name: Name;
  label: string;
  dir?: "ltr";
  inputMode?: "tel" | "numeric" | "decimal";
  placeholder?: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className}>
          <FieldLabel htmlFor={`worker-${name}`}>{label}</FieldLabel>
          <Input
            id={`worker-${name}`}
            {...field}
            value={(field.value as string | undefined) ?? ""}
            dir={dir}
            inputMode={inputMode}
            placeholder={placeholder}
            disabled={disabled}
            aria-invalid={fieldState.invalid}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

function DateField({ control, name, label }: { control: FormControl; name: Name; label: string }) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel htmlFor={`worker-${name}`}>{label}</FieldLabel>
          <Input
            id={`worker-${name}`}
            type="date"
            dir="ltr"
            {...field}
            value={(field.value as string | undefined) ?? ""}
            aria-invalid={fieldState.invalid}
          />
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

function ChoiceField({
  control,
  name,
  label,
  description,
  options,
  placeholder,
  disabled,
}: {
  control: FormControl;
  name: Name;
  label: string;
  description?: string;
  options: readonly { value: string; label: string }[];
  placeholder?: string;
  disabled?: boolean;
}) {
  const t = useTranslations("WorkerForm");
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel>{label}</FieldLabel>
          <Select
            value={(field.value as string | undefined) ?? ""}
            onValueChange={field.onChange}
            disabled={disabled || options.length === 0}
          >
            <SelectTrigger aria-invalid={fieldState.invalid}>
              <SelectValue placeholder={placeholder ?? t("Placeholders.Choose")} />
            </SelectTrigger>
            <SelectContent>
              {options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

function RadioField({
  control,
  name,
  label,
  options,
  inline = false,
  hideLabel = false,
  disabled,
  description,
}: {
  control: FormControl;
  name: Name;
  label: string;
  options: readonly { value: string; label: string }[];
  inline?: boolean;
  /** For screen readers only, when the card's title already says it. */
  hideLabel?: boolean;
  disabled?: boolean;
  description?: string;
}) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel className={cn(hideLabel && "sr-only")}>{label}</FieldLabel>
          <RadioGroup
            value={(field.value as string | undefined) ?? ""}
            onValueChange={field.onChange}
            disabled={disabled}
            className={cn("min-h-[52px] gap-x-8 gap-y-3", inline ? "flex flex-wrap items-center" : "grid")}
          >
            {options.map((option) => (
              <div key={option.value} className="flex items-center gap-3">
                <RadioGroupItem value={option.value} id={`worker-${name}-${option.value}`} />
                <Label htmlFor={`worker-${name}-${option.value}`} className="font-normal">
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

/** His ticks, one box per option, in his order. */
function CheckGroup({
  control,
  name,
  label,
  options,
  onToggle,
}: {
  control: FormControl;
  name: "abilities" | "availableDays" | "healthConditions";
  label?: string;
  options: readonly { value: string; label: string }[];
  /** The list after a tick, when one tick changes others. */
  onToggle?: (current: string[], value: string, checked: boolean) => string[];
}) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => {
        const current = (field.value ?? []) as string[];
        const toggle = (value: string, checked: boolean) =>
          onToggle
            ? onToggle(current, value, checked)
            : checked
              ? options.map((o) => o.value).filter((code) => code === value || current.includes(code))
              : current.filter((code) => code !== value);
        return (
          <Field className={SPAN_BOTH}>
            {label && <FieldLabel>{label}</FieldLabel>}
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {options.map((option) => (
                <div key={option.value} className="flex items-center gap-3">
                  <Checkbox
                    id={`worker-${name}-${option.value}`}
                    checked={current.includes(option.value)}
                    onCheckedChange={(checked) => field.onChange(toggle(option.value, checked === true))}
                  />
                  <Label htmlFor={`worker-${name}-${option.value}`} className="font-normal">
                    {option.label}
                  </Label>
                </div>
              ))}
            </div>
            <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
          </Field>
        );
      }}
    />
  );
}

/** «اسم المؤسسة»: asked after «نعم». */
function PreviousEmployerField({ control, label }: { control: FormControl; label: string }) {
  const worked = useWatch({ control, name: "workedInFieldBefore" });
  return <TextField control={control} name="previousEmployer" label={label} disabled={worked !== "YES"} />;
}

/** «هل تعاني من»: «لا يوجد» stands alone, «أخرى» comes with its words. */
function HealthField({ control }: { control: FormControl }) {
  const t = useTranslations("WorkerForm");
  const ticked = useWatch({ control, name: "healthConditions" });
  return (
    <>
      <CheckGroup
        control={control}
        name="healthConditions"
        options={HEALTH_CONDITIONS.map((code) => ({ value: code, label: t(`HealthConditions.${code}`) }))}
        onToggle={(current, value, checked) => {
          if (!checked) return current.filter((code) => code !== value);
          if (value === "NONE") return ["NONE"];
          return HEALTH_CONDITIONS.filter(
            (code) => code !== "NONE" && (code === value || current.includes(code)),
          ) as HealthCondition[];
        }}
      />
      <TextField
        control={control}
        name="healthOtherText"
        label={`${t("HealthConditions.OTHER")}: ${t("Fields.otherIllness")}`}
        disabled={!ticked.includes("OTHER")}
      />
    </>
  );
}

/** «الوثائق المسلمة»: his ticks, each with the date it expires. */
function DocumentsField({ control }: { control: FormControl }) {
  const t = useTranslations("WorkerForm");
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name="documents"
      render={({ field, fieldState }) => (
        <div className={cn(SPAN_BOTH, "grid gap-3")}>
          <div className="hidden grid-cols-[minmax(0,1fr)_14rem] gap-4 text-sm text-muted-foreground sm:grid">
            <span />
            <span>{t("Fields.expiryDate")}</span>
          </div>
          {field.value.map((document, index) => (
            <div key={document.type} className="grid items-center gap-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:gap-4">
              <div className="flex items-center gap-3">
                <Checkbox
                  id={`worker-document-${document.type}`}
                  checked={document.delivered}
                  onCheckedChange={(checked) =>
                    field.onChange(
                      field.value.map((d, i) =>
                        i === index
                          ? { ...d, delivered: checked === true, expiryDate: checked ? d.expiryDate : "" }
                          : d,
                      ),
                    )
                  }
                />
                <Label htmlFor={`worker-document-${document.type}`} className="font-normal">
                  {t(`Documents.${document.type}`)}
                </Label>
              </div>
              <Input
                type="date"
                dir="ltr"
                aria-label={`${t(`Documents.${document.type}`)}: ${t("Fields.expiryDate")}`}
                value={document.expiryDate}
                disabled={!document.delivered}
                onChange={(event) =>
                  field.onChange(
                    field.value.map((d, i) => (i === index ? { ...d, expiryDate: event.target.value } : d)),
                  )
                }
              />
            </div>
          ))}
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </div>
      )}
    />
  );
}

/** «المجموع: ……/100»: the sum of the criteria, or typed alone when none is scored. */
function TotalField({
  control,
  form,
  label,
}: {
  control: FormControl;
  form: UseFormReturn<WorkerFormValues>;
  label: string;
}) {
  const t = useTranslations("WorkerForm");
  const errorMessage = useErrorMessage();
  const scores = useWatch({ control, name: "hiringScores" });
  const computed = hiringTotal(safeScores(scores));
  return (
    <Controller
      control={control}
      name="hiringTotal"
      render={({ field, fieldState }) => (
        <Field className={SPAN_BOTH}>
          <FieldLabel htmlFor="worker-hiringTotal">{label}</FieldLabel>
          <div className="flex items-center gap-3">
            <Input
              id="worker-hiringTotal"
              className="w-28"
              dir="ltr"
              inputMode="numeric"
              {...field}
              value={computed.total !== null ? String(computed.total) : field.value}
              disabled={computed.total !== null}
              onChange={(event) => {
                field.onChange(event.target.value);
                form.clearErrors("hiringTotal");
              }}
              aria-invalid={fieldState.invalid}
            />
            <Ltr className="text-muted-foreground">/ 100</Ltr>
          </div>
          <FieldDescription>
            {computed.total !== null ? t("Fields.totalComputed") : t("Fields.totalAlone")}
          </FieldDescription>
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

/** The scores as numbers, ignoring what is not yet a valid score (the validator says so). */
function safeScores(scores: WorkerFormValues["hiringScores"]) {
  return Object.fromEntries(
    Object.entries(scoresAsNumbers(scores)).filter(([, value]) => Number.isInteger(value) && value >= 0 && value <= 10),
  );
}

/** One criterion of the confidential evaluation, with the number Word prints before it. */
function ScoreField({
  control,
  form,
  name,
}: {
  control: FormControl;
  form: UseFormReturn<WorkerFormValues>;
  name: string;
}) {
  const t = useTranslations("WorkerForm");
  const errorMessage = useErrorMessage();
  const row = workerFormRowByKey(name);
  const path = `hiringScores.${name}` as Name;
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <Field orientation="horizontal" className="items-center justify-between gap-4">
          <FieldLabel htmlFor={`worker-${name}`} className="font-normal">
            <Ltr className="text-muted-foreground">{row.number}</Ltr> {t(`Labels.${name}`)}
          </FieldLabel>
          <Input
            id={`worker-${name}`}
            className="w-24 shrink-0"
            dir="ltr"
            inputMode="numeric"
            placeholder={t("Fields.scoreHint")}
            {...field}
            value={(field.value as string | undefined) ?? ""}
            onChange={(event) => {
              field.onChange(event.target.value);
              // A total typed alone gives way to the criteria as soon as one is scored.
              if (form.getValues("hiringTotal") !== "") form.setValue("hiringTotal", "");
            }}
            aria-invalid={fieldState.invalid}
          />
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

/** «للاستخدام الإداري»: what the plan's features need and his form does not ask. Not printed. */
function OfficeCard({ control, zones }: { control: FormControl; zones: readonly Zone[] }) {
  const t = useTranslations("WorkerForm");
  const sex = useWatch({ control, name: "sex" });
  const canCollect = useWatch({ control, name: "canCollectCash" });
  const declared = useWatch({ control, name: "cnasDeclared" });
  const tOptions = useTranslations("Options");
  const roles = sex === "FEMALE" ? "WorkerRoleFeminine" : "WorkerRole";
  return (
    <Card id="worker-card-office">
      <CardHeader>
        <CardTitle className="text-base">{t("Office.Title")}</CardTitle>
        <CardDescription>{t("Office.Description")}</CardDescription>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField
          control={control}
          name="nationalIdNumber"
          label={t("Fields.nationalIdNumber")}
          description={t("Fields.nationalIdHint")}
          dir="ltr"
          inputMode="numeric"
        />
        <ChoiceField
          control={control}
          name="zoneId"
          label={t("Fields.zone")}
          options={zones.map((zone) => ({ value: zone.id, label: zone.name }))}
          placeholder={zones.length === 0 ? t("Placeholders.NoZone") : undefined}
          description={t("Fields.zoneHint")}
        />
        <ChoiceField
          control={control}
          name="role"
          label={t("Fields.role")}
          options={WORKER_ROLES.map((code) => ({ value: code, label: tOptions(`${roles}.${code}`) }))}
        />
        <TextField
          control={control}
          name="weeklyCapacityHours"
          label={t("Fields.weeklyCapacity")}
          dir="ltr"
          inputMode="decimal"
        />
        <ChoiceField
          control={control}
          name="payBasis"
          label={t("Fields.payBasis")}
          options={PAY_BASES.map((code) => ({ value: code, label: t(`PayBases.${code}`) }))}
        />
        <TextField control={control} name="payRate" label={t("Fields.payRate")} dir="ltr" inputMode="decimal" />
        <ChoiceField
          control={control}
          name="payPeriod"
          label={t("Fields.payPeriod")}
          options={PAY_PERIODS.map((code) => ({ value: code, label: t(`PayPeriods.${code}`) }))}
        />
        <Controller
          control={control}
          name="canCollectCash"
          render={({ field }) => (
            <div className={cn(SPAN_BOTH, "flex items-center gap-3")}>
              <Checkbox
                id="worker-canCollectCash"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              <Label htmlFor="worker-canCollectCash" className="font-normal">
                {t("Fields.canCollectCash")}
              </Label>
            </div>
          )}
        />
        {canCollect && (
          <>
            <DateField control={control} name="collectAuthFrom" label={t("Fields.collectAuthFrom")} />
            <TextField control={control} name="collectAuthNote" label={t("Fields.collectAuthNote")} />
          </>
        )}
        <Controller
          control={control}
          name="cnasDeclared"
          render={({ field }) => (
            <div className="flex min-h-[52px] items-center gap-3">
              <Checkbox
                id="worker-cnasDeclared"
                checked={field.value}
                onCheckedChange={(checked) => field.onChange(checked === true)}
              />
              <Label htmlFor="worker-cnasDeclared" className="font-normal">
                {t("Fields.cnasDeclared")}
              </Label>
            </div>
          )}
        />
        {declared && (
          <TextField
            control={control}
            name="cnasNumber"
            label={t("Fields.cnasNumber")}
            dir="ltr"
            inputMode="numeric"
          />
        )}
      </CardContent>
    </Card>
  );
}
