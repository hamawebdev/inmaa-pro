import * as React from "react";

import { Clock } from "lucide-react";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

import { HOURS, isTime, MINUTES, parseTypedTime } from "./logic";
import { PickerPanel, PickerRoot, PickerTrigger } from "./picker-shell";
import { usePickerDraft } from "./picker-state";

export interface TimeFieldProps {
  /** `HH:MM` (24 hours), or "" for none. */
  value: string;
  /** Called only from «تأكيد», with `HH:MM` or "" (after «مسح»); never when nothing changed. */
  onChange: (value: string) => void;
  onBlur?: () => void;
  ref?: React.Ref<HTMLButtonElement>;
  id?: string;
  name?: string;
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

/**
 * A clock time, the program's own picker (no browser time field anywhere: the developer, 2026-10-22).
 *
 * The panel takes the time typed («7:05», «0705», «17h30») or picked: an hour, then minutes by five. A minute
 * typed exactly is kept. Nothing changes until «تأكيد» (or Enter in the typed box).
 */
export function TimeField({
  value,
  onChange,
  onBlur,
  ref,
  id,
  name,
  disabled,
  clearable = false,
  placeholder,
  size,
  className,
  ...aria
}: TimeFieldProps) {
  const t = useTranslations("Pickers");
  const { open, setOpen, draft, setDraft } = usePickerDraft(value);
  const [typed, setTyped] = React.useState("");
  const typedRef = React.useRef<HTMLInputElement>(null);
  const typedId = React.useId();

  const typedTime = parseTypedTime(typed);
  const typedProblem = typed.trim() !== "" && !typedTime;
  const showProblem = typedProblem && typed.replace(/\D/g, "").length >= 3;
  const [hour, minute] = isTime(draft) ? draft.split(":") : ["", ""];

  function openPanel(next: boolean, firstDigit?: string) {
    if (next) setTyped(firstDigit ?? value);
    setOpen(next);
  }

  function set(next: string) {
    setDraft(next);
    setTyped(next);
  }

  function confirm() {
    if (typedProblem) return;
    if (draft !== value) onChange(draft);
    setOpen(false);
  }

  const cell = "h-10 min-w-0 px-0 font-normal tabular-nums tall:h-10";

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
        icon={<Clock className="size-4 text-muted-foreground" />}
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
        {value ? <Ltr>{value}</Ltr> : (placeholder ?? t("ChooseTime"))}
      </PickerTrigger>
      <PickerPanel
        whole
        label={aria["aria-label"] ?? t("ChooseTime")}
        initialFocus={typedRef}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        confirmDisabled={typedProblem}
        className="w-auto"
        extra={
          clearable && (
            <Button type="button" variant="ghost" size="sm" onClick={() => set("")}>
              {t("Clear")}
            </Button>
          )
        }
      >
        <div className="flex w-[18.5rem] flex-col gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor={typedId} className="text-sm font-bold text-muted-foreground">
              {t("TypeTime")}
            </label>
            <Input
              ref={typedRef}
              id={typedId}
              dir="ltr"
              inputMode="numeric"
              autoComplete="off"
              placeholder="__:__"
              value={typed}
              aria-invalid={showProblem || undefined}
              onChange={(event) => {
                setTyped(event.target.value);
                const parsed = parseTypedTime(event.target.value);
                if (parsed) setDraft(parsed);
              }}
              className="h-11 text-center tabular-nums tall:h-11 short:h-11"
            />
            {showProblem && <p className="text-sm text-destructive">{t("InvalidTime")}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-muted-foreground">{t("Hours")}</span>
            <div dir="ltr" className="grid grid-cols-6 gap-1">
              {HOURS.map((candidate) => (
                <Button
                  key={candidate}
                  type="button"
                  variant={candidate === hour ? "default" : "ghost"}
                  size="sm"
                  className={cell}
                  aria-pressed={candidate === hour}
                  onClick={() => set(`${candidate}:${minute || "00"}`)}
                >
                  {candidate}
                </Button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-bold text-muted-foreground">{t("Minutes")}</span>
            <div dir="ltr" className="grid grid-cols-6 gap-1">
              {MINUTES.map((candidate) => (
                <Button
                  key={candidate}
                  type="button"
                  variant={candidate === minute ? "default" : "ghost"}
                  size="sm"
                  className={cell}
                  aria-pressed={candidate === minute}
                  disabled={!hour}
                  onClick={() => set(`${hour}:${candidate}`)}
                >
                  {candidate}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </PickerPanel>
    </PickerRoot>
  );
}
