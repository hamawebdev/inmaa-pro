import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * The border, fill and state behaviour every editable control shares.
 *
 * Exported rather than duplicated, because an input, a textarea and a select
 * trigger have to be indistinguishable as *surfaces* — the moment one of them
 * grows a different border weight or a different focus ring, a form reads as
 * three kinds of control instead of one.
 *
 * Three things here are load-bearing:
 *
 * - `bg-field`, not `bg-card` and not `bg-transparent`. A field sits one step
 *   above the card it lives on, so it reads as an open slot rather than a
 *   painted rectangle. On a dialog (which is already at the app's ceiling) it
 *   simply matches, and the border does the work.
 * - The resting border is `--input`, which is pinned to WCAG 1.4.11's 3:1
 *   against every surface a field is ever drawn on. Hover, focus and invalid
 *   all ESCALATE that line rather than introducing one — a field must never
 *   gain its first visible border by being touched.
 * - Heights are px on a viewport-height ramp, matching Button, so a control and
 *   the button beside it are the same height at every window size.
 */
export const fieldShell = cn(
  "w-full min-w-0 rounded-lg border-app border-input bg-field text-foreground shadow-xs",
  "transition-[color,box-shadow,border-color] outline-none",
  "placeholder:text-muted-foreground/80",
  "hover:border-input/80",
  "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
  "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
  "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/25",
  "dark:bg-field",
);

/** The height ramp shared by input, select trigger and any single-line control. */
export const fieldHeight = "h-[52px] short:h-[56px] tall:h-[60px]";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        data-slot="input"
        className={cn(
          fieldShell,
          fieldHeight,
          "px-4 text-base tall:px-5",
          "file:me-3 file:inline-flex file:h-full file:cursor-pointer file:border-0 file:bg-transparent file:text-base file:font-bold file:text-foreground",
          className,
        )}
        {...props}
      />
    );
  },
);

Input.displayName = "Input";

export { Input };
