import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { PAYMENTS_PATH } from "@/features/money/services/paths";
import { getReceiptBatchQuery, recordReceiptBatchPrintedAction } from "@/features/money/services/payments";
import { CashReceiptBatchSheet } from "@/features/money/sheets/cash-receipt-sheet";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * A block of numbered blank receipts, one A4 page each, for the collector they
 * were handed to (feature 32). A receipt of the block that a payment was since
 * typed in against prints filled in; one declared void says so.
 *
 * Closest academy screen: none; the page follows the single receipt's.
 */
export default function ReceiptBatchPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("MoneyPrint");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const { data } = useQuery({
    queryKey: [...pathKey(PAYMENTS_PATH), "batch", id],
    queryFn: () => getReceiptBatchQuery({ batchId: id }),
  });

  async function record() {
    // On the laptop without the books the sheets are copies, and are recorded as such.
    const result = await recordReceiptBatchPrintedAction({
      batchId: id,
      asCopy: data?.receipts[0]?.receipt.copy ?? false,
    });
    if (!result.success) toast.error(errorMessage(result.error, t("PrintNotRecorded")));
    return result.success;
  }

  return (
    <DetailScreen
      section="money"
      title={data ? t("BatchTitle", { first: data.firstNumber, last: data.lastNumber }) : tNav("Payments")}
      back={{ href: "/dashboard/payments", label: tNav("Payments") }}
      actions={data ? <PrintButton onPrint={record} /> : undefined}
    >
      {data ? <CashReceiptBatchSheet receipts={data.receipts.map((sheet) => sheet.receipt)} /> : <ScreenSkeleton />}
    </DetailScreen>
  );
}
