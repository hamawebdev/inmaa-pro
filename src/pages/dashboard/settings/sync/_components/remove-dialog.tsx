import * as React from "react";

import { MonitorX, TriangleAlert } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { syncApi } from "@/features/sync/api";
import { useErrorMessage } from "@/i18n/errors";
import type { SyncDeviceView } from "@/lib/sync/services/types";

/** A number typed from paper: digits only, or null while the field is empty. */
function paperNumber(text: string): number | null {
  const clean = text.trim();
  return /^\d{1,9}$/.test(clean) ? Number(clean) : null;
}

/**
 * «إزالة حاسوب» (DECISION section 7, case 9): the manager's act, with her
 * reason typed. When the laptop held the books she declares the last invoice
 * and receipt numbers seen on paper, so that the numbers it may have issued
 * are never issued again here.
 */
export function RemoveDialog({ device, onClose }: { device: SyncDeviceView | null; onClose: () => void }) {
  const t = useTranslations("Sync.Remove");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [reason, setReason] = React.useState("");
  const [lastInvoice, setLastInvoice] = React.useState("");
  const [lastReceipt, setLastReceipt] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const heldBooks = device?.holdsBooks ?? false;
  const ready =
    reason.trim() !== "" && (!heldBooks || (paperNumber(lastInvoice) !== null && paperNumber(lastReceipt) !== null));

  function close() {
    if (busy) return;
    setReason("");
    setLastInvoice("");
    setLastReceipt("");
    onClose();
  }

  async function remove() {
    if (!device || busy || !ready) return;
    setBusy(true);
    try {
      const result = await syncApi.removeLaptop({
        deviceId: device.id,
        reason: reason.trim(),
        ...(heldBooks ? { lastInvoice: paperNumber(lastInvoice), lastReceipt: paperNumber(lastReceipt) } : {}),
      });
      if (!result.success) return void toast.error(errorMessage(result.error, t("Failed")));
      toast.success(t("Done"));
      setBusy(false);
      close();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={device !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent data-sync-remove>
        <DialogHeader>
          <DialogTitle>{t("Title")}</DialogTitle>
          <DialogDescription>{t("Description")}</DialogDescription>
        </DialogHeader>
        {device && (
          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-base">
              {t("Laptop")}: <span className="font-bold">{device.name}</span>
            </p>
            {heldBooks && (
              <>
                <div
                  role="alert"
                  className="border-app flex min-w-0 items-start gap-3 rounded-xl border-warning-ink/35 bg-warning/10 p-4"
                >
                  <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden />
                  <p className="min-w-0 text-base leading-relaxed">{t("HeldBooks")}</p>
                </div>
                <div className="grid min-w-0 gap-4 sm:grid-cols-2">
                  <div className="grid min-w-0 content-start gap-2">
                    <Label htmlFor="sync_remove_invoice">{t("LastInvoice")}</Label>
                    <Input
                      id="sync_remove_invoice"
                      dir="ltr"
                      inputMode="numeric"
                      className="font-mono tabular-nums"
                      value={lastInvoice}
                      onChange={(event) => setLastInvoice(event.target.value)}
                    />
                  </div>
                  <div className="grid min-w-0 content-start gap-2">
                    <Label htmlFor="sync_remove_receipt">{t("LastReceipt")}</Label>
                    <Input
                      id="sync_remove_receipt"
                      dir="ltr"
                      inputMode="numeric"
                      className="font-mono tabular-nums"
                      value={lastReceipt}
                      onChange={(event) => setLastReceipt(event.target.value)}
                    />
                  </div>
                </div>
              </>
            )}
            <div className="grid gap-2">
              <Label htmlFor="sync_remove_reason">{t("Reason")}</Label>
              <Textarea
                id="sync_remove_reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button type="button" variant="destructive" loading={busy} disabled={!ready} onClick={() => void remove()}>
            <MonitorX />
            {t("Confirm")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
