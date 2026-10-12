import type { LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { cn } from "@/lib/utils";
import { SECTION_ACCENT, type SectionId } from "@/navigation/sections";

/**
 * One number, said once, at the size it deserves.
 *
 * These replace the hand-built KPI markup that the overview, student overview
 * and finance pages each grew separately — three different type scales, three
 * different label treatments, and a set of hard-coded hex greys that were
 * invisible in dark mode.
 *
 * The number is `tabular-nums` and very large, because a row of these is read by
 * comparing figures down a line: proportional digits make "1,411" and "1,111"
 * different widths and defeat that entirely.
 *
 * `href` turns the whole tile into a link. That matters on the overview screen,
 * where each payment-status figure is also the way in to the list behind it —
 * previously a small "view" link in the corner that nobody found.
 */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone,
  href,
  className,
}: {
  label: string;
  value: React.ReactNode;
  /** A second line under the number — a comparison, a unit, a caveat. */
  hint?: string;
  icon?: LucideIcon;
  /** Whose hue this tile wears. Defaults to the neutral treatment. */
  tone?: SectionId;
  href?: string;
  className?: string;
}) {
  const accent = tone ? SECTION_ACCENT[tone] : undefined;

  const body = (
    <>
      <div className="flex min-w-0 items-start gap-4">
        {Icon && (
          <span
            aria-hidden
            className={cn(
              "border-app grid size-11 shrink-0 place-content-center rounded-lg tall:size-12",
              accent ? cn(accent.fill, accent.border, accent.text) : "border-border bg-muted text-muted-foreground",
            )}
          >
            <Icon className="size-5 tall:size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="min-w-0 truncate text-base font-bold tracking-tight text-muted-foreground tall:text-lg">
            {label}
          </p>
          <p
            className={cn(
              "mt-1 min-w-0 truncate text-3xl leading-none font-bold tabular-nums tall:text-5xl short:text-4xl",
              accent?.text,
            )}
          >
            {value}
          </p>
          {hint && <p className="mt-2 min-w-0 truncate text-base text-muted-foreground short:hidden">{hint}</p>}
        </div>
      </div>
    </>
  );

  const shell = cn(
    "border-app block min-w-0 rounded-xl border-border bg-card p-5 shadow-sm transition-colors tall:p-6",
    href && "hover:border-ring/50 hover:bg-accent/30 focus-visible:ring-[3px] focus-visible:ring-ring/30 outline-none",
    className,
  );

  if (href) {
    return (
      <Link to={href} className={shell}>
        {body}
      </Link>
    );
  }
  return <div className={shell}>{body}</div>;
}
