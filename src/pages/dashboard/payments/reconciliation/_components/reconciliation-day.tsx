import * as React from "react";

import { ChevronDown, CircleOff, HandCoins, ListChecks, SearchX } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { PageActions, SectionHeading } from "@/components/screen";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { centreToday } from "@/features/money/components/centre-today";
import { MoneyValue } from "@/features/money/components/money-value";
import { ReasonDialog } from "@/features/money/components/reason-dialog";
import { RecordPaymentDialog, type BlankReceipt } from "@/features/money/components/record-payment-dialog";
import { useMoneyText } from "@/features/money/components/use-money-text";
import {
  closeReconciliationAction,
  declareReceiptAction,
  type ReconciliationDay,
  type ReconciliationOutcome,
  type ReconciliationReceipt,
} from "@/features/money/services/reconciliation";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { dinarsToMoney } from "@/lib/units";

const OUTCOME_TONE: Record<ReconciliationOutcome, StatusTone> = {
  USED: "success",
  VOIDED: "neutral",
  MISSING: "danger",
};

/**
 * The day's receipts, then the cash. A blank receipt is accounted for here:
 * its payment typed in from the collector's copy, or returned unused, or
 * declared missing, each with a word. Once none is left, the cash handed in is
 * typed and the day closed; a closed day shows its figures, and can be
 * corrected once by the accountant.
 */
export function ReconciliationDayView({ day }: { day: ReconciliationDay }) {
  const t = useTranslations("Reconciliation");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const money = useMoneyText();
  const level = useSectionLevel("MONEY");
  const closes = useCan("reconciliation.close");
  const records = useCan("payment.record");
  const mayClose = level === "WRITE" && closes;
  const [paying, setPaying] = React.useState<BlankReceipt | null>(null);
  const [declaring, setDeclaring] = React.useState<{
    receipt: ReconciliationReceipt;
    outcome: "VOIDED" | "MISSING";
  } | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [counted, setCounted] = React.useState("");
  const [note, setNote] = React.useState("");
  const [correcting, setCorrecting] = React.useState(false);

  async function declare(reason: string) {
    if (!declaring) return;
    setBusy(true);
    const result = await declareReceiptAction({ receiptId: declaring.receipt.id, outcome: declaring.outcome, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("DeclareFailed")));
      return;
    }
    toast.success(t(declaring.outcome === "VOIDED" ? "Returned" : "Missing", { number: declaring.receipt.number }));
    setDeclaring(null);
  }

  const countedAmount = counted.trim() === "" ? null : dinarsToMoney(Number(counted) || 0);
  async function close() {
    if (countedAmount === null) return;
    setBusy(true);
    const result = await closeReconciliationAction({
      date: day.date,
      collectorKind: day.collectorKind,
      collectorStaffId: day.collectorStaffId,
      countedCash: countedAmount,
      note,
      corrects: correcting ? (day.closed?.id ?? null) : null,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("CloseFailed")));
      return;
    }
    toast.success(t("Closed"));
    setCorrecting(false);
    setCounted("");
    setNote("");
  }

  const blank = (receipt: ReconciliationReceipt): BlankReceipt => ({
    id: receipt.id,
    number: receipt.number,
    collectorKind: day.collectorKind,
    collectorStaffId: day.collectorStaffId,
    date: day.date,
  });
  const showClosing = mayClose && day.pending === 0 && (!day.closed || correcting);

  return (
    <div className="space-y-8 tall:space-y-10">
      <section className="space-y-4">
        <SectionHeading>{t("Receipts")}</SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.Receipt")}</TableHead>
              <TableHead>{t("Table.Client")}</TableHead>
              <TableHead>{t("Table.Received")}</TableHead>
              <TableHead>{t("Table.Outcome")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("Table.Actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {day.receipts.map((receipt) => (
              <TableRow key={receipt.id}>
                <TableCell className="font-bold tabular-nums">
                  <Ltr>{receipt.number}</Ltr>
                </TableCell>
                <TableCell>
                  {receipt.clientName ? (
                    <div className="max-w-40 min-w-0 xl:max-w-64">
                      <p className="truncate leading-tight font-bold">{receipt.clientName}</p>
                      <p className="truncate text-sm leading-tight text-muted-foreground">
                        <Ltr>{receipt.fileNumber}</Ltr>
                      </p>
                    </div>
                  ) : (
                    <span className="text-muted-foreground">{receipt.reason ?? "—"}</span>
                  )}
                </TableCell>
                <TableCell className="font-bold whitespace-nowrap tabular-nums">
                  {receipt.outcome === "USED" && receipt.total !== null ? money(receipt.total) : "—"}
                </TableCell>
                <TableCell>
                  {receipt.outcome ? (
                    <StatusChip tone={OUTCOME_TONE[receipt.outcome]} label={t(`Outcomes.${receipt.outcome}`)} />
                  ) : (
                    <StatusChip tone="warning" label={t("Outcomes.BLANK")} />
                  )}
                </TableCell>
                <TableCell>
                  {receipt.outcome === null && !day.closed && (records || mayClose) && (
                    // One named action per row, as the academy's rows name theirs; the three ways a blank ends are its menu.
                    <div className="flex justify-end">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm">
                            <ListChecks />
                            {t("AccountFor")}
                            <ChevronDown />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {records && (
                            <DropdownMenuItem onSelect={() => setPaying(blank(receipt))}>
                              <HandCoins />
                              {t("TypePayment")}
                            </DropdownMenuItem>
                          )}
                          {mayClose && (
                            <DropdownMenuItem onSelect={() => setDeclaring({ receipt, outcome: "VOIDED" })}>
                              <CircleOff />
                              {t("ReturnedUnused")}
                            </DropdownMenuItem>
                          )}
                          {mayClose && (
                            <DropdownMenuItem
                              variant="destructive"
                              onSelect={() => setDeclaring({ receipt, outcome: "MISSING" })}
                            >
                              <SearchX />
                              {t("DeclareMissing")}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4">
        <SectionHeading>{t("Cash")}</SectionHeading>
        <Card>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
              <div>
                <dt className="text-sm text-muted-foreground">{t("Expected")}</dt>
                <dd className="text-xl font-bold tabular-nums tall:text-2xl">
                  <MoneyValue amount={day.expectedCash} />
                </dd>
              </div>
              {day.closed && (
                <>
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("Counted")}</dt>
                    <dd className="text-xl font-bold tabular-nums tall:text-2xl">
                      <MoneyValue amount={day.closed.countedCash} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-muted-foreground">{t("Difference")}</dt>
                    <dd className="text-xl font-bold tabular-nums tall:text-2xl">
                      <MoneyValue amount={day.closed.difference} />
                    </dd>
                  </div>
                </>
              )}
            </dl>
            {day.closed && (
              <p className="mt-4 text-muted-foreground">
                {t("ClosedBy", { name: day.closed.closedBy })}
                {day.closed.note ? ` · ${day.closed.note}` : ""}
              </p>
            )}
            {!day.closed && day.pending > 0 && <p className="mt-4 text-muted-foreground">{t("PendingFirst")}</p>}
          </CardContent>
        </Card>

        {showClosing && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field>
              <FieldLabel htmlFor="reconciliation-counted">{t("CountedInput")}</FieldLabel>
              <Input
                id="reconciliation-counted"
                type="number"
                inputMode="decimal"
                min={0}
                step={0.01}
                placeholder="0.00"
                value={counted}
                onChange={(event) => setCounted(event.target.value)}
              />
              {countedAmount !== null && (
                <FieldDescription>
                  {t("DifferenceWillBe")} <MoneyValue amount={countedAmount - day.expectedCash} />
                </FieldDescription>
              )}
            </Field>
            <Field>
              <FieldLabel htmlFor="reconciliation-note">{t("Note")}</FieldLabel>
              <Textarea
                id="reconciliation-note"
                rows={2}
                value={note}
                onChange={(event) => setNote(event.target.value)}
              />
              <FieldDescription>{t("NoteHint")}</FieldDescription>
            </Field>
          </div>
        )}
      </section>

      {showClosing ? (
        <PageActions>
          {correcting && (
            <Button variant="outline" onClick={() => setCorrecting(false)}>
              {tCommon("Cancel")}
            </Button>
          )}
          <Button variant="success" disabled={busy || countedAmount === null} onClick={() => void close()}>
            {correcting ? t("Correct") : t("Close")}
          </Button>
        </PageActions>
      ) : (
        day.closed &&
        mayClose &&
        !correcting && (
          <PageActions>
            <Button variant="outline" onClick={() => setCorrecting(true)}>
              {t("CorrectClosing")}
            </Button>
          </PageActions>
        )
      )}

      {paying && (
        <RecordPaymentDialog
          open
          onOpenChange={(open) => !open && setPaying(null)}
          today={centreToday()}
          receipt={paying}
        />
      )}
      <ReasonDialog
        open={declaring !== null}
        title={t(declaring?.outcome === "MISSING" ? "MissingTitle" : "ReturnedTitle", {
          number: declaring?.receipt.number ?? "",
        })}
        description={t(declaring?.outcome === "MISSING" ? "MissingDescription" : "ReturnedDescription")}
        confirmLabel={t(declaring?.outcome === "MISSING" ? "DeclareMissing" : "ReturnedUnused")}
        destructive={declaring?.outcome === "MISSING"}
        busy={busy}
        onConfirm={declare}
        onCancel={() => setDeclaring(null)}
      />
    </div>
  );
}
