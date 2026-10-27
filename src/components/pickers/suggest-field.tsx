import * as React from "react";

import { CheckIcon, ChevronDownIcon, PenLine, SearchIcon } from "lucide-react";
import { useTranslations } from "use-intl";

import { Input } from "@/components/ui/input";
import { normaliseName } from "@/lib/text/normalise";
import { cn } from "@/lib/utils";

import { PickerPanel, PickerRoot, PickerTrigger } from "./picker-shell";
import { usePickerDraft } from "./picker-state";

export interface Suggestion {
  /** The text that is stored when this suggestion is chosen. */
  value: string;
  /** What the list shows, when not the value itself (a commune with its French name beside it). */
  label?: React.ReactNode;
  /** More words the search box matches (the French name of a commune). */
  keywords?: string;
}

export interface SuggestFieldProps {
  /** The text as stored; "" for none. */
  value: string;
  /** Called only from «تأكيد», with the suggestion chosen or the text typed; never when nothing changed. */
  onChange: (value: string) => void;
  suggestions: readonly Suggestion[];
  onBlur?: () => void;
  ref?: React.Ref<HTMLButtonElement>;
  id?: string;
  name?: string;
  disabled?: boolean;
  placeholder?: string;
  size?: "sm" | "default";
  className?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-label"?: string;
  "aria-describedby"?: string;
}

/**
 * A text the office types, with the usual answers offered (the communes of a wilaya): the program's own
 * picker in place of a browser's suggestion list. In the panel the search box both filters the suggestions
 * and offers what was typed as it stands («استعمال "…"»). Nothing changes until «تأكيد» (or Enter).
 */
export function SuggestField({
  value,
  onChange,
  suggestions,
  onBlur,
  ref,
  id,
  name,
  disabled,
  placeholder,
  size,
  className,
  ...aria
}: SuggestFieldProps) {
  const t = useTranslations("Pickers");
  const { open, setOpen, draft, setDraft } = usePickerDraft(value);
  const [query, setQuery] = React.useState("");
  // Whether a row was pressed since the panel opened: otherwise «تأكيد» takes what the search box says.
  const [picked, setPicked] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);

  const needle = normaliseName(query);
  const shown = suggestions.filter(
    (suggestion) => !needle || normaliseName(`${suggestion.value} ${suggestion.keywords ?? ""}`).includes(needle),
  );
  const typed = query.trim().replace(/\s+/g, " ");
  const typedIsNew = typed !== "" && !suggestions.some((suggestion) => suggestion.value === typed);

  // The panel opens on the whole list, the current value marked: the search box filters, it does not choose.
  function openPanel(next: boolean) {
    if (next) {
      setQuery("");
      setPicked(false);
    }
    setOpen(next);
  }

  function choose(next: string) {
    setDraft(next);
    setPicked(true);
  }

  /** With no row pressed, what was typed: the suggestion it names, the only one left, or the text itself. */
  function typedChoice(): string {
    if (typed === "") return draft;
    const exact = suggestions.find((suggestion) => normaliseName(suggestion.value) === normaliseName(typed));
    if (exact) return exact.value;
    return shown.length === 1 ? shown[0].value : typed;
  }

  function confirm() {
    const next = picked ? draft : typedChoice();
    if (next !== value) onChange(next);
    setOpen(false);
  }

  const row =
    "relative flex min-h-[44px] w-full cursor-default items-center gap-2 rounded-md py-2 ps-3 pe-9 text-start text-base outline-hidden select-none hover:bg-accent hover:text-accent-foreground data-marked:bg-accent data-marked:text-accent-foreground";
  const tick = (marked: boolean) => (
    <span className="pointer-events-none absolute end-3 flex size-4 items-center justify-center">
      {marked && <CheckIcon className="size-4" />}
    </span>
  );

  return (
    <PickerRoot open={open} onOpenChange={openPanel}>
      <PickerTrigger
        ref={ref}
        id={id}
        name={name}
        size={size}
        disabled={disabled}
        empty={!value}
        className={cn("w-full", className)}
        onBlur={onBlur}
        icon={<ChevronDownIcon className="size-4 text-muted-foreground" />}
        onKeyDown={(event) => {
          if (open) return;
          if (event.key === "ArrowDown") {
            event.preventDefault();
            openPanel(true);
          }
        }}
        {...aria}
      >
        {value || placeholder || ""}
      </PickerTrigger>
      <PickerPanel
        label={aria["aria-label"]}
        initialFocus={searchRef}
        onConfirm={confirm}
        onCancel={() => setOpen(false)}
        bodyClassName="max-h-[min(24rem,var(--radix-popover-content-available-height))] p-1.5"
      >
        <div className="sticky top-0 z-10 bg-popover p-1.5 pb-2">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              ref={searchRef}
              value={query}
              autoComplete="off"
              aria-label={t("Search")}
              placeholder={t("Search")}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 ps-9 tall:h-11 short:h-11"
            />
          </div>
        </div>
        <div role="listbox" className="flex flex-col">
          {typedIsNew && (
            <button
              type="button"
              role="option"
              aria-selected={draft === typed}
              data-marked={draft === typed || undefined}
              className={row}
              onClick={() => choose(typed)}
            >
              <PenLine className="size-4 text-muted-foreground" />
              {t("UseTyped", { text: typed })}
              {tick(draft === typed)}
            </button>
          )}
          {shown.map((suggestion) => (
            <button
              key={suggestion.value}
              type="button"
              role="option"
              aria-selected={draft === suggestion.value}
              data-marked={draft === suggestion.value || undefined}
              className={row}
              onClick={() => choose(suggestion.value)}
            >
              {suggestion.label ?? suggestion.value}
              {tick(draft === suggestion.value)}
            </button>
          ))}
          {shown.length === 0 && !typedIsNew && (
            <p className="px-3 py-4 text-center text-sm text-muted-foreground">{t("NoMatch")}</p>
          )}
        </div>
      </PickerPanel>
    </PickerRoot>
  );
}
