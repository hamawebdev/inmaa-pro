import { useTranslations } from "use-intl";

import { PagePlaceholder } from "@/components/page-placeholder";
import { SectionScreen } from "@/components/section-screen";

/**
 * Placeholder. Section «المصاريف», tab «التقارير والمؤشرات». Owner: Money and stock.
 *
 * Replace the placeholder with the screen. Keep `section` and the heading as
 * they are: the tab strip and the lit bar item come from the route.
 */
export default function ReportsPage() {
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen section="money" title={tNav("MoneyHeading")}>
      <PagePlaceholder owner="money" />
    </SectionScreen>
  );
}
