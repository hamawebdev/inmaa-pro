import * as React from "react";

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
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useDateText } from "@/features/money/components/use-money-text";
import type { ProposedVisit } from "@/features/money/services/invoices";
import { clearVisitBillingAction, setVisitBillingAction } from "@/features/money/services/visit-billing";
import { useErrorMessage } from "@/i18n/errors";
import { dinarsToMoney, moneyToDinars, type Money } from "@/lib/units";

/**
 * «قرار الفوترة» of one visit of the statement (MON-05): billed or not, with the reason typed, and the price
 * of an extra visit billed on its own. Saving brings the file's dues in line at once.
 */
export function VisitBillingDialog({ visit, onClose }: { visit: ProposedVisit | null; onClose: () => void }) {
  return (
    <Dialog open={visit !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>{visit && <DecisionForm key={visit.visitId} visit={visit} onClose={onClose} />}</DialogContent>
    </Dialog>
  );
}

function DecisionForm({ visit, onClose }: { visit: ProposedVisit; onClose: () => void }) {
  const t = useTranslations("VisitBilling");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const dates = useDateText();
  const [billable, setBillable] = React.useState(visit.decision?.billable ?? visit.billable);
  const [reason, setReason] = React.useState(visit.decision?.reason ?? "");
  const [price, setPrice] = React.useState<number | undefined>(
    visit.decision?.amount ? moneyToDinars(visit.decision.amount as Money) : undefined,
  );
  const [busy, setBusy] = React.useState(false);
  const extra = visit.origin === "EXTRA";

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await setVisitBillingAction({
      visitId: visit.visitId,
      billable,
      reason,
      amount: extra && billable && price !== undefined ? dinarsToMoney(price) : null,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("Saved"));
    onClose();
  }

  async function clear() {
    setBusy(true);
    const result = await clearVisitBillingAction({ visitId: visit.visitId });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("Cleared"));
    onClose();
  }

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{t("Title")}</DialogTitle>
        <DialogDescription>{t("Description", { date: dates.long(visit.visitDate) })}</DialogDescription>
      </DialogHeader>
      <RadioGroup value={billable ? "yes" : "no"} onValueChange={(value) => setBillable(value === "yes")}>
        <div className="flex items-center gap-3">
          <RadioGroupItem id="visit-billable-yes" value="yes" />
          <Label htmlFor="visit-billable-yes">{t("Billable")}</Label>
        </div>
        <div className="flex items-center gap-3">
          <RadioGroupItem id="visit-billable-no" value="no" />
          <Label htmlFor="visit-billable-no">{t("NotBillable")}</Label>
        </div>
      </RadioGroup>
      {extra && billable && (
        <Field>
          <FieldLabel htmlFor="visit-billing-price">{t("Price")}</FieldLabel>
          <Input
            id="visit-billing-price"
            type="number"
            inputMode="decimal"
            min={0.01}
            step={0.01}
            placeholder="0.00"
            value={price ?? ""}
            onChange={(event) => setPrice(event.target.value === "" ? undefined : Number(event.target.value))}
          />
        </Field>
      )}
      <Field>
        <FieldLabel htmlFor="visit-billing-reason">{t("Reason")}</FieldLabel>
        <Input id="visit-billing-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <DialogFooter>
        {visit.decision && (
          <Button type="button" variant="outline" disabled={busy} onClick={() => void clear()}>
            {t("Clear")}
          </Button>
        )}
        <Button type="button" variant="outline" onClick={onClose}>
          {tCommon("Cancel")}
        </Button>
        <Button type="submit" variant="success" disabled={busy || reason.trim() === ""}>
          {t("Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
