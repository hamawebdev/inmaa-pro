import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Lock } from "lucide-react";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PageActions } from "@/components/screen";
import { StatCard } from "@/components/stat-card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { FieldGrid, NumberField, TextField } from "@/features/clients/components/part-fields";
import { computeCostStudy, type CostStudyTerms } from "@/features/clients/rules/pricing";
import { getCostStudyAction, saveCostStudyAction } from "@/features/clients/services/cost-study";
import { fileQueryPath } from "@/features/clients/services/file-reads";
import { COST_LINES, RATE_COST_LINES, type CostLineCode } from "@/features/clients/validators/pricing";
import { useMoneyText } from "@/hooks/use-money-text";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useRouter } from "@/lib/compat/navigation";
import { pathKey } from "@/lib/compat/revalidate";
import { fileHubHref } from "@/navigation/file-parts";

import { ltr } from "../../_components/ltr-text";

/**
 * «الدراسة المالية» of a file (plan feature 4): the work, what it costs, the
 * margin and the price it gives. Only who may read costs opens it, and every
 * opening is logged.
 *
 * Closest academy screen: the employee form (employees/_components/employee-form.tsx)
 * for its stacked cards of labelled fields with Cancel and Save at the foot;
 * the figures the program works out are the stat tiles of the attendance
 * overview (employee-attendance/page.tsx).
 */
export default function FileFinancialStudyPage() {
  const { id = "" } = useParams();
  const t = useTranslations("CostStudy");
  const tNav = useTranslations("Nav");
  const tHub = useTranslations("FileHub");
  const tCommon = useTranslations("Common");
  const seesCost = useCan("cost.read");
  const back = { href: fileHubHref(id), label: tNav("FileHub") };

  const study = useQuery({
    queryKey: [...pathKey(fileQueryPath(id)), "cost-study"],
    queryFn: async () => {
      const result = await getCostStudyAction({ fileId: id });
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: seesCost,
  });

  if (!seesCost || !study.data) {
    return (
      <DetailScreen section="requests" title={tNav("FilePartFinancialStudy")} back={back}>
        {!seesCost ? (
          <Alert className="text-start">
            <Lock />
            <AlertDescription className="text-base">{t("Restricted")}</AlertDescription>
          </Alert>
        ) : study.isPending ? (
          <Skeleton className="h-96 w-full" />
        ) : (
          <p className="py-16 text-center text-base text-muted-foreground">{tHub("NotFound")}</p>
        )}
      </DetailScreen>
    );
  }

  const { file } = study.data;
  return (
    <DetailScreen
      section="requests"
      title={`${tNav("FilePartFinancialStudy")} · ${tHub("Title", { number: ltr(file.number) })}`}
      description={file.clientName}
      back={back}
    >
      <StudyForm
        key={study.dataUpdatedAt}
        fileId={id}
        saved={study.data.saved}
        closed={file.closed}
        initial={study.data.terms}
        cancelLabel={tCommon("Cancel")}
      />
    </DetailScreen>
  );
}

function StudyForm({
  fileId,
  saved,
  closed,
  initial,
  cancelLabel,
}: {
  fileId: string;
  saved: boolean;
  closed: boolean;
  initial: CostStudyTerms;
  cancelLabel: string;
}) {
  const t = useTranslations("CostStudy");
  const lineLabel = useCodeLabel("FileOptions.CostLine");
  const money = useMoneyText();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const writes = useSectionLevel("REQUESTS") === "WRITE" && !closed;
  const [busy, setBusy] = React.useState(false);
  // Every line of the list is on the screen, in the list's order, whatever was saved.
  const [terms, setTerms] = React.useState<CostStudyTerms>(() => ({
    ...initial,
    lines: COST_LINES.map(
      (code) => initial.lines.find((line) => line.code === code) ?? { code, label: null, amount: 0, rateBp: null },
    ),
  }));
  const totals = computeCostStudy(terms);
  const labourWorkedOut = terms.hourlyRate !== null && totals.labourMin > 0;

  const set = (patch: Partial<CostStudyTerms>) => setTerms((current) => ({ ...current, ...patch }));
  const setLine = (code: CostLineCode, patch: { amount?: number; rateBp?: number | null; label?: string | null }) =>
    setTerms((current) => ({
      ...current,
      lines: current.lines.map((line) => (line.code === code ? { ...line, ...patch } : line)),
    }));

  async function save() {
    setBusy(true);
    const result = await saveCostStudyAction({ fileId, terms: { ...terms, lines: [...terms.lines] } });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(result.data.changed ? t("Saved") : t("Unchanged"));
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      {!saved && (
        <Alert className="text-start">
          <AlertDescription className="text-base">{t("Suggested")}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Work")}</CardTitle>
          <CardDescription>{t("WorkHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!writes} className="m-0 min-w-0 border-0 p-0">
            <FieldGrid>
              <NumberField
                label={t("Workers")}
                kind="count"
                value={terms.workers}
                onChange={(workers) => set({ workers })}
              />
              <NumberField
                label={t("PerVisit")}
                kind="hours"
                suffix={t("Hours")}
                value={terms.perVisitMin}
                onChange={(perVisitMin) => set({ perVisitMin })}
              />
              <NumberField
                label={t("VisitsPerWeek")}
                kind="count"
                value={terms.visitsPerWeek}
                onChange={(visitsPerWeek) => set({ visitsPerWeek })}
              />
              <NumberField
                label={t("Weeks")}
                kind="qty"
                value={terms.weeks}
                onChange={(weeks) => set({ weeks })}
                hint={t("WeeksHint")}
              />
              <NumberField
                label={t("HourlyRate")}
                kind="money"
                suffix={money(0).replace(/^[\d.,\s]+/, "")}
                value={terms.hourlyRate}
                onChange={(hourlyRate) => set({ hourlyRate })}
              />
            </FieldGrid>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Costs")}</CardTitle>
          <CardDescription>{t("CostsHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!writes} className="m-0 min-w-0 space-y-4 border-0 p-0">
            {terms.lines.map((line) => {
              const rated = RATE_COST_LINES.includes(line.code);
              const worked = totals.lines.find((one) => one.code === line.code)?.amount ?? line.amount;
              const given = (line.code === "LABOUR" && labourWorkedOut) || (rated && line.rateBp !== null);
              return (
                <div key={line.code} className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                  {rated ? (
                    <NumberField
                      label={t("RateOf", { line: lineLabel(line.code) })}
                      kind="percent"
                      suffix="%"
                      value={line.rateBp}
                      onChange={(rateBp) => setLine(line.code, { rateBp })}
                    />
                  ) : line.code === "OTHER" || line.code === "SPECIAL_SERVICES" ? (
                    <TextField
                      label={t("DetailOf", { line: lineLabel(line.code) })}
                      value={line.label ?? ""}
                      onChange={(label) => setLine(line.code, { label: label === "" ? null : label })}
                    />
                  ) : (
                    <div className="hidden sm:block" />
                  )}
                  <NumberField
                    label={lineLabel(line.code)}
                    kind="money"
                    value={given ? worked : line.amount}
                    disabled={given}
                    hint={given ? t("WorkedOut") : undefined}
                    onChange={(amount) => setLine(line.code, { amount: amount ?? 0 })}
                  />
                </div>
              );
            })}
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Price")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <fieldset disabled={!writes} className="m-0 min-w-0 border-0 p-0">
            <FieldGrid>
              <NumberField
                label={t("Margin")}
                kind="percent"
                suffix="%"
                value={terms.marginPercent}
                onChange={(marginPercent) => set({ marginPercent })}
              />
              <NumberField
                label={t("Discount")}
                kind="money"
                value={terms.discount}
                onChange={(discount) => set({ discount })}
              />
            </FieldGrid>
          </fieldset>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label={t("TotalCost")} value={money(totals.totalCost)} />
            <StatCard label={t("Profit")} value={money(totals.profitValue)} />
            <StatCard label={t("BeforeDiscount")} value={money(totals.priceBeforeDiscount)} />
            <StatCard label={t("FinalPrice")} value={money(totals.finalPrice)} tone="requests" />
            <StatCard
              label={t("PerVisitPrice")}
              value={totals.pricePerVisit === null ? "—" : money(totals.pricePerVisit)}
              hint={t("VisitsCount", { count: totals.visits })}
            />
            <StatCard label={t("PerWeek")} value={totals.pricePerWeek === null ? "—" : money(totals.pricePerWeek)} />
            <StatCard label={t("PerMonth")} value={totals.pricePerMonth === null ? "—" : money(totals.pricePerMonth)} />
          </div>
        </CardContent>
      </Card>

      <PageActions>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {cancelLabel}
        </Button>
        {writes && (
          <Button type="submit" variant="success" disabled={busy}>
            {busy ? t("Saving") : t("Save")}
          </Button>
        )}
      </PageActions>
    </form>
  );
}
