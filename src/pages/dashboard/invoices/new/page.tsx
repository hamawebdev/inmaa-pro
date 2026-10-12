import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";

import { IssueInvoice } from "./_components/issue-invoice";

/**
 * «إصدار فاتورة»: the dues that can be invoiced, and the invoice they make.
 *
 * Closest academy screen: recording a student's payment
 * (groups/[groupId]/students/[studentId]/payments): choose what is paid, see
 * the amount, confirm. Here the choice is a due of a file (a month of a
 * contract, a visit, a job), the proposal is the invoice with its lines,
 * totals and visit statement as they will print, and issuing it takes the next
 * number of the legal sequence and cannot be undone, only voided.
 */
export default function NewInvoicePage() {
  const t = useTranslations("IssueInvoice");
  const tNav = useTranslations("Nav");

  return (
    <DetailScreen
      section="money"
      title={t("Title")}
      description={t("Description")}
      back={{ href: "/dashboard/invoices", label: tNav("Invoices") }}
    >
      <IssueInvoice />
    </DetailScreen>
  );
}
