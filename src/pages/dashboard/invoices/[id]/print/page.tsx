import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { InvoiceSheet } from "@/features/money/sheets/invoice-sheet";
import { sampleInvoice, sampleStatement } from "@/features/money/sheets/samples";

/**
 * The invoice on its A4 sheet, with the visit statement of a contract invoice
 * on the page after it.
 *
 * Closest academy screen: the receipt of a student's payment
 * (groups/[groupId]/students/[studentId]/payments, `payment-receipt.tsx` with
 * `print-receipt-button.tsx`). There the receipt is a card in a dialog and the
 * live page is printed; here the sheet is a page of its own below the invoice,
 * as the print sample is (settings/print-sample).
 *
 * Until invoices can be issued, `:id` picks a sample: `sample-ifu`,
 * `sample-vat`, `sample-vat-cash`, `sample-home`, `sample-void`.
 */
export default function InvoicePrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("MoneyPrint");
  const tNav = useTranslations("Nav");
  const invoice = sampleInvoice(id);

  return (
    <DetailScreen
      section="money"
      title={t("InvoiceTitle", { number: invoice.number })}
      description={t("SampleNote")}
      back={{ href: "/dashboard/invoices", label: tNav("Invoices") }}
      actions={<PrintButton />}
    >
      <InvoiceSheet invoice={invoice} statement={sampleStatement(id)} />
    </DetailScreen>
  );
}
