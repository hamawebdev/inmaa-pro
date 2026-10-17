import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { HandCoins, PackageOpen } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { SectionHeading } from "@/components/screen";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import {
  listPendingChargesQuery,
  settleEquipmentChargeAction,
  type EquipmentIncident,
} from "@/features/stock/services/incidents";
import { HANDOUTS_PATH } from "@/features/stock/services/paths";
import { listEquipmentToRecoverQuery } from "@/features/stock/services/recovery";
import { useCan } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { dinarsToMoney, moneyToDinars, type Money } from "@/lib/units";

const quantity = (thousandths: number) => String(thousandths / 1000).replace(".", ",");

/** An item's name in the reader's language, Arabic when it has none (as the maintenance screen does). */
function useItemName() {
  const locale = useLocale();
  return (row: { itemName: string; itemNameFr: string | null; itemNameEn: string | null }) =>
    (locale === "fr" ? row.itemNameFr : locale === "en" ? row.itemNameEn : null) ?? row.itemName;
}

/**
 * Equipment lost or damaged on a return, still to settle (MON-10): the manager decides what the worker owes,
 * from nothing to the cost, with the reason typed. Drawn only while there is one.
 */
export function PendingCharges() {
  const t = useTranslations("HandoutAttention");
  const money = useMoneyText();
  const dates = useDateText();
  const settles = useCan("sanction.set");
  const nameOf = useItemName();
  const [settling, setSettling] = React.useState<EquipmentIncident | null>(null);
  const { data } = useQuery({
    queryKey: [...pathKey(HANDOUTS_PATH), "charges"],
    queryFn: () => listPendingChargesQuery(undefined),
  });
  if (!data || data.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeading>{t("ChargesTitle", { count: data.length })}</SectionHeading>
      <p className="text-muted-foreground">{t(settles ? "ChargesHint" : "ChargesHintReader")}</p>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Table.Return")}</TableHead>
            <TableHead>{t("Table.Worker")}</TableHead>
            <TableHead>{t("Table.Equipment")}</TableHead>
            <TableHead>{t("Table.Cost")}</TableHead>
            {settles && (
              <TableHead className="w-12">
                <span className="sr-only">{t("Settle")}</span>
              </TableHead>
            )}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((row) => (
            <TableRow key={row.handOutReturnId}>
              <TableCell>
                <p className="leading-tight font-bold tabular-nums">
                  <Ltr>{row.handOutNumber}</Ltr>
                </p>
                <p className="text-sm leading-tight whitespace-nowrap text-muted-foreground">{dates.long(row.date)}</p>
              </TableCell>
              <TableCell>
                <p className="max-w-48 truncate font-bold">{row.workerName}</p>
                {row.workerNumber && (
                  <p className="text-sm text-muted-foreground">
                    <Ltr>{row.workerNumber}</Ltr>
                  </p>
                )}
              </TableCell>
              <TableCell>
                <p className="max-w-56 truncate">
                  {nameOf(row)}
                  {row.unitNumber && (
                    <>
                      {" "}
                      <Ltr>{row.unitNumber}</Ltr>
                    </>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {row.lost > 0 && <StatusChip tone="danger" label={t("Lost", { qty: quantity(row.lost) })} />}
                  {row.damaged > 0 && (
                    <StatusChip tone="warning" label={t("Damaged", { qty: quantity(row.damaged) })} />
                  )}
                </div>
              </TableCell>
              <TableCell className="font-bold whitespace-nowrap tabular-nums">{money(row.cost)}</TableCell>
              {settles && (
                <TableCell>
                  <Button type="button" variant="outline" size="sm" onClick={() => setSettling(row)}>
                    <HandCoins />
                    {t("Settle")}
                  </Button>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <SettleDialog incident={settling} onClose={() => setSettling(null)} />
    </section>
  );
}

function SettleDialog({ incident, onClose }: { incident: EquipmentIncident | null; onClose: () => void }) {
  return (
    <Dialog open={incident !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {incident && <SettleForm key={incident.handOutReturnId} incident={incident} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function SettleForm({ incident, onClose }: { incident: EquipmentIncident; onClose: () => void }) {
  const t = useTranslations("HandoutAttention");
  const tCommon = useTranslations("Common");
  const money = useMoneyText();
  const errorMessage = useErrorMessage();
  const [amount, setAmount] = React.useState<number | undefined>(moneyToDinars(incident.cost as Money));
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    const result = await settleEquipmentChargeAction({
      handOutReturnId: incident.handOutReturnId,
      amount: dinarsToMoney(amount ?? 0),
      reason,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SettleFailed")));
      return;
    }
    toast.success(t("Settled"));
    onClose();
  }

  return (
    <form onSubmit={(event) => void save(event)} className="grid gap-5">
      <DialogHeader>
        <DialogTitle>{t("SettleTitle", { worker: incident.workerName })}</DialogTitle>
        <DialogDescription>{t("SettleDescription", { cost: money(incident.cost) })}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="charge-amount">{t("Charged")}</FieldLabel>
        <Input
          id="charge-amount"
          type="number"
          inputMode="decimal"
          min={0}
          step={0.01}
          value={amount ?? ""}
          onChange={(event) => setAmount(event.target.value === "" ? undefined : Number(event.target.value))}
        />
        <FieldDescription>{t("ChargedHint")}</FieldDescription>
      </Field>
      <Field>
        <FieldLabel htmlFor="charge-reason">{t("Reason")}</FieldLabel>
        <Input id="charge-reason" value={reason} onChange={(event) => setReason(event.target.value)} />
      </Field>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tCommon("Cancel")}
        </Button>
        <Button type="submit" variant="success" disabled={busy || reason.trim() === "" || amount === undefined}>
          {t("Settle")}
        </Button>
      </DialogFooter>
    </form>
  );
}

/**
 * Equipment to bring back (INT-8, MON-13): out on a contract that ended without renewal, or with a worker who
 * left. On a file's own part, that file's only. Drawn only while there is some.
 */
export function ToRecoverList({ fileId }: { fileId?: string }) {
  const t = useTranslations("HandoutAttention");
  const dates = useDateText();
  const nameOf = useItemName();
  const { data } = useQuery({
    queryKey: [...pathKey(HANDOUTS_PATH), "recover"],
    queryFn: () => listEquipmentToRecoverQuery(undefined),
    retry: false,
  });
  const rows = (data ?? []).filter((row) => fileId === undefined || row.fileId === fileId);
  if (rows.length === 0) return null;

  return (
    <section className="space-y-3">
      <SectionHeading>{t("RecoverTitle", { count: rows.length })}</SectionHeading>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Table.Equipment")}</TableHead>
            <TableHead>{t("Table.Holder")}</TableHead>
            <TableHead>{t("Table.Why")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.handOutLineId ?? `unit-${row.unitNumber}`}>
              <TableCell>
                <p className="max-w-56 truncate font-bold">
                  <PackageOpen className="me-1.5 inline size-4 text-muted-foreground" aria-hidden />
                  {nameOf(row)}
                  {row.unitNumber && (
                    <>
                      {" "}
                      <Ltr>{row.unitNumber}</Ltr>
                    </>
                  )}
                </p>
                {row.handOutNumber && row.date && (
                  <p className="text-sm text-muted-foreground">
                    <Ltr>{row.handOutNumber}</Ltr> · {dates.long(row.date)}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <p className="max-w-48 truncate">{row.atSite ? t("AtSite") : row.workerName}</p>
                {row.clientName && (
                  <p className="max-w-48 truncate text-sm text-muted-foreground">
                    {row.clientName}
                    {row.fileNumber && (
                      <>
                        {" · "}
                        <Ltr>{row.fileNumber}</Ltr>
                      </>
                    )}
                  </p>
                )}
              </TableCell>
              <TableCell>
                <StatusChip
                  tone="warning"
                  label={t(row.why === "CONTRACT_ENDED" ? "WhyContractEnded" : "WhyWorkerLeft")}
                />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
