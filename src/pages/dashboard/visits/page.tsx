import { useTranslations } from "use-intl";

import { PagePlaceholder } from "@/components/page-placeholder";
import { SectionScreen } from "@/components/section-screen";

/**
 * Placeholder. Section «طلبات الخدمة», tab «الزيارات». Owner: Operations.
 *
 * Replace the placeholder with the screen. Keep `section` and the heading as
 * they are: the tab strip and the lit bar item come from the route.
 */
export default function VisitsPage() {
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen section="requests" title={tNav("RequestsHeading")}>
      <PagePlaceholder owner="operations" />
    </SectionScreen>
  );
}
