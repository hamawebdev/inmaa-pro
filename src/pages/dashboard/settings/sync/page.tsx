import * as React from "react";

import { RefreshCw } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { syncApi, useMayAskForBooks, useSyncStatus } from "@/features/sync/api";
import { useCan } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";

import { ConflictsCard } from "./_components/conflicts-card";
import { DevicesCard } from "./_components/devices-card";
import { ExchangeCard } from "./_components/exchange-card";
import { SetUpCard } from "./_components/set-up-card";

/**
 * Settings › المزامنة: the centre's two laptops (docs/sync/DECISION.md).
 *
 * Closest academy screen: the academy settings page's backup card
 * (academy-system-desktop: src/pages/dashboard/settings/_components/backup-card.tsx),
 * the one card there about where the data lives and how it is kept safe. Its
 * cards in the same order of thought:
 *
 *  1. Not set up: the manager's set-up form (the mailbox address and the setup
 *     key the developer gave).
 *  2. Set up: the exchange (one chip, every problem in its own words with what
 *     to do, the figures); the two laptops and the books, with «إضافة الحاسوب
 *     الثاني», «طلب الدفاتر» and «إزالة حاسوب»; then «تعارضات المزامنة».
 *
 * «زامن الآن» is the screen's one button in the header. What changes sync is
 * the manager's (`sync.manage`, nobody else's by default); asking for the books
 * is for whoever writes invoices or payments; anybody who opens Settings sees
 * where the exchange stands.
 */
export default function SettingsSyncPage() {
  const t = useTranslations("Sync");
  const tNav = useTranslations("Nav");
  const errorMessage = useErrorMessage();
  const manages = useCan("sync.manage");
  const mayAskBooks = useMayAskForBooks();
  const status = useSyncStatus();
  const [searchParams, setSearchParams] = useSearchParams();
  const [syncing, setSyncing] = React.useState(false);

  // Ctrl+K «إضافة الحاسوب الثاني» arrives with ?add=1.
  const addOpen = searchParams.get("add") === "1";
  const setAddOpen = (open: boolean) =>
    setSearchParams(
      (params) => {
        if (open) params.set("add", "1");
        else params.delete("add");
        return params;
      },
      { replace: true },
    );

  async function syncNow() {
    setSyncing(true);
    try {
      const result = await syncApi.syncNow();
      if (result.success) toast.success(t("SyncNowStarted"));
      else toast.error(errorMessage(result.error, t("SyncNowFailed")));
    } finally {
      setSyncing(false);
    }
  }

  const on = status.data?.state === "ON";

  return (
    <SectionScreen
      section="settings"
      title={tNav("SettingsSync")}
      description={t("Description")}
      className="max-w-5xl"
      actions={
        on &&
        status.data?.exchange !== "REVOKED" && (
          <Button variant="outline" onClick={() => void syncNow()} loading={syncing}>
            <RefreshCw />
            {t("SyncNow")}
          </Button>
        )
      }
    >
      {status.isError ? (
        <ErrorState onRetry={() => void status.refetch()} />
      ) : !status.data ? (
        <div className="flex flex-col gap-6">
          <Skeleton className="h-48 w-full rounded-xl" />
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : !on ? (
        manages ? (
          <SetUpCard onDone={() => void status.refetch()} />
        ) : (
          <p className="text-lg text-muted-foreground">{t("NotSetUp")}</p>
        )
      ) : (
        <div className="flex flex-col gap-6 tall:gap-7">
          <ExchangeCard status={status.data} />
          <DevicesCard
            status={status.data}
            manages={manages}
            mayAskBooks={mayAskBooks}
            addOpen={addOpen}
            onAddOpenChange={setAddOpen}
          />
          {manages ? (
            <ConflictsCard />
          ) : (
            status.data.heldCount + status.data.conflictCount > 0 && (
              <p className="text-base text-muted-foreground">{t("ManagerOnly")}</p>
            )
          )}
        </div>
      )}
    </SectionScreen>
  );
}
