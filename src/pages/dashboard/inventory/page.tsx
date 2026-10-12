import { useMemo } from "react";

import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { SampleNotice } from "@/features/money/components/sample-notice";
import { sampleInventory } from "@/features/stock/samples/inventory";

import { InventoryView } from "./_components/inventory-view";

/**
 * Section «المخزون», tab «جرد المخزون».
 *
 * Closest academy screen: the employees list (`/dashboard/employees`): a
 * search and filters above a table, a count over it. The kind switch is the
 * one on the academy's groups list. Until the services that read the stock
 * exist, the list is drawn from sample items and says so.
 */
export default function InventoryPage() {
  const tNav = useTranslations("Nav");
  const tCommon = useTranslations("MoneyCommon");
  const items = useMemo(() => sampleInventory(), []);

  return (
    <SectionScreen section="stock" title={tNav("StockHeading")}>
      <div className="space-y-6">
        <SampleNotice title={tCommon("SampleTitle")} description={tCommon("SampleDescription")} />
        <InventoryView items={items} />
      </div>
    </SectionScreen>
  );
}
