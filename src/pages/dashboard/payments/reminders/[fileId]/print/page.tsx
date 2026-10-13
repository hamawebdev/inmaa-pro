import { useQuery } from "@tanstack/react-query";
import { useParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { getPaymentReminderQuery, recordReminderPrintedAction } from "@/features/money/services/debts";
import { PAYMENTS_PATH } from "@/features/money/services/paths";
import { PaymentReminderSheet } from "@/features/money/sheets/payment-reminder-sheet";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The payment reminder for one file, as a letter to sign and stamp, written
 * from what the file owes today (services/debts.ts).
 *
 * Closest academy screen: the list of students with outstanding debt
 * (academy/_components/payment-status-table.tsx), which has no letter. The
 * program sends nothing, so the reminder is printed from here; a letter that
 * states a debt to a named person is a disclosure, recorded before it prints.
 */
export default function ReminderPrintPage() {
  const { fileId = "" } = useParams();
  const t = useTranslations("MoneyPrint");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const { data, error } = useQuery({
    queryKey: [...pathKey(PAYMENTS_PATH), "reminder", fileId],
    queryFn: () => getPaymentReminderQuery({ fileId }),
    retry: false,
  });

  async function record() {
    const result = await recordReminderPrintedAction({ fileId });
    if (!result.success) toast.error(errorMessage(result.error, t("PrintNotRecorded")));
    return result.success;
  }

  return (
    <DetailScreen
      section="money"
      title={t("ReminderTitle")}
      back={{ href: "/dashboard/payments?view=dues", label: tNav("Payments") }}
      actions={data ? <PrintButton onPrint={record} /> : undefined}
    >
      {data ? (
        <PaymentReminderSheet reminder={data} />
      ) : error ? (
        <p className="text-lg text-muted-foreground">{errorMessage(error.message, t("NoReminder"))}</p>
      ) : (
        <ScreenSkeleton />
      )}
    </DetailScreen>
  );
}
