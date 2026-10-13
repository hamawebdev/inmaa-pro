import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useMay } from "@/features/people/components/may";
import { useReasonDialog } from "@/features/people/components/reason-dialog";
import { useSubjectLabel } from "@/features/people/components/subject-label";
import { SanctionChip } from "@/features/people/components/sanction-chip";
import { DECISION_TONE } from "@/features/people/components/status-tones";
import {
  answerDecisionAction,
  cancelDecisionAction,
  listDecisionsQuery,
  type DecisionRow,
} from "@/features/people/services/sanction-decisions";
import {
  liftSanctionAction,
  listSanctionsQuery,
  SANCTIONS_PATH,
  type SanctionRow,
} from "@/features/people/services/sanctions";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * «الموقوفون والمعاقبون»: the questions «هل نسمح له أم لا؟» that wait for the
 * manager, with his answers, and every sanction in force on a worker, an
 * employee or a client. Section «عمال النظافة», below the tab «العمال». Owner:
 * People.
 *
 * The manager sees every question and answers here, with his reason. Anybody
 * else sees the questions they asked: one still waiting can be withdrawn, one
 * he said yes to leads back to the registration it was asked for.
 *
 * Closest academy screen: the absences detail of the attendance family (a
 * detail screen of cards, each a list with its row actions), with the newer
 * generation's chips.
 */

export default function SanctionsPage() {
  const t = useTranslations("Sanctions");
  const subjectLabel = useSubjectLabel();
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const [askReason, reasonDialog] = useReasonDialog();
  const { data: decisions = [] } = useQuery({
    queryKey: [...pathKey(SANCTIONS_PATH), "decisions"],
    queryFn: () => listDecisionsQuery({}),
  });
  const { data: sanctions = [] } = useQuery({
    queryKey: [...pathKey(SANCTIONS_PATH), "in-force"],
    queryFn: () => listSanctionsQuery({ inForceOnly: true }),
  });
  const canAnswer = useMay("sanction.answer");
  const canLift = useMay("sanction.set");

  const report = (result: { success: boolean; error?: string }, done: string) => {
    if (result.success) toast.success(done);
    else toast.error(errorMessage(result.error, t("Page.Failed")));
  };

  const answer = async (decision: DecisionRow) => {
    const given = await askReason({
      title: t("Gate.AnswerTitle"),
      description: t("Page.AnswerDescription", { name: decision.attemptName }),
      details: <DecisionFacts decision={decision} />,
      reasonLabel: t("Gate.AnswerReason"),
      confirmLabel: t("Gate.Allow"),
      confirmTone: "success",
      secondLabel: t("Gate.Refuse"),
    });
    if (!given) return;
    const allow = given.answer === "confirm";
    report(
      await answerDecisionAction({ decisionId: decision.id, allow, reason: given.reason }),
      t(allow ? "Page.Allowed" : "Page.Refused"),
    );
  };

  const withdraw = async (decision: DecisionRow) => {
    const given = await askReason({
      title: t("Page.WithdrawTitle"),
      reasonLabel: t("Page.WithdrawReason"),
      confirmLabel: t("Page.Withdraw"),
      confirmTone: "destructive",
    });
    if (!given) return;
    report(await cancelDecisionAction({ decisionId: decision.id, reason: given.reason }), t("Page.Withdrawn"));
  };

  const lift = async (sanction: SanctionRow) => {
    const given = await askReason({
      title: t("Card.LiftTitle"),
      description: t("Card.LiftDescription"),
      reasonLabel: t("Card.LiftReason"),
      confirmLabel: t("Card.Lift"),
    });
    if (!given) return;
    report(await liftSanctionAction({ sanctionId: sanction.id, reason: given.reason }), t("Card.LiftDone"));
  };

  return (
    <DetailScreen
      section="workers"
      title={t("Page.Title")}
      back={{ href: "/dashboard/workers", label: tNav("WorkersList") }}
    >
      <div className="space-y-6">
        <Card id="sanction-decisions">
          <CardHeader>
            <CardTitle className="text-base">{t("Page.DecisionsTitle")}</CardTitle>
            <CardDescription>{t(canAnswer ? "Page.DecisionsForManager" : "Page.DecisionsForClerk")}</CardDescription>
          </CardHeader>
          <CardContent>
            {decisions.length === 0 ? (
              <p className="text-muted-foreground">{t("Page.NoDecisions")}</p>
            ) : (
              <ul className="grid gap-3">
                {decisions.map((decision) => {
                  const used = decision.consumedAt !== null;
                  return (
                    <li key={decision.id} className="border-app grid gap-3 rounded-lg border-border px-4 py-3">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex flex-wrap items-center gap-2 font-bold">
                            {decision.attemptName}
                            <span className="font-normal text-muted-foreground">
                              {t(`Contexts.${decision.context}`)}
                            </span>
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {decision.requestedBy ?? ""} · <Ltr>{decision.requestedAt.slice(0, 10)}</Ltr>
                          </p>
                        </div>
                        <StatusChip
                          tone={used ? "neutral" : DECISION_TONE[decision.status]}
                          label={used ? t("Page.Used") : t(`DecisionStatuses.${decision.status}`)}
                        />
                      </div>
                      <DecisionFacts decision={decision} />
                      {decision.answerReason && (
                        <p className="text-base">
                          <span className="text-muted-foreground">
                            {decision.answeredBy ?? ""}
                            {decision.answeredBy ? ": " : ""}
                          </span>
                          {decision.answerReason}
                        </p>
                      )}
                      <div className="flex flex-wrap justify-end gap-2">
                        {decision.status === "PENDING" && canAnswer && (
                          <Button type="button" variant="warning" size="sm" onClick={() => answer(decision)}>
                            {t("Page.Answer")}
                          </Button>
                        )}
                        {decision.status === "PENDING" && (decision.requestedByMe || canAnswer) && (
                          <Button type="button" variant="outline" size="sm" onClick={() => withdraw(decision)}>
                            {t("Page.Withdraw")}
                          </Button>
                        )}
                        {decision.status === "ALLOWED" && !used && decision.resumeRoute && (
                          <Button asChild variant="success" size="sm">
                            <Link to={`${decision.resumeRoute}?decision=${decision.id}`}>{t("Page.Resume")}</Link>
                          </Button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card id="sanctions-in-force">
          <CardHeader>
            <CardTitle className="text-base">{t("Page.InForceTitle")}</CardTitle>
            <CardDescription>{t("Page.InForceDescription")}</CardDescription>
          </CardHeader>
          <CardContent>
            {sanctions.length === 0 ? (
              <p className="text-muted-foreground">{t("Page.NoSanctions")}</p>
            ) : (
              <ul className="grid gap-3">
                {sanctions.map((sanction) => (
                  <li
                    key={sanction.id}
                    className="border-app flex flex-wrap items-start justify-between gap-3 rounded-lg border-border px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-bold">
                        <PersonLink sanction={sanction} />
                        {sanction.displayNumber && (
                          <Ltr className="font-normal text-muted-foreground">{sanction.displayNumber}</Ltr>
                        )}
                        <span className="font-normal text-muted-foreground">
                          {subjectLabel(sanction.subjectKind, {
                            sex: sanction.subjectSex,
                            role: sanction.subjectRole,
                            number: sanction.displayNumber,
                          })}
                        </span>
                        {sanction.upcoming ? (
                          <StatusChip
                            tone="pending"
                            label={t("Card.Upcoming", {
                              state: t(
                                `${sanction.subjectKind === "CLIENT" ? "ClientStates" : "States"}.${sanction.state}`,
                              ),
                            })}
                          />
                        ) : (
                          <SanctionChip kind={sanction.subjectKind} state={sanction.state} />
                        )}
                      </p>
                      <p className="text-base">{sanction.reason}</p>
                      <p className="text-sm text-muted-foreground">
                        <Ltr>
                          {sanction.startDate}
                          {sanction.endDate ? ` → ${sanction.endDate}` : ""}
                        </Ltr>
                        {sanction.setBy ? ` · ${sanction.setBy}` : ""}
                      </p>
                    </div>
                    {canLift && (
                      <Button type="button" variant="outline" size="sm" onClick={() => lift(sanction)}>
                        {t("Card.Lift")}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
      {reasonDialog}
    </DetailScreen>
  );
}

/** The sanction a question is about, and what the match rests on. */
function DecisionFacts({ decision }: { decision: DecisionRow }) {
  const t = useTranslations("Sanctions");
  const subjectLabel = useSubjectLabel();
  const { sanction } = decision;
  return (
    <dl className="border-app grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg border-border bg-muted/40 px-4 py-3 text-base">
      <dt className="text-muted-foreground">
        {subjectLabel(sanction.subjectKind, { number: sanction.displayNumber })}
      </dt>
      <dd className="flex flex-wrap items-center gap-2 font-bold">
        {sanction.displayName}
        {sanction.displayNumber && <Ltr className="font-normal text-muted-foreground">{sanction.displayNumber}</Ltr>}
        <SanctionChip kind={sanction.subjectKind} state={sanction.state} />
      </dd>
      <dt className="text-muted-foreground">{t("Facts.Since")}</dt>
      <dd>
        <Ltr>{sanction.startDate}</Ltr>
        {sanction.endDate && (
          <>
            {" "}
            {t("Facts.Until")} <Ltr>{sanction.endDate}</Ltr>
          </>
        )}
      </dd>
      <dt className="text-muted-foreground">{t("Facts.Reason")}</dt>
      <dd>{sanction.reason}</dd>
      <dt className="text-muted-foreground">{t("Facts.FoundBy")}</dt>
      <dd>{t(`Bases.${decision.matchBasis}`)}</dd>
    </dl>
  );
}

/** The person's name, leading to the file when it is one of People's. */
function PersonLink({ sanction }: { sanction: SanctionRow }) {
  if (sanction.subjectKind === "CLIENT") return <span>{sanction.displayName}</span>;
  const base = sanction.subjectKind === "WORKER" ? "/dashboard/workers" : "/dashboard/employees";
  return (
    <Link to={`${base}/${sanction.subjectId}`} className="hover:underline">
      {sanction.displayName}
    </Link>
  );
}
