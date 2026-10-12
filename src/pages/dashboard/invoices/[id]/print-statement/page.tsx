import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { getInvoiceSheetQuery, recordInvoicePrintedAction } from "@/features/money/services/invoices";
import { INVOICES_PATH } from "@/features/money/services/paths";
import { VisitStatementSheet } from "@/features/money/sheets/visit-statement-sheet";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The visit statement of a contract invoice, on its own: what a building's
 * representative or a public client asks for each month. It is the invoice's
 * own statement, from the stored visit rows; printing it is recorded as a
 * print of the invoice.
 *
 * Closest academy screen: none prints a list on paper; the page follows the
 * print sample (settings/print-sample), below the invoice it belongs to.
 */
export default function InvoiceStatementPrintPage() {
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

  const number = data?.invoice.number ?? "";
  return (
    <DetailScreen
      section="money"
      title={data ? t("StatementTitle", { number }) : tNav("Invoices")}
      back={{ href: `/dashboard/invoices/${id}/print`, label: t("InvoiceTitle", { number }) }}
      actions={data?.statement ? <PrintButton onPrint={record} /> : undefined}
    >
      {!data ? (
        <ScreenSkeleton />
      ) : data.statement ? (
        <VisitStatementSheet data={data.statement} />
      ) : (
        <p className="text-lg text-muted-foreground">{t("NoStatement")}</p>
      )}
    </DetailScreen>
  );
}
