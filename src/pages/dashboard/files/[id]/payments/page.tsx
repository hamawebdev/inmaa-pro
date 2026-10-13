import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { FilePlus2, Mail, Plus } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { Button } from "@/components/ui/button";
import { centreToday } from "@/features/money/components/centre-today";
import { RecordPaymentDialog } from "@/features/money/components/record-payment-dialog";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { getFileMoneyQuery } from "@/features/money/services/debts";
import { PAYMENTS_PATH } from "@/features/money/services/paths";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { fileHubHref } from "@/navigation/file-parts";

import { FileMoneyView } from "./_components/file-money-view";

/**
 * A file's part «التسديد»: what the file owes and when, its invoices and the
 * payments received, with «حالة الدفع» in his words.
 *
 * Closest academy screen: a student's payments
 * (groups/[groupId]/students/[studentId]/payments): the figures, the ledger
 * and the "record a payment" button of one person. It is a part of the file:
 * a detail page with a back action to the hub and no tab strip. Reception
 * takes payments here (`payment.record`), though the money section is closed
 * to it; the accountant issues the invoice from here.
 */
export default function FilePaymentsPage() {
  const { id = "" } = useParams();
  const tNav = useTranslations("Nav");
  const t = useTranslations("FileMoney");
  const errorMessage = useErrorMessage();
  const today = centreToday();
  const records = useCan("payment.record");
  const issues = useCan("invoice.issue");
  const mayIssue = useSectionLevel("MONEY") === "WRITE" && issues;
  const [recording, setRecording] = useState(false);
  const { data, error } = useQuery({
    queryKey: [...pathKey(PAYMENTS_PATH), "file", id],
    queryFn: () => getFileMoneyQuery({ fileId: id }),
    retry: false,
  });
  const owes = (data?.summary.remaining ?? 0) > 0;

  return (
    <DetailScreen
      section="requests"
      title={tNav("FilePartPayments")}
      description={data ? t("Of", { client: data.clientName, number: data.fileNumber }) : undefined}
      back={{ href: fileHubHref(id), label: tNav("FileHub") }}
      actions={
        data ? (
          <div className="flex flex-wrap items-center gap-2">
            {owes && records && (
              <Button asChild variant="info">
                <Link to={`/dashboard/payments/reminders/${id}/print`}>
                  <Mail />
                  {t("Reminder")}
                </Link>
              </Button>
            )}
            {mayIssue && (
              <Button asChild variant="outline">
                <Link to="/dashboard/invoices/new">
                  <FilePlus2 />
                  {t("Issue")}
                </Link>
              </Button>
            )}
            {owes && records && (
              <Button variant="add" onClick={() => setRecording(true)}>
                <Plus />
                {t("Record")}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {data ? (
        <FileMoneyView money={data} />
      ) : error ? (
        <p className="text-lg text-muted-foreground">{errorMessage(error.message, t("CouldNotLoad"))}</p>
      ) : (
        <ScreenSkeleton />
      )}
      {records && <RecordPaymentDialog open={recording} onOpenChange={setRecording} today={today} fileId={id} />}
    </DetailScreen>
  );
}
