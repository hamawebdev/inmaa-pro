import { useNavigate, useSearchParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { ScreenTabs } from "@/components/screen-tabs";
import { SectionScreen } from "@/components/section-screen";
import { useMay } from "@/features/people/components/may";
import { useCentreClock } from "@/hooks/use-centre-clock";

import { AdvancesView } from "./_components/advances-view";
import { HoursView } from "./_components/hours-view";
import { PayRunsView } from "./_components/pay-runs-view";

/**
 * Section «عمال النظافة», tab «الساعات والأجور» (features 21 and 38). Owner: People.
 *
 * Three views of one tab: each worker's hours of a month, from the orders
 * typed in; the monthly pay runs, for the workers and for the centre's
 * employees; advances and what people owe.
 *
 * Closest academy screens: the attendance family for the hours (a second strip
 * under the section's tabs, a period switch, a table), and its payouts and
 * debt ledger (finance) for the pay and the advances.
 */
const VIEWS = ["hours", "pay", "advances"] as const;
type View = (typeof VIEWS)[number];

export default function HoursPayPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Pay");
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { today } = useCentreClock();
  const readsPay = useMay("pay.read");

  const thisMonth = today.slice(0, 7);
  const asked = params.get("view") as View | null;
  const view: View = asked && VIEWS.includes(asked) && (asked === "hours" || readsPay) ? asked : "hours";
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get("month") ?? "") ? (params.get("month") as string) : thisMonth;
  const href = (next: { view?: View; month?: string }) => {
    const query = new URLSearchParams();
    const nextView = next.view ?? view;
    const nextMonth = next.month ?? month;
    if (nextView !== "hours") query.set("view", nextView);
    if (nextMonth !== thisMonth) query.set("month", nextMonth);
    const text = query.toString();
    return `/dashboard/hours-pay${text ? `?${text}` : ""}`;
  };
  const setMonth = (next: string) => navigate(href({ month: next }), { replace: true });

  const views = VIEWS.filter((each) => each === "hours" || readsPay).map((each) => ({
    id: each,
    label: t(`Views.${each}`),
    href: href({ view: each }),
  }));

  return (
    <SectionScreen section="workers" title={tNav("HoursPay")} description={t("Description")}>
      <div className="space-y-5 tall:space-y-6">
        {views.length > 1 && <ScreenTabs section="workers" items={views} value={view} ariaLabel={t("ViewsLabel")} />}
        {view === "hours" && <HoursView month={month} thisMonth={thisMonth} onMonthChange={setMonth} />}
        {view === "pay" && <PayRunsView month={month} thisMonth={thisMonth} onMonthChange={setMonth} />}
        {view === "advances" && <AdvancesView month={month} thisMonth={thisMonth} onMonthChange={setMonth} />}
      </div>
    </SectionScreen>
  );
}
