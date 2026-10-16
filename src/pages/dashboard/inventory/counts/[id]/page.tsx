import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { useDateText } from "@/features/money/components/use-money-text";
import { COUNTS_PATH, getCountQuery } from "@/features/stock/services/counts";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

import { CountSheetView } from "./_components/count-sheet";

/**
 * «الجرد»: one count of the store, line by line. Opening it froze what the
 * record said of each item; the storekeeper types what is on the shelf, a
 * word beside every difference, and closing it brings the record to the shelf.
 *
 * Closest academy screen: the attendance sheet of a day
 * (employee-attendance/[date]): one row per person, a value typed on each,
 * saved as it is typed, and the day closed at the foot.
 */
export default function CountPage() {
  const { id = "" } = useParams();
  const t = useTranslations("Counts");
  const tNav = useTranslations("Nav");
  const dates = useDateText();
  const kindLabel = useCodeLabel("StockCodes.Kinds");
  const { data: count } = useQuery({
    queryKey: [...pathKey(COUNTS_PATH), id],
    queryFn: () => getCountQuery({ countId: id }),
  });

  return (
    <DetailScreen
      section="stock"
      title={count ? t("Title", { number: count.number }) : tNav("Inventory")}
      description={count ? t("Of", { kind: kindLabel(count.kind), date: dates.long(count.date) }) : undefined}
      back={{ href: "/dashboard/inventory/counts", label: t("ListTitle") }}
    >
      {count ? <CountSheetView count={count} /> : <ScreenSkeleton />}
    </DetailScreen>
  );
}
