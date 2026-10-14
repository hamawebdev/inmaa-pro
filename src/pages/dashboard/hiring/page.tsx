import { CalendarPlus, Scale, ShieldAlert } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { ScreenTabs } from "@/components/screen-tabs";
import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { useConductEntries } from "@/features/people/components/conduct-entries";
import { useMay, useMayIn } from "@/features/people/components/may";

import { CandidatesView, EvaluationsView, TrainingView, ViolationsView } from "./_components/hiring-views";

/**
 * Section «عمال النظافة», tab «التوظيف والتدريب» (feature 37, articles 16 and
 * 17 of his regulations). Owner: People.
 *
 * Four views of one tab: the candidates and workers on trial (interview,
 * decision, training done); the training days and the skills; the violations
 * and what followed; the periodic evaluations.
 *
 * Closest academy screens: its attendance family (a second strip of views
 * under the section's tabs, a table, an "add" button in the heading).
 */
const VIEWS = ["candidates", "training", "violations", "evaluations"] as const;
type View = (typeof VIEWS)[number];

export default function HiringPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Hiring");
  const [params] = useSearchParams();
  const entries = useConductEntries();
  const keepsFiles = useMay("staff.write");
  const writes = useMayIn("WORKERS", "WRITE");
  const may = keepsFiles && writes;
  const asked = params.get("view") as View | null;
  const view: View = asked && VIEWS.includes(asked) ? asked : "candidates";
  const href = (next: View) => `/dashboard/hiring${next === "candidates" ? "" : `?view=${next}`}`;

  const action =
    !may || view === "candidates" ? null : view === "training" ? (
      <Button variant="add" onClick={() => void entries.planSession()}>
        <CalendarPlus />
        {t("Entry.SessionTitle")}
      </Button>
    ) : view === "violations" ? (
      <Button variant="add" onClick={() => void entries.recordViolation()}>
        <ShieldAlert />
        {t("Entry.ViolationTitle")}
      </Button>
    ) : (
      <Button variant="add" onClick={() => void entries.evaluate()}>
        <Scale />
        {t("Entry.EvaluationTitle")}
      </Button>
    );

  return (
    <SectionScreen section="workers" title={tNav("Hiring")} description={t("Description")} actions={action}>
      {entries.dialogs}
      <div className="space-y-5 tall:space-y-6">
        <ScreenTabs
          section="workers"
          items={VIEWS.map((each) => ({ id: each, label: t(`Views.${each}`), href: href(each) }))}
          value={view}
          ariaLabel={t("ViewsLabel")}
        />
        {view === "candidates" && <CandidatesView entries={entries} />}
        {view === "training" && <TrainingView entries={entries} />}
        {view === "violations" && <ViolationsView entries={entries} />}
        {view === "evaluations" && <EvaluationsView entries={entries} />}
      </div>
    </SectionScreen>
  );
}
