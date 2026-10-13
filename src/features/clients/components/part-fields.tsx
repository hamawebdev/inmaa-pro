import * as React from "react";

import { Ltr } from "@/components/ltr";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { NUMBER_PLACES, shownNumber, typedNumber, type NumberKind } from "./number-text";

/**
 * The fields the parts of a file and the client card are built from: a label
 * over an input, as the academy's forms have them (employee-form.tsx), for the
 * values this program stores as whole numbers.
 */

export function NumberField({
  label,
  kind,
  value,
  onChange,
  disabled,
  suffix,
  hint,
  className,
}: {
  label: string;
  kind: NumberKind;
  value: number | null;
  onChange: (value: number | null) => void;
  disabled?: boolean;
  /** The unit, after the field: «دج», «%», «ساعة». */
  suffix?: string;
  hint?: string;
  className?: string;
}) {
  const id = React.useId();
  // What is being typed, until it is a number again; the stored value otherwise.
  const [draft, setDraft] = React.useState<string | null>(null);
  const invalid = draft !== null && typedNumber(kind, draft) === undefined;
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <div className="flex min-w-0 items-center gap-2">
        <Input
          id={id}
          dir="ltr"
          inputMode={NUMBER_PLACES[kind] === 0 ? "numeric" : "decimal"}
          className="min-w-0 text-end tabular-nums"
          value={draft ?? shownNumber(kind, value)}
          disabled={disabled}
          aria-invalid={invalid}
          onChange={(event) => {
            setDraft(event.target.value);
            const next = typedNumber(kind, event.target.value);
            if (next !== undefined) onChange(next);
          }}
          onBlur={() => {
            if (!invalid) setDraft(null);
          }}
        />
        {suffix && <span className="shrink-0 text-muted-foreground">{suffix}</span>}
      </div>
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

export function TextField({
  label,
  value,
  onChange,
  disabled,
  multiline,
  ltr,
  type = "text",
  hint,
  className,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  multiline?: boolean;
  /** A phone, a registration number: digits read left to right. */
  ltr?: boolean;
  type?: "text" | "date" | "time";
  hint?: string;
  className?: string;
  placeholder?: string;
}) {
  const id = React.useId();
  return (
    <Field className={className}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      {multiline ? (
        <Textarea
          id={id}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <Input
          id={id}
          type={type}
          dir={ltr ? "ltr" : undefined}
          className={cn(ltr && "text-end tabular-nums")}
          value={value}
          disabled={disabled}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

const NONE = "__none__";

export function ChoiceField<T extends string>({
  label,
  value,
  options,
  labelOf,
  onChange,
  disabled,
  emptyLabel,
  className,
  hint,
}: {
  label: string;
  value: T | null;
  options: readonly T[];
  labelOf: (code: T) => string;
  onChange: (value: T | null) => void;
  disabled?: boolean;
  /** Offers "nothing chosen" under this label. */
  emptyLabel?: string;
  className?: string;
  hint?: string;
}) {
  return (
    <Field className={className}>
      <FieldLabel>{label}</FieldLabel>
      <Select
        value={value ?? (emptyLabel ? NONE : "")}
        disabled={disabled}
        onValueChange={(next) => onChange(next === NONE || next === "" ? null : (next as T))}
      >
        <SelectTrigger aria-label={label}>
          <SelectValue placeholder={emptyLabel ?? ""} />
        </SelectTrigger>
        <SelectContent>
          {emptyLabel && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
          {options.map((code) => (
            <SelectItem key={code} value={code}>
              {labelOf(code)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hint && <FieldDescription>{hint}</FieldDescription>}
    </Field>
  );
}

/** A value the screen shows and nobody types: a label over it, as a field has. */
export function Fact({
  label,
  children,
  ltr,
  className,
}: {
  label: string;
  children: React.ReactNode;
  ltr?: boolean;
  className?: string;
}) {
  const empty = children === null || children === undefined || children === "";
  return (
    <div className={cn("min-w-0 space-y-1", className)}>
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="min-w-0 text-base font-medium break-words">
        {empty ? "—" : ltr ? <Ltr className="tabular-nums">{children}</Ltr> : children}
      </p>
    </div>
  );
}

/** The two-column grid of a card of fields. */
export function FieldGrid({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2", className)}>{children}</div>;
}
