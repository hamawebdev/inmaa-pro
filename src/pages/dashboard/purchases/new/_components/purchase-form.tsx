import * as React from "react";

import { Plus, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { centreToday } from "@/features/money/components/centre-today";
import { useDivisionLabel, usePaymentMethodLabel } from "@/features/money/components/labels";
import { useMoneyText } from "@/features/money/components/use-money-text";
import {
  EXPENSE_DIVISIONS,
  PAYMENT_METHODS,
  type ExpenseDivision,
  type PaymentMethod,
} from "@/features/money/validators/option-codes";
import { createSupplierAction, recordPurchaseAction } from "@/features/stock/services/purchases";
import type { StockItemView } from "@/features/stock/views";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { dinarsToMoney } from "@/lib/units";

interface Line {
  key: number;
  itemId: string;
  qty: string;
  unitPrice: string;
}

const NEW_SUPPLIER = "new";
const blankLine = (key: number): Line => ({ key, itemId: "", qty: "1", unitPrice: "" });

/**
 * The purchase as the storekeeper types it from the supplier's invoice: the
 * supplier (one on file, or a new name), the date, what it was bought for, how
 * it was paid, then one line per item with its quantity and unit price.
 *
 * The total is shown as it is typed. The service checks everything again and
 * writes the stock, the pieces and the expense in one transaction.
 */
export function PurchaseForm({
  suppliers,
  items,
}: {
  suppliers: readonly { id: string; name: string; phone: string | null }[];
  items: readonly StockItemView[];
}) {
  const t = useTranslations("PurchaseForm");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const money = useMoneyText();
  const today = centreToday();
  const divisionLabel = useDivisionLabel();
  const methodLabel = usePaymentMethodLabel();
  const kindLabel = useCodeLabel("StockCodes.Kinds");
  const unitLabel = useCodeLabel("StockCodes.Units");
  const level = useSectionLevel("STOCK");
  const manages = useCan("stock.manage");
  const mayBuy = level === "WRITE" && manages;

  const [supplierId, setSupplierId] = React.useState(suppliers[0]?.id ?? NEW_SUPPLIER);
  const [supplierName, setSupplierName] = React.useState("");
  const [date, setDate] = React.useState(today);
  const [invoiceNo, setInvoiceNo] = React.useState("");
  const [division, setDivision] = React.useState<ExpenseDivision>("COMMON");
  const [method, setMethod] = React.useState<PaymentMethod>("CASH");
  const [lines, setLines] = React.useState<Line[]>([blankLine(0)]);
  const [busy, setBusy] = React.useState(false);
  const nextKey = React.useRef(1);
  const active = items.filter((item) => item.isActive);

  const change = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  const amountOf = (line: Line) => Math.round((Number(line.qty) || 0) * dinarsToMoney(Number(line.unitPrice) || 0));
  const total = lines.reduce((sum, line) => sum + (line.itemId ? amountOf(line) : 0), 0);

  async function save() {
    setBusy(true);
    try {
      let chosen = supplierId;
      if (chosen === NEW_SUPPLIER) {
        const made = await createSupplierAction({ name: supplierName });
        if (!made.success) {
          toast.error(errorMessage(made.error, t("SaveFailed")));
          return;
        }
        chosen = made.data.id;
        setSupplierId(chosen);
      }
      const result = await recordPurchaseAction({
        date,
        supplierId: chosen,
        supplierInvoiceNo: invoiceNo,
        division,
        method,
        lines: lines
          .filter((line) => line.itemId !== "")
          .map((line) => ({
            itemId: line.itemId,
            qty: Number(line.qty) || 0,
            unitPrice: dinarsToMoney(Number(line.unitPrice) || 0),
          })),
      });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("Saved", { number: result.data.number }));
      navigate("/dashboard/purchases");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6 tall:space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("From")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 tall:gap-5">
          <Field>
            <FieldLabel htmlFor="purchase-supplier">{t("Supplier")}</FieldLabel>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="purchase-supplier">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((supplier) => (
                  <SelectItem key={supplier.id} value={supplier.id}>
                    {supplier.name}
                  </SelectItem>
                ))}
                <SelectItem value={NEW_SUPPLIER}>{t("NewSupplier")}</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          {supplierId === NEW_SUPPLIER && (
            <Field>
              <FieldLabel htmlFor="purchase-supplier-name">{t("SupplierName")}</FieldLabel>
              <Input
                id="purchase-supplier-name"
                value={supplierName}
                onChange={(event) => setSupplierName(event.target.value)}
              />
            </Field>
          )}
          <Field>
            <FieldLabel htmlFor="purchase-date">{t("Date")}</FieldLabel>
            <Input
              id="purchase-date"
              type="date"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="purchase-invoice">{t("InvoiceNo")}</FieldLabel>
            <Input
              id="purchase-invoice"
              dir="ltr"
              value={invoiceNo}
              onChange={(event) => setInvoiceNo(event.target.value)}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="purchase-division">{t("Division")}</FieldLabel>
            <Select value={division} onValueChange={(value) => setDivision(value as ExpenseDivision)}>
              <SelectTrigger id="purchase-division">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_DIVISIONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {divisionLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="purchase-method">{t("Method")}</FieldLabel>
            <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
              <SelectTrigger id="purchase-method">
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
          </Field>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("What")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {lines.map((line, index) => {
            const item = active.find((candidate) => candidate.id === line.itemId);
            return (
              <div
                key={line.key}
                className="border-app grid items-end gap-3 rounded-lg border-border p-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]"
              >
                <Field>
                  <FieldLabel htmlFor={`purchase-item-${line.key}`}>{t("Item", { number: index + 1 })}</FieldLabel>
                  <Select value={line.itemId} onValueChange={(value) => change(line.key, { itemId: value })}>
                    <SelectTrigger id={`purchase-item-${line.key}`}>
                      <SelectValue placeholder={t("ChooseItem")} />
                    </SelectTrigger>
                    <SelectContent>
                      {active.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.nameAr} · {kindLabel(candidate.kind)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
                <Field>
                  <FieldLabel htmlFor={`purchase-qty-${line.key}`}>
                    {item ? t("QuantityIn", { unit: unitLabel(item.unit) }) : t("Quantity")}
                  </FieldLabel>
                  <Input
                    id={`purchase-qty-${line.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0.001}
                    step={item?.tracking === "UNIT" ? 1 : 0.001}
                    value={line.qty}
                    onChange={(event) => change(line.key, { qty: event.target.value })}
                  />
                </Field>
                <Field>
                  <FieldLabel htmlFor={`purchase-price-${line.key}`}>{t("UnitPrice")}</FieldLabel>
                  <Input
                    id={`purchase-price-${line.key}`}
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.01}
                    placeholder="0.00"
                    value={line.unitPrice}
                    onChange={(event) => change(line.key, { unitPrice: event.target.value })}
                  />
                </Field>
                <div className="pb-2">
                  <p className="text-sm text-muted-foreground">{t("Amount")}</p>
                  <p className="font-bold whitespace-nowrap tabular-nums">{money(line.itemId ? amountOf(line) : 0)}</p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon-sm"
                  className="mb-1"
                  aria-label={t("RemoveLine")}
                  title={t("RemoveLine")}
                  disabled={lines.length === 1}
                  onClick={() => setLines((current) => current.filter((other) => other.key !== line.key))}
                >
                  <Trash2 />
                </Button>
              </div>
            );
          })}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setLines((current) => [...current, blankLine(nextKey.current)]);
                nextKey.current += 1;
              }}
            >
              <Plus />
              {t("AddLine")}
            </Button>
            <p className="text-lg">
              {t("Total")} <span className="font-bold tabular-nums">{money(total)}</span>
            </p>
          </div>
        </CardContent>
      </Card>

      {mayBuy ? (
        <PageActions>
          <Button asChild variant="outline">
            <Link to="/dashboard/purchases">{tCommon("Cancel")}</Link>
          </Button>
          <Button variant="success" disabled={busy} onClick={() => void save()}>
            {t("Save")}
          </Button>
        </PageActions>
      ) : (
        <PageActions note={<p className="text-muted-foreground">{t("ReadOnly")}</p>}>{null}</PageActions>
      )}
    </div>
  );
}
