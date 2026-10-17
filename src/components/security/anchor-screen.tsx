import * as React from "react";

import { LockKeyhole, RotateCcw, ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { answerAnchorAction } from "@/features/core/services/anchor-answer";
import { leaveSession } from "@/features/core/services/session";
import { anchorAfterAnswer, recheckStartupAnchor, type StartupAnchor } from "@/features/core/services/startup";
import { useDateText } from "@/hooks/use-date-text";
import { useCan } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { MANAGER_ONLY_CAPABILITY } from "@/lib/access/catalogue";
import type { AnchorComparison } from "@/lib/chain/anchor";
import { clearRestoreNote, type RestoreNote } from "@/server/backup";

/**
 * What the program opens on when the database does not agree with its anchor
 * (DESIGN.md section 8): an older copy was restored, a record was altered, or
 * the data is another machine's.
 *
 * Closest academy screen: the licence lock window, as the sign-in window. It
 * is drawn *instead of* the program (src/components/security/program-gate.tsx),
 * for everybody: nothing is written to a database in question, least of all an
 * invoice whose number may already have been given. Only the manager answers,
 * with his reason in his own words; anyone else is told to fetch him.
 *
 * When the comparison itself could not be made (a read or the anchor command
 * failed), the database is in question all the same: the screen says so and
 * offers to try again, to anyone (audit LOG-11).
 */
export function AnchorScreen({ comparison, note }: { comparison: StartupAnchor; note: RestoreNote | null }) {
  if (comparison.state === "unchecked") return <UncheckedScreen />;
  return <AnswerScreen comparison={comparison} note={note} />;
}

function AnswerScreen({ comparison, note }: { comparison: AnchorComparison; note: RestoreNote | null }) {
  const t = useTranslations("AnchorScreen");
  const dates = useDateText();
  const errorMessage = useErrorMessage();
  const mayAnswer = useCan(MANAGER_ONLY_CAPABILITY);
  // A restore the manager has just asked for carries the reason he typed then.
  const [reason, setReason] = React.useState(note?.reason ?? "");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const state = comparison.state;
  const danger = state === "altered";
  const lost = comparison.lostNumbers.reduce((sum, gap) => sum + (gap.toValue - gap.fromValue + 1), 0);

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !reason.trim()) return;
    setBusy(true);
    setError("");
    try {
      const result = await answerAnchorAction({
        comparison,
        reason,
        restoredFromPath: note?.restoredFromPath ?? null,
        preRestorePath: note?.preRestorePath ?? null,
      });
      if (!result.success) {
        setError(errorMessage(result.error, t("Failed")) ?? "");
        return;
      }
      // The answer is in the database: the anchor now follows it, and the note has done its work.
      if (note) await clearRestoreNote().catch(() => {});
      await anchorAfterAnswer();
    } catch {
      setError(t("Failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenFrame state={state} danger={danger} title={t(`States.${state}.Title`)} body={t(`States.${state}.Body`)}>
      {state === "behind" && (
        <div className="rounded-lg border-2 border-border-strong bg-card p-5 text-lg leading-relaxed">
          <p>
            {t("Behind.Anchor")} <Ltr className="font-bold">{comparison.anchor?.lastInvoice?.number ?? "—"}</Ltr>
            {comparison.anchor?.lastInvoice?.issueDate && <> ({dates.long(comparison.anchor.lastInvoice.issueDate)})</>}
          </p>
          <p>
            {t("Behind.Database")}{" "}
            <Ltr className="font-bold">{comparison.database.lastInvoice?.number ?? t("Behind.None")}</Ltr>
          </p>
          {lost > 0 && <p className="mt-2 text-base text-muted-foreground">{t("Behind.Lost", { count: lost })}</p>}
        </div>
      )}
      {note && (
        <p className="text-center text-base text-muted-foreground">
          {t("Restored", { name: note.byUserName })} <Ltr className="break-all">{note.restoredFromPath}</Ltr>
        </p>
      )}

      {mayAnswer ? (
        <form className="flex flex-col gap-4" onSubmit={confirm}>
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="anchor_reason">{t("Reason")}</Label>
            <Textarea
              id="anchor_reason"
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError("");
              }}
              aria-invalid={!!error}
            />
            <p className="text-base leading-relaxed text-muted-foreground">{t(`States.${state}.Consequence`)}</p>
          </div>
          {error && (
            <p role="alert" className="text-base font-bold text-destructive">
              {error}
            </p>
          )}
          <Button
            type="submit"
            size="lg"
            variant={danger ? "destructive" : "default"}
            loading={busy}
            disabled={!reason.trim()}
          >
            {!busy && <ShieldCheck />}
            {t("Confirm")}
          </Button>
        </form>
      ) : (
        <p className="rounded-lg border-2 border-border-strong bg-card p-5 text-center text-lg leading-relaxed">
          {t("ManagerOnly")}
        </p>
      )}
    </ScreenFrame>
  );
}

/** The comparison could not be made: nothing is worked on until it is. Anyone may try again. */
function UncheckedScreen() {
  const t = useTranslations("AnchorScreen");
  const [busy, setBusy] = React.useState(false);
  const [failedAgain, setFailedAgain] = React.useState(false);

  async function retry() {
    setBusy(true);
    try {
      const found = await recheckStartupAnchor();
      setFailedAgain(found?.state === "unchecked");
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenFrame state="unchecked" danger title={t("States.unchecked.Title")} body={t("States.unchecked.Body")}>
      {failedAgain && (
        <p role="alert" className="text-center text-base font-bold text-destructive">
          {t("States.unchecked.FailedAgain")}
        </p>
      )}
      <Button type="button" size="lg" loading={busy} onClick={() => void retry()}>
        {!busy && <RotateCcw />}
        {t("TryAgain")}
      </Button>
    </ScreenFrame>
  );
}

/**
 * The window the anchor and clock screens share: the sign-in window's frame, a
 * mark, a title and a line, then their own part, and «قفل» at the foot.
 */
export function ScreenFrame({
  state,
  danger,
  title,
  body,
  children,
}: {
  /** Marks the window for the harness: `data-anchor-screen`. */
  state: string;
  danger: boolean;
  title: string;
  body: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("AnchorScreen");
  return (
    <div data-anchor-screen={state} className="flex h-dvh flex-col overflow-y-auto bg-background text-foreground">
      <main className="mx-auto flex w-full max-w-xl flex-col justify-center gap-6 px-6 py-10">
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className={
              danger
                ? "flex size-16 items-center justify-center rounded-full bg-destructive/12 text-destructive"
                : "flex size-16 items-center justify-center rounded-full bg-warning/15 text-warning-ink"
            }
          >
            <ShieldAlert className="size-8" />
          </div>
          <h1 className="text-3xl font-bold">{title}</h1>
          <p className="text-lg leading-relaxed text-balance text-muted-foreground">{body}</p>
        </div>
        {children}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-muted-foreground"
          onClick={() => void leaveSession()}
        >
          <LockKeyhole />
          {t("SignOut")}
        </Button>
      </main>
    </div>
  );
}
