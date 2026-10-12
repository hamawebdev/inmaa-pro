import { Loader2Icon } from "lucide-react";
import { useTranslations } from "use-intl";

import { cn } from "@/lib/utils";

/**
 * `size-[1.15em]` rather than a fixed `size-4`, so a spinner that has replaced a
 * button's leading icon is exactly the size of the icon it replaced — which is
 * what stops the button's contents shifting when work starts. See
 * `withStatusIcon` in button.tsx.
 */
function Spinner({ className, ...props }: React.ComponentProps<"svg">) {
  const t = useTranslations("Common");
  return (
    <Loader2Icon role="status" aria-label={t("Loading")} className={cn("size-[1.15em] animate-spin", className)} {...props} />
  );
}

export { Spinner };
