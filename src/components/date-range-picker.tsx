import * as React from "react";

import { subDays } from "date-fns";
import type { DateRange, Locale } from "react-day-picker";
import { useLocale, useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { dateFnsLocaleFor } from "@/i18n/config";

interface DateRangePickerProps {
  value?: DateRange;
  onChange?: (value: DateRange | undefined) => void;
  locale?: Locale;
  placeholder?: string;
}

export function DateRangePicker({ value, onChange, locale, placeholder }: DateRangePickerProps) {
  const t = useTranslations("DateRangePicker");
  // Without a `locale` prop, follow the app's language rather than the system's.
  const appLocale = useLocale();
  const calendarLocale = locale ?? dateFnsLocaleFor(appLocale);
  const [open, setOpen] = React.useState(false);
  const [internalDateRange, setInternalDateRange] = React.useState<DateRange | undefined>(() => {
    const to = new Date();
    const from = subDays(to, 29);
    return { from, to };
  });
  const dateRange = value ?? internalDateRange;

  const handleDateChange = (nextValue: DateRange | undefined) => {
    if (!value) {
      setInternalDateRange(nextValue);
    }
    onChange?.(nextValue);
  };

  const formatDate = (date: Date) =>
    new Intl.DateTimeFormat(calendarLocale.code, {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(date);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" id="date" className="font-normal">
          {dateRange?.from
            ? dateRange.to
              ? `${formatDate(dateRange.from)} - ${formatDate(dateRange.to)}`
              : formatDate(dateRange.from)
            : (placeholder ?? t("SelectDate"))}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="end">
        <Calendar
          mode="range"
          locale={calendarLocale}
          defaultMonth={dateRange?.from}
          selected={dateRange}
          onSelect={handleDateChange}
          numberOfMonths={2}
        />
      </PopoverContent>
    </Popover>
  );
}
