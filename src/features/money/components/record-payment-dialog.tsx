import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery } from "@tanstack/react-query";
import { Controller, useForm, useWatch } from "react-hook-form";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { Ltr } from "@/components/ltr";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { dinarsToMoney, moneyToDinars, type Money } from "@/lib/units";

import type { IsoDate } from "../rules/dates";
import { PAYMENTS_PATH } from "../services/paths";
import { listPayableFilesQuery, recordPaymentAction, type PayableFile } from "../services/payments";
import { PAYMENT_METHODS, type CollectorKind, type PaymentMethod } from "../validators/option-codes";
import { paymentFormSchema, type PaymentFormValues } from "../validators/payment";

import { asksClockConfirmation } from "./clock-jump";
import { usePaymentMethodLabel } from "./labels";
import { useDateText, useMoneyText } from "./use-money-text";

/** A receipt printed blank for a collector, whose payment is typed in from his copy. */
export interface BlankReceipt {
  id: string;
  number: string;
  collectorKind: CollectorKind;
  collectorStaffId: string | null;
  /** The day the block was handed out: the payment is dated that day unless the office says otherwise. */
  date: string;
}

interface DialogProps {
  /** The centre's today: the latest date a payment can carry. */
  today: IsoDate;
  /** A file to record for, from its own part or a row of the debt list. Absent: the office chooses. */
  fileId?: string;
  /** The blank receipt it fills in: cash, collected by the receipt's holder. */
  receipt?: BlankReceipt;
}

/**
 * «تسجيل دفعة»: money received for a file.
 *
 * The academy's payment dialog (groups/[groupId]/students/[studentId]/payments:
 * the amount, the date, then the receipt), with what his forms ask: «طريقة
 * الدفع», «مسدد أتعاب», the reference of a transfer, and the dues it settles,
 * the oldest first unless the office ticks others. Cash takes its stamp duty
 * on top and gets a numbered receipt, which opens to be printed at once.
 *
 * Who takes payments at the desk (`payment.record`: the accountant,
 * administration and reception) sees this; the service checks again.
 */
export function RecordPaymentDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  ...props
}: DialogProps & { trigger?: React.ReactNode; open?: boolean; onOpenChange?: (open: boolean) => void }) {
  const [ownOpen, setOwnOpen] = React.useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent className="sm:max-w-2xl">
        <PaymentLoader {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function PaymentLoader(props: DialogProps & { onDone: () => void }) {
  const t = useTranslations("PaymentForm");
  const title = props.receipt ? t("ReceiptTitle", { number: props.receipt.number }) : t("Title");
  const description = props.receipt ? t("ReceiptDescription") : t("Description");
  const { data: files } = useQuery({
    queryKey: [...pathKey(PAYMENTS_PATH), "payable"],
    queryFn: () => listPayableFilesQuery(undefined),
  });
  return (
    <>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
        <DialogDescription>{description}</DialogDescription>
      </DialogHeader>
      {files ? (
        <PaymentForm {...props} files={files} />
      ) : (
        <p className="py-6 text-center text-muted-foreground">{t("Loading")}</p>
      )}
    </>
  );
}

const remainingOf = (file: PayableFile | undefined, dueIds: readonly string[]) =>
  (file?.dues ?? []).filter((due) => dueIds.includes(due.id)).reduce((sum, due) => sum + due.remaining, 0);

function startingValues(
  today: IsoDate,
  file: PayableFile | undefined,
  receipt?: BlankReceipt,
): Partial<PaymentFormValues> {
  // What is due today or late is ticked and proposed; a due still to come is offered, never assumed (MON-03).
  const dueIds = file?.dues.filter((due) => due.dueDate <= today).map((due) => due.id) ?? [];
  const owed = remainingOf(file, dueIds);
  return {
    fileId: file?.fileId ?? "",
    receivedDate: receipt?.date ?? today,
    method: receipt ? "CASH" : (file?.methods[0] ?? "CASH"),
    amount: owed > 0 ? moneyToDinars(owed as Money) : undefined,
    dueIds,
    payerName: "",
    reference: "",
    note: "",
  };
}

function PaymentForm({
  today,
  fileId,
  receipt,
  files,
  onDone,
}: DialogProps & { files: PayableFile[]; onDone: () => void }) {
  const t = useTranslations("PaymentForm");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const methodLabel = usePaymentMethodLabel();
  const money = useMoneyText();
  const dates = useDateText();
  const navigate = useNavigate();
  const session = useSession();
  const [confirm, confirmDialog] = useConfirm();
  const schema = React.useMemo(() => paymentFormSchema(today), [today]);
  const preset = files.find((file) => file.fileId === fileId);

  const form = useForm<PaymentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: startingValues(today, preset, receipt),
  });
  const { control, setValue } = form;
  const chosenId = useWatch({ control, name: "fileId" });
  const method = useWatch({ control, name: "method" });
  const chosen = files.find((file) => file.fileId === chosenId);

  // A new file starts from its own dues, method and payer; ticking dues proposes what they still owe.
  function chooseFile(next: string) {
    const file = files.find((candidate) => candidate.fileId === next);
    const values = startingValues(today, file, receipt);
    setValue("fileId", next, { shouldValidate: true });
    setValue("dueIds", values.dueIds ?? []);
    setValue("method", values.method ?? "CASH");
    if (values.amount !== undefined) setValue("amount", values.amount);
  }
  function tickDue(dueIds: string[]) {
    setValue("dueIds", dueIds);
    const owed = remainingOf(chosen, dueIds);
    if (owed > 0) setValue("amount", moneyToDinars(owed as Money), { shouldValidate: true });
  }

  const [saving, setSaving] = React.useState(false);
  const submit = form.handleSubmit(async (values) => {
    setSaving(true);
    try {
      // The ticked dues in the file's order, the oldest first, as the service settles them.
      const order = chosen?.dues.map((due) => due.id) ?? [];
      const input = {
        fileId: values.fileId,
        receivedDate: values.receivedDate,
        method: values.method,
        amount: dinarsToMoney(values.amount),
        dueIds: order.filter((id) => values.dueIds.includes(id)),
        payerName: values.payerName ?? null,
        reference: values.reference ?? null,
        note: values.note ?? null,
        ...(receipt
          ? {
              receiptId: receipt.id,
              collectorKind: receipt.collectorKind,
              collectorStaffId: receipt.collectorStaffId,
            }
          : {}),
      };
      let result = await recordPaymentAction(input);
      if (!result.success && asksClockConfirmation(result.error, session)) {
        const confirmed = await confirm({
          title: t("ClockTitle"),
          description: errorMessage(result.error),
          confirmLabel: t("ClockConfirm"),
        });
        if (confirmed) result = await recordPaymentAction({ ...input, confirmedClockJump: true });
      }
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("Recorded", { amount: money(result.data.totalReceived) }));
      onDone();
      // A receipt made now is printed at once; one filled in from a collector's copy is already on paper.
      if (result.data.receiptId && !receipt) navigate(`/dashboard/payments/receipts/${result.data.receiptId}/print`);
    } finally {
      setSaving(false);
    }
  });

  const methods: PaymentMethod[] = chosen
    ? [...chosen.methods, ...PAYMENT_METHODS.filter((code) => !chosen.methods.includes(code))]
    : [...PAYMENT_METHODS];

  if (files.length === 0) {
    return (
      <>
        <p className="py-6 text-center text-lg text-muted-foreground">{t("NothingOwed")}</p>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onDone}>
            {tCommon("Close")}
          </Button>
        </DialogFooter>
      </>
    );
  }

  return (
    <>
      <form id="payment-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2 tall:gap-5">
        <Controller
          control={control}
          name="fileId"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
              <FieldLabel htmlFor="payment-file">{t("File")}</FieldLabel>
              <Select value={field.value ?? ""} onValueChange={chooseFile} disabled={preset !== undefined}>
                <SelectTrigger id="payment-file" aria-invalid={fieldState.invalid}>
                  <SelectValue placeholder={t("ChooseFile")} />
                </SelectTrigger>
                <SelectContent>
                  {files.map((file) => (
                    <SelectItem key={file.fileId} value={file.fileId}>
                      {t("FileOption", {
                        client: file.clientName,
                        number: file.fileNumber,
                        owed: money(file.remaining),
                      })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />

        {chosen && (
          <Controller
            control={control}
            name="dueIds"
            render={({ field }) => (
              <FieldSet className="sm:col-span-2">
                <FieldLegend variant="label">{t("Dues")}</FieldLegend>
                <FieldDescription>{t("DuesHint")}</FieldDescription>
                <div className="grid gap-2">
                  {chosen.dues.map((due) => {
                    const id = `payment-due-${due.id}`;
                    const ticked = field.value.includes(due.id);
                    return (
                      <Field key={due.id} orientation="horizontal">
                        <Checkbox
                          id={id}
                          checked={ticked}
                          onCheckedChange={(checked) =>
                            tickDue(
                              checked === true
                                ? [...field.value, due.id]
                                : field.value.filter((value) => value !== due.id),
                            )
                          }
                        />
                        <FieldLabel htmlFor={id} className="flex w-full flex-wrap justify-between gap-x-4 font-normal">
                          <span>
                            {due.periodStart && due.periodEnd
                              ? t("DuePeriod", { from: dates.short(due.periodStart), to: dates.long(due.periodEnd) })
                              : t("DueOn", { date: dates.long(due.dueDate) })}
                            {due.invoiceNumber && (
                              <span className="text-muted-foreground">
                                {" · "}
                                {t("Invoice")} <Ltr>{due.invoiceNumber}</Ltr>
                              </span>
                            )}
                          </span>
                          <span className="font-bold tabular-nums">{money(due.remaining)}</span>
                        </FieldLabel>
                      </Field>
                    );
                  })}
                </div>
              </FieldSet>
            )}
          />
        )}

        <Controller
          control={control}
          name="receivedDate"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="payment-date">{t("Date")}</FieldLabel>
              <Input
                id="payment-date"
                type="date"
                max={today}
                value={field.value ?? ""}
                onChange={(event) => field.onChange(event.target.value)}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="method"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="payment-method">{t("Method")}</FieldLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange} disabled={receipt !== undefined}>
                <SelectTrigger id="payment-method" aria-invalid={fieldState.invalid}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {methods.map((code) => (
                    <SelectItem key={code} value={code}>
                      {methodLabel(code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="amount"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="payment-amount">{t("Amount")}</FieldLabel>
              <Input
                id="payment-amount"
                type="number"
                inputMode="decimal"
                min={0.01}
                step={0.01}
                placeholder="0.00"
                value={field.value ?? ""}
                onChange={(event) => field.onChange(event.target.value === "" ? undefined : Number(event.target.value))}
                onBlur={field.onBlur}
                aria-invalid={fieldState.invalid}
              />
              {method === "CASH" && <FieldDescription>{t("CashHint")}</FieldDescription>}
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="payerName"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="payment-payer">{t("Payer")}</FieldLabel>
              <Input
                id="payment-payer"
                {...field}
                value={field.value ?? ""}
                placeholder={chosen?.payerName ?? chosen?.clientName ?? ""}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />

        {method !== "CASH" && (
          <Controller
            control={control}
            name="reference"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor="payment-reference">{t("Reference")}</FieldLabel>
                <Input
                  id="payment-reference"
                  dir="ltr"
                  {...field}
                  value={field.value ?? ""}
                  aria-invalid={fieldState.invalid}
                />
                <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
              </Field>
            )}
          />
        )}

        <Controller
          control={control}
          name="note"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
              <FieldLabel htmlFor="payment-note">{t("Note")}</FieldLabel>
              <Textarea
                id="payment-note"
                {...field}
                value={field.value ?? ""}
                rows={2}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />
      </form>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("Cancel")}
        </Button>
        <Button type="submit" form="payment-form" variant="success" disabled={saving}>
          {t("Record")}
        </Button>
      </DialogFooter>
      {confirmDialog}
    </>
  );
}
