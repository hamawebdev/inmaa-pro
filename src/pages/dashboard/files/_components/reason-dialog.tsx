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
 * Asks the reason the user must type for an act the log keeps with his words:
 * changing a signed file, taking a resident off the list, moving a file back
 * (docs/data-model/DESIGN.md section 9). The confirm button waits for a reason.
 */
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("FileHub");
  const tCommon = useTranslations("Common");
  const [reason, setReason] = React.useState("");
  const id = React.useId();

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setReason("");
          onCancel();
        }
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field>
          <FieldLabel htmlFor={id}>{t("Reason")}</FieldLabel>
          <Textarea id={id} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
        </Field>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setReason("");
              onCancel();
            }}
          >
            {tCommon("Cancel")}
          </Button>
          <Button
            type="button"
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
