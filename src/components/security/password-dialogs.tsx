import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";
import { Copy, KeyRound, ShieldAlert } from "lucide-react";
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
import {
  MIN_PASSWORD_LENGTH,
  changePassword,
  clearPassword,
  createPassword,
  formatRecoveryCode,
  regenerateRecoveryCode,
  verifyPassword,
} from "@/lib/auth";
import { SETTINGS_QUERY_KEY } from "@/features/core/services/settings";

/** Shared: every dialog here writes settings, so every one must invalidate. */
function useSettingsInvalidator() {
  const qc = useQueryClient();
  return React.useCallback(() => qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY }), [qc]);
}

/**
 * Step two of creating a password, and the only moment the recovery code exists
 * in readable form.
 *
 * Deliberately **not dismissible** by Escape, an outside click or a close
 * button, and the Close button stays disabled until the acknowledgement is
 * ticked. Every other dialog in this app can be waved away; this one cannot,
 * because waving it away silently destroys the only route back into a locked
 * academy. The friction is the feature.
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

/** Sets the first password, then reveals the recovery code exactly once. */
export function PasswordCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("Auth");
  const invalidate = useSettingsInvalidator();

  const [password, setPassword] = React.useState("");
  const [confirmValue, setConfirmValue] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);

  /** Clears the typed fields as the dialog goes away, so a password never
   *  outlives the dialog it was entered into. */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setPassword("");
      setConfirmValue("");
      setError("");
    }
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (password.trim().length < MIN_PASSWORD_LENGTH) {
      setError(t("PasswordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    if (password !== confirmValue) {
      setError(t("PasswordsDoNotMatch"));
      return;
    }
    setBusy(true);
    setError("");
    try {
      const generated = await createPassword(password);
      await invalidate();
      // Close the form and open the reveal, rather than showing both: the code
      // must be the only thing on screen when it appears.
      onOpenChange(false);
      setCode(generated);
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
            <DialogTitle>{t("SetPassword")}</DialogTitle>
            <DialogDescription>{t("SetPasswordDesc")}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-2">
              <Label htmlFor="new_password">{t("NewPassword")}</Label>
              <Input
                id="new_password"
                dir="ltr"
                type="password"
                autoComplete="new-password"
                autoFocus
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError("");
                }}
                aria-invalid={!!error}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="confirm_password">{t("ConfirmPassword")}</Label>
              <Input
                id="confirm_password"
                dir="ltr"
                type="password"
                autoComplete="new-password"
                value={confirmValue}
                onChange={(e) => {
                  setConfirmValue(e.target.value);
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
              <Button type="submit" variant="success" loading={busy}>
                <KeyRound />
                {t("SetPassword")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <RecoveryRevealDialog code={code ?? ""} open={code !== null} onClose={() => setCode(null)} />
    </>
  );
}

/** Changes an existing password. The recovery code is unaffected — it clears the
 *  password, it never reveals it, so it stays valid across changes. */
export function PasswordChangeDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("Auth");
  const invalidate = useSettingsInvalidator();

  const [current, setCurrent] = React.useState("");
  const [next, setNext] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  /** Clears the typed fields as the dialog goes away, so a password never
   *  outlives the dialog it was entered into. */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setCurrent("");
      setNext("");
      setError("");
    }
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (next.trim().length < MIN_PASSWORD_LENGTH) {
      setError(t("PasswordTooShort", { min: MIN_PASSWORD_LENGTH }));
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!(await changePassword(current, next))) {
        setError(t("WrongPassword"));
        setCurrent("");
        return;
      }
      await invalidate();
      toast.success(t("PasswordChanged"));
      onOpenChange(false);
    } catch {
      toast.error(t("PasswordSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("ChangePassword")}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="current_password">{t("CurrentPassword")}</Label>
            <Input
              id="current_password"
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
          <div className="grid gap-2">
            <Label htmlFor="next_password">{t("NewPassword")}</Label>
            <Input
              id="next_password"
              dir="ltr"
              type="password"
              autoComplete="new-password"
              value={next}
              onChange={(e) => {
                setNext(e.target.value);
                if (error) setError("");
              }}
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
            <Button type="submit" variant="success" loading={busy} disabled={!current.trim() || !next.trim()}>
              {t("ChangePassword")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Removes the password entirely — the gate goes fully open. Requires the
 *  current password, so a walk-up user cannot simply switch protection off. */
export function PasswordRemoveDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("Auth");
  const invalidate = useSettingsInvalidator();

  const [current, setCurrent] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  /** Clears the typed fields as the dialog goes away, so a password never
   *  outlives the dialog it was entered into. */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setCurrent("");
      setError("");
    }
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !current.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (!(await verifyPassword(current))) {
        setError(t("WrongPassword"));
        setCurrent("");
        return;
      }
      await clearPassword();
      await invalidate();
      toast.success(t("PasswordRemoved"));
      onOpenChange(false);
    } catch {
      toast.error(t("PasswordSaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("RemovePassword")}</DialogTitle>
          <DialogDescription>{t("RemovePasswordDesc")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="border-app flex items-start gap-3 rounded-xl border-destructive/35 bg-destructive/5 p-4">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            <p className="min-w-0 text-base leading-relaxed">{t("RemovePasswordWarning")}</p>
          </div>
          <div className="grid gap-2">
            <Label htmlFor="remove_password">{t("CurrentPassword")}</Label>
            <Input
              id="remove_password"
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
            <Button type="submit" variant="destructive" loading={busy} disabled={!current.trim()}>
              {t("RemovePassword")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Issues a fresh recovery code for an academy that lost the paper slip.
 *
 * Requires the current password even though the caller is already unlocked: the
 * old code is invalidated by this, so an assistant who found an unlocked machine
 * could otherwise lock the owner out of their own recovery path.
 */
export function RecoveryRegenerateDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations("Auth");
  const invalidate = useSettingsInvalidator();

  const [current, setCurrent] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [code, setCode] = React.useState<string | null>(null);

  /** Clears the typed fields as the dialog goes away, so a password never
   *  outlives the dialog it was entered into. */
  function handleOpenChange(next: boolean) {
    if (!next) {
      setCurrent("");
      setError("");
    }
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !current.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (!(await verifyPassword(current))) {
        setError(t("WrongPassword"));
        setCurrent("");
        return;
      }
      const generated = await regenerateRecoveryCode();
      await invalidate();
      onOpenChange(false);
      setCode(generated);
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
            <DialogDescription>{t("RegenerateRecoveryDesc")}</DialogDescription>
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
                {t("RegenerateRecovery")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <RecoveryRevealDialog code={code ?? ""} open={code !== null} onClose={() => setCode(null)} />
    </>
  );
}
