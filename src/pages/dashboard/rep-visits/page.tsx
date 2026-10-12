import { useTranslations } from "use-intl";

import { PagePlaceholder } from "@/components/page-placeholder";
import { SectionScreen } from "@/components/section-screen";

/**
 * Placeholder. Section «الموظفون», tab «زيارات المندوب التجاري». Owner: Clients and contracts.
 *
 * Replace the placeholder with the screen. Keep `section` and the heading as
 * they are: the tab strip and the lit bar item come from the route.
 */
export default function RepVisitsPage() {
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen section="employees" title={tNav("EmployeesHeading")}>
      <PagePlaceholder owner="clients" />
    </SectionScreen>
  );
}
