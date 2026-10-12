import { useTranslations } from "use-intl";

import { PagePlaceholder } from "@/components/page-placeholder";
import { SectionScreen } from "@/components/section-screen";

/**
 * Placeholder. The home screen. Owner: Foundation.
 *
 * It will carry today's tiles, the alert tiles and the day board. The day
 * board is Operations' and each alert's rule is its feature owner's; how they
 * are mounted here without sharing this file is settled with the home screen.
 */
export default function HomePage() {
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen section="home" title={tNav("HomeHeading")}>
      <PagePlaceholder owner="core" />
    </SectionScreen>
  );
}
