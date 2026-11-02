import * as React from "react";

import { BookLock, BookUp, Laptop, MonitorSmartphone, MonitorX, Smartphone } from "lucide-react";
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
import { useDevice } from "@/lib/device";
import type { SyncDeviceView, SyncStatus } from "@/lib/sync/services/types";

import { PairDialog } from "./pair-dialog";
import { RemoveDialog } from "./remove-dialog";

/**
 * The centre's devices, this one first: the two laptops and the director's
 * phone at most (docs/phone/DECISION.md section 2), which is which, when each
 * was last heard from, and where the books are (DECISION section 5). The
 * manager adds the second laptop and the phone here, from a laptop, and
 * removes a device that is lost; anybody who may write invoices or payments
 * asks for the books.
 */
export function DevicesCard({
  status,
  manages,
  mayAskBooks,
  adding,
  onAddingChange,
}: {
  status: SyncStatus;
  manages: boolean;
  mayAskBooks: boolean;
  /** Which pairing dialog is open, if any. */
  adding: "LAPTOP" | "PHONE" | null;
  onAddingChange: (adding: "LAPTOP" | "PHONE" | null) => void;
}) {
  const t = useTranslations("Sync.Devices");
  const instant = useInstantText();
  const errorMessage = useErrorMessage();
  const [confirm, confirmDialog] = useConfirm();
  const [removing, setRemoving] = React.useState<SyncDeviceView | null>(null);
  const [takingBack, setTakingBack] = React.useState(false);
  const [asking, setAsking] = React.useState(false);

  const { isPhone } = useDevice();
  const active = status.devices.filter((device) => device.removedAt === null);
  const laptops = active.filter((device) => device.kind === "LAPTOP").length;
  const hasPhone = active.some((device) => device.kind === "PHONE");
  const books = status.books;
  const thisRevoked = status.exchange === "REVOKED";
  // A device is added from a laptop: a phone cannot pair another (the engine refuses it too).
  const mayAdd = manages && !thisRevoked && !isPhone && status.thisDevice?.kind !== "PHONE";
  const addLaptop = mayAdd && laptops < 2;
  const addPhone = mayAdd && !hasPhone;
  const thisIsPhone = status.thisDevice?.kind === "PHONE";
  // A device is removed from a laptop: the mailbox refuses a removal from the phone (the engine refuses it too).
  const mayRemove = manages && !isPhone && !thisIsPhone;

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
          <MonitorSmartphone className="size-5" />
          {t("Title")}
        </CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-5">
        <ul className="flex min-w-0 flex-col">
          {status.devices.map((device) => {
            const last = device.lastExchangeAt ? instant(device.lastExchangeAt) : null;
            const seen = !device.isThis && device.lastSeenAt ? instant(device.lastSeenAt) : null;
            const KindIcon = device.kind === "PHONE" ? Smartphone : Laptop;
            return (
              <li
                key={device.id}
                data-sync-device={device.isThis ? "this" : "other"}
                data-sync-device-kind={device.kind}
                className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 py-3 last:border-b-0"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="truncate text-lg font-bold">{device.name}</span>
                    <StatusChip
                      tone="neutral"
                      icon={KindIcon}
                      label={device.kind === "PHONE" ? t("Phone") : t("Laptop")}
                    />
                    {device.isThis && <StatusChip tone="info" label={t("This")} />}
                    {device.removedAt && (
                      <StatusChip tone="danger" label={t("RemovedOn", { date: instant(device.removedAt).date })} />
                    )}
                    {device.holdsBooks && device.removedAt === null && (
                      <StatusChip
                        tone="success"
                        icon={BookLock}
                        label={device.isThis ? t("HoldsBooks") : t("HoldsBooksThere")}
                      />
                    )}
                    {/* The books handed to a device as it was being removed elsewhere: taken back here (case 9). */}
                    {device.holdsBooks && device.removedAt !== null && (
                      <StatusChip tone="danger" icon={BookLock} label={t("BooksOnRemoved")} />
                    )}
                    {device.removalUnfinished && <StatusChip tone="danger" label={t("RemovalUnfinished")} />}
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
                  {seen && (
                    <p className="text-sm text-muted-foreground">
                      {t("LastSeen")}: {seen.date} <Ltr>{seen.time}</Ltr>
                    </p>
                  )}
                  {!device.isThis && device.removedAt === null && device.waitingFromIt !== null && (
                    <p className="text-sm text-muted-foreground">
                      {t("WaitingFromIt", { count: device.waitingFromIt })}
                    </p>
                  )}
                </div>
                {mayRemove && !device.isThis && device.removedAt === null && (
                  <Button
                    variant="outline"
                    className="narrow:w-full"
                    onClick={() => {
                      setTakingBack(false);
                      setRemoving(device);
                    }}
                  >
                    <MonitorX />
                    {t("Remove")}
                  </Button>
                )}
                {/* Refused by the mailbox, the centre key not replaced after it: the same removal again finishes it. */}
                {mayRemove && !thisRevoked && !device.isThis && device.removalUnfinished && !device.holdsBooks && (
                  <Button
                    variant="outline"
                    className="narrow:w-full"
                    data-sync-retry-removal
                    onClick={() => {
                      setTakingBack(false);
                      setRemoving(device);
                    }}
                  >
                    <MonitorX />
                    {t("RetryRemoval")}
                  </Button>
                )}
                {mayRemove && !thisRevoked && !device.isThis && device.removedAt !== null && device.holdsBooks && (
                  <Button
                    variant="outline"
                    className="narrow:w-full"
                    data-sync-take-back
                    onClick={() => {
                      setTakingBack(true);
                      setRemoving(device);
                    }}
                  >
                    <BookUp />
                    {t("TakeBackBooks")}
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
            {/* What the phone issues prints from a laptop (docs/phone/DECISION.md section 6). */}
            {thisIsPhone && books.heldHere && (
              <p className="text-base leading-relaxed text-muted-foreground">{t("PhoneBooksHint")}</p>
            )}
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

        {(active.length < 2 || addLaptop || addPhone) && !thisRevoked && (
          <div className="flex min-w-0 flex-wrap items-center gap-3">
            {active.length < 2 && <p className="text-base text-muted-foreground">{t("OnlyOne")}</p>}
            {addLaptop && (
              <Button variant="add" data-sync-add="LAPTOP" onClick={() => onAddingChange("LAPTOP")}>
                <MonitorSmartphone />
                {t("Add")}
              </Button>
            )}
            {addPhone && (
              <Button variant="add" data-sync-add="PHONE" onClick={() => onAddingChange("PHONE")}>
                <Smartphone />
                {t("AddPhone")}
              </Button>
            )}
          </div>
        )}
      </CardContent>

      {mayAdd && (
        <PairDialog
          kind={adding ?? "LAPTOP"}
          open={(adding === "LAPTOP" && addLaptop) || (adding === "PHONE" && addPhone)}
          onOpenChange={(open) => onAddingChange(open ? adding : null)}
        />
      )}
      {mayRemove && <RemoveDialog device={removing} takeBack={takingBack} onClose={() => setRemoving(null)} />}
      {confirmDialog}
    </Card>
  );
}
