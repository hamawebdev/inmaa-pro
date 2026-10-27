import * as React from "react";

import { Popover as PopoverPrimitive } from "radix-ui";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { pickerTriggerClass, usePickerDir } from "./picker-state";

/**
 * The shell every one of the program's own pickers is built on (date, time, period, a choice from a list, a
 * suggested text). No browser or system picker opens anywhere in the program (the developer, 2026-10-22).
 *
 * What the shell guarantees, for every picker alike:
 *
 *  - The field is a native `<button type="button">`: a label's `htmlFor` reaches it, a `<fieldset disabled>`
 *    disables it, and it looks exactly like the text field beside it (`fieldShell`, the same height ramp as
 *    `SelectTrigger` had).
 *  - Its panel holds a draft. Nothing reaches the form until «تأكيد» is pressed (or Enter in a text box of the
 *    panel). «إلغاء», Escape and a click outside drop the draft and leave the value as it was.
 *  - The panel is modal: inside a dialog, a click outside closes the panel only, never the dialog behind it.
 *
 * A picker keeps its own draft and calls `onConfirm`; the shell draws the trigger, the panel and its foot.
 */

interface PickerState {
  /** Keeps the field the panel belongs to: where there is room for the panel is measured from it. */
  registerField: (element: HTMLElement | null) => void;
  fieldOf: () => HTMLElement | null;
}
const PickerContext = React.createContext<PickerState | null>(null);

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as React.RefObject<T | null>).current = value;
}

/** The picker's open state: modal, so that a click outside closes the panel and nothing behind it. */
export function PickerRoot({
  open,
  onOpenChange,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const field = React.useRef<HTMLElement | null>(null);
  const state = React.useMemo<PickerState>(
    () => ({
      registerField: (element) => {
        field.current = element;
      },
      fieldOf: () => field.current,
    }),
    [],
  );
  return (
    <PickerContext value={state}>
      <PopoverPrimitive.Root modal open={open} onOpenChange={onOpenChange}>
        {children}
      </PopoverPrimitive.Root>
    </PickerContext>
  );
}

export interface PickerTriggerProps extends Omit<React.ComponentProps<"button">, "type"> {
  size?: "sm" | "default";
  /** Nothing chosen yet: the text is the muted placeholder. */
  empty?: boolean;
  /** Drawn at the field's end: a chevron, a calendar, a clock. */
  icon?: React.ReactNode;
}

/** The field. Pressing it opens the panel; it never changes the value by itself. */
export function PickerTrigger({
  ref,
  size = "default",
  empty = false,
  icon,
  className,
  children,
  ...props
}: PickerTriggerProps) {
  const state = React.use(PickerContext);
  return (
    <PopoverPrimitive.Trigger asChild>
      <button
        ref={(element) => {
          state?.registerField(element);
          setRef(ref, element);
        }}
        type="button"
        data-size={size}
        data-placeholder={empty ? "" : undefined}
        className={cn(pickerTriggerClass, className)}
        {...props}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2 truncate text-start">{children}</span>
        {icon}
      </button>
    </PopoverPrimitive.Trigger>
  );
}

/** A trigger of the caller's own drawing (a button rather than a field): it opens the panel, nothing else. */
export function PickerCustomTrigger({ children }: { children: React.ReactElement }) {
  const state = React.use(PickerContext);
  return (
    <PopoverPrimitive.Trigger asChild ref={(element) => state?.registerField(element)}>
      {children}
    </PopoverPrimitive.Trigger>
  );
}

type Side = "top" | "bottom" | "left" | "right";
/** Room kept between a panel and the window's edge, as the panel's own collision padding. */
const EDGE = 12;
const GAP = 6;

/**
 * Where a panel that must be seen whole opens: below its field, or above it, where it fits; otherwise beside
 * it, on the side with more room, where the window's whole height is free (a date field in the middle of a
 * dialog, on a small window).
 */
function sideFor(field: HTMLElement, height: number): Side {
  const box = field.getBoundingClientRect();
  const below = window.innerHeight - box.bottom - GAP - EDGE;
  const above = box.top - GAP - EDGE;
  if (below >= height) return "bottom";
  if (above >= height) return "top";
  return box.left >= window.innerWidth - box.right ? "left" : "right";
}

export interface PickerPanelProps {
  children: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
  /** The draft cannot be applied as it stands (a date typed half-way, out of range). */
  confirmDisabled?: boolean;
  /** Buttons at the foot's start: «اليوم», «مسح». */
  extra?: React.ReactNode;
  /** What takes the focus when the panel opens; otherwise the panel itself. */
  initialFocus?: React.RefObject<HTMLElement | null>;
  align?: "start" | "center" | "end";
  /** Names the panel for a screen reader. */
  label?: string;
  /**
   * The panel must be seen whole (a calendar, a clock): where it fits neither below nor above its field, it
   * opens beside it. A list leaves it out: it scrolls in whatever height there is.
   */
  whole?: boolean;
  className?: string;
  bodyClassName?: string;
  onKeyDown?: React.KeyboardEventHandler<HTMLDivElement>;
}

/** The panel: its body, then the foot with «إلغاء» and «تأكيد». */
export function PickerPanel({
  children,
  onConfirm,
  onCancel,
  confirmDisabled = false,
  extra,
  initialFocus,
  align = "start",
  label,
  whole = false,
  className,
  bodyClassName,
  onKeyDown,
}: PickerPanelProps) {
  const t = useTranslations("Pickers");
  const dir = usePickerDir();
  const fieldOf = React.use(PickerContext)?.fieldOf;
  const [side, setSide] = React.useState<Side>("bottom");
  // Measured when the panel is drawn, before it is painted: its whole height against the room around the field.
  const placePanel = React.useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) {
        setSide("bottom");
        return;
      }
      const field = fieldOf?.();
      const [body, foot] = [...element.children];
      if (!whole || !field || !(body instanceof HTMLElement) || !(foot instanceof HTMLElement)) return;
      // The body's whole height, scrolled or not, and the foot: what the panel needs to be seen whole.
      setSide(sideFor(field, body.scrollHeight + foot.offsetHeight + 4));
    },
    [whole, fieldOf],
  );
  const beside = side === "left" || side === "right";
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        ref={placePanel}
        data-slot="popover-content"
        role="dialog"
        aria-label={label}
        dir={dir}
        side={side}
        align={beside ? "center" : align}
        sticky={beside ? "always" : "partial"}
        sideOffset={GAP}
        collisionPadding={EDGE}
        className={cn(
          "border-app z-50 flex max-h-(--radix-popover-content-available-height) min-w-(--radix-popover-trigger-width) flex-col overflow-hidden rounded-xl border-border-strong bg-popover text-popover-foreground shadow-lg outline-hidden",
          "origin-(--radix-popover-content-transform-origin) duration-100 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          className,
        )}
        onOpenAutoFocus={(event) => {
          const target = initialFocus?.current;
          if (!target) return;
          event.preventDefault();
          target.focus();
          if (target instanceof HTMLInputElement) {
            const end = target.value.length;
            target.setSelectionRange(end, end);
          }
        }}
        onKeyDown={(event) => {
          onKeyDown?.(event);
          if (event.defaultPrevented) return;
          // Enter in a text box of the panel presses «تأكيد»; on a button it stays that button's press.
          if (event.key === "Enter" && event.target instanceof HTMLInputElement) {
            event.preventDefault();
            event.stopPropagation();
            if (!confirmDisabled) onConfirm();
          }
        }}
      >
        <div className={cn("min-h-0 flex-1 overflow-y-auto p-3", bodyClassName)}>{children}</div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-3 py-2.5">
          {extra}
          <div className="ms-auto flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={onCancel}>
              {t("Cancel")}
            </Button>
            <Button type="button" variant="success" size="sm" onClick={onConfirm} disabled={confirmDisabled}>
              {t("Confirm")}
            </Button>
          </div>
        </div>
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}
