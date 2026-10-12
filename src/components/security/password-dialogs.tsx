import * as React from "react";

import { Copy, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { changeOwnPasswordAction, renewRecoveryCodeAction } from "@/features/core/services/sign-in";
import { useErrorMessage } from "@/i18n/errors";
import { formatRecoveryCode, isPasswordLongEnough, MIN_PASSWORD_LENGTH } from "@/lib/auth";

/**
 * The only moment a recovery code exists in readable form (a new one asked for
 * in Settings; the first one is shown by the sign-in window itself).
 *
 * Deliberately **not dismissible** by Escape, an outside click or a close
 * button, and the Close button stays disabled until the acknowledgement is
 * ticked. Every other dialog in this app can be waved away; this one cannot,
 * because waving it away silently destroys the manager's only way back in. The friction is the feature.
 */
export function RecoveryRevealDialog({ code, open, onClose }: { code: string; open: boolean; onClose: () => void }) {
  const t = useTranslations("Auth");
  const [acknowledged, setAcknowledged] = React.useState(false);

  function close() {
    setAcknowledged(false);
    onClose();
  }

  const formatted = formatRecoveryCode(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted);
      toast.success(t("RecoveryCopied"));
    } catch {
      toast.error(t("RecoveryCopyFailed"));
    }
  }

  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t("RecoveryTitle")}</DialogTitle>
          <DialogDescription>{t("RecoveryDesc")}</DialogDescription>
        </DialogHeader>

        <div className="border-app rounded-xl border-warning-ink/35 bg-warning/10 p-5 text-center">
          {/* `dir="ltr"` and tabular figures: this is a number to be copied onto
              paper, and mirroring it in Arabic would produce a code that does
              not match what was stored. */}
          <p dir="ltr" className="font-mono text-2xl font-bold tracking-widest tabular-nums select-all tall:text-3xl">
            {formatted}
          </p>
        </div>

        <Button variant="outline" onClick={copy} className="w-full">
          <Copy />
          {t("CopyCode")}
        </Button>

        <label className="flex cursor-pointer items-start gap-3">
          <Checkbox checked={acknowledged} onCheckedChange={(v) => setAcknowledged(v === true)} className="mt-0.5" />
          <span className="min-w-0 text-base leading-relaxed">{t("RecoveryAcknowledge")}</span>
        </label>

        <DialogFooter>
          <Button disabled={!acknowledged} onClick={close}>
            {t("RecoveryDone")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The signed-in user changes his own password: the current one, then the new
 * one twice. The manager's recovery code is unaffected: it replaces a
 * password, it never reveals one, so it stays good across changes.
 */
export function PasswordChangeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  /** Clears the typed fields as the dialog goes away, so a password never
   *  outlives the dialog it was entered into. */
  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCurrent("");
      setNext("");
      setAgain("");
      setError("");
    }
    onOpenChange(nextOpen);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (!isPasswordLongEnough(next)) {
      setError(t("PasswordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (next !== again) {
      setError(t("PasswordsDoNotMatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const result = await changeOwnPasswordAction({ currentPassword: current, newPassword: next });
      if (!result.success) {
        setError(errorMessage(result.error, t("PasswordSaveFailed")));
        return;
      }
      if (!result.data.changed) {
        setError(t("WrongPassword"));
        setCurrent("");
        return;
      }
      toast.success(t("PasswordChanged"));
      handleOpenChange(false);
    } catch {
      toast.error(t("PasswordSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  const fields = [
    {
      id: "current_password",
      label: t("CurrentPassword"),
      value: current,
      set: setCurrent,
      complete: "current-password",
    },
    { id: "next_password", label: t("NewPassword"), value: next, set: setNext, complete: "new-password" },
    { id: "again_password", label: t("ConfirmPassword"), value: again, set: setAgain, complete: "new-password" },
  ] as const;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ChangePassword")}</DialogTitle>
          <DialogDescription>{t("ChangePasswordDesc")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {fields.map((field, index) => (
            <div key={field.id} className="grid gap-2">
              <Label htmlFor={field.id}>{field.label}</Label>
              <Input
                id={field.id}
                dir="ltr"
                type="password"
                autoComplete={field.complete}
                autoFocus={index === 0}
                value={field.value}
                onChange={(e) => {
                  field.set(e.target.value);
                  if (error) setError("");
                }}
                aria-invalid={!!error}
              />
            </div>
          ))}
          {error && (
            <p role="alert" className="text-base font-bold text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
              {t("Cancel")}
            </Button>
            <Button
              type="submit"
              variant="success"
              loading={busy}
              disabled={!current.trim() || !next.trim() || !again.trim()}
            >
              {t("ChangePassword")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A new recovery code for the manager who lost the paper. He types his
 * password to get it, so somebody who finds the program open cannot take the
 * way back in for himself. The old code stops working at once.
 */
export function RecoveryRegenerateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("Auth");
  const errorMessage = useErrorMessage();

  const [current, setCurrent] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      setCurrent("");
      setError("");
    }
    onOpenChange(nextOpen);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !current.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await renewRecoveryCodeAction({ password: current });
      if (!result.success) {
        setError(errorMessage(result.error, t("PasswordSaveFailed")));
        return;
      }
      if (!result.data.recoveryCode) {
        setError(t("WrongPassword"));
        setCurrent("");
        return;
      }
      // Close the form and open the reveal, rather than showing both: the code
      // must be the only thing on screen when it appears.
      handleOpenChange(false);
      setCode(result.data.recoveryCode);
    } catch {
      toast.error(t("PasswordSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("RegenerateRecovery")}</DialogTitle>
            <DialogDescription>
              {t("RegenerateRecoveryDesc")} {t("RegenerateRecoveryPassword")}
            </DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-2">
              <Label htmlFor="regen_password">{t("CurrentPassword")}</Label>
              <Input
                id="regen_password"
                dir="ltr"
                type="password"
                autoComplete="current-password"
                autoFocus
                value={current}
                onChange={(e) => {
                  setCurrent(e.target.value);
                  if (error) setError("");
                }}
                aria-invalid={!!error}
              />
            </div>
            {error && (
              <p role="alert" className="text-base font-bold text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                {t("Cancel")}
              </Button>
              <Button type="submit" loading={busy} disabled={!current.trim()}>
                <KeyRound />
                {t("RegenerateRecoveryAction")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <RecoveryRevealDialog code={code ?? ""} open={code !== null} onClose={() => setCode(null)} />
    </>
  );
}
