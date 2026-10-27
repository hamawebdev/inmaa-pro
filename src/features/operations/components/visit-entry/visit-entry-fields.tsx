import { Controller, type Control, type FieldPath } from "react-hook-form";

import { DateField, TimeField } from "@/components/pickers";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useErrorMessage } from "@/i18n/errors";
import { cn } from "@/lib/utils";

import type { ReturnedOrderValues } from "../../validators/returned-order";
import { RuleNotes } from "../rule-notes";

import type { EntryNote } from "./visit-entry-notes";

/**
 * The few kinds of field the visit page is made of, each with its label, its
 * error and the rule notes that concern it, laid out as the academy's forms
 * lay out a `Field`.
 */

type Values = ReturnedOrderValues;
type TextPath = Extract<
  FieldPath<Values>,
  | "returnedDate"
  | "problemDetails"
  | "incompleteReason"
  | "signoffAbsentReason"
  | "signoffName"
  | "signoffRole"
  | "signoffDate"
  | "signoffNotes"
  | "otherServiceText"
  | `workers.${number}.arrivedTime`
  | `workers.${number}.workStartTime`
  | `workers.${number}.workEndTime`
  | `workers.${number}.leftTime`
  | `workers.${number}.lateReason`
>;
type BooleanPath = Extract<
  FieldPath<Values>,
  | "signedOnPaper"
  | "workerSigned"
  | `workers.${number}.arrivalInitialled`
  | `workers.${number}.departureInitialled`
  | `checklist.${number}.done`
>;

/**
 * A line of text, a date or a clock time. A date or a time is the program's own picker (nothing changes until its
 * «تأكيد»), with «مسح»: each may be left empty on the order sheet.
 */
export function TextField({
  control,
  name,
  label,
  kind = "text",
  notes = [],
  disabled = false,
  multiline = false,
  className,
  children,
}: {
  control: Control<Values>;
  name: TextPath;
  label: string;
  kind?: "text" | "date" | "time";
  notes?: readonly EntryNote[];
  disabled?: boolean;
  multiline?: boolean;
  className?: string;
  /** Something that belongs under the field, before its notes: a tick box. */
  children?: React.ReactNode;
}) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field className={className} data-invalid={fieldState.invalid || undefined}>
          <FieldLabel htmlFor={name}>{label}</FieldLabel>
          {multiline ? (
            <Textarea
              id={name}
              {...field}
              value={field.value ?? ""}
              rows={3}
              disabled={disabled}
              aria-invalid={fieldState.invalid || undefined}
            />
          ) : kind === "date" ? (
            <DateField
              id={name}
              {...field}
              value={field.value ?? ""}
              clearable
              disabled={disabled}
              aria-invalid={fieldState.invalid || undefined}
              className="max-w-60"
            />
          ) : kind === "time" ? (
            <TimeField
              id={name}
              {...field}
              value={field.value ?? ""}
              clearable
              disabled={disabled}
              aria-invalid={fieldState.invalid || undefined}
              className="max-w-60"
            />
          ) : (
            <Input
              id={name}
              {...field}
              value={field.value ?? ""}
              disabled={disabled}
              aria-invalid={fieldState.invalid || undefined}
            />
          )}
          {children}
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
          <RuleNotes notes={notes} />
        </Field>
      )}
    />
  );
}

/** A tick box with its words beside it, as on the sheet. */
export function TickField({
  control,
  name,
  label,
  detail,
  disabled = false,
}: {
  control: Control<Values>;
  name: BooleanPath;
  label: React.ReactNode;
  /** A second, quieter line: the frequency of a task, what a floor needs today. */
  detail?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <label
          className={cn("flex min-w-0 cursor-pointer items-start gap-3", disabled && "cursor-not-allowed opacity-60")}
        >
          <Checkbox
            checked={field.value === true}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            onBlur={field.onBlur}
            disabled={disabled}
          />
          <span className="min-w-0 pt-1 text-base leading-snug">
            {label}
            {detail && <span className="block text-sm text-muted-foreground">{detail}</span>}
          </span>
        </label>
      )}
    />
  );
}

/** A read-only fact of the visit: its number, its date, its site. */
export function Fact({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <dt className="text-sm font-bold text-muted-foreground">{label}</dt>
      <dd className="mt-1 min-w-0 text-base font-semibold">{children}</dd>
    </div>
  );
}
