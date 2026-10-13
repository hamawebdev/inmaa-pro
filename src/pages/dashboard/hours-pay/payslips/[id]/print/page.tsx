import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { getPayslipQuery, recordPayslipPrintAction } from "@/features/people/services/pay-runs";
import { PayslipSheet } from "@/features/people/sheets/payslip";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * A payslip as it prints: «كشف الراتب», on the centre's letterhead. Section
 * «عمال النظافة», below the tab «الساعات والأجور». Owner: People.
 *
 * Handing a payslip over is a disclosure of personal data: the print is
 * written in the log before the print dialog opens, and a print that could
 * not be recorded does not happen.
 *
 * Closest academy screen: the ID card page (a print button above the thing
 * that prints), with Foundation's print sheet.
 */
export default function PayslipPrintPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Pay");
  const errorMessage = useErrorMessage();
  const { data: slip, isError } = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "payslip", id],
    queryFn: () => getPayslipQuery({ payslipId: id }),
  });
  const back = { href: `/dashboard/hours-pay/payslips/${id}`, label: t("Slips.BackToSlip") };

  if (!slip) {
    return (
      <DetailScreen section="workers" title={t("Slips.Title")} back={back}>
        <p className="text-base text-muted-foreground">{t(isError ? "Slips.Missing" : "Loading")}</p>
      </DetailScreen>
    );
  }

  return (
    <DetailScreen
      section="workers"
      title={`${t("Slips.Title")} · ${slip.staffName}`}
      back={back}
      actions={
        <PrintButton
          onPrint={async () => {
            const result = await recordPayslipPrintAction({ payslipId: slip.id });
            if (!result.success) toast.error(errorMessage(result.error, t("Entry.Failed")));
            return result.success;
          }}
        />
      }
    >
      <div className="space-y-5">
        {slip.run.status !== "CLOSED" && (
          <p className="text-base font-semibold text-warning-ink">{t("Slips.DraftPrint")}</p>
        )}
        <PayslipSheet slip={slip} />
      </div>
    </DetailScreen>
  );
}
