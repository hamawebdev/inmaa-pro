import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";

import { ServiceListsEditor } from "./_components/service-lists-editor";

/**
 * Settings › الخدمات: his two service lists, «الخدمات المقدمة» and «الخدمات المبرمجة» (the developer,
 * 2026-10-22). The manager adds a service, renames it in Arabic, French and English, removes it, chooses the
 * divisions whose forms offer it and its place on each; the request and contract screens and his printed
 * forms follow. A removed service stays on the files that already tick it.
 *
 * Closest academy screen: settings/_components/subjects-card.tsx (a list chosen above, rows with edit and
 * remove, a dialog for one row), on the newer generation's segmented tabs and its Save foot (the settings
 * cards). Changing the lists needs `settings.rules`; everyone who opens Settings reads them.
 */
export default function SettingsServicesPage() {
  const tNav = useTranslations("Nav");
  const tLines = useTranslations("TabLines");

  return (
    <SectionScreen
      section="settings"
      title={tNav("SettingsServices")}
      description={tLines("SettingsServices")}
      className="max-w-4xl"
    >
      <ServiceListsEditor />
    </SectionScreen>
  );
}
