import { useQuery } from "@tanstack/react-query";
import { FilePlus2 } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { centreToday } from "@/features/money/components/centre-today";
import { PeriodFilter } from "@/features/money/components/period-filter";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { readPeriod } from "@/features/money/rules/period";
import { listInvoicesQuery } from "@/features/money/services/invoices";
import { INVOICES_PATH } from "@/features/money/services/paths";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { pathKey } from "@/lib/compat/revalidate";
import { useSearchParams } from "@/lib/compat/navigation";
import { localDate } from "@/lib/units";

import { InvoicesView } from "./_components/invoices-view";

/**
 * Section «المصاريف والمداخيل», tab «الفواتير»: the invoices issued over a
 * period, what each has received, and the way in to issuing the next.
 *
 * Closest academy screens: finance analytics (`/dashboard/finance`) for the
 * period and the figures above the list, and the outstanding-debt list
 * (academy/_components/payment-status-table.tsx) for a table of amounts with
 * their payment state. The list is the newer generation's table.
 *
 * Issuing is the accountant's (`invoice.issue`), voiding the manager's
 * (`invoice.void`): a reader sees neither button.
 */
export default function InvoicesPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Invoices");
  const today = centreToday();
  const period = readPeriod(useSearchParams(), today);
  const level = useSectionLevel("MONEY");
  const issues = useCan("invoice.issue");
  const mayIssue = level === "WRITE" && issues;

  const { data: invoices } = useQuery({
    queryKey: [...pathKey(INVOICES_PATH), period.from, period.to],
    queryFn: () => listInvoicesQuery({ from: localDate(period.from), to: localDate(period.to) }),
  });

  return (
    <SectionScreen
      section="money"
      title={tNav("Invoices")}
      actions={
        mayIssue ? (
          <Button asChild variant="add">
            <Link to="/dashboard/invoices/new">
              <FilePlus2 />
              {t("Issue")}
            </Link>
          </Button>
        ) : undefined
      }
    >
      <div className="space-y-6 tall:space-y-8">
        <PeriodFilter period={period} today={today} />
        {invoices ? <InvoicesView invoices={invoices} /> : <ScreenSkeleton />}
      </div>
    </SectionScreen>
  );
}
