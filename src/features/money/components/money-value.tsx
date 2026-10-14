import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { formatMoney } from "@/lib/units";
import { cn } from "@/lib/utils";

/**
 * An amount on a card or a strip: never cut. The figure keeps its digits
 * together and, in a narrow card, the currency goes to its own line, as the
 * academy's finance cards let a long value wrap. Inside a `StatCard` the
 * figure is set a step smaller than a count (`compact`), so that six and seven
 * figures fit a third of a 1024-pixel window. A loss keeps its minus sign,
 * left of the digits in Arabic too, and wears the danger tone.
 */
export function MoneyValue({ amount, compact = false }: { amount: number; compact?: boolean }) {
  const t = useTranslations("Common");
  return (
    <span
      className={cn(
        "inline-block max-w-full whitespace-normal",
        compact && "text-2xl leading-tight tall:text-4xl short:text-3xl",
        amount < 0 && "text-destructive",
      )}
    >
      <span className="whitespace-nowrap">
        <Ltr>{formatMoney(amount)}</Ltr>
      </span>{" "}
      <span className="whitespace-nowrap">{t("Currency")}</span>
    </span>
  );
}
