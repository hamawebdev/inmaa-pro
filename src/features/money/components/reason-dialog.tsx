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
import { Field, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";

/**
 * Asks the reason the user must type for an act the log keeps in his words:
 * voiding an invoice or a payment, removing an expense, cancelling a
 * hand-out (docs/data-model/DESIGN.md section 9). The confirm button waits
 * for a reason; the dialog is gone once the act is done.
 */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  destructive = true,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  destructive?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("MoneyCommon");
  const tCommon = useTranslations("Common");
  const [reason, setReason] = React.useState("");
  const id = React.useId();
  const close = () => {
    setReason("");
    onCancel();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? undefined : close())}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>{t("Reason")}</FieldLabel>
          <Textarea id={id} value={reason} onChange={(event) => setReason(event.target.value)} rows={3} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            {tCommon("Cancel")}
          </Button>
          <Button
            type="button"
            variant={destructive ? "destructive" : "success"}
            disabled={busy || reason.trim() === ""}
            onClick={() => {
              const typed = reason.trim();
              setReason("");
              onConfirm(typed);
            }}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
