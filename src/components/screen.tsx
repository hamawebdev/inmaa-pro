import { ArrowLeft, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SECTION_ACCENT, type SectionId } from "@/navigation/sections";

/**
 * The page box every screen sits in.
 *
 * One place owns the max width and the padding ramp, so no screen can drift into
 * its own margins — which is exactly what happened before, when four pages grew
 * their own `max-w-5xl` and their own hard-coded padding.
 *
 * `min-w-0` and `max-w-full` together are what keep a wide child — a long table,
 * an untruncated number — from pushing the box past the window: without them a
 * grid or flex parent sizes to its content and the app gains the sideways scroll
 * the shell works to prevent.
 *
 * The trailing padding is deliberate and large. A page in this app *ends*: the
 * last control is followed by clear space, so scrolling to the bottom reads as
 * "that was everything" rather than "something is cut off down there" — which
 * matters more now that a bottom bar sits under the scroller.
 *
 * Padding is keyed to viewport *height* rather than width on purpose. The window
 * cannot open below 1024px wide, so `sm`/`md`/`lg` are matched on every machine
 * this ships to and are useless as a density signal; height is what varies.
 */
export function Screen({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        "mx-auto w-full max-w-[92rem] min-w-0 px-5 pt-5 pb-16",
        "tall:px-10 tall:pt-8 tall:pb-24 short:px-6 short:pt-6",
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The end of a page: the actions that commit whatever was filled in above.
 *
 * Deliberately *not* sticky. A pinned bar is right when a form is longer than
 * the reader's patience and the primary action must always be a click away — and
 * wrong here, because the app already has one permanent bar at the bottom of the
 * window, and a second one above it would leave a long form with two strips of
 * chrome competing for the same corner of the eye.
 *
 * The rule above it and the whitespace around it are the whole point: they say
 * "this is the bottom of the form" before the buttons are read at all.
 */
export function PageActions({
  children,
  note,
  className,
}: {
  children: React.ReactNode;
  /** Anything that must be seen alongside the buttons — a validation count. */
  note?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mt-10 border-t-2 border-border pt-8 tall:mt-14 tall:pt-10", className)}>
      <div className="flex min-w-0 flex-wrap items-center gap-4 tall:gap-5">
        {note}
        <div className="ms-auto flex min-w-0 flex-wrap items-center justify-end gap-3 tall:gap-4">{children}</div>
      </div>
    </div>
  );
}

/**
 * A screen's title, in its section's colour.
 *
 * The colour is the orientation cue — the same hue this section wears in the
 * bottom bar — but it is never the only one: the word is right there, the icon
 * repeats it, and the plate behind the icon repeats the hue as *shape* rather
 * than as text colour, which is what keeps it readable for someone who cannot
 * separate the hues.
 *
 * This replaces `PageShell`, whose hand-rolled `/`-separated breadcrumb trail
 * ran across the top of all 47 routes. Breadcrumbs answered "where am I" for a
 * ten-item sidebar with nested children; the bottom bar and the tab strip answer
 * it directly now, and a detail route says it with `back` instead.
 */
export function ScreenHeader({
  section,
  title,
  description,
  icon: Icon,
  actions,
  back,
  className,
  titleClassName,
}: {
  section: SectionId;
  title: string;
  /** One line under the title saying what this screen is for. */
  description?: string;
  icon?: LucideIcon;
  /** Buttons that belong to the screen as a whole, trailing the title. */
  actions?: React.ReactNode;
  /** Where "back" goes, for a detail route. Renders nothing when absent. */
  back?: { href: string; label: string };
  className?: string;
  /** Extra classes for the heading row alone. */
  titleClassName?: string;
}) {
  const accent = SECTION_ACCENT[section];
  return (
    <div className={cn("min-w-0", className)}>
      {back && (
        <Button asChild variant="ghost" size="sm" className="-ms-3 mb-3 text-muted-foreground">
          <Link to={back.href}>
            {/* The arrow is the one glyph here that is inherently physical:
                "back" points left in English and right in Arabic. */}
            <ArrowLeft className="rtl:rotate-180" />
            {back.label}
          </Link>
        </Button>
      )}
      <div className={cn("flex min-w-0 flex-wrap items-center gap-x-5 gap-y-3", titleClassName)}>
        {Icon && (
          <span
            aria-hidden
            className={cn(
              "border-app grid size-14 shrink-0 place-content-center rounded-xl tall:size-16",
              accent.fill,
              accent.border,
              accent.text,
            )}
          >
            <Icon className="size-7 tall:size-8" />
          </span>
        )}
        <div className="min-w-0 flex-1 basis-64">
          <h1
            className={cn(
              "min-w-0 truncate text-2xl leading-tight font-bold tracking-tight tall:text-4xl short:text-3xl",
              accent.text,
            )}
          >
            {title}
          </h1>
          {description && (
            // A description explains, and explanations are the first thing a
            // short window gives up — the heading beside it still says what
            // this is.
            <p className="mt-1 truncate text-base text-muted-foreground tall:text-lg short:hidden">{description}</p>
          )}
        </div>
        {actions && <div className="ms-auto flex flex-wrap items-center gap-3">{actions}</div>}
      </div>
    </div>
  );
}

/**
 * A secondary heading inside a screen ("Recent observations", "Enrolled
 * groups"). Same shrink ramp as {@link ScreenHeader} so the two never disagree
 * about how big a heading is at a given height.
 */
export function SectionHeading({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("text-xl font-bold tracking-tight tall:text-3xl short:text-2xl", className)}>{children}</h2>;
}
