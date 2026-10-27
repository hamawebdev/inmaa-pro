import * as React from "react";

import { useTranslations } from "use-intl";

import { DateRangeField, type DateRangeValue } from "@/components/pickers";
import { Button } from "@/components/ui/button";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";

import type { IsoDate } from "../rules/dates";
import { presetPeriod, writePeriod, type Period } from "../rules/period";
import { PERIOD_PRESETS, type PeriodPreset } from "../validators/period";

import { useDateText } from "./use-money-text";

/**
 * The period of a money screen: today, the last seven days, the month so far,
 * or a range of one's own.
 *
 * The academy's finance date filter (finance/_components/finance-date-filter.tsx),
 * with one change: the period is read from the address by `readPeriod`, so a
 * named preset always counts from today. A range of one's own is the program's
 * period picker: the address changes only when its «تأكيد» is pressed.
 */
export function PeriodFilter({ period, today }: { period: Period; today: IsoDate }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const t = useTranslations("MoneyPeriod");
  const dates = useDateText();
  const [showCustom, setShowCustom] = React.useState(false);

  function go(next: Period) {
    router.push(`?${writePeriod(searchParams, next)}`);
  }

  function choose(preset: PeriodPreset) {
    if (preset === "custom") {
      setShowCustom(true);
      return;
    }
    setShowCustom(false);
    go(presetPeriod(preset, today));
  }

  function chooseRange(range: DateRangeValue) {
    if (range.from && range.to) go({ from: range.from, to: range.to, preset: "custom" });
  }

  const customOpen = showCustom || period.preset === "custom";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label={t("Label")} className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
        {PERIOD_PRESETS.map((preset) => {
          const active = preset === "custom" ? customOpen : !customOpen && period.preset === preset;
          return (
            <Button
              key={preset}
              variant={active ? "default" : "ghost"}
              size="sm"
              className="h-7 px-3 text-xs"
              aria-pressed={active}
              onClick={() => choose(preset)}
            >
              {t(`Presets.${preset}`)}
            </Button>
          );
        })}
      </div>
      {customOpen && (
        <DateRangeField
          id="money-period-range"
          value={{ from: period.from, to: period.to }}
          onChange={chooseRange}
          placeholder={t("ChooseDates")}
        />
      )}
      <span className="text-xs text-muted-foreground">
        {dates.long(period.from)} – {dates.long(period.to)}
      </span>
    </div>
  );
}
