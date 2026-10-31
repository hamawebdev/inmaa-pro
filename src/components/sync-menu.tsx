import * as React from "react";

import { BookLock, RefreshCw, Settings2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { StatusChip, type StatusTone } from "@/components/status-chip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SYNC_PATH, syncApi, useMayAskForBooks } from "@/features/sync/api";
import { useInstantText } from "@/features/sync/use-instant-text";
import { isolate, type SyncBarState } from "@/features/sync/view";
import { useSession } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { mayOpenSection } from "@/lib/access/session";
import type { SyncStatus } from "@/lib/sync/services/types";

/**
 * What the bar's sync item opens: where the exchange stands, «زامن الآن»,
 * «طلب الدفاتر» for whoever writes invoices or payments, and the way to
 * Settings › المزامنة for whoever may open Settings. A menu rather than a link,
 * like «قفل», because the assistant (who has no Settings by default) must be
 * able to ask for the books from here (DECISION section 10).
 */
export function SyncMenu({
  status,
  state,
  tone,
  children,
}: {
  status: SyncStatus;
  state: SyncBarState;
  tone: StatusTone;
  children: React.ReactNode;
}) {
  const t = useTranslations("Sync");
  const navigate = useNavigate();
  const session = useSession();
  const instant = useInstantText();
  const errorMessage = useErrorMessage();
  const mayAskBooks = useMayAskForBooks();
  const settingsOpen = session !== null && mayOpenSection(session, "settings");
  const last = status.lastExchangeAt ? instant(status.lastExchangeAt) : null;
  const books = status.books;
  const revoked = status.exchange === "REVOKED";

  async function syncNow() {
    const result = await syncApi.syncNow();
    if (result.success) toast.success(t("SyncNowStarted"));
    else toast.error(errorMessage(result.error, t("SyncNowFailed")));
  }

  async function askForBooks() {
    const result = await syncApi.requestBooks();
    if (result.success) toast.success(t("Devices.RequestBooksDone"));
    else toast.error(errorMessage(result.error, t("Devices.RequestBooksFailed")));
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-80" data-sync-menu>
        <DropdownMenuLabel className="flex flex-col items-start gap-2">
          <StatusChip tone={tone} label={t(`Bar.${state}`)} />
          {status.problem && state === "ATTENTION" && (
            <span className="text-sm font-bold">{t(`ProblemTitles.${status.problem}`)}</span>
          )}
          <span className="text-sm font-normal text-muted-foreground">
            {last ? t("Bar.Last", { date: last.date, time: isolate(last.time) }) : t("Bar.Never")}
          </span>
          <span className="text-sm font-normal text-muted-foreground">
            {t("Bar.Waiting", { count: status.waitingCount })}
          </span>
          {books?.holderName && (
            <span className="text-sm font-normal text-muted-foreground">
              {books.heldHere
                ? t("Devices.HoldsBooks")
                : t("Devices.BooksOn", { name: books.holderName, date: books.since ? instant(books.since).date : "—" })}
            </span>
          )}
          {books?.requestedAt && !books.heldHere && (
            <span className="text-sm leading-relaxed font-normal text-muted-foreground">
              {t("Devices.Requested", {
                date: instant(books.requestedAt).date,
                time: isolate(instant(books.requestedAt).time),
              })}
            </span>
          )}
        </DropdownMenuLabel>
        {!revoked && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => void syncNow()}>
              <RefreshCw />
              {t("SyncNow")}
            </DropdownMenuItem>
          </>
        )}
        {mayAskBooks && books && !books.heldHere && !books.requestedAt && !revoked && (
          <DropdownMenuItem onSelect={() => void askForBooks()}>
            <BookLock />
            {t("Devices.RequestBooks")}
          </DropdownMenuItem>
        )}
        {settingsOpen && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate(SYNC_PATH)}>
              <Settings2 />
              {t("Open")}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
