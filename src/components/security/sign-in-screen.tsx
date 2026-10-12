import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Check, Copy, KeyRound, LockKeyhole, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { enterSession } from "@/features/core/services/session";
import {
  listSignInAccountsQuery,
  resetManagerPasswordAction,
  setFirstPasswordAction,
  signInAction,
  type SignInAccount,
} from "@/features/core/services/sign-in";
import { useErrorMessage } from "@/i18n/errors";
import { formatRecoveryCode, isPasswordLongEnough, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import type { Session } from "@/lib/service/context";
import { cn } from "@/lib/utils";

/**
 * The sign-in window: what the program shows when nobody is signed in.
 *
 * Closest academy screen: the licence lock window (src/lock/lock-app.tsx). The
 * same frame, the same round mark over a heading, the same card and the same
 * form, with a field-level message under the field instead of a toast (the
 * Toaster lives in the dashboard shell, which does not exist here).
 *
 * Like that window it is not an overlay and not a route. `main.tsx` draws it
 * *instead of* the router while there is no session, so no page is mounted
 * behind it, none of their queries has run, and there is nothing to navigate
 * past.
 *
 * Two steps on one screen: pick your name, then type your password. The second
 * step is one of four forms, decided by the account and by what the first
 * answer was:
 *
 *  - `password`: the ordinary case;
 *  - `first`: the account has no password yet (the manager on a new
 *    installation, an account just made): choose one;
 *  - `replace`: the password was right but is one the manager gave: choose
 *    your own before going further;
 *  - `recovery`: the manager's way back, with the code he wrote down.
 *
 * A manager who has just chosen a password is shown his recovery code, and the
 * program opens only once he says he wrote it down.
 */
type Step =
  | { kind: "password" }
  | { kind: "first" }
  | { kind: "replace"; given: string }
  | { kind: "recovery" }
  | { kind: "code"; session: Session; code: string };

const SIGN_IN_ACCOUNTS_KEY = ["sign-in", "accounts"] as const;

export function SignInScreen() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const accounts = useQuery({
    queryKey: SIGN_IN_ACCOUNTS_KEY,
    queryFn: () => listSignInAccountsQuery(undefined),
  });

  const [chosenId, setChosenId] = React.useState<string | null>(null);
  const [step, setStep] = React.useState<Step>({ kind: "password" });
  const [password, setPassword] = React.useState("");
  const [next, setNext] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [code, setCode] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const list = accounts.data ?? [];
  // One account (a new installation has only the manager): there is nothing to choose.
  const chosen = list.find((account) => account.id === chosenId) ?? (list.length === 1 ? list[0] : undefined);

  function clearFields() {
    setPassword("");
    setNext("");
    setAgain("");
    setCode("");
    setError("");
  }

  function choose(account: SignInAccount | null) {
    clearFields();
    setChosenId(account?.id ?? null);
    setStep({ kind: "password" });
  }

  function roleOf(account: SignInAccount): string {
    return account.role[locale as keyof SignInAccount["role"]] ?? account.role.ar;
  }

  /** The two typed copies of a new password, checked before anything is asked of the database. */
  function newPasswordProblem(): string | null {
    if (!isPasswordLongEnough(next)) return t("PasswordTooShort", { min: MIN_PASSWORD_LENGTH });
    if (next !== again) return t("PasswordsDoNotMatch");
    return null;
  }

  function entered(session: Session, recoveryCode: string | null) {
    clearFields();
    if (recoveryCode) setStep({ kind: "code", session, code: recoveryCode });
    else enterSession(session);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !chosen || step.kind === "code") return;
    const form = chosen.needsPassword && step.kind === "password" ? "first" : step.kind;

    if (form !== "password") {
      const problem = newPasswordProblem();
      if (problem) {
        setError(problem);
        return;
      }
    }
    setBusy(true);
    setError("");
    try {
      if (form === "first") {
        const result = await setFirstPasswordAction({ userId: chosen.id, password: next });
        if (!result.success) return setError(errorMessage(result.error, t("SignInFailed")));
        return entered(result.data.session, result.data.recoveryCode);
      }

      if (form === "recovery") {
        const result = await resetManagerPasswordAction({ userId: chosen.id, recoveryCode: code, newPassword: next });
        if (!result.success) return setError(errorMessage(result.error, t("SignInFailed")));
        if (!result.data.ok) {
          setCode("");
          return setError(t("RecoveryWrong"));
        }
        return entered(result.data.session, result.data.recoveryCode);
      }

      const given = step.kind === "replace" ? step.given : password;
      const result = await signInAction({
        userId: chosen.id,
        password: given,
        ...(step.kind === "replace" ? { newPassword: next } : {}),
      });
      if (!result.success) return setError(errorMessage(result.error, t("SignInFailed")));
      const answer = result.data;
      if (answer.ok) return entered(answer.session, null);
      if (answer.reason === "NEW_PASSWORD_NEEDED") {
        setPassword("");
        return setStep({ kind: "replace", given });
      }
      if (answer.reason === "NO_PASSWORD_YET") {
        // The list was read before the account lost its password: read it again and ask for a first one.
        await accounts.refetch();
        return setStep({ kind: "first" });
      }
      setPassword("");
      setError(t("WrongPassword"));
    } catch {
      setError(t("SignInFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (step.kind === "code") {
    return (
      <Shell step="code">
        <RecoveryCodePanel code={step.code} onContinue={() => enterSession(step.session)} />
      </Shell>
    );
  }

  const form = chosen ? (chosen.needsPassword && step.kind === "password" ? "first" : step.kind) : null;
  const choosing = form === "first" || form === "replace" || form === "recovery";

  return (
    <Shell step={form ?? "accounts"}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground">
          {form === "recovery" ? <KeyRound className="size-8" /> : <LockKeyhole className="size-8" />}
        </div>
        <h1 className="text-3xl font-bold">
          {form === "first"
            ? t("FirstPasswordTitle")
            : form === "replace"
              ? t("GivenPasswordTitle")
              : form === "recovery"
                ? t("RecoveryEnter")
                : t("SignInTitle")}
        </h1>
        <p className="text-lg leading-relaxed text-balance text-muted-foreground">
          {form === "first"
            ? t("FirstPasswordHint")
            : form === "replace"
              ? t("GivenPasswordHint")
              : form === "recovery"
                ? t("RecoveryHint")
                : t("SignInHint")}
        </p>
      </div>

      {accounts.isPending ? (
        <div className="flex flex-col gap-3">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : accounts.isError ? (
        <ErrorState title={t("AccountsFailed")} onRetry={() => void accounts.refetch()} />
      ) : !chosen ? (
        <div role="radiogroup" aria-label={t("Accounts")} className="flex flex-col gap-2">
          {list.map((account) => (
            <AccountRow key={account.id} account={account} role={roleOf(account)} onChoose={() => choose(account)} />
          ))}
        </div>
      ) : (
        <>
          <AccountRow
            account={chosen}
            role={roleOf(chosen)}
            chosen
            // With one account there is nobody else to be.
            onChoose={list.length > 1 ? () => choose(null) : undefined}
          />

          <form className="flex flex-col gap-4" onSubmit={submit}>
            {form === "password" && (
              <Field
                id="signin_password"
                label={t("Password")}
                value={password}
                onChange={(value) => {
                  setPassword(value);
                  if (error) setError("");
                }}
                invalid={!!error}
                autoFocus
              />
            )}
            {form === "recovery" && (
              <Field
                id="signin_recovery_code"
                label={t("RecoveryCode")}
                value={code}
                onChange={(value) => {
                  setCode(value);
                  if (error) setError("");
                }}
                invalid={!!error}
                placeholder="1234-5678-9012-3456"
                numeric
                autoFocus
              />
            )}
            {choosing && (
              <>
                <Field
                  id="signin_new_password"
                  label={t("NewPassword")}
                  value={next}
                  onChange={(value) => {
                    setNext(value);
                    if (error) setError("");
                  }}
                  invalid={!!error}
                  autoFocus={form !== "recovery"}
                />
                <Field
                  id="signin_confirm_password"
                  label={t("ConfirmPassword")}
                  value={again}
                  onChange={(value) => {
                    setAgain(value);
                    if (error) setError("");
                  }}
                  invalid={!!error}
                />
                {chosen.isManager && form === "first" && (
                  <p className="text-base leading-relaxed text-muted-foreground">{t("ManagerFirstHint")}</p>
                )}
              </>
            )}

            {/* Inline rather than a toast: a wrong password is field-level
                feedback and belongs next to the field it describes. */}
            {error && (
              <p role="alert" className="text-base font-bold text-destructive">
                {error}
              </p>
            )}

            <Button
              type="submit"
              size="lg"
              loading={busy}
              disabled={
                form === "password"
                  ? !password.trim()
                  : !next.trim() || !again.trim() || (form === "recovery" && !code.trim())
              }
            >
              {!busy && <LockKeyhole />}
              {choosing ? t("SavePassword") : t("SignIn")}
            </Button>

            {/* Only the manager has a code to fall back on, and only once he has a password to have forgotten. */}
            {chosen.isManager && (form === "password" || form === "recovery") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-muted-foreground"
                onClick={() => {
                  clearFields();
                  setStep({ kind: form === "recovery" ? "password" : "recovery" });
                }}
              >
                {form === "recovery" ? t("UsePassword") : t("ForgotPassword")}
              </Button>
            )}
          </form>
        </>
      )}
    </Shell>
  );
}

/**
 * One account: a name over its role. In the list it is a choice; above the
 * form it is who the password is asked of, and pressing it goes back to the
 * list.
 */
function AccountRow({
  account,
  role,
  chosen = false,
  onChoose,
}: {
  account: SignInAccount;
  role: string;
  chosen?: boolean;
  onChoose?: () => void;
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={chosen}
      data-signin-user={account.username}
      disabled={!onChoose}
      onClick={onChoose}
      className={cn(
        "flex min-w-0 items-center gap-4 rounded-lg border-2 bg-card px-5 py-2.5 text-start transition-colors outline-none",
        "focus-visible:ring-[3px] focus-visible:ring-ring/40",
        chosen ? "border-primary bg-primary/8" : "border-border-strong hover:bg-accent/60",
        !onChoose && "cursor-default",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-full",
          chosen ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground",
        )}
      >
        {chosen ? <Check className="size-5" /> : <UserRound className="size-5" />}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate text-lg font-bold">{account.displayName}</span>
        <span className="truncate text-base text-muted-foreground">{role}</span>
      </span>
    </button>
  );
}

function Field({
  id,
  label,
  value,
  onChange,
  invalid,
  placeholder,
  numeric = false,
  autoFocus = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  invalid: boolean;
  placeholder?: string;
  numeric?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <div className="grid min-w-0 gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        // Credentials read left to right even in Arabic: a right-to-left field
        // shows a password or a run of digits in an order nobody can check.
        dir="ltr"
        type={numeric ? "text" : "password"}
        inputMode={numeric ? "numeric" : undefined}
        autoComplete="off"
        spellCheck={false}
        autoFocus={autoFocus}
        placeholder={placeholder}
        className={numeric ? "text-center font-mono text-xl tracking-widest" : "text-xl"}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={invalid}
      />
    </div>
  );
}

/**
 * The manager's recovery code, in the one moment it can be read. The program
 * opens only once he has said that he wrote it down: waving this away would
 * destroy his only way back in, so here the friction is the feature (the
 * academy's `RecoveryRevealDialog`, as a panel of this window).
 */
function RecoveryCodePanel({ code, onContinue }: { code: string; onContinue: () => void }) {
  const t = useTranslations("Auth");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [copied, setCopied] = React.useState<"yes" | "no" | null>(null);
  const formatted = formatRecoveryCode(code);

  async function copy() {
    try {
      await navigator.clipboard.writeText(formatted);
      setCopied("yes");
    } catch {
      setCopied("no");
    }
  }

  return (
    <>
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-warning/15 text-warning-ink">
          <KeyRound className="size-8" />
        </div>
        <h1 className="text-3xl font-bold">{t("RecoveryTitle")}</h1>
        <p className="text-lg leading-relaxed text-balance text-muted-foreground">{t("RecoveryDesc")}</p>
      </div>

      <div className="border-app rounded-xl border-warning-ink/35 bg-warning/10 p-6 text-center">
        {/* Left to right and in tabular figures: this is a number copied onto
            paper, and mirroring it would give a code that is not the one kept. */}
        <p
          dir="ltr"
          data-signin-code
          className="font-mono text-2xl font-bold tracking-widest tabular-nums select-all tall:text-3xl"
        >
          {formatted}
        </p>
      </div>

      <Button variant="outline" onClick={copy}>
        <Copy />
        {t("CopyCode")}
      </Button>
      {copied && (
        <p role="status" className={cn("text-center text-base font-semibold", copied === "no" && "text-destructive")}>
          {copied === "yes" ? t("RecoveryCopied") : t("RecoveryCopyFailed")}
        </p>
      )}

      <label className="flex cursor-pointer items-start gap-3">
        <Checkbox
          data-signin-ack
          checked={acknowledged}
          onCheckedChange={(value) => setAcknowledged(value === true)}
          className="mt-0.5"
        />
        <span className="min-w-0 text-base leading-relaxed">{t("RecoveryAcknowledge")}</span>
      </label>

      <Button size="lg" data-signin-continue disabled={!acknowledged} onClick={onContinue}>
        {t("RecoveryContinue")}
      </Button>
    </>
  );
}

/**
 * The window's whole frame, as the licence lock window's: it scrolls inside
 * rather than growing, so the form is reachable in the shortest window.
 * `data-signin` names the step for whoever drives the screen from outside
 * (the harness).
 */
function Shell({ step, children }: { step: string; children: React.ReactNode }) {
  return (
    <div data-signin={step} className="flex h-dvh flex-col overflow-y-auto bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-lg flex-col justify-center gap-6 px-6 py-10">{children}</main>
    </div>
  );
}
