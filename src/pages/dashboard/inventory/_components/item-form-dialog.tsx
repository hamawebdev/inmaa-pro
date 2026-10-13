import * as React from "react";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, type Control, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createStockItemAction, updateStockItemAction } from "@/features/stock/services/items";
import { newStockItemSchema, stockItemSchema, type NewStockItemValues } from "@/features/stock/validators/item";
import {
  STOCK_CATEGORIES,
  STOCK_KINDS,
  STOCK_TRACKINGS,
  UNITS,
  type StockCategory,
  type StockKind,
  type StockTracking,
  type Unit,
} from "@/features/stock/validators/option-codes";
import type { StockItemView } from "@/features/stock/views";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

const oneOf = <T extends string>(codes: readonly T[], value: string | null): T | undefined =>
  value !== null && (codes as readonly string[]).includes(value) ? (value as T) : undefined;

function startingValues(item: StockItemView | undefined, kind: StockKind): Partial<NewStockItemValues> {
  if (!item) return { nameAr: "", nameFr: "", nameEn: "", kind, unit: "PIECE", tracking: "QUANTITY", note: "" };
  return {
    nameAr: item.nameAr,
    nameFr: item.nameFr ?? "",
    nameEn: item.nameEn ?? "",
    kind: oneOf<StockKind>(STOCK_KINDS, item.kind) ?? kind,
    category: oneOf<StockCategory>(STOCK_CATEGORIES, item.category),
    unit: oneOf<Unit>(UNITS, item.unit) ?? "PIECE",
    tracking: oneOf<StockTracking>(STOCK_TRACKINGS, item.tracking) ?? "QUANTITY",
    minLevel: item.minLevel === null ? undefined : item.minLevel / 1000,
  };
}

interface DialogProps {
  /** The item to change. Absent: a new one. */
  item?: StockItemView;
  /** The kind a new item starts on: the one being looked at. */
  kind: StockKind;
}

/**
 * Adds an item to the store's list, or changes one: its name, kind, unit and
 * minimum («الحد الأدنى», at or below which it is to buy).
 *
 * The academy's expense dialog (expenses/_components/expense-form-dialog.tsx),
 * with his store table's columns as fields. The quantity is never typed into
 * an item: a new one may start with what is on the shelf today, written as its
 * first movement; afterwards it moves by purchases, hand-outs and counts only.
 */
export function ItemFormDialog({
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
        <ItemForm {...props} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

function ItemForm({ item, kind, onDone }: DialogProps & { onDone: () => void }) {
  const t = useTranslations("ItemForm");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const kindLabel = useCodeLabel("StockCodes.Kinds");
  const categoryLabel = useCodeLabel("StockCodes.Categories");
  const unitLabel = useCodeLabel("StockCodes.Units");
  const trackingLabel = useCodeLabel("StockCodes.Trackings");
  const form = useForm<NewStockItemValues>({
    resolver: zodResolver(item ? stockItemSchema : newStockItemSchema),
    defaultValues: startingValues(item, kind),
  });
  const { control } = form;
  const [saving, setSaving] = React.useState(false);

  const submit = form.handleSubmit(async (values) => {
    setSaving(true);
    const { openingQty, ...rest } = values;
    const result = item
      ? await updateStockItemAction({ id: item.id, values: rest })
      : await createStockItemAction({ values: { ...rest, openingQty } });
    setSaving(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(item ? t("Updated") : t("Added"));
    onDone();
  });

  const text = (name: "nameAr" | "nameFr" | "nameEn", label: string, dir?: "ltr") => (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid} className={name === "nameAr" ? "sm:col-span-2" : undefined}>
          <FieldLabel htmlFor={`item-${name}`}>{label}</FieldLabel>
          <Input id={`item-${name}`} dir={dir} {...field} value={field.value ?? ""} aria-invalid={fieldState.invalid} />
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );

  return (
    <>
      <DialogHeader>
        <DialogTitle>{item ? t("EditTitle") : t("NewTitle")}</DialogTitle>
        <DialogDescription>{t("Description")}</DialogDescription>
      </DialogHeader>
      <form id="item-form" onSubmit={submit} noValidate className="grid gap-4 sm:grid-cols-2 tall:gap-5">
        {text("nameAr", t("NameAr"))}
        {text("nameFr", t("NameFr"), "ltr")}
        {text("nameEn", t("NameEn"), "ltr")}
        <Choice control={control} name="kind" label={t("Kind")} codes={STOCK_KINDS} labelOf={kindLabel} />
        <Choice
          control={control}
          name="category"
          label={t("Category")}
          codes={STOCK_CATEGORIES}
          labelOf={categoryLabel}
          placeholder={t("NoCategory")}
        />
        <Choice control={control} name="unit" label={t("Unit")} codes={UNITS} labelOf={unitLabel} />
        <Choice
          control={control}
          name="tracking"
          label={t("Tracking")}
          codes={STOCK_TRACKINGS}
          labelOf={trackingLabel}
          hint={t("TrackingHint")}
        />
        <Quantity control={control} name="minLevel" label={t("Minimum")} hint={t("MinimumHint")} />
        {!item && <Quantity control={control} name="openingQty" label={t("Opening")} hint={t("OpeningHint")} />}
      </form>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("Cancel")}
        </Button>
        <Button type="submit" form="item-form" variant="success" disabled={saving}>
          {item ? t("SaveChanges") : t("Add")}
        </Button>
      </DialogFooter>
    </>
  );
}

function Choice({
  control,
  name,
  label,
  codes,
  labelOf,
  placeholder,
  hint,
}: {
  control: Control<NewStockItemValues>;
  name: FieldPath<NewStockItemValues>;
  label: string;
  codes: readonly string[];
  labelOf: (code: string) => string;
  placeholder?: string;
  hint?: string;
}) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`item-${name}`}>{label}</FieldLabel>
          <Select value={typeof field.value === "string" ? field.value : ""} onValueChange={field.onChange}>
            <SelectTrigger id={`item-${name}`} aria-invalid={fieldState.invalid}>
              <SelectValue placeholder={placeholder} />
            </SelectTrigger>
            <SelectContent>
              {codes.map((code) => (
                <SelectItem key={code} value={code}>
                  {labelOf(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {hint && <FieldDescription>{hint}</FieldDescription>}
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}

function Quantity({
  control,
  name,
  label,
  hint,
}: {
  control: Control<NewStockItemValues>;
  name: "minLevel" | "openingQty";
  label: string;
  hint: string;
}) {
  const errorMessage = useErrorMessage();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field, fieldState }) => (
        <Field data-invalid={fieldState.invalid}>
          <FieldLabel htmlFor={`item-${name}`}>{label}</FieldLabel>
          <Input
            id={`item-${name}`}
            type="number"
            inputMode="decimal"
            min={0}
            step={0.001}
            value={field.value ?? ""}
            onChange={(event) => field.onChange(event.target.value === "" ? undefined : Number(event.target.value))}
            onBlur={field.onBlur}
            aria-invalid={fieldState.invalid}
          />
          <FieldDescription>{hint}</FieldDescription>
          <FieldError>{errorMessage(fieldState.error?.message)}</FieldError>
        </Field>
      )}
    />
  );
}
