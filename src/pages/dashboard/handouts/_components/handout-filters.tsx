import { useTranslations } from "use-intl";

import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { DIVISIONS, SERVICE_TYPES, STOCK_KINDS } from "@/features/stock/validators/option-codes";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";
import { cn } from "@/lib/utils";
import { SECTION_ACCENT } from "@/navigation/sections";

import { ALL, useHandoutFilter } from "./use-handout-filter";

/**
 * «التسليم» as his handwritten page draws it: two sides, «المعدات · المواد»
 * (the inventory's switch), and under each «نوع الخدمة» «عند الطلب · عقد», then
 * the four divisions, all four under either service type (scope A1, N3), «الكل»
 * first. Kept in the address: `?kind=`, `?service=`, `?division=`. A hand-out
 * with no job is a worker's own kit and shows only under «الكل».
 */
export function HandoutFilters() {
  const t = useTranslations("Handouts");
  const kindLabel = useCodeLabel("StockCodes.Kinds");
  const serviceLabel = useCodeLabel("Options.ServiceType");
  const divisionLabel = useCodeLabel("Options.Division");
  const params = useSearchParams();
  const router = useRouter();
  const filter = useHandoutFilter();
  const accent = SECTION_ACCENT.stock;

  function set(name: string, value: string, fallback: string) {
    const next = new URLSearchParams(params);
    if (value === fallback) next.delete(name);
    else next.set(name, value);
    router.replace(`?${next.toString()}`);
  }

  const pills = (
    name: string,
    value: string,
    options: readonly string[],
    labelOf: (code: string) => string,
    fallback: string,
    ariaLabel: string,
    large = false,
  ) => (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={2}
      value={value}
      // Radix reports "" when the pressed pill was already on: the choice stays.
      onValueChange={(next) => {
        if (next) set(name, next, fallback);
      }}
      aria-label={ariaLabel}
      className="max-w-full min-w-0 flex-wrap"
    >
      {options.map((code) => (
        <ToggleGroupItem
          key={code}
          value={code}
          className={cn(
            "min-w-0 font-semibold data-[state=on]:font-bold",
            large ? "px-5 tall:px-7" : "px-4",
            accent.segment,
          )}
        >
          <span className="min-w-0 truncate">{labelOf(code)}</span>
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );

  return (
    <div className="space-y-3">
      {pills("kind", filter.kind, STOCK_KINDS, kindLabel, STOCK_KINDS[0], t("KindSwitch"), true)}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
        {pills(
          "service",
          filter.serviceType ?? ALL,
          [ALL, ...SERVICE_TYPES],
          (code) => (code === ALL ? t("All") : serviceLabel(code)),
          ALL,
          t("ServiceSwitch"),
        )}
        {pills(
          "division",
          filter.division ?? ALL,
          [ALL, ...DIVISIONS],
          (code) => (code === ALL ? t("All") : divisionLabel(code)),
          ALL,
          t("DivisionSwitch"),
        )}
      </div>
    </div>
  );
}
