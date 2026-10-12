import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";
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
import { LICENSE_QUERY_KEY } from "@/hooks/use-license";
import { commands } from "@/lib/bindings";

/**
 * Activating from Settings, during the trial.
 *
 * The lock screen (src/lock/lock-app.tsx) takes the same code and calls the same
 * command, but it is not the same moment: there the app is already dead and has
 * to be restarted into a window with real permissions, whereas here the academy
 * paid early and the app is running normally. Nothing needs restarting — the
 * licence is re-read and the Settings card just changes what it says.
 *
 * An academy that buys on day three keeps its remaining trial days in the sense
 * that matters: the countdown stops applying entirely.
 */
export function ActivateDialog({
  open,
  onOpenChange,
  deviceId,
  phone,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Shown so the owner can read it out mid-call without leaving the dialog. */
  deviceId: string;
  /**
   * Interpolated rather than written into each translation, so the number lives
   * in exactly one place — `CONTACT_PHONE` in the Rust secret module.
   */
  phone: string;
}) {
  const t = useTranslations("License");
  const tCommon = useTranslations("Common");
  const qc = useQueryClient();

  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function close() {
    setCode("");
    setError("");
    onOpenChange(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await commands.licenseUnlock(code);
      if (res.status === "error" || !res.data) {
        // Inline, not a toast: a rejected code is field-level feedback, and the
        // field it describes is right there. No attempt limit — this stands
        // between an academy that has paid and its own records.
        setError(t("CodeWrong"));
        setCode("");
        return;
      }
      // Rust has already written the unlock to every anchor; this only refreshes
      // what the screen is showing.
      await qc.invalidateQueries({ queryKey: LICENSE_QUERY_KEY });
      toast.success(t("Activated"));
      close();
    } catch {
      toast.error(t("UnlockFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader className="rtl:text-right">
          <DialogTitle>{t("ActivateTitle")}</DialogTitle>
          <DialogDescription className="rtl:text-right">{t("ActivateDescription", { phone })}</DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={submit}>
          {/* The id the developer asks for first. Repeated here rather than only
              on the card behind this dialog, because the owner is on the
              telephone while this is open. */}
          <div className="flex flex-col items-center gap-1 rounded-lg bg-muted py-3">
            <span className="text-base font-semibold text-muted-foreground uppercase">{t("DeviceId")}</span>
            <code dir="ltr" className="font-mono text-xl font-semibold tracking-widest select-all">
              {deviceId}
            </code>
          </div>

          <div className="grid min-w-0 gap-2">
            <Label htmlFor="activation_code">{t("CodeLabel")}</Label>
            <Input
              id="activation_code"
              // Codes read left-to-right even in Arabic: an RTL field renders a
              // grouped run of letters and digits in a genuinely confusing order.
              dir="ltr"
              autoComplete="off"
              autoFocus
              spellCheck={false}
              placeholder="XXXX-XXXX-XXXX-XXXX"
              className="text-center font-mono text-xl tracking-widest uppercase"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (error) setError("");
              }}
              aria-invalid={!!error}
            />
            {error && (
              <p role="alert" className="text-base font-bold text-destructive">
                {error}
              </p>
            )}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>
              {tCommon("Cancel")}
            </Button>
            <Button type="submit" loading={busy} disabled={!code.trim()}>
              {t("UnlockAction")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
