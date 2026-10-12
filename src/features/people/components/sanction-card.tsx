import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  liftSanctionAction,
  listSanctionsQuery,
  SANCTIONS_PATH,
  setSanctionAction,
  type SanctionRow,
} from "@/features/people/services/sanctions";
import { SANCTION_STATES, type SanctionState, type SanctionSubject } from "@/features/people/validators/staff-codes";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

import { isolate, may, todayAtTheCentre } from "./may";
import { useReasonDialog } from "./reason-dialog";
import { SanctionChip } from "./sanction-chip";

/**
 * A person's «موقف / متوقف / معاقب»: the sanction in force, the manager's
 * buttons to set one and to lift it (with the reason and the dates), and the
 * history. For a worker's and an employee's file, and for Clients' client card:
 *
 *     <SanctionCard subjectKind="CLIENT" subjectId={client.id} />
 *
 * Closest academy component: a card of the employee file, with the newer
 * generation's chips.
 */
export function SanctionCard({ subjectKind, subjectId }: { subjectKind: SanctionSubject; subjectId: string }) {
  const t = useTranslations("Sanctions");
  const errorMessage = useErrorMessage();
  const [askReason, reasonDialog] = useReasonDialog();
  const { data: sanctions = [] } = useQuery({
    queryKey: [...pathKey(SANCTIONS_PATH), subjectKind, subjectId],
    queryFn: () => listSanctionsQuery({ subjectKind, subjectId }),
  });
  const states = subjectKind === "CLIENT" ? "ClientStates" : "States";
  const live = sanctions.find((sanction) => sanction.inForce) ?? sanctions.find((sanction) => sanction.upcoming);
  const canSet = may("sanction.set");

  const set = async () => {
    const answer = await askReason({
      title: t("Card.SetTitle"),
      description: t("Card.SetDescription"),
      fields: [
        {
          kind: "choice",
          name: "state",
          label: t("Card.State"),
          options: SANCTION_STATES.map((state) => ({ value: state, label: t(`${states}.${state}`) })),
        },
        { kind: "date", name: "startDate", label: t("Card.From"), required: true, defaultValue: todayAtTheCentre() },
        { kind: "date", name: "endDate", label: t("Card.Until") },
      ],
      reasonLabel: t("Card.Reason"),
      confirmLabel: t("Card.Set"),
      confirmTone: "destructive",
    });
    if (!answer) return;
    const result = await setSanctionAction({
      subjectKind,
      subjectId,
      state: answer.values.state as SanctionState,
      reason: answer.reason,
      startDate: answer.values.startDate,
      endDate: answer.values.endDate || null,
    });
    if (result.success) toast.success(t("Card.SetDone"));
    else toast.error(errorMessage(result.error, t("Card.Failed")));
  };

  const lift = async (sanction: SanctionRow) => {
    const answer = await askReason({
      title: t("Card.LiftTitle"),
      description: t("Card.LiftDescription"),
      reasonLabel: t("Card.LiftReason"),
      confirmLabel: t("Card.Lift"),
    });
    if (!answer) return;
    const result = await liftSanctionAction({ sanctionId: sanction.id, reason: answer.reason });
    if (result.success) toast.success(t("Card.LiftDone"));
    else toast.error(errorMessage(result.error, t("Card.Failed")));
  };

  return (
    <Card id="sanction-card">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <CardTitle className="text-base">{t("Card.Title")}</CardTitle>
            {live?.inForce ? (
              <SanctionChip kind={subjectKind} state={live.state} />
            ) : live?.upcoming ? (
              <StatusChip tone="pending" label={t("Card.Upcoming", { state: t(`${states}.${live.state}`) })} />
            ) : (
              <StatusChip tone="success" label={t("Card.None")} />
            )}
          </div>
          {canSet && (
            <div className="flex flex-wrap items-center gap-2">
              {live ? (
                <Button type="button" variant="outline" size="sm" onClick={() => lift(live)}>
                  {t("Card.Lift")}
                </Button>
              ) : (
                <Button type="button" variant="outline" size="sm" onClick={set}>
                  {t("Card.Set")}
                </Button>
              )}
            </div>
          )}
        </div>
        {live && (
          <CardDescription>
            {t("Card.Period", { since: isolate(live.startDate) })}
            {live.endDate ? ` ${t("Card.PeriodUntil", { until: isolate(live.endDate) })}` : ""} · {live.reason}
          </CardDescription>
        )}
      </CardHeader>
      {sanctions.length > 0 && (
        <CardContent>
          <ul className="grid gap-3">
            {sanctions.map((sanction) => (
              <li
                key={sanction.id}
                className="border-app flex flex-wrap items-start justify-between gap-x-6 gap-y-1 rounded-lg border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    {t(`${states}.${sanction.state}`)}
                    <Ltr className="font-normal text-muted-foreground">
                      {sanction.startDate}
                      {sanction.endDate ? ` → ${sanction.endDate}` : ""}
                    </Ltr>
                  </p>
                  <p className="text-base">{sanction.reason}</p>
                  {sanction.liftedAt && (
                    <p className="text-sm text-muted-foreground">
                      {t("Card.LiftedOn", { date: isolate(sanction.liftedAt.slice(0, 10)) })}
                      {sanction.liftReason ? ` · ${sanction.liftReason}` : ""}
                    </p>
                  )}
                </div>
                <p className="text-sm text-muted-foreground">
                  {sanction.setBy ? t("Card.SetBy", { name: sanction.setBy }) : ""}
                </p>
              </li>
            ))}
          </ul>
        </CardContent>
      )}
      {reasonDialog}
    </Card>
  );
}
