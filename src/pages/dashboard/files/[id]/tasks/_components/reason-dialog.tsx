import * as React from "react";

import { Trash2 } from "lucide-react";
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
 * Asks why a task or a place is taken off the file. A removal is a soft delete
 * the log keeps with the user's own words (docs/data-model/DESIGN.md sections 4
 * and 9), so the button waits for a reason.
 *
 * The academy confirms a delete with its confirmation dialog
 * (components/confirm-dialog.tsx, danger tone); this is the same dialog with
 * the one field the log needs. Its content is mounted only while it is open,
 * so every opening starts with an empty reason.
 */
export function ReasonDialog({
  open,
  onOpenChange,
  ...props
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: React.ReactNode;
  busy: boolean;
  onConfirm: (reason: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <ReasonForm {...props} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({
  title,
  description,
  busy,
  onConfirm,
  onCancel,
}: {
  title: string;
  description: React.ReactNode;
  busy: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("FileTasks");
  const tCommon = useTranslations("Common");
  const [reason, setReason] = React.useState("");
  const id = React.useId();
  const typed = reason.trim();

  return (
    <>
      <DialogHeader>
        <DialogTitle className="break-words">{title}</DialogTitle>
        <DialogDescription asChild>
          <div className="space-y-2">{description}</div>
        </DialogDescription>
      </DialogHeader>
      <form
        className="space-y-5"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed) onConfirm(typed);
        }}
      >
        <Field>
          <FieldLabel htmlFor={id}>{t("Reason")}</FieldLabel>
          <Textarea id={id} value={reason} onChange={(event) => setReason(event.target.value)} autoFocus />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onCancel}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="destructive" loading={busy} disabled={typed === ""}>
            <Trash2 />
            {tCommon("Delete")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
