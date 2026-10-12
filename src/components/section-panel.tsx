import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * The colour identities a panel can wear.
 *
 * Spelled out in full rather than composed, because Tailwind scans source text
 * and a template literal like `bg-section-${tone}/15` produces no CSS at all.
 *
 * The names are the *colours*, not the sections, on purpose: a violet panel on
 * the student form is not "the staff panel", it is the violet one. The
 * section-to-hue mapping lives in src/navigation/sections.ts and is a different
 * contract.
 */
const SECTION_TONES = {
  teal: {
    wash: "bg-section-home/5",
    head: "border-section-home/25",
    plate: "bg-section-home/15 border-section-home/30 text-section-home",
  },
  blue: {
    wash: "bg-section-requests/5",
    head: "border-section-requests/25",
    plate: "bg-section-requests/15 border-section-requests/30 text-section-requests",
  },
  violet: {
    wash: "bg-section-employees/5",
    head: "border-section-employees/25",
    plate: "bg-section-employees/15 border-section-employees/30 text-section-employees",
  },
  amber: {
    wash: "bg-section-workers/5",
    head: "border-section-workers/25",
    plate: "bg-section-workers/15 border-section-workers/30 text-section-workers",
  },
  green: {
    wash: "bg-section-stock/5",
    head: "border-section-stock/25",
    plate: "bg-section-stock/15 border-section-stock/30 text-section-stock",
  },
  plum: {
    wash: "bg-section-money/5",
    head: "border-section-money/25",
    plate: "bg-section-money/15 border-section-money/30 text-section-money",
  },
  sage: {
    wash: "bg-section-settings/5",
    head: "border-section-settings/25",
    plate: "bg-section-settings/15 border-section-settings/30 text-section-settings",
  },
  /** No hue at all, for a panel that groups without claiming an identity. */
  neutral: {
    wash: "bg-muted/40",
    head: "border-border",
    plate: "bg-muted border-border text-muted-foreground",
  },
} as const;

export type SectionTone = keyof typeof SECTION_TONES;

/**
 * A titled panel — the unit every long form in this app is built from.
 *
 * Grouping is what makes a form scannable at arm's length: someone filling in a
 * student record looks for "health" or "family", not for individual inputs. The
 * student form has 69 fields and the teacher form has 20-odd; before this they
 * were separated by a small grey caption over a hairline, which is legible on a
 * designer's monitor and invisible on an office screen under strip lighting —
 * and indistinguishable from the field labels below it.
 *
 * So a section is a real enclosure: its own border, its own faintly tinted
 * header, an icon on a coloured plate, and a title set at the size of a heading
 * rather than a caption. The hue is per-panel, which is what lets someone find
 * "the amber block" halfway down a long form without reading anything.
 */
export function SectionPanel({
  title,
  hint,
  icon: Icon,
  tone = "neutral",
  actions,
  className,
  bodyClassName,
  children,
}: {
  title: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: SectionTone;
  /** Controls belonging to the panel as a whole, trailing its title. */
  actions?: React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const t = SECTION_TONES[tone];
  return (
    <section className={cn("border-app min-w-0 overflow-hidden rounded-xl border-border bg-card shadow-sm", className)}>
      <div
        className={cn(
          "flex min-w-0 flex-wrap items-center gap-3.5 border-b-2 px-5 py-4 tall:gap-4 tall:px-6 tall:py-5",
          t.wash,
          t.head,
        )}
      >
        {Icon && (
          <span
            aria-hidden
            className={cn("border-app grid size-10 shrink-0 place-content-center rounded-lg tall:size-12", t.plate)}
          >
            <Icon className="size-5 tall:size-6" />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="min-w-0 truncate text-lg font-bold tracking-tight tall:text-2xl short:text-xl">{title}</h3>
          {/* A hint is an explanation, and explanations are the first thing a
              short window gives up — the heading beside it still says what this
              is. */}
          {hint && <p className="mt-0.5 truncate text-base text-muted-foreground short:hidden">{hint}</p>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div>}
      </div>
      <div className={cn("min-w-0 space-y-5 p-5 tall:space-y-6 tall:p-6", bodyClassName)}>{children}</div>
    </section>
  );
}
