import { useMemo } from "react";

import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { centreToday } from "@/features/money/components/centre-today";
import { SampleNotice } from "@/features/money/components/sample-notice";
import { sampleIncome, SAMPLE_TAX } from "@/features/money/samples/income";

import { IncomeView } from "./_components/income-view";

/**
 * Section «المصاريف», tab «المداخيل حسب القسم».
 *
 * Closest academy screen: finance analytics (`/dashboard/finance`). Until the
 * services that read payments exist, the screen is drawn from sample rows and
 * says so.
 */
export default function IncomePage() {
  const tNav = useTranslations("Nav");
  const tCommon = useTranslations("MoneyCommon");
  const today = centreToday();
  const sample = useMemo(() => sampleIncome(today), [today]);

  return (
    <SectionScreen section="money" title={tNav("MoneyHeading")}>
      <div className="space-y-6">
        <SampleNotice title={tCommon("SampleTitle")} description={tCommon("SampleDescription")} />
        <IncomeView {...sample} taxMode={SAMPLE_TAX.taxMode} vatRate={SAMPLE_TAX.vatRate} today={today} />
      </div>
    </SectionScreen>
  );
}
