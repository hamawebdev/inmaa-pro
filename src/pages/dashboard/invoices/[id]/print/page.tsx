import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { getInvoiceSheetQuery, recordInvoicePrintedAction } from "@/features/money/services/invoices";
import { INVOICES_PATH } from "@/features/money/services/paths";
import { InvoiceSheet } from "@/features/money/sheets/invoice-sheet";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The invoice on its A4 sheet, with the visit statement of a contract invoice
 * on the page after it, as it was issued: every word and figure from the
 * stored rows (services/invoices.ts, `getInvoiceSheet`).
 *
 * Closest academy screen: the receipt of a student's payment
 * (groups/[groupId]/students/[studentId]/payments, `payment-receipt.tsx` with
 * `print-receipt-button.tsx`). There the receipt is a card in a dialog and the
 * live page is printed; here the sheet is a page of its own below the invoice,
 * as the print sample is (settings/print-sample).
 *
 * Printing is recorded first (a `PRINTED` event on the invoice's chain and the
 * disclosure the law asks for); a print that cannot be recorded does not
 * happen.
 */
export default function InvoicePrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("MoneyPrint");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const { data } = useQuery({
    queryKey: [...pathKey(INVOICES_PATH), "sheet", id],
    queryFn: () => getInvoiceSheetQuery({ invoiceId: id }),
  });

  async function record() {
    const result = await recordInvoicePrintedAction({ invoiceId: id });
    if (!result.success) toast.error(errorMessage(result.error, t("PrintNotRecorded")));
    return result.success;
  }

  return (
    <DetailScreen
      section="money"
      title={data ? t("InvoiceTitle", { number: data.invoice.number }) : tNav("Invoices")}
      back={{ href: "/dashboard/invoices", label: tNav("Invoices") }}
      actions={data ? <PrintButton onPrint={record} /> : undefined}
    >
      {data ? <InvoiceSheet invoice={data.invoice} statement={data.statement} /> : <ScreenSkeleton />}
    </DetailScreen>
  );
}
