import * as React from "react";

import { BookLock, Laptop, MonitorSmartphone, MonitorX } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { syncApi } from "@/features/sync/api";
import { useInstantText } from "@/features/sync/use-instant-text";
import { isolate } from "@/features/sync/view";
import { useErrorMessage } from "@/i18n/errors";
import type { SyncDeviceView, SyncStatus } from "@/lib/sync/services/types";

import { PairDialog } from "./pair-dialog";
import { RemoveDialog } from "./remove-dialog";

/**
 * The two laptops, this one first: which is which, when each was last heard
 * from, and where the books are (DECISION section 5). The manager adds the
 * second laptop here, and removes one that is lost; anybody who may write
 * invoices or payments asks for the books.
 */
export function DevicesCard({
  status,
  manages,
  mayAskBooks,
  addOpen,
  onAddOpenChange,
}: {
  status: SyncStatus;
  manages: boolean;
  mayAskBooks: boolean;
  addOpen: boolean;
  onAddOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("Sync.Devices");
  const instant = useInstantText();
  const errorMessage = useErrorMessage();
  const [confirm, confirmDialog] = useConfirm();
  const [removing, setRemoving] = React.useState<SyncDeviceView | null>(null);
  const [asking, setAsking] = React.useState(false);

  const active = status.devices.filter((device) => device.removedAt === null);
  const other = active.find((device) => !device.isThis) ?? null;
  const books = status.books;
  const thisRevoked = status.exchange === "REVOKED";

  async function askForBooks() {
    if (!books?.holderName) return;
    const ok = await confirm({
      title: t("RequestBooksConfirm", { name: books.holderName }),
      description: t("RequestBooksHint"),
      confirmLabel: t("RequestBooks"),
    });
    if (!ok) return;
    setAsking(true);
    try {
      const result = await syncApi.requestBooks();
      if (result.success) toast.success(t("RequestBooksDone"));
      else toast.error(errorMessage(result.error, t("RequestBooksFailed")));
    } finally {
      setAsking(false);
    }
  }

  return (
    <Card data-sync-devices>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Laptop className="size-5" />
          {t("Title")}
        </CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <ul className="flex min-w-0 flex-col">
          {status.devices.map((device) => {
            const last = device.lastExchangeAt ? instant(device.lastExchangeAt) : null;
            return (
              <li
                key={device.id}
                data-sync-device={device.isThis ? "this" : "other"}
                className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-lg font-bold">{device.name}</span>
                    <StatusChip
                      tone={device.isThis ? "info" : "neutral"}
                      label={device.isThis ? t("This") : t("Other")}
                    />
                    {device.removedAt && (
                      <StatusChip tone="danger" label={t("RemovedOn", { date: instant(device.removedAt).date })} />
                    )}
                    {device.holdsBooks && device.removedAt === null && (
                      <StatusChip tone="success" icon={BookLock} label={t("HoldsBooks")} />
                    )}
                  </div>
                  <p className="text-base text-muted-foreground">
                    {t("LastExchange")}:{" "}
                    {last ? (
                      <>
                        {last.date} <Ltr>{last.time}</Ltr>
                      </>
                    ) : (
                      t("Never")
                    )}
                  </p>
                </div>
                {manages && !device.isThis && device.removedAt === null && (
                  <Button variant="outline" onClick={() => setRemoving(device)}>
                    <MonitorX />
                    {t("Remove")}
                  </Button>
                )}
              </li>
            );
          })}
        </ul>

        {books && (
          <div className="flex min-w-0 flex-col gap-3 rounded-xl border-2 border-border bg-muted/40 p-4">
            <p className="text-base leading-relaxed">
              {books.holderName && books.since
                ? t("BooksOn", { name: books.holderName, date: instant(books.since).date })
                : t("BooksNowhere")}
            </p>
            {books.requestedAt && !books.heldHere && (
              <p className="text-base leading-relaxed text-muted-foreground" data-sync-books-requested>
                {t("Requested", {
                  date: instant(books.requestedAt).date,
                  time: isolate(instant(books.requestedAt).time),
                })}
              </p>
            )}
            {mayAskBooks && !books.heldHere && !books.requestedAt && books.holderName && !thisRevoked && (
              <div className="flex min-w-0 flex-col gap-2">
                <p className="text-sm text-muted-foreground tall:text-base">{t("RequestBooksHint")}</p>
                <Button className="w-fit" variant="outline" onClick={() => void askForBooks()} loading={asking}>
                  <BookLock />
                  {t("RequestBooks")}
                </Button>
              </div>
            )}
          </div>
        )}

        {active.length < 2 && !thisRevoked && (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            <p className="text-base text-muted-foreground">{t("OnlyOne")}</p>
            {manages && (
              <Button variant="add" onClick={() => onAddOpenChange(true)}>
                <MonitorSmartphone />
                {t("Add")}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {manages && <PairDialog open={addOpen && !other} onOpenChange={onAddOpenChange} />}
      {manages && <RemoveDialog device={removing} onClose={() => setRemoving(null)} />}
      {confirmDialog}
    </Card>
  );
}
