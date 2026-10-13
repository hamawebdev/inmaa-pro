import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { listInventoryQuery } from "@/features/stock/services/items";
import { INVENTORY_PATH, PURCHASES_PATH } from "@/features/stock/services/paths";
import { listSuppliersQuery } from "@/features/stock/services/purchases";
import { pathKey } from "@/lib/compat/revalidate";

import { PurchaseForm } from "./_components/purchase-form";

/**
 * «شراء جديد»: what was bought, from which supplier and at what price. Saving
 * puts every line in the store, numbers each machine followed piece by piece,
 * and writes the purchase's total into the expenses.
 *
 * Closest academy screen: the new-employee page (`/dashboard/employees/new`):
 * a detail screen with a form in cards and one save button at its foot.
 */
export default function NewPurchasePage() {
  const t = useTranslations("PurchaseForm");
  const tNav = useTranslations("Nav");
  const { data: suppliers } = useQuery({
    queryKey: [...pathKey(PURCHASES_PATH), "suppliers"],
    queryFn: () => listSuppliersQuery(undefined),
  });
  const { data: items } = useQuery({
    queryKey: pathKey(INVENTORY_PATH),
    queryFn: () => listInventoryQuery(undefined),
  });

  return (
    <DetailScreen
      section="stock"
      title={t("Title")}
      description={t("Description")}
      back={{ href: "/dashboard/purchases", label: tNav("Purchases") }}
    >
      {suppliers && items ? <PurchaseForm suppliers={suppliers} items={items} /> : <ScreenSkeleton />}
    </DetailScreen>
  );
}
