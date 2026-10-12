import { useTranslations } from "use-intl";

import { PagePlaceholder } from "@/components/page-placeholder";
import { SectionScreen } from "@/components/section-screen";

/** Placeholder. A Settings tab. Owner: Foundation. */
export default function SettingsRulesPage() {
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen section="settings" title={tNav("SettingsHeading")} className="max-w-4xl">
      <PagePlaceholder owner="core" />
    </SectionScreen>
  );
}
