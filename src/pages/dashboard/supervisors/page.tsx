import { useTranslations } from "use-intl";

import { PagePlaceholder } from "@/components/page-placeholder";
import { SectionScreen } from "@/components/section-screen";

/**
 * Placeholder. Section «الموظفون», tab «المشرفون والمناطق». Owner: Operations.
 *
 * Replace the placeholder with the screen. Keep `section` and the heading as
 * they are: the tab strip and the lit bar item come from the route.
 */
export default function SupervisorsPage() {
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen section="employees" title={tNav("Supervisors")}>
      <PagePlaceholder owner="operations" />
    </SectionScreen>
  );
}
