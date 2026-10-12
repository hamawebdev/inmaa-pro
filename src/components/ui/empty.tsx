import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * "There is nothing here", said in a way that reads as a state rather than as a
 * failure.
 *
 * The dashed border is doing real work: it marks out the region that *would*
 * hold content, so an empty list looks like an empty container instead of like a
 * page that stopped rendering halfway. The border has to be declared here —
 * `border-dashed` alone sets a style with no width, which is why the original
 * drew nothing at all.
 */
function Empty({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty"
      className={cn(
        "border-app flex w-full min-w-0 flex-1 flex-col items-center justify-center gap-4 rounded-xl border-dashed border-border bg-card/40 p-10 text-center text-balance tall:gap-5 tall:p-14",
        className,
      )}
      {...props}
    />
  );
}

function EmptyHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="empty-header" className={cn("flex max-w-md flex-col items-center gap-2", className)} {...props} />;
}

const emptyMediaVariants = cva("mb-1 flex shrink-0 items-center justify-center [&_svg]:pointer-events-none [&_svg]:shrink-0", {
  variants: {
    variant: {
      default: "bg-transparent",
      /** The icon on a plate, matching the plates ScreenHeader and SectionPanel
       * put their icons on, so an empty state belongs to the same system. */
      icon: "border-app grid size-14 place-content-center rounded-xl border-border bg-muted text-muted-foreground tall:size-16 [&_svg:not([class*='size-'])]:size-7 tall:[&_svg:not([class*='size-'])]:size-8",
      /** For an error rather than an absence — see ErrorState. */
      destructive:
        "border-app grid size-14 place-content-center rounded-xl border-destructive/35 bg-destructive/10 text-destructive tall:size-16 [&_svg:not([class*='size-'])]:size-7 tall:[&_svg:not([class*='size-'])]:size-8",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

function EmptyMedia({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<"div"> & VariantProps<typeof emptyMediaVariants>) {
  return <div data-slot="empty-icon" data-variant={variant} className={cn(emptyMediaVariants({ variant, className }))} {...props} />;
}

function EmptyTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-title"
      className={cn("text-xl font-bold tracking-tight text-foreground tall:text-2xl", className)}
      {...props}
    />
  );
}

function EmptyDescription({ className, ...props }: React.ComponentProps<"p">) {
  return (
    <div
      data-slot="empty-description"
      className={cn(
        "text-base/relaxed text-muted-foreground tall:text-lg [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-primary",
        className,
      )}
      {...props}
    />
  );
}

function EmptyContent({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="empty-content"
      className={cn("flex w-full max-w-md min-w-0 flex-col items-center gap-4 text-balance", className)}
      {...props}
    />
  );
}

export { Empty, EmptyHeader, EmptyTitle, EmptyDescription, EmptyContent, EmptyMedia };
