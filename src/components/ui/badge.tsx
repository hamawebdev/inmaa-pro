import * as React from "react";

import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * A small, bordered label for a value that has a state — a contract type, an
 * education level, active/inactive.
 *
 * Every semantic variant carries a real 2px border in its own hue rather than a
 * transparent one, for the same reason cards do: a pale tinted pill on a warm
 * canvas has no edge, and a row of them reads as coloured smudges. The tint is
 * the fill, the hue is the ink, and the border is what makes it an object.
 *
 * This is deliberately not the place for status that the reader must not miss —
 * that is `StatusChip`, which forces an icon and a word so the meaning never
 * rests on hue alone.
 */
const badgeVariants = cva(
  "group/badge inline-flex w-fit shrink-0 items-center justify-center gap-1.5 overflow-hidden rounded-full border-app px-2.5 py-0.5 text-sm font-bold tracking-tight whitespace-nowrap transition-all tall:text-base focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&>svg]:pointer-events-none [&>svg]:size-[1.05em]",
  {
    variants: {
      variant: {
        default: "border-primary/0 bg-primary text-primary-foreground [a]:hover:bg-primary/90",
        secondary: "border-border bg-secondary text-secondary-foreground [a]:hover:bg-accent",
        outline: "border-border-strong bg-card text-foreground [a]:hover:bg-accent",
        success: "border-success/35 bg-success/12 text-success",
        warning: "border-warning-ink/35 bg-warning/15 text-warning-ink",
        info: "border-info/35 bg-info/12 text-info",
        destructive: "border-destructive/35 bg-destructive/10 text-destructive",
        muted: "border-border bg-muted text-muted-foreground",
        ghost: "border-transparent text-muted-foreground hover:bg-accent hover:text-accent-foreground",
        link: "border-transparent text-primary underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : "span";

  return <Comp data-slot="badge" data-variant={variant} className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
