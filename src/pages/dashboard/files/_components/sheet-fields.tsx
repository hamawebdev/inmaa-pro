import { useQuery } from "@tanstack/react-query";
import { Controller, type Control, type FieldPath } from "react-hook-form";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listCommunesQuery, PLACES_PATH } from "@/features/core/services/places";
import { freeSlot, optionCode, optionLabel, withoutTatweel } from "@/features/clients/forms/answers";
import { labelKeyOf, LIST_NAMESPACES } from "@/features/clients/forms/screen-labels";
import type { FormOption, FormRow } from "@/features/clients/forms/types";
import type { FieldKey } from "@/features/clients/forms/values";
import type { FileScreenState } from "@/features/clients/validators/file-screen";
import type { FileStatusTick, FormKind, OptionListName } from "@/features/clients/validators/option-lists";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";
import { WILAYAS } from "@/lib/geo/wilayas";
import { cn } from "@/lib/utils";

/**
 * One answer of his form on screen, as the field it needs: his label, his
 * options in his order, the dotted place beside them.
 *
 * In Arabic an option reads as his form prints it (a weekday is «الاثنين» as
 * on his client forms, «مسأجر» reads «مستأجر» as agreed); in French and
 * English it is the code's label.
 */

type FormControl = Control<FileScreenState>;
type Path = FieldPath<FileScreenState>;

const SPAN_BOTH = "sm:col-span-2";

/** The answers a file is not saved without. */
const REQUIRED_KEYS: ReadonlySet<FieldKey> = new Set(["clientName", "phone", "address", "commune"]);

const answerPath = (key: string) => `answers.${key}` as Path;

/**
 * The shared radio button marks its ticked state with a class that matches
 * nothing (`data-checked:`, where the library sets `data-state="checked"`), so
 * a ticked option looks like the others. Until the shared one is corrected, the
 * ticked state is named here.
 */
const RADIO_CHECKED = "data-[state=checked]:border-primary data-[state=checked]:bg-primary";

/** An option's words on screen: his in Arabic, the code's label otherwise. */
function useOptionText(list: OptionListName | undefined) {
  const t = useTranslations("FileForm");
  const locale = useLocale();
  const codeLabel = useCodeLabel(list ? LIST_NAMESPACES[list] : "FileOptions");
  return (option: FormOption, code: string | null) => {
    const his = withoutTatweel(optionLabel(option)).replace(/:$/, "").trim();
    // A bare blank line of his, ticked to write something else on it.
    if (his === "") return t("Fields.Other");
    if (locale === "ar" || code === null) return his;
    return codeLabel(code);
  };
}

function useRowLabel(kind: FormKind, row: FormRow): string {
  const t = useTranslations("FileForm");
  // A list of services has no label of its own on his form: its card's title says it.
  if (!row.label && row.key !== "registrationDate") return "";
  const label = t(`Labels.${labelKeyOf(kind, row.key!)}`);
  return REQUIRED_KEYS.has(row.key!) ? t("Required", { label }) : label;
}

function TextInput({
  control,
  path,
  label,
  type = "text",
  dir,
  inputMode,
  placeholder,
  description,
  className,
  disabled,
  hideLabel,
}: {
  control: FormControl;
  path: Path;
  label: string;
  type?: "text" | "date" | "time" | "tel";
  dir?: "ltr";
  inputMode?: "numeric" | "decimal" | "tel";
  placeholder?: string;
  description?: string;
  className?: string;
  disabled?: boolean;
  hideLabel?: boolean;
}) {
  const errorMessage = useErrorMessage();
  const id = `file-${path.replace(/\./g, "-")}`;
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <Field className={className}>
          <FieldLabel htmlFor={id} className={cn(hideLabel && "sr-only")}>
            {label}
          </FieldLabel>
          <Input
            id={id}
            type={type}
            dir={dir}
            inputMode={inputMode}
            placeholder={placeholder}
            disabled={disabled}
            name={field.name}
            ref={field.ref}
            onBlur={field.onBlur}
            value={typeof field.value === "string" ? field.value : ""}
            onChange={(event) => field.onChange(event.target.value)}
            aria-invalid={fieldState.invalid}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

/** A number with its unit beside it: «م2», «دج». */
function UnitInput({
  control,
  path,
  label,
  unit,
  inputMode,
}: {
  control: FormControl;
  path: Path;
  label: string;
  unit: string;
  inputMode: "numeric" | "decimal";
}) {
  const errorMessage = useErrorMessage();
  const id = `file-${path.replace(/\./g, "-")}`;
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => (
        <Field>
          <FieldLabel htmlFor={id}>{label}</FieldLabel>
          <div className="flex min-w-0 items-center gap-3">
            <Input
              id={id}
              inputMode={inputMode}
              className="tabular-nums"
              name={field.name}
              ref={field.ref}
              onBlur={field.onBlur}
              value={typeof field.value === "string" ? field.value : ""}
              onChange={(event) => field.onChange(event.target.value)}
              aria-invalid={fieldState.invalid}
            />
            <span className="shrink-0 text-base text-muted-foreground">{unit}</span>
          </div>
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

/** One of his options, or none: radio buttons in his order, and a way to clear them. */
function SingleChoice({
  control,
  path,
  label,
  row,
  className,
}: {
  control: FormControl;
  path: Path;
  label: string;
  row: FormRow;
  className?: string;
}) {
  const t = useTranslations("FileForm");
  const errorMessage = useErrorMessage();
  const optionText = useOptionText(row.list);
  const options = (row.options ?? []).filter((option) => !option.free);
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => {
        const value = typeof field.value === "string" ? field.value : "";
        return (
          <Field className={className}>
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <FieldLabel>{label}</FieldLabel>
              {value !== "" && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 text-sm font-normal text-muted-foreground"
                  onClick={() => field.onChange("")}
                >
                  {t("Clear")}
                </Button>
              )}
            </div>
            <RadioGroup
              value={value}
              onValueChange={field.onChange}
              aria-label={label}
              className="flex min-h-[52px] flex-wrap items-center gap-x-8 gap-y-3"
            >
              {options.map((option) => {
                const code = optionCode(row.list!, option);
                if (code === null) return null;
                const id = `file-${path.replace(/\./g, "-")}-${code}`;
                return (
                  <div key={code} className="flex items-center gap-3">
                    <RadioGroupItem value={code} id={id} className={RADIO_CHECKED} />
                    <Label htmlFor={id} className="font-normal">
                      {optionText(option, code)}
                    </Label>
                  </div>
                );
              })}
            </RadioGroup>
            <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
          </Field>
        );
      }}
    />
  );
}

/** Several of his options: a box for each, in his order; his blank lines as places to write. */
function SeveralChoices({
  control,
  row,
  label,
  className,
}: {
  control: FormControl;
  row: FormRow;
  label?: string;
  className?: string;
}) {
  const t = useTranslations("FileForm");
  const errorMessage = useErrorMessage();
  const optionText = useOptionText(row.list);
  const path = answerPath(row.key!);
  return (
    <Controller
      control={control}
      name={path}
      render={({ field, fieldState }) => {
        const ticked = Array.isArray(field.value) ? (field.value as string[]) : [];
        return (
          <Field className={cn(SPAN_BOTH, className)}>
            {label && <FieldLabel>{label}</FieldLabel>}
            <div className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
              {(row.options ?? []).map((option, index) => {
                if (option.free) {
                  const slot = freeSlot(row, index);
                  return (
                    <TextInput
                      key={`free-${index}`}
                      control={control}
                      path={`answers.${row.freeKey}.${slot}` as Path}
                      label={t("Fields.OtherService")}
                      placeholder={t("Fields.OtherService")}
                      hideLabel
                    />
                  );
                }
                const code = optionCode(row.list!, option);
                if (code === null) return null;
                const id = `file-${row.key}-${code}`;
                return (
                  <div key={code} className="flex min-h-[52px] items-center gap-3">
                    <Checkbox
                      id={id}
                      checked={ticked.includes(code)}
                      onCheckedChange={(checked) =>
                        field.onChange(checked === true ? [...ticked, code] : ticked.filter((item) => item !== code))
                      }
                    />
                    <Label htmlFor={id} className="font-normal">
                      {optionText(option, code)}
                    </Label>
                  </div>
                );
              })}
            </div>
            <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
          </Field>
        );
      }}
    />
  );
}

/** «البلدية / الولاية»: the commune as typed, offered from the list of the wilaya chosen. */
function PlaceField({ control, label, wilayaCode }: { control: FormControl; label: string; wilayaCode: string }) {
  const t = useTranslations("FileForm");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const communes = useQuery({
    queryKey: [...pathKey(PLACES_PATH), "communes", wilayaCode],
    queryFn: () => listCommunesQuery({ wilayaCode }),
    enabled: wilayaCode !== "",
  });
  const listId = `file-communes-${wilayaCode}`;
  return (
    <Field className={SPAN_BOTH}>
      <FieldLabel>{label}</FieldLabel>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Controller
          control={control}
          name={answerPath("commune")}
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel htmlFor="file-answers-commune" className="text-sm text-muted-foreground">
                {t("Fields.Commune")}
              </FieldLabel>
              <Input
                id="file-answers-commune"
                list={listId}
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={typeof field.value === "string" ? field.value : ""}
                onChange={(event) => field.onChange(event.target.value)}
                aria-invalid={fieldState.invalid}
              />
              <datalist id={listId}>
                {(communes.data ?? []).map((commune) => (
                  <option key={commune.id} value={commune.nameAr}>
                    {locale === "ar" ? undefined : (commune.nameFr ?? undefined)}
                  </option>
                ))}
              </datalist>
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />
        <Controller
          control={control}
          name={answerPath("wilaya")}
          render={({ field, fieldState }) => (
            <Field>
              <FieldLabel className="text-sm text-muted-foreground">{t("Fields.Wilaya")}</FieldLabel>
              <Select value={typeof field.value === "string" ? field.value : ""} onValueChange={field.onChange}>
                <SelectTrigger aria-invalid={fieldState.invalid} aria-label={t("Fields.Wilaya")}>
                  <SelectValue placeholder={t("Fields.ChooseWilaya")} />
                </SelectTrigger>
                <SelectContent>
                  {WILAYAS.map((wilaya) => (
                    <SelectItem key={wilaya.code} value={wilaya.code}>
                      <Ltr>{wilaya.code}</Ltr> {locale === "ar" ? wilaya.nameAr : wilaya.nameFr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />
      </div>
    </Field>
  );
}

/** «مدة التنفيذ»: a number and its unit, hours or days. */
function DurationField({ control, label }: { control: FormControl; label: string }) {
  const t = useTranslations("FileForm");
  const unitLabel = useCodeLabel("Options.DurationUnit");
  const errorMessage = useErrorMessage();
  return (
    <Field>
      <FieldLabel htmlFor="file-answers-executionDurationValue">{label}</FieldLabel>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
        <Controller
          control={control}
          name={answerPath("executionDurationValue")}
          render={({ field, fieldState }) => (
            <div className="min-w-0">
              <Input
                id="file-answers-executionDurationValue"
                inputMode="decimal"
                className="tabular-nums"
                name={field.name}
                ref={field.ref}
                onBlur={field.onBlur}
                value={typeof field.value === "string" ? field.value : ""}
                onChange={(event) => field.onChange(event.target.value)}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </div>
          )}
        />
        <Controller
          control={control}
          name={answerPath("executionDurationUnit")}
          render={({ field }) => (
            <Select value={typeof field.value === "string" ? field.value : ""} onValueChange={field.onChange}>
              <SelectTrigger aria-label={t("Fields.Unit")}>
                <SelectValue placeholder={t("Fields.Unit")} />
              </SelectTrigger>
              <SelectContent>
                {(["HOURS", "DAYS"] as const).map((unit) => (
                  <SelectItem key={unit} value={unit}>
                    {unitLabel(unit)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        />
      </div>
    </Field>
  );
}

/** «حالة الملف»: the program ticks it; the screen only shows it. */
export function StatusTicksField({ label, ticks }: { label: string; ticks: readonly FileStatusTick[] }) {
  const t = useTranslations("FileForm");
  const tickLabel = useCodeLabel("FileOptions.StatusTick");
  return (
    <Field className={SPAN_BOTH}>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex min-h-[52px] flex-wrap items-center gap-2">
        {ticks.map((tick) => (
          <StatusChip
            key={tick}
            tone={tick === "SUSPENDED" || tick === "PENALISED" ? "danger" : "info"}
            label={tickLabel(tick)}
          />
        ))}
      </div>
      <FieldDescription>{t("StatusTicksHint")}</FieldDescription>
    </Field>
  );
}

/** A value the program gives: shown, never typed. */
export function GivenValue({ label, value, ltr = true }: { label: string; value: string | null; ltr?: boolean }) {
  const t = useTranslations("FileForm");
  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      <p className="flex min-h-[52px] items-center rounded-lg border border-dashed px-4 text-muted-foreground">
        {value ? (
          ltr ? (
            <Ltr className="text-foreground">{value}</Ltr>
          ) : (
            <span className="text-foreground">{value}</span>
          )
        ) : (
          t("NumberOnSave")
        )}
      </p>
    </Field>
  );
}

const WIDE_KEYS: ReadonlySet<FieldKey> = new Set([
  "address",
  "commonName",
  "storagePlace",
  "paymentPlace",
  "issuedDate",
]);

/** One row of his form, as the field its answer needs. */
export function SheetRowField({
  kind,
  row,
  control,
  wilayaCode,
}: {
  kind: FormKind;
  row: FormRow;
  control: FormControl;
  /** The wilaya chosen, for the list of its communes. */
  wilayaCode: string;
}) {
  const t = useTranslations("FileForm");
  const tCommon = useTranslations("Common");
  const label = useRowLabel(kind, row);
  const key = row.key!;
  const path = answerPath(key);
  const options = row.options ?? [];

  const note = row.noteKey ? (
    <TextInput control={control} path={answerPath(row.noteKey)} label={`${label}: ${t("Fields.Note")}`} />
  ) : null;
  const other = row.otherKey ? (
    <TextInput control={control} path={answerPath(row.otherKey)} label={`${label}: ${t("Fields.Other")}`} />
  ) : null;

  switch (row.answer) {
    case "text":
      if (row.labelKey) {
        return (
          <Field className={SPAN_BOTH}>
            <FieldDescription>{t("Fields.ExtraHint")}</FieldDescription>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextInput control={control} path={answerPath(row.labelKey)} label={t("Fields.ExtraLabel")} />
              <TextInput control={control} path={path} label={t("Fields.ExtraValue")} />
            </div>
          </Field>
        );
      }
      return <TextInput control={control} path={path} label={label} className={cn(WIDE_KEYS.has(key) && SPAN_BOTH)} />;
    case "number":
      return <TextInput control={control} path={path} label={label} inputMode="numeric" />;
    case "area":
      return (
        <UnitInput
          control={control}
          path={path}
          label={label}
          unit={row.suffix?.replace(/\s/g, "") || "m²"}
          inputMode="decimal"
        />
      );
    case "money":
      return <UnitInput control={control} path={path} label={label} unit={tCommon("Currency")} inputMode="decimal" />;
    case "date":
      return (
        <TextInput
          control={control}
          path={path}
          label={label}
          type="date"
          dir="ltr"
          className={cn(WIDE_KEYS.has(key) && SPAN_BOTH)}
        />
      );
    case "time":
      return <TextInput control={control} path={path} label={label} type="time" dir="ltr" />;
    case "phone":
      return <TextInput control={control} path={path} label={label} type="tel" dir="ltr" inputMode="tel" />;
    case "place":
      return <PlaceField control={control} label={label} wilayaCode={wilayaCode} />;
    case "duration":
      return <DurationField control={control} label={label} />;
    case "single":
    case "yesNo": {
      const wide = options.filter((option) => !option.free).length > 3 || row.noteKey !== undefined;
      return (
        <>
          <SingleChoice control={control} path={path} label={label} row={row} className={cn(wide && SPAN_BOTH)} />
          {note}
          {other}
        </>
      );
    }
    case "several":
      return (
        <>
          <SeveralChoices control={control} row={row} label={row.label ? label : undefined} />
          {note}
          {other}
        </>
      );
    default:
      return null;
  }
}
