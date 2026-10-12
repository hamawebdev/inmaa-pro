import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";

import { SettingsGroups } from "../_components/settings-form/settings-groups";

/**
 * Settings › قواعد العمل: every work rule of DESIGN.md section 11, one card per
 * family, in the document's order.
 *
 * Closest academy screen: settings/page.tsx, a single column of cards, each
 * saving behind its own button (the academy's identity card). Changing a rule
 * needs the capability `settings.rules` (the manager's by default); everybody
 * who opens Settings reads them.
 */
export default function SettingsRulesPage() {
  const t = useTranslations("Settings");
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen
      section="settings"
      title={tNav("SettingsHeading")}
      description={t("RulesDescription")}
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-6 tall:gap-7">
        <SettingsGroups tab="rules" />
      </div>
    </SectionScreen>
  );
}
