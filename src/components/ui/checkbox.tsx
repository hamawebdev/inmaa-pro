import * as React from "react";

import { CheckIcon } from "lucide-react";
import { Checkbox as CheckboxPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * A checkbox you can actually hit.
 *
 * The 16px box this replaces was a 16px *target* — well under WCAG 2.5.5's
 * 24px minimum, never mind a comfortable one — and its 1px border vanished on
 * the warm canvas. At this size the tick is legible at a glance across a desk,
 * which matters most where these appear in bulk: the locked-sections picker and
 * the attendance grids.
 *
 * The `after` pseudo-element extends the hit area beyond the drawn box, so the
 * label's leading edge is forgiving without the box itself having to grow.
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        "border-app peer relative flex size-8 shrink-0 items-center justify-center rounded-md border-input bg-field shadow-xs outline-none transition-[color,box-shadow,border-color] tall:size-9",
        "after:absolute after:-inset-x-2 after:-inset-y-1.5",
        "hover:border-input/80",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30",
        "disabled:cursor-not-allowed disabled:opacity-50 group-has-disabled/field:opacity-50",
        "aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/25 aria-invalid:aria-checked:border-primary",
        // Radix marks a ticked box `data-state="checked"`. The academy's `data-checked:` matched an attribute
        // Radix never sets, so its ticked boxes never filled: an intended difference from the reference.
        "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground dark:data-[state=checked]:bg-primary",
        "data-[state=indeterminate]:border-primary data-[state=indeterminate]:bg-primary data-[state=indeterminate]:text-primary-foreground",
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none [&>svg]:size-5 tall:[&>svg]:size-6"
      >
        {/* A heavier stroke than the default: a hairline tick inside a filled
            box is the first thing to disappear under glare. */}
        <CheckIcon strokeWidth={3} className="animate-in zoom-in-75 duration-150" />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
