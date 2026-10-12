import { useTranslations } from "use-intl";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";
import { SECTION_ACCENT } from "@/navigation/sections";

/**
 * One choice among a few, as the boxes of his sheet: one click lights it, a
 * second click on the lit one clears it, because a box may be left blank on
 * paper and the office types what the paper says.
 *
 * It is the control `ScreenTabs` draws (separated pills, the lit one in the
 * section's hue), so a choice on a form looks like a choice everywhere else.
 */
export function ChoiceToggle<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
  invalid = false,
  className,
}: {
  value: T | null;
  onChange: (value: T | null) => void;
  options: readonly { value: T; label: string }[];
  ariaLabel: string;
  invalid?: boolean;
  className?: string;
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={2}
      value={value ?? ""}
      onValueChange={(next) => onChange(next === "" ? null : (next as T))}
      aria-label={ariaLabel}
      aria-invalid={invalid || undefined}
      className={cn("max-w-full min-w-0 flex-wrap", className)}
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className={cn("min-w-0 px-4 font-semibold data-[state=on]:font-bold", SECTION_ACCENT.requests.segment)}
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** «نعم» / «لا», in the order of his sheet for this question; neither lit means neither box was ticked. */
export function YesNoToggle({
  value,
  onChange,
  ariaLabel,
  noFirst = false,
}: {
  value: boolean | null;
  onChange: (value: boolean | null) => void;
  ariaLabel: string;
  /** His card asks «هل توجد مشكلة في الموقع؟ ☐ لا ☐ نعم»: «لا» first. */
  noFirst?: boolean;
}) {
  const t = useTranslations("VisitEntry");
  const yes = { value: "yes" as const, label: t("Yes") };
  const no = { value: "no" as const, label: t("No") };
  return (
    <ChoiceToggle
      value={value === null ? null : value ? "yes" : "no"}
      onChange={(next) => onChange(next === null ? null : next === "yes")}
      options={noFirst ? [no, yes] : [yes, no]}
      ariaLabel={ariaLabel}
    />
  );
}
