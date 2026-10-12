import { useTranslations } from "use-intl";

import { PagePlaceholder } from "@/components/page-placeholder";
import { SectionScreen } from "@/components/section-screen";

/**
 * Placeholder. Section «عمال النظافة», tab «العمال». Owner: People.
 *
 * Replace the placeholder with the screen. Keep `section` and the heading as
 * they are: the tab strip and the lit bar item come from the route.
 */
export default function WorkersPage() {
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen section="workers" title={tNav("WorkersHeading")}>
      <PagePlaceholder owner="people" />
    </SectionScreen>
  );
}
