import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { PaymentReminderSheet } from "@/features/money/sheets/payment-reminder-sheet";
import { sampleReminder } from "@/features/money/sheets/samples";

/**
 * The payment reminder for one file, as a letter to sign and stamp.
 *
 * Closest academy screen: the list of students with outstanding debt
 * (academy/_components/payment-status-table.tsx), which has no letter. The
 * program sends nothing, so the reminder is printed from here.
 *
 * Until dues exist, every `:fileId` shows the same sample.
 */
export default function ReminderPrintPage() {
  const t = useTranslations("MoneyPrint");
  const tNav = useTranslations("Nav");

  return (
    <DetailScreen
      section="money"
      title={t("ReminderTitle")}
      description={t("SampleNote")}
      back={{ href: "/dashboard/payments", label: tNav("Payments") }}
      actions={<PrintButton />}
    >
      <PaymentReminderSheet reminder={sampleReminder()} />
    </DetailScreen>
  );
}
