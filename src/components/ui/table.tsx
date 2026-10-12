import * as React from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { directionFor } from "@/i18n/config";
import { handleScrollKeyDown } from "@/lib/scroll-keyboard-nav";
import { cn } from "@/lib/utils";

/** How far the scroll buttons in {@link Table} can see. */
const H_SCROLL_EPSILON = 2;

interface HScrollState {
  hasOverflow: boolean;
  canLeft: boolean;
  canRight: boolean;
}

/**
 * Reads how far a horizontally-scrolled element is from each edge.
 *
 * `scrollLeft` is not `[0, max]` once the element is inside `dir="rtl"`: modern
 * engines (which is all Tauri ships with — WebView2, WebKitGTK, WKWebView) range
 * it `[-max, 0]` instead, zero at the reading start (the *visual right* edge)
 * and `-max` at the visual left. The physical left/right buttons below don't
 * care which convention is live — `scrollBy` moves the same physical direction
 * either way — but *disabling* them at the correct edge does.
 */
function readHScroll(el: HTMLElement, rtl: boolean): HScrollState {
  const max = el.scrollWidth - el.clientWidth;
  if (max <= H_SCROLL_EPSILON) {
    return { hasOverflow: false, canLeft: false, canRight: false };
  }
  const sl = el.scrollLeft;
  if (!rtl) {
    return {
      hasOverflow: true,
      canLeft: sl > H_SCROLL_EPSILON,
      canRight: sl < max - H_SCROLL_EPSILON,
    };
  }
  return {
    hasOverflow: true,
    canLeft: sl > -max + H_SCROLL_EPSILON,
    canRight: sl < -H_SCROLL_EPSILON,
  };
}

/**
 * The app's one data table.
 *
 * A real `<table>`, not a grid of divs: a student roster is tabular data, and
 * the semantics are what let a screen reader announce "row 4 of 20, Name, Amina
 * Belkacem" instead of reading a wall of unrelated text.
 *
 * Two things are load-bearing and easy to lose in a redesign:
 *
 *  - **The header is sticky** — for a table that fits its container width. These
 *    tables run to hundreds of rows, so by row eight the column names would
 *    otherwise have scrolled away and the reader is looking at four numbers with
 *    no idea which is the total.
 *
 *    A table wide enough to need this wrapper's `overflow-x: auto` loses that
 *    stickiness, and that is a browser behaviour rather than a bug here: setting
 *    `overflow-x` to anything but `visible` forces the used `overflow-y` to
 *    `auto` too (`hidden` and `clip` don't escape it), which makes this element
 *    a scroll container in its own right. A `position: sticky` descendant sticks
 *    to the *nearest* scroll container, so it locks onto this one — which never
 *    scrolls vertically, so the header sits at the top of the table and scrolls
 *    away with it. Accepted as a known gap rather than hand-rolled, since it
 *    only affects tables wide enough to scroll sideways in the first place.
 *
 *  - **The rows are tall.** 64px minimum, because every row here carries buttons
 *    a pointer has to hit and a name that has to be readable at a glance.
 *    Density is bought with fewer columns, never with shorter rows.
 *
 * Horizontal scrolling stays local to the table: a table wider than its
 * container handing the whole app a sideways scrollbar would be worse, not
 * better. The wrapper answers to wheel+Shift, trackpad and touch for free
 * (native `overflow-x: auto`) and to the arrow keys via
 * {@link handleScrollKeyDown} — the on-screen buttons are for the reader who
 * knows none of that, or whose input device cannot do it. They appear only when
 * there is something to scroll to and disable themselves at the edge they would
 * otherwise scroll past; holding one down repeats it.
 */
function Table({ className, children, ...props }: React.ComponentProps<"table">) {
  const t = useTranslations("Table");
  const locale = useLocale();
  const rtl = directionFor(locale) === "rtl";
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = React.useState<HScrollState>({
    hasOverflow: false,
    canLeft: false,
    canRight: false,
  });
  const hold = React.useRef<{ timeout?: number; interval?: number }>({});

  const update = React.useCallback(() => {
    const el = scrollerRef.current;
    if (el) setScroll(readHScroll(el, rtl));
  }, [rtl]);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    update();
    // The table's own width changes with its data (a filter narrowing the
    // columns, a roster gaining a column), not just the container's — so the
    // content box is observed too, not only the viewport.
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    el.addEventListener("scroll", update, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener("scroll", update);
    };
  }, [update]);

  const stopHold = React.useCallback(() => {
    window.clearTimeout(hold.current.timeout);
    window.clearInterval(hold.current.interval);
    hold.current = {};
  }, []);

  React.useEffect(() => stopHold, [stopHold]);

  function scrollStep(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = Math.max(240, Math.round(el.clientWidth * 0.8));
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    el.scrollBy({ left: dir * distance, behavior });
  }

  /** First press moves immediately; holding repeats after a short delay, so a
   * tap and a hold both feel right rather than the tap firing twice. */
  function startHold(dir: -1 | 1) {
    scrollStep(dir);
    hold.current.timeout = window.setTimeout(() => {
      hold.current.interval = window.setInterval(() => scrollStep(dir), 120);
    }, 350);
  }

  return (
    <div className="min-w-0 space-y-2">
      {scroll.hasOverflow && (
        <div className="flex shrink-0 items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={!scroll.canLeft}
            aria-label={t("ScrollLeft")}
            onPointerDown={() => startHold(-1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
          >
            <ChevronLeft />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            disabled={!scroll.canRight}
            aria-label={t("ScrollRight")}
            onPointerDown={() => startHold(1)}
            onPointerUp={stopHold}
            onPointerLeave={stopHold}
            onPointerCancel={stopHold}
          >
            <ChevronRight />
          </Button>
        </div>
      )}
      <div
        ref={scrollerRef}
        data-slot="table-container"
        className="border-app relative w-full min-w-0 overflow-x-auto rounded-xl border-border bg-card shadow-sm"
        onKeyDown={handleScrollKeyDown}
      >
        <table data-slot="table" className={cn("w-full caption-bottom border-collapse", className)} {...props}>
          {children}
        </table>
      </div>
    </div>
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return (
    <thead
      data-slot="table-header"
      className={cn("sticky top-0 z-10 bg-muted/70 backdrop-blur-sm", className)}
      {...props}
    />
  );
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return <tbody data-slot="table-body" className={className} {...props} />;
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t-2 border-border bg-muted/60 font-bold [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b-2 border-border transition-colors last:border-b-0",
        "hover:bg-accent/40 has-aria-expanded:bg-accent/40 data-[state=selected]:bg-accent/60",
        className,
      )}
      {...props}
    />
  );
}

/**
 * A column heading.
 *
 * `numeric` right-aligns it — and only it: the cells underneath align
 * themselves, because a heading that knows about its column's alignment while
 * the cells do not is how a money column ends up with a start-aligned title over
 * end-aligned figures.
 */
function TableHead({ className, numeric, ...props }: React.ComponentProps<"th"> & { numeric?: boolean }) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "border-b-2 border-border px-4 py-3.5 text-start text-sm font-bold tracking-[0.08em] whitespace-nowrap uppercase text-foreground/70 tall:px-5 tall:py-4",
        numeric && "text-end",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, numeric, ...props }: React.ComponentProps<"td"> & { numeric?: boolean }) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "h-16 px-4 py-3 align-middle text-base tall:px-5 tall:py-4 tall:text-lg",
        numeric && "text-end tabular-nums",
        className,
      )}
      {...props}
    />
  );
}

/**
 * The row shown in place of the body when a filter matches nothing. Spans the
 * whole table so the message sits under the headings rather than in column 1.
 */
function TableEmpty({ colSpan, children }: { colSpan: number; children: React.ReactNode }) {
  return (
    <tr>
      <td colSpan={colSpan} className="px-4 py-16 text-center text-lg text-muted-foreground">
        {children}
      </td>
    </tr>
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return <caption data-slot="table-caption" className={cn("mt-4 text-base text-muted-foreground", className)} {...props} />;
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableEmpty, TableCaption };
