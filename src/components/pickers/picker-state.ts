import * as React from "react";

import { useLocale } from "use-intl";

import { fieldShell } from "@/components/ui/input";
import { directionFor, isLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

/** What the pickers share besides their components (./picker-shell.tsx): the field's look, the direction, the draft. */

/** The reading direction of the interface, for a panel drawn in `<body>`. */
export function usePickerDir(): "ltr" | "rtl" {
  const locale = useLocale();
  return isLocale(locale) ? directionFor(locale) : "rtl";
}

/** The field as a select trigger draws it, shared by every picker. */
export const pickerTriggerClass = cn(
  fieldShell,
  "flex items-center justify-between gap-2 ps-4 pe-3 text-start text-base whitespace-nowrap tall:ps-5",
  "data-[size=default]:h-[52px] data-[size=default]:short:h-[56px] data-[size=default]:tall:h-[60px]",
  "data-[size=sm]:h-[46px] data-[size=sm]:tall:h-[50px]",
  "data-placeholder:text-muted-foreground",
  "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-[1.15em]",
);

/**
 * The draft a picker edits while its panel is open: taken from the value each time the panel opens, dropped
 * when it closes without «تأكيد».
 */
export function usePickerDraft<T>(value: T) {
  const [open, setOpenState] = React.useState(false);
  const [draft, setDraft] = React.useState<T>(value);
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (next) setDraft(value);
      setOpenState(next);
    },
    [value],
  );
  return { open, setOpen, draft, setDraft };
}
