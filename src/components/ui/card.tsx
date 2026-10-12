import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * A card is an enclosure defined by its **border**, not by its shadow.
 *
 * Under fluorescent lighting a 1px hairline plus a 2% surface step is, in
 * practice, one undifferentiated field: the reader has to re-find the boundary
 * of every card on every glance. So a card here carries a real 2px line and sits
 * a genuine ~9% of relative luminance above the canvas. The shadow is a third,
 * quieter signal underneath those two — it confirms the hierarchy, it never
 * carries it alone.
 *
 * `size="sm"` keeps its old meaning (tighter padding for cards used as list
 * items) so existing call sites do not have to change.
 */
function Card({
  className,
  size = "default",
  ...props
}: React.ComponentProps<"div"> & { size?: "default" | "sm" }) {
  return (
    <div
      data-slot="card"
      data-size={size}
      className={cn(
        "group/card border-app flex min-w-0 flex-col gap-5 overflow-hidden rounded-xl border-border bg-card py-5 text-card-foreground shadow-sm tall:gap-6 tall:py-7",
        "data-[size=sm]:gap-4 data-[size=sm]:py-4",
        "has-[>img:first-child]:pt-0 *:[img:first-child]:rounded-t-xl *:[img:last-child]:rounded-b-xl",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "group/card-header @container/card-header grid min-w-0 auto-rows-min items-start gap-1.5 rounded-t-xl px-5 tall:px-7",
        "group-data-[size=sm]/card:px-4",
        "has-data-[slot=card-action]:grid-cols-[1fr_auto] has-data-[slot=card-description]:grid-rows-[auto_auto]",
        "[.border-b]:pb-5 tall:[.border-b]:pb-6 group-data-[size=sm]/card:[.border-b]:pb-4",
        className,
      )}
      {...props}
    />
  );
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn(
        "min-w-0 text-lg leading-tight font-bold tracking-tight short:text-xl tall:text-2xl",
        "group-data-[size=sm]/card:text-base group-data-[size=sm]/card:short:text-lg group-data-[size=sm]/card:tall:text-lg",
        className,
      )}
      {...props}
    />
  );
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      // A description explains; explanations are the first thing a short screen
      // gives up, because the title beside it still says what this is.
      className={cn("min-w-0 text-base text-muted-foreground short:text-sm tall:text-lg", className)}
      {...props}
    />
  );
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  );
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-content"
      className={cn("min-w-0 px-5 tall:px-7 group-data-[size=sm]/card:px-4", className)}
      {...props}
    />
  );
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn(
        "flex min-w-0 flex-wrap items-center gap-3 rounded-b-xl px-5 tall:px-7 group-data-[size=sm]/card:px-4",
        "[.border-t]:pt-5 tall:[.border-t]:pt-6 group-data-[size=sm]/card:[.border-t]:pt-4",
        className,
      )}
      {...props}
    />
  );
}

export { Card, CardHeader, CardFooter, CardTitle, CardAction, CardDescription, CardContent };
