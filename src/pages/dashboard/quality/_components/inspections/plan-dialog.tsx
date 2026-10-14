import * as React from "react";

import { CalendarPlus } from "lucide-react";
import { toast } from "sonner";
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
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useCentreClock } from "@/features/operations/components/use-centre-clock";
import { addDays, isIsoDate } from "@/features/operations/rules/calendar";
import { planInspectionsAction } from "@/features/operations/services/inspections";
import { useErrorMessage } from "@/i18n/errors";

/** How far ahead the dialog proposes to plan: four weeks. */
const DEFAULT_WEEKS = 4;

/**
 * «تخطيط التفتيش»: one inspection per week or month of each live file's
 * plan, from today to the date chosen, on the plan's day or the first visit
 * day, with the plan's or the zone's supervisor. What was planned before is
 * never planned twice, so it can be run as often as wanted.
 *
 * Closest academy component: attendance/_components/add-absence-dialog.tsx
 * (a dialog with its fields, Cancel and Save in the footer).
 */
export function PlanInspectionsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        {/* Radix unmounts the content on close: the form starts afresh on every opening. */}
        <PlanForm onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({ onClose }: { onClose: () => void }) {
  const t = useTranslations("Inspections.Plan");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const { today } = useCentreClock();
  const [upTo, setUpTo] = React.useState(() => addDays(today, DEFAULT_WEEKS * 7));
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const invalid = !isIsoDate(upTo) || upTo < today;

  async function plan(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setTried(true);
    if (invalid) return;
    setBusy(true);
    const result = await planInspectionsAction({ upTo });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    if (result.data.created > 0) toast.success(t("Done", { count: result.data.created }));
    else toast.info(t("Nothing"));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <CalendarPlus className="size-6 text-section-requests" />
          {t("Title")}
        </DialogTitle>
        <DialogDescription>{t("Description")}</DialogDescription>
      </DialogHeader>
      <form onSubmit={plan} className="space-y-5" noValidate>
        <Field data-invalid={(tried && invalid) || undefined}>
          <FieldLabel htmlFor="plan-up-to">{t("UpTo")}</FieldLabel>
          <Input
            id="plan-up-to"
            type="date"
            dir="ltr"
            className="max-w-60"
            min={today}
            value={upTo}
            onChange={(event) => setUpTo(event.target.value)}
            aria-invalid={(tried && invalid) || undefined}
          />
          <FieldDescription>{t("Hint")}</FieldDescription>
          {tried && invalid && <FieldError>{t("UpToInvalid")}</FieldError>}
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button type="submit" variant="success" loading={busy}>
            <CalendarPlus />
            {t("Submit")}
          </Button>
        </DialogFooter>
      </form>
    </>
  );
}
