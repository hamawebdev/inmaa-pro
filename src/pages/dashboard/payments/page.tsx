import { useState } from "react";

import { FileStack, Plus } from "lucide-react";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { centreToday } from "@/features/money/components/centre-today";
import { RecordPaymentDialog } from "@/features/money/components/record-payment-dialog";
import { useCan } from "@/hooks/use-session";
import { useRouter, useSearchParams } from "@/lib/compat/navigation";
import { cn } from "@/lib/utils";
import { SECTION_ACCENT } from "@/navigation/sections";

import { DuesView } from "./_components/dues-view";
import { PaymentsView } from "./_components/payments-view";
import { ReceiptBatchDialog } from "./_components/receipt-batch-dialog";

const VIEWS = ["payments", "dues"] as const;
type View = (typeof VIEWS)[number];

/**
 * Section «المصاريف والمداخيل», tab «التسديد والديون»: the payments received
 * over a period, and what is still owed, file by file.
 *
 * Closest academy screens: finance analytics (`/dashboard/finance`) for the
 * period, the figures and the payments list, and the outstanding-debt list
 * (`/dashboard/academy/outstanding-debt`, payment-status-table.tsx) for the
 * debts. The switch between the two is the groups list's (outline pills in the
 * section's hue), kept in the address: the payment alerts on the home screen
 * open `?view=dues&state=OVERDUE` or `DUE_SOON`. `?new=1` opens the payment
 * dialog: the Ctrl+K "record a payment" entry lands here.
 */
export default function PaymentsPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Payments");
  const today = centreToday();
  const params = useSearchParams();
  const router = useRouter();
  const view: View = params.get("view") === "dues" ? "dues" : "payments";
  const records = useCan("payment.record");
  const askedNew = params.get("new") === "1";
  const [recording, setRecording] = useState(false);
  const [forFile, setForFile] = useState<string | undefined>(undefined);
  const [blanks, setBlanks] = useState(false);

  function setView(next: View) {
    const rest = new URLSearchParams(params);
    if (next === "payments") rest.delete("view");
    else rest.set("view", next);
    rest.delete("state");
    router.replace(`?${rest.toString()}`);
  }

  function changeRecording(next: boolean) {
    setRecording(next);
    if (!next) setForFile(undefined);
    if (!next && askedNew) {
      const rest = new URLSearchParams(params);
      rest.delete("new");
      router.replace(`?${rest.toString()}`);
    }
  }

  return (
    <SectionScreen
      section="money"
      title={tNav("MoneyHeading")}
      actions={
        records ? (
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => setBlanks(true)}>
              <FileStack />
              {t("BlankReceipts")}
            </Button>
            <Button variant="add" onClick={() => setRecording(true)}>
              <Plus />
              {t("Record")}
            </Button>
          </div>
        ) : undefined
      }
    >
      <div className="space-y-6 tall:space-y-8">
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={2}
          value={view}
          // Radix reports "" when the pressed pill was already on: the view stays.
          onValueChange={(next) => {
            if (next) setView(next as View);
          }}
          aria-label={t("ViewSwitch")}
          className="max-w-full min-w-0 flex-wrap"
        >
          {VIEWS.map((code) => (
            <ToggleGroupItem
              key={code}
              value={code}
              className={cn(
                "min-w-0 px-5 font-semibold data-[state=on]:font-bold tall:px-7",
                SECTION_ACCENT.money.segment,
              )}
            >
              <span className="min-w-0 truncate">{t(`Views.${code}`)}</span>
            </ToggleGroupItem>
          ))}
        </ToggleGroup>

        {view === "payments" ? (
          <PaymentsView today={today} />
        ) : (
          <DuesView
            onRecord={
              records
                ? (fileId) => {
                    setForFile(fileId);
                    setRecording(true);
                  }
                : undefined
            }
          />
        )}
      </div>

      {records && (
        <RecordPaymentDialog open={recording || askedNew} onOpenChange={changeRecording} today={today} fileId={forFile} />
      )}
      {records && <ReceiptBatchDialog open={blanks} onOpenChange={setBlanks} />}
    </SectionScreen>
  );
}
