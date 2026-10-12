import { useLocation } from "react-router-dom";
import { useTranslations } from "use-intl";

import { Screen, ScreenHeader } from "@/components/screen";
import { ScreenTabs } from "@/components/screen-tabs";
import { getSection, resolveTab, type SectionId } from "@/navigation/sections";

/**
 * A section's landing page: the heading, the tab strip, and the view below it.
 *
 * Every list page in the app is this shape, so it is worth having once. Pages
 * that use it supply a title and their content; the strip is derived from the
 * section registry and the current location, which means a tab can never point
 * somewhere the router does not go and the lit segment can never disagree with
 * the page actually on screen.
 *
 * Detail routes (`/students/:id`, `/groups/:groupId`) do **not** use this — they
 * compose `Screen` + `ScreenHeader` with a `back` action directly. A tab strip
 * switches between siblings, and a single record has none.
 */
export function SectionScreen({
  section,
  title,
  description,
  actions,
  tabsAriaLabel,
  className,
  children,
}: {
  section: SectionId;
  title: string;
  description?: string;
  /** Buttons for the section as a whole — "Add student", and so on. */
  actions?: React.ReactNode;
  /** Falls back to the section's own name if not given. */
  tabsAriaLabel?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { pathname } = useLocation();
  const t = useTranslations("Nav");
  const def = getSection(section);
  const activeTab = resolveTab(section, pathname);

  const items = def.tabs?.map((tab) => ({
    id: tab.id,
    label: t(tab.labelKey),
    href: tab.href,
    icon: tab.icon,
  }));

  return (
    <Screen className={className}>
      <div className="space-y-5 tall:space-y-6">
        <ScreenHeader section={section} title={title} description={description} icon={def.icon} actions={actions} />

        {items && items.length > 0 && (
          <ScreenTabs section={section} items={items} value={activeTab} ariaLabel={tabsAriaLabel ?? t(def.labelKey)} />
        )}

        <div className="min-w-0">{children}</div>
      </div>
    </Screen>
  );
}
