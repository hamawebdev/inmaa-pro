import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Toggle as TogglePrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

const toggleVariants = cva(
  "group/toggle inline-flex items-center justify-center gap-2 rounded-lg font-semibold tracking-tight whitespace-nowrap outline-none transition-[color,box-shadow,border-color,background-color] hover:bg-accent hover:text-accent-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
  {
    variants: {
      variant: {
        default: "border-app border-transparent bg-transparent data-[state=on]:bg-accent",
        /**
         * A *visible box at rest*, not just when pressed. A segmented control
         * whose unpressed segments have no edge reads as one lit button beside
         * some floating words — the reader cannot tell the alternatives are
         * choices until they have already clicked one.
         */
        outline:
          "border-app border-border-strong bg-card shadow-xs hover:border-ring/60 data-[state=on]:shadow-sm",
      },
      size: {
        default: "h-[52px] min-w-[52px] px-4 text-base short:h-[56px] tall:h-[60px]",
        sm: "h-[46px] min-w-[46px] px-3.5 text-base tall:h-[50px]",
        lg: "h-[58px] min-w-[58px] px-5 text-lg short:h-[62px] tall:h-[66px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Toggle({
  className,
  variant = "default",
  size = "default",
  ...props
}: React.ComponentProps<typeof TogglePrimitive.Root> &
  VariantProps<typeof toggleVariants>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(toggleVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Toggle, toggleVariants }
