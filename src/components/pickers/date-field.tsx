import * as React from "react";

import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useDateText } from "@/hooks/use-date-text";
import { dateFnsLocaleFor, intlLocaleFor, isLocale, type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

import { dateFromIso, formatTypedDate, isoFromDate, limitOf, monthOf, parseTypedDate, yearPage } from "./logic";
import { PickerPanel, PickerRoot, PickerTrigger } from "./picker-shell";
import { usePickerDraft } from "./picker-state";

export interface DateFieldProps {
  /** `YYYY-MM-DD`, or "" for none. */
  value: string;
  /** Called only from «تأكيد», with `YYYY-MM-DD` or "" (after «مسح»); never when nothing changed. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  ref?: React.Ref<HTMLButtonElement>;
  id?: string;
  name?: string;
  /** The earliest and latest day that may be chosen, `YYYY-MM-DD`. */
  min?: string;
  max?: string;
  disabled?: boolean;
  /** Offers «مسح», which empties the field once confirmed. */
  clearable?: boolean;
  placeholder?: string;
  size?: "sm" | "default";
  className?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
  "aria-describedby"?: string;
}

type View = "days" | "months" | "years";

const asLocale = (locale: string): Locale => (isLocale(locale) ? locale : "ar");

/**
 * A calendar date, the program's own picker (no browser date field anywhere: the developer, 2026-10-22).
 *
 * The field shows the date as screens write it («12 أكتوبر 2026»). Its panel takes the date typed as he
 * writes it on paper («12/10/2026», «121026»), or picked on the calendar (weeks start on Saturday), with a
 * month view and a year view for a birth date. Typing a digit on the field opens the panel with it typed.
 * Nothing changes until «تأكيد» (or Enter in the typed box).
 */
export function DateField({
  value,
  onChange,
  onBlur,
  ref,
  id,
  name,
  min,
  max,
  disabled,
  clearable = false,
  placeholder,
  size,
  className,
  ...aria
}: DateFieldProps) {
  const t = useTranslations("Pickers");
  const locale = asLocale(useLocale());
  const dates = useDateText();
  const { today } = useCentreClock();
  const { open, setOpen, draft, setDraft } = usePickerDraft(value);
  const [typed, setTyped] = React.useState("");
  const [view, setView] = React.useState<View>("days");
  const [month, setMonth] = React.useState<Date>(() => monthOf(value || today) ?? new Date());
  const typedRef = React.useRef<HTMLInputElement>(null);
  const typedId = React.useId();

  const typedIso = parseTypedDate(typed);
  const typedProblem =
    typed.trim() === "" ? null : !typedIso ? "invalid" : limitOf(typedIso, min, max) ? "range" : null;
  // A half-typed date is not called wrong until it has as many digits as a whole one.
  const showProblem = typedProblem === "range" || (typedProblem === "invalid" && typed.replace(/\D/g, "").length >= 6);

  function openPanel(next: boolean, firstDigit?: string) {
    if (next) {
      setTyped(firstDigit ?? formatTypedDate(value));
      setView("days");
      setMonth(monthOf(value || today) ?? new Date());
    }
    setOpen(next);
  }

  function pick(iso: string) {
    setDraft(iso);
    setTyped(formatTypedDate(iso));
    const first = monthOf(iso);
    if (first) setMonth(first);
  }

  function onType(text: string) {
    setTyped(text);
    const iso = parseTypedDate(text);
    if (iso && !limitOf(iso, min, max)) {
      setDraft(iso);
      const first = monthOf(iso);
      if (first) setMonth(first);
    }
  }

  function confirm() {
    if (typedProblem) return;
    if (draft !== value) onChange(draft);
    setOpen(false);
  }

  const monthName = (index: number, style: "long" | "short") =>
    new Intl.DateTimeFormat(intlLocaleFor(locale), { month: style, timeZone: "UTC" }).format(
      new Date(Date.UTC(2026, index, 15)),
    );
  const year = month.getFullYear();
  const years = yearPage(year);
  const caption =
    view === "days"
      ? `${monthName(month.getMonth(), "long")} ${year}`
      : view === "months"
        ? String(year)
        : `${years[0]} – ${years[11]}`;

  function step(direction: -1 | 1) {
    if (view === "days") setMonth(new Date(year, month.getMonth() + direction, 1));
    else if (view === "months") setMonth(new Date(year + direction, month.getMonth(), 1));
    else setMonth(new Date(year + 12 * direction, month.getMonth(), 1));
  }

  const minDate = min ? dateFromIso(min) : undefined;
  const maxDate = max ? dateFromIso(max) : undefined;
  const todayAllowed = !limitOf(today, min, max);

  return (
    <PickerRoot open={open} onOpenChange={(next) => openPanel(next)}>
      <PickerTrigger
        ref={ref}
        id={id}
        name={name}
        size={size}
        disabled={disabled}
        empty={!value}
        className={cn("w-full", className)}
        onBlur={onBlur}
        icon={<CalendarDays className="size-4 text-muted-foreground" />}
        onKeyDown={(event) => {
          if (/^[0-9٠-٩]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
            event.preventDefault();
            openPanel(true, event.key);
          } else if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            openPanel(true);
          }
        }}
        {...aria}
      >
        {value ? dates.long(value) : (placeholder ?? t("ChooseDate"))}
      </PickerTrigger>
      <PickerPanel
        whole
        label={aria["aria-label"] ?? t("ChooseDate")}
        initialFocus={typedRef}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        confirmDisabled={typedProblem !== null}
        className="w-auto"
        extra={
          <>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={!todayAllowed}
              onClick={() => {
                pick(today);
                setView("days");
              }}
            >
              {t("Today")}
            </Button>
            {clearable && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDraft("");
                  setTyped("");
                }}
              >
                {t("Clear")}
              </Button>
            )}
          </>
        }
      >
        <div className="flex w-[18.5rem] flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={typedId} className="text-sm font-bold text-muted-foreground">
              {t("TypeDate")}
            </label>
            <Input
              ref={typedRef}
              id={typedId}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              placeholder="__/__/____"
              value={typed}
              aria-invalid={showProblem || undefined}
              onChange={(event) => onType(event.target.value)}
              className="h-11 text-center tabular-nums tall:h-11 short:h-11"
            />
            {showProblem && (
              <p className="text-sm text-destructive">
                {typedProblem === "range" ? t("OutOfRange") : t("InvalidDate")}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={view === "years" ? t("PreviousYears") : t("PreviousMonth")}
              onClick={() => step(-1)}
            >
              <ChevronLeft className="rtl:rotate-180" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="min-w-0 flex-1 text-base"
              disabled={view === "years"}
              aria-label={view === "days" ? t("ChooseMonth") : t("ChooseYear")}
              onClick={() => setView(view === "days" ? "months" : "years")}
            >
              {caption}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={view === "years" ? t("NextYears") : t("NextMonth")}
              onClick={() => step(1)}
            >
              <ChevronRight className="rtl:rotate-180" />
            </Button>
          </div>

          {view === "days" && (
            <Calendar
              mode="single"
              required
              month={month}
              onMonthChange={setMonth}
              hideNavigation
              selected={dateFromIso(draft)}
              onSelect={(date: Date) => pick(isoFromDate(date))}
              today={dateFromIso(today)}
              locale={dateFnsLocaleFor(locale)}
              disabled={[...(minDate ? [{ before: minDate }] : []), ...(maxDate ? [{ after: maxDate }] : [])]}
              className="w-full p-0 [--cell-size:--spacing(10)]"
              classNames={{ month_caption: "hidden", root: "w-full" }}
            />
          )}

          {view === "months" && (
            <div className="grid grid-cols-3 gap-2">
              {Array.from({ length: 12 }, (_, index) => (
                <Button
                  key={index}
                  type="button"
                  variant={index === month.getMonth() ? "default" : "ghost"}
                  size="sm"
                  className="px-2 font-normal"
                  onClick={() => {
                    setMonth(new Date(year, index, 1));
                    setView("days");
                  }}
                >
                  {monthName(index, "short")}
                </Button>
              ))}
            </div>
          )}

          {view === "years" && (
            <div className="grid grid-cols-3 gap-2">
              {years.map((candidate) => (
                <Button
                  key={candidate}
                  type="button"
                  variant={candidate === year ? "default" : "ghost"}
                  size="sm"
                  className="px-2 font-normal tabular-nums"
                  onClick={() => {
                    setMonth(new Date(candidate, month.getMonth(), 1));
                    setView("months");
                  }}
                >
                  {candidate}
                </Button>
              ))}
            </div>
          )}
        </div>
      </PickerPanel>
    </PickerRoot>
  );
}
