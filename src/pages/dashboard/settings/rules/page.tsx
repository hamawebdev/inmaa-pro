import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";

import { SETTING_GROUPS } from "@/features/core/validators/settings-form";

import { PaperNumbersCard } from "../_components/paper-numbers-card";
import { SettingsGroups } from "../_components/settings-form/settings-groups";
import { ZonesCard } from "../_components/zones-card";

/** The rule cards up to the numbering, then the rest: the paper numbers sit beside the numbering. */
const RULE_GROUPS = SETTING_GROUPS.filter((group) => group.tab === "rules").map((group) => group.id);
const UP_TO_NUMBERING = RULE_GROUPS.slice(0, RULE_GROUPS.indexOf("numbering") + 1);
const AFTER_NUMBERING = RULE_GROUPS.slice(RULE_GROUPS.indexOf("numbering") + 1);

/**
 * Settings › قواعد العمل: every work rule of DESIGN.md section 11, one card per
 * family, in the document's order.
 *
 * Closest academy screen: settings/page.tsx, a single column of cards, each
 * saving behind its own button (the academy's identity card). Changing a rule
 * needs the capability `settings.rules` (the manager's by default); everybody
 * who opens Settings reads them. Beside the numbering, the invoices and
 * receipts issued on paper this year (RULINGS item 4), the manager's alone.
 */
export default function SettingsRulesPage() {
  const t = useTranslations("Settings");
  const tNav = useTranslations("Nav");

  return (
    <SectionScreen
      section="settings"
      title={tNav("SettingsRules")}
      description={t("RulesDescription")}
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-6 tall:gap-7">
        <SettingsGroups tab="rules" only={UP_TO_NUMBERING} />
        <PaperNumbersCard />
        <SettingsGroups tab="rules" only={AFTER_NUMBERING} />
        <ZonesCard />
      </div>
    </SectionScreen>
  );
}
