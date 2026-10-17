import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Ban, Plus } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { SectionScreen } from "@/components/section-screen";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDivisionLabel, usePaymentMethodLabel } from "@/features/money/components/labels";
import { ReasonDialog } from "@/features/money/components/reason-dialog";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import { PURCHASES_PATH } from "@/features/stock/services/paths";
import { cancelPurchaseAction, listPurchasesQuery, type PurchaseListRow } from "@/features/stock/services/purchases";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * Section «إدارة المخزون», tab «المشتريات»: what was bought, from whom and for
 * how much. Each purchase put its lines in the store and its total in the
 * expenses (services/purchases.ts).
 *
 * Closest academy screen: the expenses list (`/dashboard/expenses`): an "add"
 * button in the header, then the list. A purchase is typed on a page of its
 * own, by the storekeeper (`stock.manage`); one typed wrong is cancelled with
 * a reason (MON-08) and typed again.
 */
export default function PurchasesPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Purchases");
  const money = useMoneyText();
  const dates = useDateText();
  const divisionLabel = useDivisionLabel();
  const methodLabel = usePaymentMethodLabel();
  const level = useSectionLevel("STOCK");
  const manages = useCan("stock.manage");
  const mayBuy = level === "WRITE" && manages;
  const errorMessage = useErrorMessage();
  const [cancelling, setCancelling] = React.useState<PurchaseListRow | null>(null);
  const [busy, setBusy] = React.useState(false);
  const { data: purchases } = useQuery({
    queryKey: pathKey(PURCHASES_PATH),
    queryFn: () => listPurchasesQuery(undefined),
  });

  async function confirmCancel(reason: string) {
    if (!cancelling) return;
    setBusy(true);
    const result = await cancelPurchaseAction({ purchaseId: cancelling.id, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("CancelFailed")));
      return;
    }
    toast.success(t("CancelDone", { number: cancelling.number }));
    setCancelling(null);
  }

  return (
    <SectionScreen
      section="stock"
      title={tNav("Purchases")}
      actions={
        mayBuy ? (
          <Button asChild variant="add">
            <Link to="/dashboard/purchases/new">
              <Plus />
              {t("New")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      {!purchases ? (
        <ScreenSkeleton />
      ) : (
        <div className="space-y-5">
          <h3 className="text-lg font-bold tall:text-xl">{t("PurchaseCount", { count: purchases.length })}</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Table.Number")}</TableHead>
                <TableHead>{t("Table.Supplier")}</TableHead>
                <TableHead>{t("Table.Division")}</TableHead>
                <TableHead>{t("Table.Lines")}</TableHead>
                <TableHead>{t("Table.Total")}</TableHead>
                {mayBuy && (
                  <TableHead className="w-12">
                    <span className="sr-only">{t("Table.Actions")}</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {purchases.length === 0 ? (
                <TableEmpty colSpan={mayBuy ? 6 : 5}>{t("NoPurchases")}</TableEmpty>
              ) : (
                purchases.map((purchase) => (
                  <TableRow key={purchase.id}>
                    <TableCell>
                      <p className="leading-tight font-bold tabular-nums">
                        <Ltr>{purchase.number}</Ltr>
                      </p>
                      <p className="text-sm leading-tight whitespace-nowrap text-muted-foreground">
                        {dates.long(purchase.date)}
                      </p>
                    </TableCell>
                    <TableCell>
                      <div className="max-w-64 min-w-0">
                        <p className="truncate leading-tight font-bold">{purchase.supplierName}</p>
                        {purchase.supplierInvoiceNo && (
                          <p className="truncate text-sm leading-tight text-muted-foreground">
                            <Ltr>{purchase.supplierInvoiceNo}</Ltr>
                          </p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{divisionLabel(purchase.division)}</TableCell>
                    <TableCell className="tabular-nums">{t("LineCount", { count: purchase.lines })}</TableCell>
                    <TableCell>
                      {purchase.cancelled ? (
                        <StatusChip tone="neutral" label={t("Cancelled")} />
                      ) : (
                        <>
                          <p className="leading-tight font-bold whitespace-nowrap tabular-nums">
                            {money(purchase.total)}
                          </p>
                          <p className="text-sm leading-tight text-muted-foreground">{methodLabel(purchase.method)}</p>
                        </>
                      )}
                    </TableCell>
                    {mayBuy && (
                      <TableCell>
                        {!purchase.cancelled && (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => setCancelling(purchase)}
                            aria-label={t("CancelFor", { number: purchase.number })}
                            title={t("CancelFor", { number: purchase.number })}
                          >
                            <Ban />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      )}
      <ReasonDialog
        open={cancelling !== null}
        title={t("CancelTitle", { number: cancelling?.number ?? "" })}
        description={t("CancelDescription")}
        confirmLabel={t("Cancel")}
        destructive
        busy={busy}
        onConfirm={(reason) => void confirmCancel(reason)}
        onCancel={() => setCancelling(null)}
      />
    </SectionScreen>
  );
}
