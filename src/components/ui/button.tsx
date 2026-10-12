import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { Check } from "lucide-react";
import { Slot } from "radix-ui";

import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button relative inline-flex shrink-0 items-center justify-center gap-2.5 rounded-lg font-bold tracking-tight whitespace-nowrap outline-none transition-all duration-200 ease-[var(--ease-out-soft)] select-none active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 disabled:active:scale-100 focus-visible:ring-[4px] focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-transform [&_svg:not([class*='size-'])]:size-[1.15em]",
  {
    variants: {
      /**
       * Colour carries meaning here, not just emphasis.
       *
       * An administrator reaching for a button recognises its colour before they
       * read its label, so each kind of action owns one: green commits, blue
       * prints, orange edits, emerald adds, violet exports, red destroys, amber
       * flags something unresolved. That mapping is fixed across the whole app —
       * a green button never prints and a red one never saves — because the
       * moment it varies by screen the colour stops being information and
       * becomes decoration. Every filled variant carries its colour at rest:
       * hover only deepens it, never introduces it, so an action reads correctly
       * before the cursor ever reaches it.
       *
       * Two details are shared by every filled variant. The `inset-ring` is a
       * hairline of shadow just inside the edge: on a warm canvas a flat
       * rectangle of colour has a soft, printed-looking edge, and that line is
       * what makes it read as a machined, pressable object instead. The
       * *transparent* 2px border is a spacer — `outline` and `secondary` spend
       * 2px of their height on a real border, and without a matching invisible
       * one here a filled button and an outlined one sitting in the same row
       * would be 4px different in height.
       */
      variant: {
        default:
          "border-app border-primary/0 bg-primary text-primary-foreground shadow-sm inset-ring-1 inset-ring-black/12 hover:bg-primary/90 hover:shadow-md focus-visible:ring-primary/40",
        /** Commit: save, confirm, finish. */
        success:
          "border-app border-success/0 bg-success text-success-foreground shadow-sm inset-ring-1 inset-ring-black/12 hover:bg-success/90 hover:shadow-md focus-visible:ring-success/40",
        /** Print, preview, open — the "produce a document" family. */
        info: "border-app border-info/0 bg-info text-info-foreground shadow-sm inset-ring-1 inset-ring-black/12 hover:bg-info/90 hover:shadow-md focus-visible:ring-info/40",
        /** Unresolved and waiting on the user. */
        warning:
          "border-app border-warning/0 bg-warning text-warning-foreground shadow-sm inset-ring-1 inset-ring-black/12 hover:bg-warning/90 hover:shadow-md focus-visible:ring-warning/40",
        destructive:
          "border-app border-destructive/0 bg-destructive text-white shadow-sm inset-ring-1 inset-ring-black/12 hover:bg-destructive/90 hover:shadow-md focus-visible:ring-destructive/40 dark:bg-destructive/80",
        /** Edit an existing record in place. */
        edit: "border-app border-edit/0 bg-edit text-edit-foreground shadow-sm inset-ring-1 inset-ring-black/12 hover:bg-edit/90 hover:shadow-md focus-visible:ring-edit/40",
        /** Add / create a new record — distinct from `success` so "add a
         * student" is never confused with "save". */
        add: "border-app border-add/0 bg-add text-add-foreground shadow-sm inset-ring-1 inset-ring-black/12 hover:bg-add/90 hover:shadow-md focus-visible:ring-add/40",
        /** Export a file out of the app — apart from `info` (print/preview). */
        export:
          "border-app border-export/0 bg-export text-export-foreground shadow-sm inset-ring-1 inset-ring-black/12 hover:bg-export/90 hover:shadow-md focus-visible:ring-export/40",
        /** Bring an external file into the app — apart from `default`. */
        import:
          "border-app border-import/0 bg-import text-import-foreground shadow-sm inset-ring-1 inset-ring-black/12 hover:bg-import/90 hover:shadow-md focus-visible:ring-import/40",
        outline:
          "border-app border-border-strong bg-card text-foreground shadow-xs hover:border-ring/60 hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/35 aria-expanded:bg-accent dark:bg-input/25 dark:hover:bg-input/45",
        secondary:
          "border-app border-border bg-secondary text-secondary-foreground shadow-xs hover:border-border-strong hover:bg-accent focus-visible:ring-ring/35 aria-expanded:bg-accent",
        ghost:
          "border-app border-transparent hover:bg-accent hover:text-accent-foreground focus-visible:ring-ring/35 aria-expanded:bg-accent dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline active:scale-100 focus-visible:ring-ring/35",
      },
      /**
       * Heights are in **px**, deliberately, and this is the one place in the
       * app where that is right. A fingertip and a cursor are the same size on a
       * 1024x640 laptop as on a 27" monitor, so a button's height must not ride
       * the fluid root font-size the way its label does — a `rem` height turns a
       * comfortable 52px control into an absurd 82px one at the 22px root cap,
       * and wastes exactly the vertical space the short screens cannot spare.
       *
       * So the ramp is by viewport *height* instead, and every step from `sm`
       * upward stays clear of 44px (WCAG 2.5.5 target size). `xs` is below that
       * on purpose and is reserved for controls that sit inside an already-large
       * target — a clear-field affordance inside an input, a chip's dismiss —
       * never for a standalone action.
       *
       * Padding and text stay in `rem`, so a button still grows with its label.
       */
      size: {
        xs: "h-[38px] gap-1.5 rounded-md px-3 text-sm tall:h-[42px] has-[>svg]:px-2.5",
        sm: "h-[46px] gap-2 px-4 text-base tall:h-[50px] has-[>svg]:px-3.5",
        default: "h-[52px] px-6 text-base short:h-[56px] tall:h-[60px] tall:px-7 has-[>svg]:px-5",
        lg: "h-[58px] rounded-xl px-7 text-lg short:h-[62px] tall:h-[66px] tall:px-9 has-[>svg]:px-6",
        /** The one you never miss: SAVE, PRINT — the primary action of a screen. */
        xl: "h-[62px] gap-3 rounded-xl px-8 text-lg short:h-[68px] tall:h-[74px] tall:px-9 tall:text-xl has-[>svg]:px-7",
        icon: "size-[52px] rounded-lg short:size-[56px] tall:size-[60px]",
        "icon-xs": "size-[38px] rounded-md tall:size-[42px]",
        "icon-sm": "size-[46px] rounded-lg tall:size-[50px]",
        "icon-lg": "size-[58px] rounded-xl tall:size-[62px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ComponentProps<"button">, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Work is in flight: swaps the leading icon for a spinner and blocks input. */
  loading?: boolean;
  /** Work just finished: swaps the leading icon for a tick. See {@link useActionFeedback}. */
  succeeded?: boolean;
}

/**
 * Replaces the leading icon with a spinner or a tick, leaving the label — and
 * therefore the button's width — untouched.
 *
 * Width stability is the point. Swapping the whole content makes the button
 * resize under the pointer that is still on it, which reads as a misfire and
 * invites a second click on whatever moved into that spot.
 */
function withStatusIcon(children: React.ReactNode, status: React.ReactNode): React.ReactNode {
  const items = React.Children.toArray(children);
  const first = items.findIndex(React.isValidElement);
  if (first === -1) return [status, ...items];
  return items.map((child, i) => (i === first ? status : child));
}

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  loading = false,
  succeeded = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : "button";

  // `asChild` hands rendering to the caller's element, so a status icon has
  // nowhere to go; the props are simply ignored rather than silently corrupting
  // the child's markup.
  const content =
    asChild || (!loading && !succeeded)
      ? children
      : withStatusIcon(
          children,
          loading ? <Spinner key="status" /> : <Check key="status" className="animate-in zoom-in-75 duration-200" />,
        );

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      data-loading={loading || undefined}
      data-succeeded={succeeded || undefined}
      aria-busy={loading || undefined}
      disabled={asChild ? undefined : disabled || loading}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    >
      {content}
    </Comp>
  );
}

/**
 * Holds a "just succeeded" flag for a moment after an action completes.
 *
 * Without it a fast save is invisible: the spinner appears and vanishes inside
 * one frame, and the user is left looking at a button that seems not to have
 * done anything. A tick that lingers ~1.4s is the difference between "saved"
 * and "did I press it?".
 */
export function useActionFeedback(ms = 1400) {
  const [succeeded, setSucceeded] = React.useState(false);
  const timer = React.useRef<number | undefined>(undefined);

  React.useEffect(
    () => () => {
      if (timer.current) window.clearTimeout(timer.current);
    },
    [],
  );

  const flash = React.useCallback(() => {
    if (timer.current) window.clearTimeout(timer.current);
    setSucceeded(true);
    timer.current = window.setTimeout(() => setSucceeded(false), ms);
  }, [ms]);

  return { succeeded, flash };
}

export { Button, buttonVariants };
