import * as React from "react";

import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ChoiceField, Fact, FieldGrid, NumberField, TextField } from "@/features/clients/components/part-fields";
import { quoteLineAmount, quoteTotals } from "@/features/clients/rules/pricing";
import { saveQuoteAction } from "@/features/clients/services/quotes";
import { QUOTE_LINE_KINDS, type QuoteInput, type QuoteLineInput } from "@/features/clients/validators/pricing";
import { useMoneyText } from "@/hooks/use-money-text";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { useRouter } from "@/lib/compat/navigation";
import { AMOUNT_BASES, YES_NO, type YesNo } from "@/lib/options";

/**
 * A quote being prepared: its lines, its discount, what it includes.
 *
 * Closest academy screen: the employee form (employees/_components/employee-form.tsx):
 * stacked cards of labelled fields, Cancel and Save at the foot.
 */

const yesNoOf = (value: boolean | null): YesNo | null => (value === null ? null : value ? "YES" : "NO");

export function QuoteForm({
  fileId,
  quoteId,
  initial,
  contract,
}: {
  fileId: string;
  /** The draft being changed, or null for a new quote. */
  quoteId: string | null;
  initial: QuoteInput;
  /** A contract's quote says what its amount is for; a job on demand is one amount. */
  contract: boolean;
}) {
  const t = useTranslations("Quotes");
  const tCommon = useTranslations("Common");
  const kindLabel = useCodeLabel("FileOptions.QuoteLineKind");
  const basisLabel = useCodeLabel("Options.AmountBasis");
  const yesNoLabel = useCodeLabel("Options.YesNo");
  const money = useMoneyText();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [terms, setTerms] = React.useState<QuoteInput>(initial);
  const [busy, setBusy] = React.useState(false);
  const totals = quoteTotals(terms.lines, terms.discount);

  const set = (patch: Partial<QuoteInput>) => setTerms((current) => ({ ...current, ...patch }));
  const setLine = (index: number, patch: Partial<QuoteLineInput>) =>
    setTerms((current) => ({
      ...current,
      lines: current.lines.map((line, at) => (at === index ? { ...line, ...patch } : line)),
    }));

  async function save() {
    setBusy(true);
    const result = await saveQuoteAction({ fileId, quoteId, quote: terms });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("Saved", { number: result.data.number }));
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(event) => {
        event.preventDefault();
        void save();
      }}
    >
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Lines")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {terms.lines.map((line, index) => (
            <div key={index} className="space-y-4 rounded-lg border p-4">
              <FieldGrid>
                <TextField
                  label={t("LineLabel")}
                  value={line.label}
                  onChange={(label) => setLine(index, { label })}
                  className="sm:col-span-2"
                />
                <ChoiceField
                  label={t("LineKind")}
                  value={line.kind}
                  options={QUOTE_LINE_KINDS}
                  labelOf={kindLabel}
                  onChange={(kind) => kind && setLine(index, { kind })}
                />
                <TextField
                  label={t("Unit")}
                  value={line.unit ?? ""}
                  onChange={(unit) => setLine(index, { unit: unit === "" ? null : unit })}
                />
                <NumberField
                  label={t("Quantity")}
                  kind="qty"
                  value={line.quantity}
                  onChange={(quantity) => setLine(index, { quantity: quantity ?? 0 })}
                />
                <NumberField
                  label={t("UnitPrice")}
                  kind="money"
                  value={line.unitPrice}
                  onChange={(unitPrice) => setLine(index, { unitPrice: unitPrice ?? 0 })}
                />
              </FieldGrid>
              <div className="flex min-w-0 flex-wrap items-end justify-between gap-3">
                <Fact label={t("Amount")} ltr>
                  {money(quoteLineAmount(line))}
                </Fact>
                {terms.lines.length > 1 && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => set({ lines: terms.lines.filter((_, at) => at !== index) })}
                  >
                    <Trash2 />
                    {t("RemoveLine")}
                  </Button>
                )}
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="outline"
            onClick={() =>
              set({
                lines: [
                  ...terms.lines,
                  { kind: "EXTRA", label: "", description: null, quantity: 1000, unit: null, unitPrice: 0 },
                ],
              })
            }
          >
            <Plus />
            {t("AddLine")}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("Terms")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <FieldGrid>
            <TextField label={t("Date")} type="date" value={terms.date} onChange={(date) => set({ date })} />
            <TextField
              label={t("ValidUntil")}
              type="date"
              value={terms.validUntil ?? ""}
              onChange={(validUntil) => set({ validUntil: validUntil === "" ? null : validUntil })}
            />
            <NumberField
              label={t("Discount")}
              kind="money"
              value={terms.discount}
              onChange={(discount) => set({ discount: discount ?? 0 })}
            />
            {contract && (
              <ChoiceField
                label={t("AmountBasis")}
                value={terms.amountBasis}
                options={AMOUNT_BASES}
                labelOf={basisLabel}
                emptyLabel={t("NotSaid")}
                onChange={(amountBasis) => set({ amountBasis })}
              />
            )}
            <NumberField
              label={t("Workers")}
              kind="count"
              value={terms.workers}
              onChange={(workers) => set({ workers })}
            />
            <TextField
              label={t("Duration")}
              value={terms.duration ?? ""}
              onChange={(duration) => set({ duration: duration === "" ? null : duration })}
            />
            <TextField
              label={t("Visits")}
              value={terms.visits ?? ""}
              onChange={(visits) => set({ visits: visits === "" ? null : visits })}
            />
            <ChoiceField
              label={t("MaterialsIncluded")}
              value={yesNoOf(terms.materialsIncluded)}
              options={YES_NO}
              labelOf={yesNoLabel}
              emptyLabel={t("NotSaid")}
              onChange={(value) => set({ materialsIncluded: value === null ? null : value === "YES" })}
            />
            <ChoiceField
              label={t("EquipmentIncluded")}
              value={yesNoOf(terms.equipmentIncluded)}
              options={YES_NO}
              labelOf={yesNoLabel}
              emptyLabel={t("NotSaid")}
              onChange={(value) => set({ equipmentIncluded: value === null ? null : value === "YES" })}
            />
            <TextField
              label={t("Included")}
              multiline
              value={terms.includedText ?? ""}
              onChange={(includedText) => set({ includedText: includedText === "" ? null : includedText })}
              className="sm:col-span-2"
            />
            <TextField
              label={t("Excluded")}
              multiline
              value={terms.excludedText ?? ""}
              onChange={(excludedText) => set({ excludedText: excludedText === "" ? null : excludedText })}
              className="sm:col-span-2"
            />
          </FieldGrid>
          <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-3">
            <Fact label={t("Subtotal")} ltr>
              {money(totals.subtotal)}
            </Fact>
            <Fact label={t("Discount")} ltr>
              {money(totals.discount)}
            </Fact>
            <Fact label={t("Total")} ltr>
              {money(totals.total)}
            </Fact>
          </div>
        </CardContent>
      </Card>

      <PageActions>
        <Button type="button" variant="outline" onClick={() => router.back()}>
          {tCommon("Cancel")}
        </Button>
        <Button type="submit" variant="success" disabled={busy}>
          {busy ? t("Saving") : t("Save")}
        </Button>
      </PageActions>
    </form>
  );
}
