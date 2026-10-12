import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { MediaUploadField, createEmptyUploadSelection } from "@/components/media-upload-field";
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
import { Field, FieldContent, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDivisionLabel, usePaymentMethodLabel } from "@/features/money/components/labels";
import type { IsoDate } from "@/features/money/rules/dates";
import { expenseFormSchema, type ExpenseFormValues } from "@/features/money/validators/expense";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_DIVISIONS,
  PAYMENT_METHODS,
  isExpenseDivision,
  type ExpenseCategory,
  type ExpenseDivision,
  type PaymentMethod,
} from "@/features/money/validators/option-codes";
import { createExpenseAction, updateExpenseAction } from "@/features/money/services/expenses";
import type { ExpenseView } from "@/features/money/views";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { moneyToDinars } from "@/lib/units";
import { RECEIPT_UPLOAD_RULE } from "@/lib/uploads";
import { saveManagedUpload } from "@/server/uploads";

/** What the dialog opens with: the expense being edited, or a blank one dated today. */
function startingValues(today: IsoDate, expense?: ExpenseView, division?: ExpenseDivision): Partial<ExpenseFormValues> {
  if (!expense) {
    return { division, date: today, method: "CASH", recurrence: "NONE", paidTo: "", spentByName: "", note: "" };
  }
  return {
    division: isExpenseDivision(expense.division) ? expense.division : undefined,
    category: (EXPENSE_CATEGORIES as readonly string[]).includes(expense.category)
      ? (expense.category as ExpenseCategory)
      : undefined,
    date: expense.date,
    amount: moneyToDinars(expense.amount),
    method: (PAYMENT_METHODS as readonly string[]).includes(expense.method ?? "")
      ? (expense.method as PaymentMethod)
      : "CASH",
    recurrence: expense.recurrence === "MONTHLY" ? "MONTHLY" : "NONE",
    paidTo: expense.paidTo ?? "",
    spentByName: expense.spentByName ?? "",
    note: expense.note ?? "",
  };
}

interface DialogProps {
  /** The centre's today: the latest date an expense can carry. */
  today: IsoDate;
  /** The expense to change. Absent: a new one. */
  expense?: ExpenseView;
  /** The division a new expense starts on: the tab being looked at. */
  defaultDivision?: ExpenseDivision;
  /** After a save: the screen refreshes by itself (the action names its path); this is for anything else. */
  onSaved?: () => void;
}

/**
 * Records an expense typed by hand (`source = MANUAL`), or changes one.
 *
 * The academy's expense dialog (expenses/_components/expense-form-dialog.tsx)
 * and its fields (category, date and amount side by side, purchasing agent,
 * note, receipt), with what his money needs added: the division or «عام»
 * first, as on his note, the payment method, who was paid, and whether the
 * expense comes back every month (the forecast counts it).
 *
 * The form lives inside the dialog's content, which is mounted only while the
 * dialog is open: each opening starts afresh, from the row as it is now or
 * blank on the tab being looked at. `open` and `onOpenChange` let the page
 * open it from the address (the Ctrl+K "new expense" entry).
 *
 * Saving stores the receipt first (`saveManagedUpload`), then the expense
 * (services/expenses.ts); the action refreshes the screen.
 */
export function ExpenseFormDialog({
  trigger,
  open: controlledOpen,
  onOpenChange,
  ...props
}: DialogProps & {
  trigger: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [ownOpen, setOwnOpen] = React.useState(false);
  const open = controlledOpen ?? ownOpen;
  const setOpen = onOpenChange ?? setOwnOpen;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-2xl">
        <ExpenseForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ExpenseForm({ today, expense, defaultDivision, onSaved, onDone }: DialogProps & { onDone: () => void }) {
  const t = useTranslations("ExpenseForm");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const divisionLabel = useDivisionLabel();
  const categoryLabel = useCodeLabel("MoneyCodes.ExpenseCategories");
  const methodLabel = usePaymentMethodLabel();
  const [receipt, setReceipt] = React.useState(createEmptyUploadSelection());
  const schema = React.useMemo(() => expenseFormSchema(today), [today]);

  const form = useForm<ExpenseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: startingValues(today, expense, defaultDivision),
  });
  const { control } = form;

  const [saving, setSaving] = React.useState(false);
  const submit = form.handleSubmit(async (values) => {
    if (receipt.error) return;
    setSaving(true);
    try {
      // The file is written first: bytes cannot be rolled back, the record then points at them.
      let receiptUrl: string | null | undefined;
      if (receipt.file) {
        receiptUrl = await saveManagedUpload({
          entity: "Expense",
          field: "receiptUrl",
          file: receipt.file,
          rule: RECEIPT_UPLOAD_RULE,
        });
      } else if (receipt.removeExisting) {
        receiptUrl = null;
      }
      const result = expense
        ? await updateExpenseAction({ id: expense.id, values, receiptUrl })
        : await createExpenseAction({ values, receiptUrl });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(expense ? t("Updated") : t("Recorded"));
      onSaved?.();
      onDone();
    } catch (error) {
      toast.error(errorMessage(error instanceof Error ? error.message : null, t("SaveFailed")));
    } finally {
      setSaving(false);
    }
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle>{expense ? t("EditTitle") : t("NewTitle")}</DialogTitle>
        <DialogDescription>{t("Description")}</DialogDescription>
      </DialogHeader>

      <form id="expense-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2 tall:gap-5">
        <Controller
          control={control}
          name="division"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="expense-division">{t("Division")}</FieldLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger id="expense-division" aria-invalid={fieldState.invalid}>
                  <SelectValue placeholder={t("ChooseDivision")} />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_DIVISIONS.map((code) => (
                    <SelectItem key={code} value={code}>
                      {divisionLabel(code)}
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
          name="category"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="expense-category">{t("Category")}</FieldLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger id="expense-category" aria-invalid={fieldState.invalid}>
                  <SelectValue placeholder={t("ChooseCategory")} />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((code) => (
                    <SelectItem key={code} value={code}>
                      {categoryLabel(code)}
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
          name="date"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="expense-date">{t("Date")}</FieldLabel>
              <Input
                id="expense-date"
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
          name="amount"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="expense-amount">{t("Amount")}</FieldLabel>
              <Input
                id="expense-amount"
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
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="paidTo"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="expense-paid-to">{t("PaidTo")}</FieldLabel>
              <Input
                id="expense-paid-to"
                {...field}
                value={field.value ?? ""}
                placeholder={t("PaidToPlaceholder")}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="spentByName"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor="expense-spent-by">{t("SpentBy")}</FieldLabel>
              <Input
                id="expense-spent-by"
                {...field}
                value={field.value ?? ""}
                placeholder={t("SpentByPlaceholder")}
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
              <FieldLabel htmlFor="expense-method">{t("Method")}</FieldLabel>
              <Select value={field.value ?? ""} onValueChange={field.onChange}>
                <SelectTrigger id="expense-method" aria-invalid={fieldState.invalid}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAYMENT_METHODS.map((code) => (
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
          name="recurrence"
          render={({ field }) => (
            <Field orientation="horizontal" className="self-end sm:pb-2">
              <Checkbox
                id="expense-monthly"
                checked={field.value === "MONTHLY"}
                onCheckedChange={(checked) => field.onChange(checked === true ? "MONTHLY" : "NONE")}
              />
              <FieldContent>
                <FieldLabel htmlFor="expense-monthly">{t("Monthly")}</FieldLabel>
                <FieldDescription>{t("MonthlyHint")}</FieldDescription>
              </FieldContent>
            </Field>
          )}
        />

        <Controller
          control={control}
          name="note"
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid} className="sm:col-span-2">
              <FieldLabel htmlFor="expense-note">{t("Note")}</FieldLabel>
              <Textarea
                id="expense-note"
                {...field}
                value={field.value ?? ""}
                placeholder={t("NotePlaceholder")}
                rows={2}
                aria-invalid={fieldState.invalid}
              />
              <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
            </Field>
          )}
        />

        <MediaUploadField
          label={t("Receipt")}
          rule={RECEIPT_UPLOAD_RULE}
          existingUrl={expense?.receiptUrl}
          value={receipt}
          onChange={setReceipt}
          previewAlt={t("ReceiptImage")}
          colSpan2
        />
      </form>

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("Cancel")}
        </Button>
        <Button type="submit" form="expense-form" variant="success" disabled={saving}>
          {expense ? t("SaveChanges") : t("Record")}
        </Button>
      </DialogFooter>
    </>
  );
}
