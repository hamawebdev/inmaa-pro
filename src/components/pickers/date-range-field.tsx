import * as React from "react";

import { CalendarRange } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useDateText } from "@/hooks/use-date-text";
import { useIsMobile } from "@/hooks/use-mobile";
import { dateFnsLocaleFor, isLocale } from "@/i18n/config";
import { cn } from "@/lib/utils";

import { dateFromIso, isoFromDate, monthOf, orderedRange } from "./logic";
import { PickerCustomTrigger, PickerPanel, PickerRoot } from "./picker-shell";
import { usePickerDraft } from "./picker-state";

/** A period: two `YYYY-MM-DD` dates, the first not after the second; "" while unset. */
export interface DateRangeValue {
  from: string;
  to: string;
}

export interface DateRangeFieldProps {
  value: DateRangeValue;
  /** Called only from «تأكيد», with the period in order; never when nothing changed. */
  onChange: (value: DateRangeValue) => void;
  id?: string;
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Offers «مسح»: the period is emptied once confirmed (a filter back to "any day"). */
  clearable?: boolean;
  placeholder?: string;
  align?: "start" | "center" | "end";
  className?: string;
  "aria-label"?: string;
}

/**
 * A period, the program's own picker: the first day, then the last, on two months side by side (one on a
 * narrow window). Nothing changes until «تأكيد». The field is the academy's outline button, as its finance
 * filter has it.
 */
export function DateRangeField({
  value,
  onChange,
  id,
  min,
  max,
  disabled,
  clearable = false,
  placeholder,
  align = "end",
  className,
  ...aria
}: DateRangeFieldProps) {
  const t = useTranslations("Pickers");
  const locale = useLocale();
  const dates = useDateText();
  const { today } = useCentreClock();
  const narrow = useIsMobile();
  const { open, setOpen, draft, setDraft } = usePickerDraft(value);
  // Between the first click and the second: the next day clicked ends the period.
  const [picking, setPicking] = React.useState(false);
  const [month, setMonth] = React.useState<Date>(() => monthOf(value.from || today) ?? new Date());

  function openPanel(next: boolean) {
    if (next) {
      setPicking(false);
      setMonth(monthOf(value.from || today) ?? new Date());
    }
    setOpen(next);
  }

  function clickDay(iso: string) {
    if (!picking || !draft.from) {
      setDraft({ from: iso, to: "" });
      setPicking(true);
    } else {
      setDraft(orderedRange(draft.from, iso));
      setPicking(false);
    }
  }

  function confirm() {
    if (!draft.from) {
      if (clearable && value.from) onChange({ from: "", to: "" });
      setOpen(false);
      return;
    }
    const next = orderedRange(draft.from, draft.to);
    if (next.from !== value.from || next.to !== value.to) onChange(next);
    setOpen(false);
  }

  const text = (range: DateRangeValue) =>
    range.from === range.to ? dates.long(range.from) : `${dates.long(range.from)} – ${dates.long(range.to)}`;
  const minDate = min ? dateFromIso(min) : undefined;
  const maxDate = max ? dateFromIso(max) : undefined;
  const shown = orderedRange(draft.from, draft.to);

  return (
    <PickerRoot open={open} onOpenChange={openPanel}>
      <PickerCustomTrigger>
        <Button
          type="button"
          variant="outline"
          id={id}
          disabled={disabled}
          className={cn("font-normal", className)}
          {...aria}
        >
          <CalendarRange />
          {value.from ? text(orderedRange(value.from, value.to)) : (placeholder ?? t("ChooseRange"))}
        </Button>
      </PickerCustomTrigger>
      <PickerPanel
        whole
        label={aria["aria-label"] ?? t("ChooseRange")}
        align={align}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        confirmDisabled={!draft.from && !clearable}
        className="w-auto"
        extra={
          <>
            {clearable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={!draft.from}
                onClick={() => {
                  setDraft({ from: "", to: "" });
                  setPicking(false);
                }}
              >
                {t("Clear")}
              </Button>
            )}
            <span className="text-sm text-muted-foreground">
              {draft.from ? text(shown) : picking ? t("ChooseEnd") : t("ChooseStart")}
            </span>
          </>
        }
      >
        <Calendar
          mode="range"
          numberOfMonths={narrow ? 1 : 2}
          month={month}
          onMonthChange={setMonth}
          selected={draft.from ? { from: dateFromIso(shown.from), to: dateFromIso(shown.to) } : undefined}
          onSelect={(_range, day: Date) => clickDay(isoFromDate(day))}
          today={dateFromIso(today)}
          locale={dateFnsLocaleFor(isLocale(locale) ? locale : "ar")}
          disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
          className="p-0 [--cell-size:--spacing(10)]"
        />
      </PickerPanel>
    </PickerRoot>
  );
}
