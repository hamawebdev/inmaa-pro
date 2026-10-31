import { LockKeyhole, type LucideIcon } from "lucide-react";
import { NavLink } from "react-router-dom";
import { useTranslations } from "use-intl";

import { LockMenu } from "@/components/lock-menu";
import { SyncMenu } from "@/components/sync-menu";
import { useSession } from "@/hooks/use-session";
import { useSyncBar } from "@/hooks/use-sync-bar";
import { mayOpenSection } from "@/lib/access/session";
import { cn } from "@/lib/utils";
import {
  PRIMARY_SECTIONS,
  SECTION_ACCENT,
  SETTINGS_SECTION,
  resolveSection,
  type SectionAccent,
} from "@/navigation/sections";

/**
 * One navigation target: icon over word, in a box the whole height of the bar.
 *
 * Every item in the bar is this shape, which is the point — the icon sizes, the
 * gap, the label size and the pressed feedback are decided once, so a secondary
 * item cannot drift into looking like a different species of control. What
 * varies between items is width and colour, and both say something: see
 * {@link BottomNav}.
 *
 * The active state is marked four ways — a thick top rule, a stronger tint, the
 * section hue and a weight change — so it survives a glance, a glare-covered
 * screen and a colour-blind reader. `data-[state=open]` covers the one item that
 * opens a menu rather than a page: while its menu is up, it is lit like a hover.
 */
const navItemBase = cn(
  "h-chrome-navbar relative flex min-w-0 flex-col items-center justify-center gap-1 px-2 tall:gap-1.5",
  "transition-colors duration-150 outline-none active:scale-[0.98]",
  "focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:ring-inset",
);

function NavItemInner({ icon: Icon, label, active }: { icon: LucideIcon; label: string; active: boolean }) {
  return (
    <>
      <Icon
        className={cn("shrink-0 transition-[width,height]", active ? "size-7 tall:size-9" : "size-6 tall:size-8")}
        strokeWidth={active ? 2.4 : 2}
      />
      {/* The label never disappears at any window height: a word plus an icon
          is what makes the colour legible as a *label* instead of decoration,
          and dropping the word would leave colour doing the work alone. It
          only goes screen-reader-only below 780px, which the Tauri window
          (min 1024px wide) never reaches — that is a safety net, not a
          layout. */}
      <span className="max-w-full truncate text-sm leading-tight tracking-tight max-[780px]:sr-only tall:text-lg short:text-base">
        {label}
      </span>
    </>
  );
}

/** The hue treatment shared by a resting item, a hovered one and an active one. */
function accentClasses(accent: SectionAccent | undefined, active: boolean) {
  if (!accent) {
    // The one item with no section — Lock, which opens a menu rather than a
    // screen — stays the neutral grey utility control it is.
    return "font-semibold text-muted-foreground hover:bg-accent/60 data-[state=open]:bg-accent data-[state=open]:text-foreground";
  }
  return cn(accent.text, active ? cn(accent.fill, "font-bold") : cn(accent.bg, accent.hoverBg, "font-semibold"));
}

/**
 * The bottom bar — the app's only chrome, and so its only navigation.
 *
 * It replaces a ten-item collapsible sidebar with nested sub-items, which cost
 * every screen ~270px of width, hid half its destinations one click deep, and
 * left `/dashboard/settings` reachable only through a keyboard shortcut nobody
 * had been told about.
 *
 * Two groups, divided by the app's heaviest rule:
 *
 *  - **The six daily sections**, sharing the width equally. These are what the
 *    day is spent in, so they take every pixel the utilities do not, and each
 *    wears its section's own hue (see src/navigation/sections.ts) — the same hue
 *    that screen's heading and its tab strip use. "You are on the violet screen"
 *    is a landmark in a way that "you are on the third tab" is not.
 *  - **Lock, sync and Settings**: reached on purpose, a few times a day, by
 *    whoever runs the place. The sync item appears only once the two laptops
 *    are set up (docs/sync/DECISION.md), and says the exchange's state in the
 *    tones of `StatusChip`. They are fixed and narrow, so the eye reads the bar as
 *    six-plus-two rather than as eight of a kind. Lock opens a menu, not a
 *    screen, so it has no hue.
 *
 * A section the signed-in user's role cannot open is left out, and the others
 * share its room: an item that only answers "not for you" is not navigation.
 * The route gate still answers an address reached another way. Lock is
 * everybody's.
 *
 * At the bottom rather than the top because that is where the pointer already
 * is after working through a page, and because a bar at the bottom of a
 * `h-dvh` flex column cannot be scrolled away — it is a flex sibling of the
 * scroller, not a `position: fixed` overlay, so it never covers content and
 * never needs a spacer under the page.
 */
export function BottomNav({ pathname }: { pathname: string }) {
  const t = useTranslations("Nav");
  const tSync = useTranslations("Sync.Bar");
  const session = useSession();
  // Only once sync is set up on this laptop: before that the bar is the academy's, unchanged.
  const sync = useSyncBar();
  const activeSection = resolveSection(pathname);
  const sections = PRIMARY_SECTIONS.filter((section) => session !== null && mayOpenSection(session, section.id));
  const settingsOpen = session !== null && mayOpenSection(session, SETTINGS_SECTION.id);

  // Narrow enough to read as secondary, wide enough for the longest of the
  // three languages ("Paramètres") at the bar's own type size in the smallest
  // window.
  const utility = "w-28 shrink-0 tall:w-32";

  return (
    <nav aria-label={t("Sections")} className="flex shrink-0 border-t-[3px] border-border-strong bg-card">
      {/* NavLink's own `isActive` is deliberately unused for the lit state: it
          compares the location against *this item's* href, and a section owns
          several paths (Staff owns /teachers, /rent-teachers and /employees).
          The section resolved from the location is the authority. */}
      {sections.map((section, i) => {
        const active = activeSection === section.id;
        const accent = SECTION_ACCENT[section.id];
        return (
          <NavLink
            key={section.id}
            to={section.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              navItemBase,
              "flex-1 basis-0",
              accentClasses(accent, active),
              // Divider between sections, so the targets read as separate
              // targets even when none of them is active. Not on the first, or
              // it doubles up with the window edge.
              i > 0 && "border-s-2 border-border",
            )}
          >
            <span
              aria-hidden
              className={cn(
                "absolute inset-x-0 top-0 h-1.5 transition-opacity",
                accent.rule,
                active ? "opacity-100" : "opacity-0",
              )}
            />
            <NavItemInner icon={section.icon} label={t(section.labelKey)} active={active} />
          </NavLink>
        );
      })}

      {/* The heavier rule is the hierarchy: everything past it is the owner's
          business, not the front desk's. */}
      <div className="flex shrink-0 border-s-[3px] border-border-strong">
        <LockMenu>
          {/* Opens the lock menu rather than a screen, so it is never `active`
              and carries no section hue — but it is the same target, the same
              size and the same shape as everything else in the bar. */}
          <button type="button" className={cn(navItemBase, utility, accentClasses(undefined, false))}>
            <NavItemInner icon={LockKeyhole} label={t("Lock")} active={false} />
          </button>
        </LockMenu>

        {sync && (
          <SyncMenu status={sync.status} state={sync.state} tone={sync.tone}>
            {/* The exchange between the two laptops: a word and an icon in the
                tone of its state, the same target as Lock beside it. */}
            <button
              type="button"
              data-sync-bar={sync.state}
              className={cn(
                navItemBase,
                utility,
                "border-s-2 border-border",
                accentClasses(undefined, false),
                sync.ink,
              )}
            >
              <NavItemInner icon={sync.icon} label={tSync(sync.state)} active={false} />
            </button>
          </SyncMenu>
        )}

        {settingsOpen &&
          (() => {
            const active = activeSection === "settings";
            const accent = SECTION_ACCENT.settings;
            return (
              <NavLink
                to={SETTINGS_SECTION.href}
                aria-current={active ? "page" : undefined}
                className={cn(navItemBase, utility, "border-s-2 border-border", accentClasses(accent, active))}
              >
                <span
                  aria-hidden
                  className={cn(
                    "absolute inset-x-0 top-0 h-1.5 transition-opacity",
                    accent.rule,
                    active ? "opacity-100" : "opacity-0",
                  )}
                />
                <NavItemInner icon={SETTINGS_SECTION.icon} label={t("Settings")} active={active} />
              </NavLink>
            );
          })()}
      </div>
    </nav>
  );
}
