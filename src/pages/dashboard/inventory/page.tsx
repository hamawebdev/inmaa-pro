import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { listInventoryQuery } from "@/features/stock/services/items";
import { INVENTORY_PATH } from "@/features/stock/services/paths";
import { STOCK_KINDS, isStockKind } from "@/features/stock/validators/option-codes";
import { useSectionLevel } from "@/hooks/use-session";
import { pathKey } from "@/lib/compat/revalidate";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";

import { InventoryView } from "./_components/inventory-view";
import { ItemFormDialog } from "./_components/item-form-dialog";

/**
 * Section «إدارة المخزون», tab «جرد المخزون»: what the store holds, read from
 * the stock ledger (services/items.ts).
 *
 * Closest academy screen: the employees list (`/dashboard/employees`): an
 * "add" button in the header, a search and filters above a table, a count over
 * it. The kind switch is the one on the academy's groups list. `?new=1` opens
 * the dialog: the Ctrl+K "new item" entry lands here.
 */
export default function InventoryPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("ItemForm");
  const tCounts = useTranslations("Counts");
  const params = useSearchParams();
  const router = useRouter();
  const mayWrite = useSectionLevel("STOCK") === "WRITE";
  const askedNew = params.get("new") === "1";
  const [adding, setAdding] = useState(false);
  const kindParam = params.get("kind");
  const kind = kindParam !== null && isStockKind(kindParam) ? kindParam : STOCK_KINDS[0];

  const { data: items } = useQuery({
    queryKey: pathKey(INVENTORY_PATH),
    queryFn: () => listInventoryQuery(undefined),
  });

  function changeAdding(next: boolean) {
    setAdding(next);
    if (!next && askedNew) {
      const rest = new URLSearchParams(params);
      rest.delete("new");
      router.replace(`?${rest.toString()}`);
    }
  }

  return (
    <SectionScreen
      section="stock"
      title={tNav("StockHeading")}
      actions={
        mayWrite ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline">
              <Link to="/dashboard/inventory/counts">
                <ClipboardList />
                {tCounts("ListTitle")}
              </Link>
            </Button>
            <ItemFormDialog
              kind={kind}
              open={adding || askedNew}
              onOpenChange={changeAdding}
              trigger={
                <Button variant="add">
                  <Plus />
                  {t("AddItem")}
                </Button>
              }
            />
          </div>
        ) : (
          <Button asChild variant="outline">
            <Link to="/dashboard/inventory/counts">
              <ClipboardList />
              {tCounts("ListTitle")}
            </Link>
          </Button>
        )
      }
    >
      {items ? <InventoryView items={items} canWrite={mayWrite} /> : <ScreenSkeleton />}
    </SectionScreen>
  );
}
