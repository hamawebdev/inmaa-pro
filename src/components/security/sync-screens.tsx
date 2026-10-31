import * as React from "react";

import { CloudDownload, CloudOff, LockKeyhole, LogIn, MonitorSmartphone, MonitorX } from "lucide-react";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { leaveSession } from "@/features/core/services/session";
import { joinCentre, rejoinFromFullCopy, syncApi } from "@/features/sync/api";
import { useErrorMessage } from "@/i18n/errors";
import { ServiceError } from "@/lib/service/errors";
import type { JoinProgress, SyncStartupState } from "@/lib/sync/services/types";
import { cn } from "@/lib/utils";

/**
 * The sync screens that stand where the program would be: joining a centre
 * from a new laptop, and catching up after a restore (docs/sync/DECISION.md
 * sections 2 and 7, cases 7 and 8).
 *
 * Closest academy screen: the licence lock window, as the sign-in window and
 * the anchor screen beside them: the same frame, the same round mark over a
 * heading, one form.
 */

/** A part of the progress as a fraction from 0 to 100, or null while its size is unknown. */
function percent(done: number, total: number | null): number | null {
  if (total === null || total <= 0) return null;
  return Math.min(100, Math.round((done / total) * 100));
}

/**
 * «الانضمام إلى مركز موجود»: the mailbox address and the pairing code the
 * director's laptop shows. The centre's copy arrives, is installed, and the
 * program restarts on the sign-in window with the centre's accounts. Drawn
 * inside the sign-in window's frame, before anybody signs in.
 */
export function JoinCentrePanel({ onBack, rejoin = false }: { onBack: () => void; rejoin?: boolean }) {
  const t = useTranslations("SyncJoin");
  const errorMessage = useErrorMessage();
  const [origin, setOrigin] = React.useState("");
  const [code, setCode] = React.useState("");
  const [deviceName, setDeviceName] = React.useState(() => t("DeviceNameDefault"));
  const [progress, setProgress] = React.useState<JoinProgress | null>(null);
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setProgress({ phase: "TICKET", done: 0, total: null });
    try {
      // On success the program restarts: what follows is only seen if it does not.
      if (rejoin) await rejoinFromFullCopy(setProgress);
      else await joinCentre({ origin: origin.trim(), code, deviceName: deviceName.trim() }, setProgress);
    } catch (failure) {
      setProgress(null);
      setError(
        failure instanceof ServiceError ? (errorMessage(failure.message, t("Failed")) ?? t("Failed")) : t("Failed"),
      );
    } finally {
      setBusy(false);
    }
  }

  const share = progress ? percent(progress.done, progress.total) : null;

  return (
    <>
      <div className="flex shrink-0 flex-col items-center gap-3 text-center tight:gap-2">
        <div className="flex size-16 items-center justify-center rounded-full bg-muted text-muted-foreground tight:size-12">
          <MonitorSmartphone className="size-8 tight:size-6" />
        </div>
        <h1 className="text-3xl font-bold tight:text-2xl">{rejoin ? t("Rejoin.Title") : t("Title")}</h1>
        <p className="text-lg leading-relaxed text-balance text-muted-foreground">
          {rejoin ? t("Rejoin.Hint") : t("Description")}
        </p>
      </div>

      <form data-sync-join className="-mx-1 flex min-h-0 flex-col gap-4 overflow-y-auto px-1 pb-1" onSubmit={submit}>
        {!rejoin && (
          <>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="join_origin">{t("Origin")}</Label>
              <Input
                id="join_origin"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                autoFocus
                className="font-mono text-lg"
                value={origin}
                disabled={busy}
                onChange={(event) => setOrigin(event.target.value)}
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="join_code">{t("Code")}</Label>
              {/* Read left to right, as the director reads it out: groups of four, dashes and case ignored. */}
              <Input
                id="join_code"
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                placeholder="XXXX-XXXX-XXXX-XXXX-XXXX"
                className="text-center font-mono text-xl tracking-widest uppercase"
                value={code}
                disabled={busy}
                onChange={(event) => setCode(event.target.value)}
              />
            </div>
            <div className="grid min-w-0 gap-1.5">
              <Label htmlFor="join_device">{t("DeviceName")}</Label>
              <Input
                id="join_device"
                value={deviceName}
                disabled={busy}
                onChange={(event) => setDeviceName(event.target.value)}
              />
            </div>
          </>
        )}

        {progress && (
          <div role="status" className="flex flex-col gap-2 rounded-lg border-2 border-border-strong bg-card p-4">
            <p className="text-base font-bold">{t(`Phases.${progress.phase}`)}</p>
            <Progress value={share ?? 0} className={cn(share === null && "animate-pulse")} />
            {progress.total !== null && (
              <p className="text-sm text-muted-foreground tabular-nums">
                {t("Progress", { done: progress.done, total: progress.total })}
              </p>
            )}
            {progress.phase === "INSTALL" && <p className="text-base">{t("Restart")}</p>}
          </div>
        )}

        {error && (
          <p role="alert" className="text-base font-bold text-destructive">
            {error}
          </p>
        )}

        <Button
          type="submit"
          size="lg"
          loading={busy}
          disabled={!rejoin && (!origin.trim() || code.replace(/[\s-]/g, "").length < 20 || !deviceName.trim())}
        >
          {!busy && <MonitorSmartphone />}
          {rejoin ? t("Rejoin.Submit") : t("Submit")}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          disabled={busy}
          onClick={onBack}
        >
          {t("Back")}
        </Button>
      </form>
    </>
  );
}

/** The frame of the screens that stand before the program, in the sign-in window's style. */
function SyncFrame({ state, children }: { state: string; children: React.ReactNode }) {
  return (
    <div data-sync-screen={state} className="flex h-dvh flex-col overflow-y-auto bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-xl flex-col justify-center gap-6 px-6 py-10">{children}</main>
    </div>
  );
}

/**
 * «جارٍ استرجاع ما فات من الحاسوب الآخر» (case 7): a restored laptop takes back
 * from the mailbox what it sent after the copy and everything the other laptop
 * did, before anyone works on it. Without internet it waits and says so. The
 * manager may instead take the laptop out of sync: he signs in first
 * (`onManagerSignIn`), then answers on `manager`'s screen with his reason.
 */
export function SyncCatchUpScreen({
  state,
  signedIn,
  manager,
  onManagerSignIn,
}: {
  state: SyncStartupState;
  /** Somebody is signed in: the frame offers to lock instead of to sign in. */
  signedIn: boolean;
  /** The manager is signed in: he may take this laptop out of sync. */
  manager: boolean;
  onManagerSignIn: () => void;
}) {
  const t = useTranslations("SyncJoin.CatchUp");
  const errorMessage = useErrorMessage();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const share = percent(state.done, state.total);

  async function leave(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await syncApi.leaveSync({ reason: reason.trim() });
      if (!result.success) setError(errorMessage(result.error, t("LeaveFailed")) ?? t("LeaveFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SyncFrame state={state.offline ? "catch-up-offline" : "catch-up"}>
      <div className="flex flex-col items-center gap-3 text-center">
        <div
          className={
            state.offline
              ? "flex size-16 items-center justify-center rounded-full bg-warning/15 text-warning-ink"
              : "flex size-16 items-center justify-center rounded-full bg-progress/12 text-progress"
          }
        >
          {state.offline ? <CloudOff className="size-8" /> : <CloudDownload className="size-8" />}
        </div>
        <h1 className="text-3xl font-bold">{t("Title")}</h1>
        <p className="text-lg leading-relaxed text-balance text-muted-foreground">
          {state.offline ? t("Offline") : t("Hint")}
        </p>
      </div>

      <div role="status" className="flex flex-col gap-2 rounded-lg border-2 border-border-strong bg-card p-5">
        <Progress value={share ?? 0} className={cn(share === null && !state.offline && "animate-pulse")} />
        {state.total !== null && (
          <p className="text-base text-muted-foreground tabular-nums">
            {t("Progress", { done: state.done, total: state.total })}
          </p>
        )}
        <p className="text-base">{t("Wait")}</p>
      </div>

      {manager ? (
        <form className="flex flex-col gap-4 rounded-lg border-2 border-border bg-card/60 p-5" onSubmit={leave}>
          <p className="text-base leading-relaxed">{t("LeaveDescription")}</p>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="sync_leave_reason">{t("LeaveReason")}</Label>
            <Textarea
              id="sync_leave_reason"
              rows={2}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
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
          <Button type="submit" variant="destructive" loading={busy} disabled={!reason.trim()}>
            {!busy && <MonitorX />}
            {t("Leave")}
          </Button>
        </form>
      ) : (
        !signedIn && (
          <div className="flex flex-col items-center gap-2 text-center">
            <p className="text-base text-muted-foreground">{t("ManagerChoice")}</p>
            <Button type="button" variant="outline" onClick={onManagerSignIn}>
              <LogIn />
              {t("ManagerSignIn")}
            </Button>
          </div>
        )
      )}

      {signedIn && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => void leaveSession()}
        >
          <LockKeyhole />
          {t("Lock")}
        </Button>
      )}
    </SyncFrame>
  );
}
