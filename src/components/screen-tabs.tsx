import type { LucideIcon } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { SECTION_ACCENT, type SectionId } from "@/navigation/sections";

export interface ScreenTabItem {
  id: string;
  label: string;
  /** Where this tab lives. The router, not local state, owns which one is on. */
  href: string;
  icon?: LucideIcon;
}

/**
 * The switch between a section's faces — Teachers / Rent teachers / Employees.
 *
 * The bottom bar is full and stays that way: it holds the six things this
 * academy does, and a seventh and eighth entry for two more staff lists would
 * dilute the one piece of navigation the office has learned. So the siblings
 * live *inside* the section they belong to, one click from each other, and this
 * control is that click.
 *
 * It reads as a switch rather than as a row of buttons because exactly one
 * segment is always lit, in the section's own hue — the same hue the bottom bar
 * and the screen heading already wear, so the control is visibly part of *this*
 * screen rather than a new piece of chrome.
 *
 * ## URL-driven, unlike the reference this is adapted from
 *
 * The reference app has no router and keeps its tab state in a store. This one
 * has 47 real routes, deep links, printable card pages and a query cache keyed
 * by pathname, so the location has to stay the single source of truth: each item
 * carries an `href`, the active segment is derived from the current path by the
 * caller, and choosing one navigates. Nothing here holds state of its own —
 * which is also what makes browser Back work through a tab switch.
 *
 * `spacing={2}` rather than the joined `0`: the joined variant rounds its first
 * and last segments with physical left/right radii, which puts the flat edge on
 * the wrong side once the app runs right-to-left in Arabic. Two separated pills
 * carry the same "one of these" meaning and mirror correctly.
 *
 * Every segment keeps its icon and its word at every window height: this is the
 * control that says which of several similar-looking lists you are on, and an
 * icon-only switch answers that only for whoever set it.
 */
export function ScreenTabs({
  section,
  items,
  value,
  ariaLabel,
  className,
}: {
  /** Which section's hue the active segment wears. */
  section: SectionId;
  items: readonly ScreenTabItem[];
  /** The active item's `id`, or undefined on a detail route. */
  value: string | undefined;
  ariaLabel: string;
  className?: string;
}) {
  const navigate = useNavigate();
  const accent = SECTION_ACCENT[section];

  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={2}
      value={value ?? ""}
      // Radix reports "" when the pressed item was already on; ignoring that is
      // what stops a user un-selecting the page they are standing on.
      onValueChange={(next) => {
        if (!next) return;
        const target = items.find((item) => item.id === next);
        if (target) navigate(target.href);
      }}
      aria-label={ariaLabel}
      className={cn("max-w-full min-w-0 flex-wrap", className)}
    >
      {items.map(({ id, label, icon: Icon }) => (
        <ToggleGroupItem
          key={id}
          value={id}
          className={cn("min-w-0 px-5 font-semibold data-[state=on]:font-bold tall:px-7", accent.segment)}
        >
          {Icon && <Icon />}
          <span className="min-w-0 truncate">{label}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}
