import * as React from "react"
import { Dialog as DialogPrimitive } from "radix-ui"
import { useTranslations } from "use-intl"

import { cn } from "@/lib/utils"
import { handleScrollKeyDown } from "@/lib/scroll-keyboard-nav"
import { Button } from "@/components/ui/button"
import { XIcon } from "lucide-react"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      // Heavier than the 10% this replaces. The dialog is the brightest surface
      // in the app and has to out-rank the card it opened from; a 10% scrim over
      // a warm near-white canvas left the page behind it competing for
      // attention.
      className={cn(
        "fixed inset-0 isolate z-50 bg-black/45 duration-150 supports-backdrop-filter:backdrop-blur-sm data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const t = useTranslations("Common")
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        // `max-h` + its own scroller is not optional here. The shell pins the
        // document shut, so a dialog taller than the window has nowhere to
        // overflow to and would simply have its footer — the Save button —
        // clipped off the bottom of the screen. Several forms in this app
        // (group, expense, observation) are comfortably that tall on a 640px
        // window. `handleScrollKeyDown` gives the keys back inside it, for the
        // same WebKitGTK reason the shell needs it.
        className={cn(
          "border-app fixed top-1/2 left-1/2 z-50 flex max-h-[calc(100dvh-3rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-5 overflow-y-auto rounded-xl border-border-strong bg-popover p-5 text-popover-foreground shadow-xl duration-150 outline-none sm:max-w-lg tall:gap-6 tall:p-7 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        onKeyDown={handleScrollKeyDown}
        {...props}
      >
        {children}
        {showCloseButton && (
          <DialogPrimitive.Close data-slot="dialog-close" asChild>
            {/* `end-4`, not `right-4`: the close button belongs on the trailing
                edge, which is the left one in Arabic. */}
            <Button
              variant="ghost"
              className="absolute end-4 top-4"
              size="icon-sm"
            >
              <XIcon
              />
              <span className="sr-only">{t("Close")}</span>
            </Button>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      // `pe-12` reserves the corner the close button is pinned into, so a long
      // Arabic title cannot run underneath it.
      className={cn("flex min-w-0 shrink-0 flex-col gap-2 pe-12", className)}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  const t = useTranslations("Common")
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex shrink-0 flex-col-reverse gap-3 border-t-2 border-border pt-5 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">{t("Close")}</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("min-w-0 text-xl leading-tight font-bold tracking-tight text-balance short:text-2xl tall:text-3xl", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn(
        "min-w-0 text-base leading-relaxed text-muted-foreground tall:text-lg *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
        className
      )}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
