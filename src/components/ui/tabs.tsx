import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Tabs as TabsPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"

function Tabs({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      data-orientation={orientation}
      className={cn(
        "group/tabs flex gap-2 data-[orientation=horizontal]:flex-col",
        className
      )}
      {...props}
    />
  )
}

/**
 * The *secondary* tab strip — the one inside a page.
 *
 * Section-level navigation is `ScreenTabs` (src/components/screen-tabs.tsx),
 * which is URL-driven and wears the section's hue. This is what a page reaches
 * for below that: the six panes of the student form, the seven finance views,
 * the four education levels on Groups. `default` and `line` stay neutral on
 * purpose, so a second-level choice never competes with the section colour
 * above it.
 *
 * `segmented` is the deliberate exception: it borrows the ScreenTabs look —
 * separated outline pills, the lit one in the section's hue — for a strip whose
 * choices are peers rather than a foreground/background pair. Pair it with
 * `SECTION_ACCENT[section].tabSegment` on each trigger; without an accent it
 * falls back to the neutral card-fill active state.
 */
const tabsListVariants = cva(
  "group/tabs-list inline-flex w-fit max-w-full flex-wrap items-center justify-center rounded-xl p-1.5 text-muted-foreground group-data-[orientation=vertical]/tabs:h-fit group-data-[orientation=vertical]/tabs:flex-col data-[variant=line]:rounded-none",
  {
    variants: {
      variant: {
        default: "border-app border-border bg-muted/70",
        line: "gap-2 border-b-2 border-border bg-transparent p-0",
        // No track of its own: the pills carry their own edges, so the strip is
        // just a wrapping row of them. `justify-start` keeps a second row
        // left-aligned under the first instead of centring a short remainder.
        segmented: "justify-start gap-2 rounded-none bg-transparent p-0",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function TabsList({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof TabsPrimitive.List> &
  VariantProps<typeof tabsListVariants>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      data-variant={variant}
      className={cn(tabsListVariants({ variant }), className)}
      {...props}
    />
  )
}

function TabsTrigger({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        "relative inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg border-app border-transparent px-4 py-2 text-base font-semibold tracking-tight whitespace-nowrap text-foreground/65 transition-all group-data-[orientation=vertical]/tabs:w-full group-data-[orientation=vertical]/tabs:justify-start hover:text-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:pointer-events-none disabled:opacity-50 dark:text-muted-foreground dark:hover:text-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
        // Radix reports the selected trigger as `data-state="active"` and emits
        // no `data-active` attribute at all — a bare `data-active:` compiles to
        // `[data-active]` and silently matches nothing, leaving every tab in the
        // app looking unselected. Match on the attribute Radix actually sets.
        // Filled variant: the active pane lifts onto a card surface with a real
        // border, so which pane you are on survives a glance.
        "data-[state=active]:border-border-strong data-[state=active]:bg-card data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-sm",
        // Line variant: no fill, an underline instead. `-bottom-0.5` sits it on
        // the list's own 2px rule rather than floating below it.
        "group-data-[variant=line]/tabs-list:rounded-none group-data-[variant=line]/tabs-list:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:border-transparent group-data-[variant=line]/tabs-list:data-[state=active]:bg-transparent group-data-[variant=line]/tabs-list:data-[state=active]:shadow-none",
        "after:absolute after:bg-primary after:opacity-0 after:transition-opacity group-data-[orientation=horizontal]/tabs:after:inset-x-0 group-data-[orientation=horizontal]/tabs:after:-bottom-0.5 group-data-[orientation=horizontal]/tabs:after:h-[3px] group-data-[orientation=vertical]/tabs:after:inset-y-0 group-data-[orientation=vertical]/tabs:after:-end-0.5 group-data-[orientation=vertical]/tabs:after:w-[3px] group-data-[variant=line]/tabs-list:data-[state=active]:after:opacity-100",
        // Segmented variant: a visible box at rest, matching `toggleVariants`
        // outline. A segmented control whose unpressed segments have no edge
        // reads as one lit button beside some floating words. `flex-none` so a
        // wrapped row keeps its pills at their natural width rather than
        // stretching the leftovers across the line.
        "group-data-[variant=segmented]/tabs-list:h-[52px] group-data-[variant=segmented]/tabs-list:flex-none group-data-[variant=segmented]/tabs-list:px-5 group-data-[variant=segmented]/tabs-list:short:h-[56px] group-data-[variant=segmented]/tabs-list:tall:h-[60px] group-data-[variant=segmented]/tabs-list:tall:px-7",
        // The resting box is gated on `data-[state=inactive]` rather than left
        // unconditional: a `group-data-*` prefix outranks the plain
        // `data-[state=active]` accent a caller passes in `className`, so an
        // unconditional resting `bg-card` here would quietly beat the lit hue.
        "group-data-[variant=segmented]/tabs-list:data-[state=inactive]:border-border-strong group-data-[variant=segmented]/tabs-list:data-[state=inactive]:bg-card group-data-[variant=segmented]/tabs-list:data-[state=inactive]:shadow-xs group-data-[variant=segmented]/tabs-list:data-[state=inactive]:hover:border-ring/60",
        className
      )}
      {...props}
    />
  )
}

function TabsContent({
  className,
  ...props
}: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn("min-w-0 flex-1 outline-none", className)}
      {...props}
    />
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent, tabsListVariants }
