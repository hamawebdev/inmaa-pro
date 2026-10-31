import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { PAYMENTS_PATH } from "@/features/money/services/paths";
import { getReceiptSheetQuery, recordReceiptPrintedAction } from "@/features/money/services/payments";
import { CashReceiptSheet } from "@/features/money/sheets/cash-receipt-sheet";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * A cash receipt on its A4 sheet: two copies to cut apart, the client's and
 * the centre's, from the stored receipt and its payment. A receipt no payment
 * points at yet prints blank, for the collector it was handed to; a voided one
 * says so across both copies.
 *
 * Closest academy screen: the payout receipt of an employee
 * (employees/[id]/payments, `payout-receipt.tsx`), printed from a dialog and
 * without a number. Here the receipt is numbered, carries its stamp duty and
 * the amount in words, and is a page of its own. Printing is recorded first.
 */
export default function ReceiptPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("MoneyPrint");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const { data } = useQuery({
    queryKey: [...pathKey(PAYMENTS_PATH), "receipt", id],
    queryFn: () => getReceiptSheetQuery({ receiptId: id }),
  });

  async function record() {
    // On the laptop without the books the sheet is a copy, and is recorded as one (no event on the legal chain).
    const result = await recordReceiptPrintedAction({ receiptId: id, asCopy: data?.receipt.copy ?? false });
    if (!result.success) toast.error(errorMessage(result.error, t("PrintNotRecorded")));
    return result.success;
  }

  return (
    <DetailScreen
      section="money"
      title={data ? t("ReceiptTitle", { number: data.receipt.number }) : tNav("Payments")}
      back={{ href: "/dashboard/payments", label: tNav("Payments") }}
      actions={data ? <PrintButton onPrint={record} /> : undefined}
    >
      {data ? <CashReceiptSheet receipt={data.receipt} /> : <ScreenSkeleton />}
    </DetailScreen>
  );
}
