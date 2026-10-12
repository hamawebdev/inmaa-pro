import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { CashReceiptSheet } from "@/features/money/sheets/cash-receipt-sheet";
import { sampleReceipt } from "@/features/money/sheets/samples";

/**
 * A cash receipt on its A4 sheet: two copies to cut apart, the client's and
 * the centre's.
 *
 * Closest academy screen: the payout receipt of an employee
 * (employees/[id]/payments, `payout-receipt.tsx`), printed from a dialog and
 * without a number. Here the receipt is numbered, carries its stamp duty and
 * the amount in words, and is a page of its own.
 *
 * Until payments can be recorded, `:id` picks a sample: `sample` (made out at
 * the office), `sample-blank` (a numbered blank for an authorised collector),
 * `sample-site` (taken at the client's by an authorised employee), `sample-void`.
 */
export default function ReceiptPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("MoneyPrint");
  const tNav = useTranslations("Nav");
  const receipt = sampleReceipt(id);

  return (
    <DetailScreen
      section="money"
      title={t("ReceiptTitle", { number: receipt.number })}
      description={t("SampleNote")}
      back={{ href: "/dashboard/payments", label: tNav("Payments") }}
      actions={<PrintButton />}
    >
      <CashReceiptSheet receipt={receipt} />
    </DetailScreen>
  );
}
