import * as React from "react";

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
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import type { PersonIdentity } from "@/features/people/rules/sanction-match";
import { decideOnTheSpotAction, requestDecisionAction } from "@/features/people/services/sanction-decisions";
import { checkSanctionQuery, type CheckSanctionResult, type SanctionFound } from "@/features/people/services/sanctions";
import type { SanctionContext, SanctionSubject } from "@/features/people/validators/staff-codes";
import { useErrorMessage } from "@/i18n/errors";

import { may } from "./may";
import { SanctionFacts } from "./sanction-facts";

/**
 * The gate before a registration (CONTRACTS section 3, `<SanctionGate>`; his
 * note: «عند التعامل مع شخص موقفا أو معاقبا يمنعنا من تسجيله وينبهنا ويسألنا:
 * هل نسمح له أم لا؟»).
 *
 * A save runs it first and saves only with what it hands back:
 *
 *     const [passGate, gateDialogs] = useSanctionGate();
 *
 *     const passage = await passGate({ context: "CLIENT_FILE", subjectKind: "CLIENT", identity, draftPayload: values,
 *                                      resumeRoute: "/dashboard/files/new", decisionId });
 *     if (!passage) return;                                   // stopped, or waiting for the manager
 *     await saveAction({ ...values, ...passage });            // { notTheSamePerson, decisionId }
 *     return <>{gateDialogs}…</>;
 *
 * What it does, by what the check finds:
 *
 *  - nobody: passes;
 *  - a name alone: asks whether it is the same person. "Another person" passes
 *    (the save logs that word); "the same person" goes on as a match;
 *  - a match: «هل نسمح له أم لا؟». The manager answers on the spot, with his
 *    reason: his yes passes with its `decisionId`, which the save spends; his
 *    no stops. Anybody else sends the question to the manager, with what was
 *    typed (the services drop the health answers and the score), and stops:
 *    the request waits on the sanctions screen, and comes back to
 *    `resumeRoute?decision=<id>` once answered;
 *  - a `decisionId` the manager already answered: passes on his yes, stops on
 *    his no.
 *
 * The save checks again whatever this did: the gate is the question, not the lock.
 *
 * Closest academy component: the confirm dialog (`useConfirm`): a promise in,
 * a dialog in the page, and a dismissed dialog is never an answer.
 */

export interface GateAttempt {
  context: SanctionContext;
  /** What is being registered. */
  subjectKind: SanctionSubject;
  /** The existing record the attempt is about: a readmission, an edited identity. */
  subjectId?: string | null;
  /** The identity as typed. */
  identity: PersonIdentity;
  /** The manager's answer this attempt already has (a request resumed). */
  decisionId?: string | null;
  /** Leave the record's own sanction out (an edit of her own file). */
  ignoreOwnRecord?: boolean;
  /** What was typed so far, kept on a request so that nothing is typed twice. */
  draftPayload?: unknown;
  /** The screen to come back to once the manager answered. */
  resumeRoute?: string;
}

export interface GatePassage {
  notTheSamePerson: boolean;
  decisionId: string | null;
}

type Stage =
  | { kind: "NAME"; attempt: GateAttempt; match: SanctionFound }
  | { kind: "ANSWER" | "REQUEST"; attempt: GateAttempt; match: SanctionFound; nameConfirmed: boolean };

export function useSanctionGate(): [(attempt: GateAttempt) => Promise<GatePassage | null>, React.ReactNode] {
  const t = useTranslations("Sanctions.Gate");
  const tErrors = useTranslations("Errors");
  const errorMessage = useErrorMessage();
  const [stage, setStage] = React.useState<Stage | null>(null);
  const [reason, setReason] = React.useState("");
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const resolver = React.useRef<((passage: GatePassage | null) => void) | null>(null);

  const settle = React.useCallback((passage: GatePassage | null) => {
    resolver.current?.(passage);
    resolver.current = null;
    setStage(null);
    setBusy(false);
  }, []);

  React.useEffect(() => () => resolver.current?.(null), []);

  /** The match the manager is asked about: answered by him if he is here, sent to him otherwise. */
  const ask = (attempt: GateAttempt, match: SanctionFound, nameConfirmed: boolean) => {
    setReason("");
    setTried(false);
    setStage({ kind: may("sanction.answer") ? "ANSWER" : "REQUEST", attempt, match, nameConfirmed });
  };

  const pass = async (attempt: GateAttempt): Promise<GatePassage | null> => {
    let check: CheckSanctionResult;
    try {
      check = await checkSanctionQuery({
        context: attempt.context,
        subjectKind: attempt.subjectKind,
        subjectId: attempt.subjectId,
        identity: attempt.identity,
        decisionId: attempt.decisionId,
        ignoreOwnRecord: attempt.ignoreOwnRecord,
      });
    } catch (error) {
      toast.error(errorMessage(error instanceof Error ? error.message : null, tErrors("Unexpected")));
      return null;
    }
    if (check.outcome === "CLEAR") return { notTheSamePerson: false, decisionId: null };
    if (check.outcome === "ALLOWED") return { notTheSamePerson: false, decisionId: attempt.decisionId ?? null };
    if (check.outcome === "REFUSED") {
      toast.error(tErrors("SanctionRefused"));
      return null;
    }
    resolver.current?.(null);
    const [match] = check.matches;
    if (check.outcome === "POSSIBLE") setStage({ kind: "NAME", attempt, match });
    else ask(attempt, match, false);
    return new Promise<GatePassage | null>((resolve) => {
      resolver.current = resolve;
    });
  };

  const question = (stage: Extract<Stage, { kind: "ANSWER" | "REQUEST" }>) => ({
    context: stage.attempt.context,
    subjectKind: stage.attempt.subjectKind,
    subjectId: stage.attempt.subjectId,
    identity: stage.attempt.identity,
    sanctionId: stage.match.sanctionId,
    nameConfirmed: stage.nameConfirmed,
    draftPayload: stage.attempt.draftPayload,
    resumeRoute: stage.attempt.resumeRoute ?? null,
  });

  const answer = async (allow: boolean) => {
    if (stage?.kind !== "ANSWER") return;
    setTried(true);
    if (reason.trim() === "") return;
    setBusy(true);
    const result = await decideOnTheSpotAction({ ...question(stage), allow, reason });
    if (!result.success) {
      setBusy(false);
      toast.error(errorMessage(result.error, tErrors("Unexpected")));
      return;
    }
    if (!allow) toast.message(t("RefusedToast"));
    settle(allow ? { notTheSamePerson: false, decisionId: result.data.decisionId } : null);
  };

  const send = async () => {
    if (stage?.kind !== "REQUEST") return;
    setBusy(true);
    const result = await requestDecisionAction(question(stage));
    if (!result.success) {
      setBusy(false);
      toast.error(errorMessage(result.error, tErrors("Unexpected")));
      return;
    }
    toast.success(t("RequestSent"));
    settle(null);
  };

  const dialog = (
    <Dialog open={stage !== null} onOpenChange={(open) => !open && !busy && settle(null)}>
      <DialogContent>
        {stage?.kind === "NAME" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("NameTitle")}</DialogTitle>
              <DialogDescription>{t("NameDescription")}</DialogDescription>
            </DialogHeader>
            <SanctionFacts match={stage.match} />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => settle(null)}>
                {t("Cancel")}
              </Button>
              <Button type="button" variant="outline" onClick={() => ask(stage.attempt, stage.match, true)}>
                {t("SamePerson")}
              </Button>
              <Button type="button" onClick={() => settle({ notTheSamePerson: true, decisionId: null })}>
                {t("AnotherPerson")}
              </Button>
            </DialogFooter>
          </>
        )}
        {stage?.kind === "ANSWER" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("AnswerTitle")}</DialogTitle>
              <DialogDescription>{t("AnswerDescription")}</DialogDescription>
            </DialogHeader>
            <SanctionFacts match={stage.match} />
            <Field data-invalid={tried && reason.trim() === ""}>
              <FieldLabel htmlFor="sanction-gate-reason">{t("AnswerReason")}</FieldLabel>
              <Textarea
                id="sanction-gate-reason"
                rows={3}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                aria-invalid={tried && reason.trim() === ""}
              />
              {tried && reason.trim() === "" && <FieldError>{t("ReasonRequired")}</FieldError>}
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => settle(null)}>
                {t("Cancel")}
              </Button>
              <Button type="button" variant="destructive" disabled={busy} onClick={() => answer(false)}>
                {t("Refuse")}
              </Button>
              <Button type="button" variant="success" disabled={busy} onClick={() => answer(true)}>
                {t("Allow")}
              </Button>
            </DialogFooter>
          </>
        )}
        {stage?.kind === "REQUEST" && (
          <>
            <DialogHeader>
              <DialogTitle>{t("RequestTitle")}</DialogTitle>
              <DialogDescription>{t("RequestDescription")}</DialogDescription>
            </DialogHeader>
            <SanctionFacts match={stage.match} />
            <DialogFooter>
              <Button type="button" variant="outline" disabled={busy} onClick={() => settle(null)}>
                {t("Cancel")}
              </Button>
              <Button type="button" disabled={busy} onClick={send}>
                {t("SendRequest")}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );

  return [pass, dialog];
}
