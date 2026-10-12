import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { sampleInvoice, sampleStatement } from "@/features/money/sheets/samples";
import { VisitStatementSheet } from "@/features/money/sheets/visit-statement-sheet";

/**
 * The visit statement of a contract invoice, on its own: what a building's
 * representative or a public client asks for each month.
 *
 * Closest academy screen: none prints a list on paper; the page follows the
 * print sample (settings/print-sample), below the invoice it belongs to.
 *
 * Until invoices can be issued, `:id` picks a sample, as on the invoice's page.
 */
export default function InvoiceStatementPrintPage() {
  const { id = "" } = useParams();
  const t = useTranslations("MoneyPrint");
  const invoice = sampleInvoice(id);
  const statement = sampleStatement(id);

  return (
    <DetailScreen
      section="money"
      title={t("StatementTitle", { number: invoice.number })}
      description={t("SampleNote")}
      back={{ href: `/dashboard/invoices/${id}/print`, label: t("InvoiceTitle", { number: invoice.number }) }}
      actions={statement ? <PrintButton /> : undefined}
    >
      {statement ? (
        <VisitStatementSheet data={statement} />
      ) : (
        <p className="text-lg text-muted-foreground">{t("NoStatement")}</p>
      )}
    </DetailScreen>
  );
}
