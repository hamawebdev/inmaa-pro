import { CircleAlert, CircleCheck, CircleMinus, CirclePlay, CircleX, Clock, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * A state, said with a colour, an icon **and** a word — all three, always.
 *
 * This replaces the four `.badge-pastel-*` classes, which encoded state as a
 * 10px uppercase monospace label on a pastel fill. Two problems with that, and
 * this component exists to make both unrepresentable:
 *
 *  - 10px type on a pastel wash is at the edge of legibility on a bright office
 *    screen, and well past it for anyone reading at arm's length.
 *  - Neither the icon nor the word was required, so several call sites shipped
 *    colour alone. "Red pill" and "green pill" are the same pill to a
 *    colour-blind reader, and this app uses red/green for *paid* and *overdue* —
 *    the two states a parent will argue about.
 *
 * So `label` is required and the icon is chosen from the tone rather than passed
 * in, which means there is no way to build a chip that says less than this.
 */
/**
 * `progress` is this program's own: something under way («جارية», a visit the team is at). His colour
 * list has green for confirmed, yellow for awaiting, blue for done, red for a problem and black for
 * cancelled, and none for under way; it is violet so that it is taken for none of them.
 */
export type StatusTone = "success" | "warning" | "danger" | "info" | "progress" | "neutral" | "pending";

const TONES: Record<StatusTone, { className: string; icon: LucideIcon }> = {
  success: { className: "border-success/35 bg-success/12 text-success", icon: CircleCheck },
  warning: { className: "border-warning-ink/35 bg-warning/15 text-warning-ink", icon: CircleAlert },
  danger: { className: "border-destructive/35 bg-destructive/10 text-destructive", icon: CircleX },
  info: { className: "border-info/35 bg-info/12 text-info", icon: CircleAlert },
  progress: { className: "border-progress/35 bg-progress/12 text-progress", icon: CirclePlay },
  pending: { className: "border-border-strong bg-muted text-foreground/75", icon: Clock },
  neutral: { className: "border-border bg-muted text-muted-foreground", icon: CircleMinus },
};

export function StatusChip({
  tone,
  label,
  icon: IconOverride,
  className,
}: {
  tone: StatusTone;
  /** Required. A chip without a word is a colour, and a colour is not a status. */
  label: string;
  /** Only to say something more specific than the tone — never to remove it. */
  icon?: LucideIcon;
  className?: string;
}) {
  const { className: toneClass, icon } = TONES[tone];
  const Icon = IconOverride ?? icon;

  return (
    <span
      data-slot="status-chip"
      className={cn(
        "border-app inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-sm font-bold tracking-tight whitespace-nowrap tall:text-base",
        toneClass,
        className,
      )}
    >
      <Icon aria-hidden className="size-[1.05em] shrink-0" />
      {label}
    </span>
  );
}
