import * as React from "react";

import { KeyRound, Lock, PhoneCall } from "lucide-react";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { commands, type LicenseStatus } from "@/lib/bindings";

/**
 * The screen an expired installation shows instead of the app.
 *
 * It is not an overlay and it is not a route. The window it lives in was built
 * by Rust *instead of* the app's window, holds a capability with no filesystem
 * and no store access, and loads a bundle (lock.html) carrying no Kysely driver,
 * no server actions and no app screens — so there is nothing to navigate past
 * and nothing to close. The one database-shaped thing that does reach this page
 * is the generated IPC client below, and every command in it except the three
 * `license*` ones is refused by `license::guard` while the licence is expired.
 *
 * What it does: name the problem, give the academy the number to ring, show the
 * id the developer needs to hear, and take the code that comes back.
 */
export function LockApp() {
  const t = useTranslations("License");
  const [status, setStatus] = React.useState<LicenseStatus | null>(null);
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [unlocked, setUnlocked] = React.useState(false);

  React.useEffect(() => {
    void commands.licenseStatus().then(setStatus);
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      const res = await commands.licenseUnlock(code);
      if (res.status === "error" || !res.data) {
        // Unlimited attempts, no lockout. This stands between an academy that
        // has already paid and its own records; punishing a code misheard down a
        // phone line would be a worse failure than the guessing it would
        // prevent, and a wrong code writes nothing at all.
        setError(t("CodeWrong"));
        setCode("");
        return;
      }

      // The unlock is already saved by the time this resolves. The pause is for
      // the academy, not the machine: a window that vanished the instant the
      // code landed would leave nobody sure it had worked.
      setUnlocked(true);
      window.setTimeout(() => void commands.licenseRestart(), 1600);
    } catch {
      setError(t("UnlockFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (unlocked) {
    return (
      <Shell>
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex size-16 items-center justify-center rounded-full bg-success/15 text-success">
            <KeyRound className="size-8" />
          </div>
          <h1 className="text-3xl font-bold">{t("UnlockedTitle")}</h1>
          <p className="text-lg text-muted-foreground">{t("Restarting")}</p>
          <Spinner className="size-6 text-muted-foreground" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="size-8" />
        </div>
        <h1 className="text-3xl font-bold">{t("ExpiredTitle")}</h1>
      </div>

      {/* The message the academy is here to read, and the number that resolves
          it. The number is a heading in its own right rather than a phrase inside
          a paragraph: it is the single action this screen exists to prompt. */}
      <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-border-strong bg-card p-6 text-center">
        <p className="text-lg leading-relaxed text-balance">
          {t("ContactMessage", { phone: status?.contact_phone ?? "" })}
        </p>
        {/* Plain text, not a `tel:` link: nothing in this program hands off to
            another application. The number is read and dialled by a person. */}
        <p className="flex items-center gap-3 text-4xl font-bold tracking-wider text-primary select-all">
          <PhoneCall className="size-8 shrink-0" aria-hidden />
          <Ltr>{status?.contact_phone ?? ""}</Ltr>
        </p>
      </div>

      {/* Read out during that call. Selectable and monospaced because it will be
          dictated character by character, and `select-all` means one tap
          highlights the whole thing rather than half of it. */}
      <div className="flex flex-col items-center gap-1.5">
        <span className="text-base font-semibold text-muted-foreground uppercase">{t("DeviceId")}</span>
        <code
          dir="ltr"
          className="rounded-md bg-muted px-4 py-2 font-mono text-xl font-semibold tracking-widest select-all"
        >
          {status?.device_id ?? "…"}
        </code>
      </div>

      <form className="flex flex-col gap-3" onSubmit={submit}>
        <div className="grid min-w-0 gap-1.5">
          <Label htmlFor="unlock_code">{t("CodeLabel")}</Label>
          <Input
            id="unlock_code"
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
          {/* Inline rather than a toast: a rejected code is field-level feedback
              and belongs next to the field it describes. (There is no Toaster on
              this page anyway — it lives in the dashboard shell.) */}
          {error && (
            <p role="alert" className="text-base font-bold text-destructive">
              {error}
            </p>
          )}
        </div>
        <Button type="submit" size="lg" loading={busy} disabled={!code.trim()}>
          {t("UnlockAction")}
        </Button>
      </form>
    </Shell>
  );
}

/**
 * The window's whole frame. Scrolls internally rather than growing, so the lock
 * screen fits the shortest supported window (520px) without the phone number
 * ending up below the fold.
 */
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col overflow-y-auto bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-lg flex-col justify-center gap-6 px-6 py-10">{children}</main>
    </div>
  );
}
