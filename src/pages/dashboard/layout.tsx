import { useEffect, useRef } from "react";

import { Outlet, useLocation } from "react-router-dom";
import { useLocale } from "use-intl";

import { AlertNotifier } from "@/components/alert-notifier";
import { BottomNav } from "@/components/bottom-nav";
import { CommandPalette } from "@/components/command-palette";
import { RouteGate } from "@/components/security/route-gate";
import { Toaster } from "@/components/ui/sonner";
import { directionFor } from "@/i18n/config";
import { handleScrollKeyDown } from "@/lib/scroll-keyboard-nav";

/**
 * The app shell: one scroller and one bar of furniture, and nothing else.
 *
 * This replaces a collapsible shadcn sidebar plus a sticky header. Between them
 * they held a logo, the academy's own name, a sidebar toggle, a search button
 * and three icon buttons — none of which anyone opened the app to read, and all
 * of which cost every screen ~270px of width and ~48px of height. What survives
 * has moved: navigation to the bottom bar, search to the Ctrl+K palette it
 * already was, and theme and language to the Settings screen where they are
 * changed once and then left alone.
 *
 * The layout is a `h-dvh` flex column: a scrolling `<main>` above, a fixed-height
 * `<nav>` below. The bar is a flex *sibling* of the scroller rather than a
 * `position: fixed` overlay, which is what lets it never cover content, never
 * need a spacer under the page, and never be scrolled out of reach.
 */
export default function DashboardLayout() {
  const { pathname } = useLocation();
  const locale = useLocale();
  const mainRef = useRef<HTMLElement>(null);

  // Two jobs, one effect. Scrolling back to the top on navigation is the
  // obvious one — the shell owns the scroll now, so the browser's own
  // restoration no longer applies and a new page would otherwise open
  // half-way down where the last one was left.
  //
  // Focusing the scroller is the less obvious one, and it is what makes
  // keyboard scrolling work at all: `handleScrollKeyDown` is bound here, and a
  // keydown only reaches it if focus is inside. Without this, arriving on a
  // page by clicking the bottom bar leaves focus on the nav link, where
  // PageDown does nothing. `preventScroll` stops the focus call from
  // immediately undoing the scroll reset.
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    el.scrollTo({ top: 0, left: 0 });
    el.focus({ preventScroll: true });
  }, [pathname]);

  return (
    <div data-app-shell className="flex h-dvh flex-col overflow-hidden bg-background">
      <main
        ref={mainRef}
        data-app-main
        // `tabIndex={-1}` makes the scroller focusable without putting it in the
        // tab order, so the effect above can hand it focus.
        tabIndex={-1}
        // `overflow-x-hidden` is not decoration. Setting `overflow-y` alone
        // computes `overflow-x` to `auto`, which hands the whole app a sideways
        // scrollbar the moment any descendant is one pixel too wide. Pinning it
        // shut means a width bug shows up as clipped content during review
        // rather than as a stray scroll in production. Children that genuinely
        // cannot fit their width (a wide table) carry their own inner scroller,
        // which still works.
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto outline-none"
        onKeyDown={handleScrollKeyDown}
      >
        <RouteGate>
          <Outlet />
        </RouteGate>
      </main>

      <BottomNav pathname={pathname} />

      {/* Ctrl+K. Renders nothing until it is opened. */}
      <CommandPalette />

      {/* New alerts, said once on the desktop. Renders nothing. */}
      <AlertNotifier />

      {/* Toasts hug the reading-start corner, so top-left in Arabic. Mounted
          here rather than in main.tsx so it can see the locale. */}
      <Toaster position={directionFor(locale) === "rtl" ? "top-left" : "top-right"} />
    </div>
  );
}
