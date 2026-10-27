import * as React from "react";

import { useTranslations } from "use-intl";

import { DateField, TimeField } from "@/components/pickers";
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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * A short entry in a dialog: a time in or out, an absence, a leave, an
 * advance, a correction of hours. The fields are named by the caller, the
 * answer is their values as text; a dismissed dialog is never an answer.
 *
 *     const [ask, entryDialog] = useEntryDialog();
 *     const values = await ask({ title, confirmLabel, fields: [{ kind: "date", name: "date", label, required: true }] });
 *     if (!values) return;
 *
 * Closest academy component: the dialogs of its attendance family (a small
 * form, cancel and one action), opened the way `useConfirm` is.
 */

interface Base {
  name: string;
  label: string;
  required?: boolean;
  defaultValue?: string;
  /** Shown only while another field has one of these values. */
  when?: { field: string; in: readonly string[] };
}

export type EntryField =
  | (Base & { kind: "text" | "note" | "time" })
  /** A day. `notBefore` names the date field it may not precede (the end of a period): its calendar starts there. */
  | (Base & { kind: "date"; notBefore?: string })
  /** A number typed in digits: dinars, hours, minutes. `min` defaults to 0. */
  | (Base & { kind: "number"; step?: string; min?: string; suffix?: string })
  | (Base & { kind: "choice"; options: ReadonlyArray<{ value: string; label: string }> })
  /** "1" when ticked, "" when not. */
  | (Base & { kind: "tick" });

export interface EntryRequest {
  title: string;
  description?: React.ReactNode;
  fields: readonly EntryField[];
  confirmLabel: string;
  confirmTone?: "default" | "success" | "destructive";
}

export type EntryValues = Record<string, string>;

export function useEntryDialog(): [(request: EntryRequest) => Promise<EntryValues | null>, React.ReactNode] {
  const t = useTranslations("PeopleDialogs");
  const [request, setRequest] = React.useState<EntryRequest | null>(null);
  const [values, setValues] = React.useState<EntryValues>({});
  const [tried, setTried] = React.useState(false);
  const resolver = React.useRef<((answer: EntryValues | null) => void) | null>(null);

  const ask = React.useCallback((next: EntryRequest) => {
    resolver.current?.(null);
    setRequest(next);
    setTried(false);
    setValues(Object.fromEntries(next.fields.map((field) => [field.name, field.defaultValue ?? ""])));
    return new Promise<EntryValues | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = React.useCallback((answer: EntryValues | null) => {
    resolver.current?.(answer);
    resolver.current = null;
    setRequest(null);
  }, []);

  React.useEffect(() => () => resolver.current?.(null), []);

  const shown = (request?.fields ?? []).filter(
    (field) => !field.when || field.when.in.includes(values[field.when.field]),
  );
  const missing = shown.filter((field) => field.required && (values[field.name] ?? "").trim() === "");
  const set = (name: string, value: string) => setValues((current) => ({ ...current, [name]: value }));
  const confirm = () => {
    setTried(true);
    if (missing.length > 0) return;
    settle(Object.fromEntries(shown.map((field) => [field.name, (values[field.name] ?? "").trim()])));
  };

  const control = (field: EntryField) => {
    const id = `entry-field-${field.name}`;
    const value = values[field.name] ?? "";
    switch (field.kind) {
      case "choice":
        return (
          <Select value={value} onValueChange={(next) => set(field.name, next)}>
            <SelectTrigger id={id}>
              <SelectValue placeholder={t("Choose")} />
            </SelectTrigger>
            <SelectContent>
              {field.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        );
      case "note":
        return <Textarea id={id} rows={2} value={value} onChange={(event) => set(field.name, event.target.value)} />;
      case "number":
        return (
          <div className="flex items-center gap-2">
            <Input
              id={id}
              type="number"
              inputMode="decimal"
              dir="ltr"
              min={field.min ?? "0"}
              step={field.step ?? "1"}
              value={value}
              onChange={(event) => set(field.name, event.target.value)}
            />
            {field.suffix && <span className="shrink-0 text-sm text-muted-foreground">{field.suffix}</span>}
          </div>
        );
      case "tick":
        return null;
      case "date":
        return (
          <DateField
            id={id}
            value={value}
            min={(field.notBefore && values[field.notBefore]) || undefined}
            clearable={!field.required}
            onChange={(next) => set(field.name, next)}
          />
        );
      case "time":
        return (
          <TimeField id={id} value={value} clearable={!field.required} onChange={(next) => set(field.name, next)} />
        );
      case "text":
        return <Input id={id} value={value} onChange={(event) => set(field.name, event.target.value)} />;
    }
  };

  const dialog = (
    <Dialog open={request !== null} onOpenChange={(open) => !open && settle(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.description && <DialogDescription>{request.description}</DialogDescription>}
        </DialogHeader>
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            confirm();
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            {shown.map((field) =>
              field.kind === "tick" ? (
                <label key={field.name} className="flex items-center gap-2 text-sm font-medium sm:col-span-2">
                  <Checkbox
                    checked={values[field.name] === "1"}
                    onCheckedChange={(checked) => set(field.name, checked === true ? "1" : "")}
                  />
                  {field.label}
                </label>
              ) : (
                <Field
                  key={field.name}
                  data-invalid={tried && missing.includes(field)}
                  className={field.kind === "note" || field.kind === "text" ? "sm:col-span-2" : undefined}
                >
                  <FieldLabel htmlFor={`entry-field-${field.name}`}>{field.label}</FieldLabel>
                  {control(field)}
                  {tried && missing.includes(field) && <FieldError>{t("Required")}</FieldError>}
                </Field>
              ),
            )}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => settle(null)}>
              {t("Cancel")}
            </Button>
            <Button type="submit" variant={request?.confirmTone ?? "success"}>
              {request?.confirmLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );

  return [ask, dialog];
}
