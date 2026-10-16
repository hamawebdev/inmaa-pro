import * as React from "react";

import { CalendarCheck } from "lucide-react";
import { useTranslations } from "use-intl";

import { ScreenFrame } from "@/components/security/anchor-screen";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { confirmClockDateAction } from "@/features/core/services/clock";
import { recheckStartupClock } from "@/features/core/services/startup";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useDateText } from "@/hooks/use-date-text";
import { useErrorMessage } from "@/i18n/errors";
import type { ClockState } from "@/lib/clock/sanity";

/**
 * What the manager sees when he signs in on a PC whose date is in question
 * (src/lib/clock/sanity.ts): several days after the last recorded work, or
 * earlier than it.
 *
 * Closest academy screen: the licence lock window, as the anchor screen
 * beside it. Drawn instead of the program, for the manager only
 * (src/components/security/program-gate.tsx). Anyone else signs in after a
 * jump and works, while nothing legal is issued and the day's own work waits;
 * with the clock behind, nobody else signs in.
 *
 *  - jump: the centre was closed: he confirms the date in one step; or he
 *    locks, corrects the PC's date and signs in again;
 *  - behind: he corrects the PC's date; or, if the recorded date was the wrong
 *    one, he confirms today's with his reason.
 */
export function ClockScreen({ clock }: { clock: Exclude<ClockState, { state: "ok" }> }) {
  const t = useTranslations("ClockScreen");
  const errorMessage = useErrorMessage();
  const dates = useDateText();
  const { today } = useCentreClock();
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const behind = clock.state === "behind";

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    if (busy || (behind && !reason.trim())) return;
    setBusy(true);
    setError("");
    try {
      const result = await confirmClockDateAction(behind ? { reason } : {});
      if (!result.success) {
        setError(errorMessage(result.error, t("Failed")) ?? "");
        return;
      }
      await recheckStartupClock();
    } catch {
      setError(t("Failed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenFrame
      state={`clock-${clock.state}`}
      danger={behind}
      title={t(`${behind ? "Behind" : "Jump"}.Title`)}
      body={t(`${behind ? "Behind" : "Jump"}.Body`)}
    >
      <div className="rounded-lg border-2 border-border-strong bg-card p-5 text-lg leading-relaxed">
        <p>
          {t("Today")} <span className="font-bold">{dates.long(today)}</span>
        </p>
        <p>
          {t("LastWork")} <span className="font-bold">{dates.ofInstant(clock.lastAt)}</span>
        </p>
        {!behind && <p className="mt-2 text-base text-muted-foreground">{t("Days", { count: clock.jumpDays })}</p>}
      </div>

      <form className="flex flex-col gap-4" onSubmit={confirm}>
        {behind && (
          <div className="grid min-w-0 gap-1.5">
            <Label htmlFor="clock_reason">{t("Reason")}</Label>
            <Textarea
              id="clock_reason"
              rows={3}
              value={reason}
              onChange={(event) => {
                setReason(event.target.value);
                if (error) setError("");
              }}
              aria-invalid={!!error}
            />
          </div>
        )}
        <p className="text-base leading-relaxed text-muted-foreground">
          {t(`${behind ? "Behind" : "Jump"}.Consequence`)}
        </p>
        {error && (
          <p role="alert" className="text-base font-bold text-destructive">
            {error}
          </p>
        )}
        <Button
          type="submit"
          size="lg"
          variant={behind ? "destructive" : "default"}
          loading={busy}
          disabled={behind && !reason.trim()}
        >
          {!busy && <CalendarCheck />}
          {t(`${behind ? "Behind" : "Jump"}.Confirm`)}
        </Button>
      </form>
    </ScreenFrame>
  );
}
