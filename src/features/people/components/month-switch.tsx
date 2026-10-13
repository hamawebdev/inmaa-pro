import * as React from "react";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { shiftMonth } from "@/features/people/components/format";
import { usePeopleDates } from "@/features/people/components/people-dates";

/**
 * Previous month, the month in words, next month, and a way back to this
 * month when away from it.
 *
 * Closest academy component: the week switch of its check history
 * (staff-check-history.tsx).
 */
export function MonthSwitch({
  month,
  thisMonth,
  onChange,
  children,
}: {
  month: string;
  thisMonth: string;
  onChange: (month: string) => void;
  /** Buttons that belong beside the switch. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("PeopleDialogs");
  const dates = usePeopleDates();
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={() => onChange(shiftMonth(month, -1))}>
          {/* "Previous" points left in English and right in Arabic. */}
          <ChevronLeft className="rtl:rotate-180" />
          {t("PreviousMonth")}
        </Button>
        <span className="min-w-44 text-center text-base font-bold">{dates.month(month)}</span>
        <Button variant="outline" size="sm" onClick={() => onChange(shiftMonth(month, 1))}>
          {t("NextMonth")}
          <ChevronRight className="rtl:rotate-180" />
        </Button>
      </div>
      {month !== thisMonth && (
        <Button variant="outline" size="sm" onClick={() => onChange(thisMonth)}>
          {t("ThisMonth")}
        </Button>
      )}
      {children && <div className="ms-auto flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}
