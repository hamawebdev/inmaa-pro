import * as React from "react";

import { useQueryClient } from "@tanstack/react-query";
import { KeyRound, LockKeyhole } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { clearPassword, verifyPassword, verifyRecoveryCode } from "@/lib/auth";
import { SETTINGS_QUERY_KEY } from "@/features/core/services/settings";
import { useUnlockStore } from "@/stores/unlock-store";

/**
 * The locked screen, shown *in place of* a protected page — never layered over
 * one, so the page's markup and queries never exist while locked. Rendered by
 * `RouteGate`.
 *
 * It renders inside the app shell, so the bottom bar stays reachable: someone
 * who lands here by accident clicks away instead of being trapped on a dead end
 * with no navigation.
 */
export function LockScreen() {
  const t = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const qc = useQueryClient();
  const navigate = useNavigate();
  const unlock = useUnlockStore((s) => s.unlock);

  const [mode, setMode] = React.useState<"password" | "recovery">("password");
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function switchMode(next: "password" | "recovery") {
    setMode(next);
    setValue("");
    setError("");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (mode === "password") {
        if (await verifyPassword(value)) {
          unlock();
          return;
        }
        // Unlimited retries, no lockout: this guards against a curious
        // assistant, and stranding the manager mid-day would cost more than it
        // protects.
        setError(t("WrongPassword"));
        setValue("");
      } else {
        if (await verifyRecoveryCode(value)) {
          // unlock() BEFORE clearing. The user is about to land on Settings to
          // set a new password, and without this flag they would be ejected the
          // instant that new password lands.
          unlock();
          await clearPassword();
          await qc.invalidateQueries({ queryKey: SETTINGS_QUERY_KEY });
          toast.success(t("RecoveryUsed"));
          navigate("/dashboard/settings");
          return;
        }
        setError(t("RecoveryWrong"));
        setValue("");
      }
    } catch {
      toast.error(t("UnlockFailed"));
    } finally {
      setBusy(false);
    }
  }

  const recovery = mode === "recovery";

  return (
    <div className="mx-auto w-full max-w-md px-5 pt-12 pb-16 tall:pt-20">
      <Card>
        <CardHeader className="place-items-center text-center">
          <div className="border-app grid size-14 place-content-center rounded-full border-border bg-muted text-muted-foreground tall:size-16">
            {recovery ? <KeyRound className="size-7" /> : <LockKeyhole className="size-7" />}
          </div>
          <CardTitle className="mt-3">{recovery ? t("RecoveryEnter") : t("ManagerArea")}</CardTitle>
          <CardDescription>{recovery ? t("RecoveryHint") : t("LockedDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor="unlock_value">{recovery ? t("RecoveryCode") : t("Password")}</Label>
              <Input
                id="unlock_value"
                // Credentials read left-to-right even in Arabic: an RTL field
                // renders a password or a digit run in a genuinely confusing
                // order, and the reader cannot tell a typo from the mirroring.
                dir="ltr"
                type={recovery ? "text" : "password"}
                inputMode={recovery ? "numeric" : undefined}
                autoComplete="off"
                autoFocus
                placeholder={recovery ? "1234-5678-9012-3456" : undefined}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError("");
                }}
                aria-invalid={!!error}
              />
              {/* Inline, not a toast: a wrong password is field-level feedback
                  that belongs next to the field it describes, and a toast would
                  be gone by the time the reader looks back at the input. */}
              {error && (
                <p role="alert" className="text-base font-bold text-destructive">
                  {error}
                </p>
              )}
            </div>
            <Button type="submit" className="w-full" loading={busy} disabled={!value.trim()}>
              <LockKeyhole />
              {t("Unlock")}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full text-muted-foreground"
              onClick={() => switchMode(recovery ? "password" : "recovery")}
            >
              {recovery ? t("UsePassword") : t("ForgotPassword")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-base text-muted-foreground">{tCommon("LockNavHint")}</p>
    </div>
  );
}
