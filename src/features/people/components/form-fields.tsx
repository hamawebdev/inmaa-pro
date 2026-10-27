import { Controller, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { useTranslations } from "use-intl";

import { DateField as DatePicker } from "@/components/pickers";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useErrorMessage } from "@/i18n/errors";

/**
 * The labelled fields of People's forms, bound to react-hook-form: a text or
 * number box, a date, a choice from a list, a tick.
 *
 * Closest academy component: the fields of the employee form (employees/
 * _components/employee-form.tsx): label above, control, hint, the error in the
 * reader's language. A date is the program's own picker (no browser date
 * field: the developer, 2026-10-22); it reaches the form on «تأكيد».
 */

type Bound<T extends FieldValues> = {
  control: Control<T>;
  name: FieldPath<T>;
  label: string;
  /** Marks the label with a star. The validator is what requires it. */
  required?: boolean;
  description?: string;
  className?: string;
};

const starred = (label: string, required?: boolean) => (required ? `${label} *` : label);

export function TextField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  description,
  className,
  dir,
  inputMode,
  placeholder,
  disabled,
}: Bound<T> & {
  dir?: "ltr";
  inputMode?: "tel" | "numeric" | "decimal" | "email";
  placeholder?: string;
  disabled?: boolean;
}) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className}>
          <FieldLabel htmlFor={`field-${name}`}>{starred(label, required)}</FieldLabel>
          <Input
            id={`field-${name}`}
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

/** A date. It may be emptied («مسح») unless it is `required` or `clearable={false}`. */
export function DateField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  description,
  className,
  clearable = !required,
  min,
  max,
}: Bound<T> & { clearable?: boolean; min?: string; max?: string }) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className}>
          <FieldLabel htmlFor={`field-${name}`}>{starred(label, required)}</FieldLabel>
          <DatePicker
            id={`field-${name}`}
            {...field}
            value={(field.value as string | undefined) ?? ""}
            clearable={clearable}
            min={min || undefined}
            max={max || undefined}
            aria-invalid={fieldState.invalid}
          />
          {description && <FieldDescription>{description}</FieldDescription>}
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

export function ChoiceField<T extends FieldValues>({
  control,
  name,
  label,
  required,
  description,
  className,
  options,
  placeholder,
}: Bound<T> & { options: ReadonlyArray<{ value: string; label: string }>; placeholder?: string }) {
  const t = useTranslations("PeopleDialogs");
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className}>
          <FieldLabel>{starred(label, required)}</FieldLabel>
          <Select
            value={(field.value as string | undefined) ?? ""}
            onValueChange={field.onChange}
            disabled={options.length === 0}
          >
            <SelectTrigger aria-invalid={fieldState.invalid} aria-label={label}>
              <SelectValue placeholder={placeholder ?? t("Choose")} />
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

export function TickField<T extends FieldValues>({ control, name, label, className }: Bound<T>) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className={`flex min-h-[52px] items-center gap-3 ${className ?? ""}`}>
          <Checkbox
            id={`field-${name}`}
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
          />
          <Label htmlFor={`field-${name}`} className="font-normal">
            {label}
          </Label>
        </div>
      )}
    />
  );
}
