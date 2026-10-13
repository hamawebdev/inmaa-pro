import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { formatDays, formatMinutes } from "@/features/people/components/format";
import { usePeopleDates } from "@/features/people/components/people-dates";
import { formatMoney } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * The figures of the hours and pay screens, each kept left to right so that
 * Arabic never turns «7:30» or «1.500,00 دج» around.
 */

/** Minutes as hours and minutes: «7:30». */
export function Duration({ minutes, className }: { minutes: number; className?: string }) {
  return <Ltr className={cn("whitespace-nowrap tabular-nums", className)}>{formatMinutes(minutes)}</Ltr>;
}

/**
 * Centimes as the program writes an amount: «195.650,00 دج». The digits are
 * kept left to right, so that a minus sign stays in front of them; the
 * currency word follows them as the language reads, to their left in Arabic.
 */
export function Amount({ value, className }: { value: number; className?: string }) {
  const t = useTranslations("Common");
  return (
    <span className={cn("whitespace-nowrap tabular-nums", className)}>
      <Ltr>{formatMoney(value)}</Ltr> {t("Currency")}
    </span>
  );
}

/** A date in digits: «12/10/2026». */
export function DayDate({ date, className }: { date: string; className?: string }) {
  const dates = usePeopleDates();
  return <Ltr className={cn("whitespace-nowrap tabular-nums", className)}>{dates.short(date)}</Ltr>;
}

/** Thousandths of a day as days: «2,5». */
export function Days({ thousandths, className }: { thousandths: number; className?: string }) {
  return <Ltr className={cn("whitespace-nowrap tabular-nums", className)}>{formatDays(thousandths)}</Ltr>;
}

/** Nothing to show in a cell. */
export function Nothing() {
  return <span className="text-muted-foreground">—</span>;
}
