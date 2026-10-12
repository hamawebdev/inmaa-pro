import * as React from "react";

import { useTranslations } from "use-intl";

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
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

/**
 * A question whose answer needs the user's own words: why a filled form is
 * printed, why a sanction is set or lifted, why the manager says yes or no.
 * The log keeps those words (DESIGN section 9), so the dialog does not close
 * on an empty reason.
 *
 *     const [askReason, reasonDialog] = useReasonDialog();
 *     const answer = await askReason({ title, reasonLabel, confirmLabel });
 *     if (!answer) return;                 // cancelled
 *     await liftSanctionAction({ sanctionId, reason: answer.reason });
 *     return <>{reasonDialog}…</>;
 *
 * Closest academy component: the confirm dialog (`useConfirm`), with a form in
 * it. Same promise in, same "a dismissed dialog is never an answer".
 */

export type ReasonField =
  | { kind: "date"; name: string; label: string; required?: boolean; defaultValue?: string }
  | {
      kind: "choice";
      name: string;
      label: string;
      options: ReadonlyArray<{ value: string; label: string }>;
      defaultValue?: string;
    };

export interface ReasonRequest {
  title: string;
  description?: React.ReactNode;
  /** Shown between the description and the fields: the facts the answer is about. */
  details?: React.ReactNode;
  /** Fields before the reason: a date, a choice. */
  fields?: readonly ReasonField[];
  reasonLabel: string;
  confirmLabel: string;
  confirmTone?: "default" | "success" | "destructive";
  /** A second answer that needs the reason too (the manager's no). */
  secondLabel?: string;
}

export interface ReasonAnswer {
  reason: string;
  values: Record<string, string>;
  answer: "confirm" | "second";
}

export function useReasonDialog(): [(request: ReasonRequest) => Promise<ReasonAnswer | null>, React.ReactNode] {
  const t = useTranslations("PeopleDialogs");
  const [request, setRequest] = React.useState<ReasonRequest | null>(null);
  const [reason, setReason] = React.useState("");
  const [values, setValues] = React.useState<Record<string, string>>({});
  const [tried, setTried] = React.useState(false);
  const resolver = React.useRef<((answer: ReasonAnswer | null) => void) | null>(null);

  const ask = React.useCallback((next: ReasonRequest) => {
    resolver.current?.(null);
    setRequest(next);
    setReason("");
    setTried(false);
    setValues(Object.fromEntries((next.fields ?? []).map((field) => [field.name, field.defaultValue ?? ""])));
    return new Promise<ReasonAnswer | null>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const settle = React.useCallback((answer: ReasonAnswer | null) => {
    resolver.current?.(answer);
    resolver.current = null;
    setRequest(null);
  }, []);

  React.useEffect(() => () => resolver.current?.(null), []);

  const missing = (request?.fields ?? []).filter(
    (field) => (field.kind === "choice" || field.required) && !values[field.name],
  );
  const answer = (which: ReasonAnswer["answer"]) => {
    setTried(true);
    if (reason.trim() === "" || missing.length > 0) return;
    settle({ reason: reason.trim(), values, answer: which });
  };

  const dialog = (
    <Dialog open={request !== null} onOpenChange={(open) => !open && settle(null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request?.title}</DialogTitle>
          {request?.description && <DialogDescription>{request.description}</DialogDescription>}
        </DialogHeader>
        {request?.details}
        <div className="grid gap-4">
          {(request?.fields ?? []).map((field) => (
            <Field key={field.name} data-invalid={tried && missing.includes(field)}>
              <FieldLabel htmlFor={`reason-field-${field.name}`}>{field.label}</FieldLabel>
              {field.kind === "date" ? (
                <Input
                  id={`reason-field-${field.name}`}
                  type="date"
                  dir="ltr"
                  value={values[field.name] ?? ""}
                  onChange={(event) => setValues((current) => ({ ...current, [field.name]: event.target.value }))}
                />
              ) : (
                <Select
                  value={values[field.name] ?? ""}
                  onValueChange={(value) => setValues((current) => ({ ...current, [field.name]: value }))}
                >
                  <SelectTrigger id={`reason-field-${field.name}`}>
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
              )}
              {tried && missing.includes(field) && <FieldError>{t("Required")}</FieldError>}
            </Field>
          ))}
          <Field data-invalid={tried && reason.trim() === ""}>
            <FieldLabel htmlFor="reason-text">{request?.reasonLabel}</FieldLabel>
            <Textarea
              id="reason-text"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              aria-invalid={tried && reason.trim() === ""}
            />
            {tried && reason.trim() === "" && <FieldError>{t("ReasonRequired")}</FieldError>}
          </Field>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => settle(null)}>
            {t("Cancel")}
          </Button>
          {request?.secondLabel && (
            <Button type="button" variant="destructive" onClick={() => answer("second")}>
              {request.secondLabel}
            </Button>
          )}
          <Button type="button" variant={request?.confirmTone ?? "default"} onClick={() => answer("confirm")}>
            {request?.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  return [ask, dialog];
}
