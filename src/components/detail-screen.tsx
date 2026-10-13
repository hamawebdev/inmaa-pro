import type { LucideIcon } from "lucide-react";

import { Screen, ScreenHeader } from "@/components/screen";
import { getSection, type SectionId } from "@/navigation/sections";

/**
 * A single record's page: one student, one group, one teacher's payments.
 *
 * The counterpart to `SectionScreen`. Where that renders a tab strip because it
 * is showing one of several sibling lists, this renders a **back action**,
 * because a detail route has no siblings to switch between — and because the
 * bottom bar, which names the section, is the only other navigation on screen.
 *
 * This is what replaces `PageShell`'s breadcrumb trail. Breadcrumbs earned their
 * place under a ten-item sidebar with nested children, where "where am I" was a
 * real question; with six sections lit in the bar and at most one level of
 * detail below a list, a four-crumb trail was restating the obvious across the
 * top of all 47 routes.
 */
export function DetailScreen({
  section,
  title,
  icon,
  back,
  actions,
  className,
  children,
}: {
  section: SectionId;
  title: string;
  /**
   * Not drawn. A page below a list has no line under its heading: the academy
   * keeps that line for its tab pages (the Checker's S-14). The prop stays so
   * that a page written before the ruling still compiles; pass none.
   */
  description?: string;
  /** Defaults to the section's own icon. */
  icon?: LucideIcon;
  /** Where "back" goes and what it says — usually the list this came from. */
  back: { href: string; label: string };
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const def = getSection(section);

  return (
    <Screen className={className}>
      <div className="space-y-5 tall:space-y-6">
        <ScreenHeader section={section} icon={icon ?? def.icon} title={title} back={back} actions={actions} />
        <div className="min-w-0">{children}</div>
      </div>
    </Screen>
  );
}
