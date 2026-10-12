import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { asksClockConfirmation } from "@/features/money/components/clock-jump";
import { PAYMENTS_PATH } from "@/features/money/services/paths";
import {
  issueReceiptBatchAction,
  listCollectorsQuery,
  MAX_RECEIPT_BATCH,
  type IssueReceiptBatchInput,
} from "@/features/money/services/payments";
import { useSession } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

const OFFICE = "office";

/**
 * «سندات قبض فارغة»: a block of numbered receipts printed blank, for an
 * employee or a worker authorised to take cash at a client's door (feature 32;
 * his regulations, article 12). Each takes its number in the legal sequence
 * now, and is filled in later when the payment is typed in against it.
 *
 * Closest academy screen: none hands out paper; the dialog follows the
 * academy's expense dialog, and the block opens to be printed at once.
 */
export function ReceiptBatchDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <BatchForm onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}

function BatchForm({ onDone }: { onDone: () => void }) {
  const t = useTranslations("ReceiptBatch");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const session = useSession();
  const [confirm, confirmDialog] = useConfirm();
  const { data: collectors } = useQuery({
    queryKey: [...pathKey(PAYMENTS_PATH), "collectors"],
    queryFn: () => listCollectorsQuery(),
  });
  const [count, setCount] = React.useState("10");
  const [collector, setCollector] = React.useState<string>(OFFICE);
  const [busy, setBusy] = React.useState(false);

  const number = Number(count);
  const countValid = Number.isInteger(number) && number >= 1 && number <= MAX_RECEIPT_BATCH;

  async function issue() {
    if (!countValid) return;
    const chosen = collectors?.find((candidate) => candidate.id === collector);
    const input: IssueReceiptBatchInput = {
      count: number,
      collectorKind: chosen ? chosen.kind : "OFFICE",
      collectorStaffId: chosen?.id ?? null,
    };
    setBusy(true);
    let result = await issueReceiptBatchAction(input);
    if (!result.success && asksClockConfirmation(result.error, session)) {
      const confirmed = await confirm({
        title: t("ClockTitle"),
        description: errorMessage(result.error),
        confirmLabel: t("ClockConfirm"),
      });
      if (confirmed) result = await issueReceiptBatchAction({ ...input, confirmedClockJump: true });
    }
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Issued", { first: result.data.firstNumber, last: result.data.lastNumber }));
    onDone();
    navigate(`/dashboard/payments/receipts/batch/${result.data.batchId}/print`);
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("Title")}</DialogTitle>
        <DialogDescription>{t("Description")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4">
        <Field data-invalid={!countValid}>
          <FieldLabel htmlFor="batch-count">{t("Count")}</FieldLabel>
          <Input
            id="batch-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={MAX_RECEIPT_BATCH}
            step={1}
            value={count}
            onChange={(event) => setCount(event.target.value)}
            aria-invalid={!countValid}
          />
          {countValid ? (
            <FieldDescription>{t("CountHint", { max: MAX_RECEIPT_BATCH })}</FieldDescription>
          ) : (
            <FieldError>{errorMessage("A block of receipts holds 1 to 50 receipts.")}</FieldError>
          )}
        </Field>
        <Field>
          <FieldLabel htmlFor="batch-collector">{t("Collector")}</FieldLabel>
          <Select value={collector} onValueChange={setCollector}>
            <SelectTrigger id="batch-collector">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={OFFICE}>{t("Office")}</SelectItem>
              {(collectors ?? []).map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {t(candidate.kind === "WORKER" ? "Worker" : "Employee", {
                    name: candidate.name,
                    number: candidate.number,
                  })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>{t("CollectorHint")}</FieldDescription>
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("Cancel")}
        </Button>
        <Button type="button" variant="success" disabled={busy || !countValid} onClick={() => void issue()}>
          {t("Issue")}
        </Button>
      </DialogFooter>
      {confirmDialog}
    </>
  );
}
