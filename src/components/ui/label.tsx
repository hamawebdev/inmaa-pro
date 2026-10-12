import * as React from "react";

import { Label as LabelPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * Labels here are **scanned**, not read.
 *
 * Someone filling in a 20-field teacher record is looking for "phone" or
 * "contract type", not reading a form top to bottom, so a label has to survive
 * peripheral vision: full size, bold, tightly tracked. The small grey
 * medium-weight caption this replaces was indistinguishable from the hint text
 * underneath it and from the value inside the field beside it.
 *
 * `text-foreground/85` rather than full strength: a label still has to sit
 * *below* the data it names in the reading order.
 */
function Label({ className, ...props }: React.ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        "flex items-center gap-2 text-base leading-none font-bold tracking-tight text-foreground/85 select-none tall:text-lg",
        "group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50",
        "peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

export { Label };
