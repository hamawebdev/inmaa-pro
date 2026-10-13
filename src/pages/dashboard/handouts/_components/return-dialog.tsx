import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { centreToday } from "@/features/money/components/centre-today";
import { formatQuantity } from "@/features/money/rules/quantities";
import { getHandOutQuery, recordHandOutReturnAction, type HandOutDetailLine } from "@/features/stock/services/handouts";
import { HANDOUTS_PATH } from "@/features/stock/services/paths";
import { ITEM_CONDITIONS, type ItemCondition } from "@/features/stock/validators/option-codes";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * «استرجاع»: what came back from a hand-out, line by line: how much returned
 * to the store, how much was lost or damaged (with a word on why), and for
 * equipment the condition it came back in, as on his card.
 *
 * Closest academy screen: none takes anything back; the dialog follows the
 * academy's expense dialog. What is lost or damaged goes to the worker's
 * record through the event the service raises.
 */
export function ReturnDialog({ handOutId, onClose }: { handOutId: string | null; onClose: () => void }) {
  return (
    <Dialog open={handOutId !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {handOutId && <ReturnLoader handOutId={handOutId} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function ReturnLoader({ handOutId, onClose }: { handOutId: string; onClose: () => void }) {
  const t = useTranslations("HandoutReturn");
  const { data } = useQuery({
    queryKey: [...pathKey(HANDOUTS_PATH), "slip", handOutId],
    queryFn: () => getHandOutQuery({ handOutId }),
  });
  const open = (data?.lines ?? []).filter((line) => line.expectReturn && line.outstanding > 0);
  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("Title", { number: data?.slip.number ?? "" })}</DialogTitle>
        <DialogDescription>{t("Description")}</DialogDescription>
      </DialogHeader>
      {!data ? (
        <p className="py-6 text-center text-muted-foreground">{t("Loading")}</p>
      ) : open.length === 0 ? (
        <p className="py-6 text-center text-lg text-muted-foreground">{t("NothingOut")}</p>
      ) : (
        // One line at a time; the form starts again on the next line still out.
        <ReturnForm key={open[0].id} lines={open} onClose={onClose} />
      )}
    </>
  );
}

const units = (thousandths: number) => thousandths / 1000;

function ReturnForm({ lines, onClose }: { lines: HandOutDetailLine[]; onClose: () => void }) {
  const t = useTranslations("HandoutReturn");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const unitLabel = useCodeLabel("StockCodes.Units");
  const conditionLabel = useCodeLabel("StockCodes.Conditions");
  const [lineId, setLineId] = React.useState(lines[0].id);
  const line = lines.find((candidate) => candidate.id === lineId) ?? lines[0];
  const [returned, setReturned] = React.useState(String(units(line.outstanding)));
  const [lost, setLost] = React.useState("0");
  const [damaged, setDamaged] = React.useState("0");
  const [condition, setCondition] = React.useState<ItemCondition>("GOOD");
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const equipment = line.kind === "EQUIPMENT";

  function choose(next: string) {
    const chosen = lines.find((candidate) => candidate.id === next) ?? lines[0];
    setLineId(chosen.id);
    setReturned(String(units(chosen.outstanding)));
    setLost("0");
    setDamaged("0");
  }

  async function save() {
    setBusy(true);
    const result = await recordHandOutReturnAction({
      handOutLineId: line.id,
      date: centreToday(),
      qtyReturned: Number(returned) || 0,
      qtyLost: Number(lost) || 0,
      qtyDamaged: Number(damaged) || 0,
      condition: equipment ? condition : null,
      note,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return;
    }
    toast.success(t("Recorded"));
    if (lines.length <= 1) onClose();
  }

  const quantity = (id: string, label: string, value: string, onChange: (value: string) => void) => (
    <Field>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input
        id={id}
        type="number"
        inputMode="decimal"
        min={0}
        step={line.unitCode ? 1 : 0.001}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  );

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field className="sm:col-span-3">
          <FieldLabel htmlFor="return-line">{t("Line")}</FieldLabel>
          <Select value={line.id} onValueChange={choose}>
            <SelectTrigger id="return-line">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lines.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.itemName}
                  {candidate.unitCode ? ` · ${candidate.unitCode}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <FieldDescription>
            {t("StillOut")} <Ltr>{formatQuantity(line.outstanding)}</Ltr> {unitLabel(line.unit)}
          </FieldDescription>
        </Field>
        {quantity("return-returned", t("Returned"), returned, setReturned)}
        {quantity("return-lost", t("Lost"), lost, setLost)}
        {quantity("return-damaged", t("Damaged"), damaged, setDamaged)}
        {equipment && (
          <Field className="sm:col-span-3">
            <FieldLabel htmlFor="return-condition">{t("Condition")}</FieldLabel>
            <Select value={condition} onValueChange={(value) => setCondition(value as ItemCondition)}>
              <SelectTrigger id="return-condition">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ITEM_CONDITIONS.map((code) => (
                  <SelectItem key={code} value={code}>
                    {conditionLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}
        <Field className="sm:col-span-3">
          <FieldLabel htmlFor="return-note">{t("Note")}</FieldLabel>
          <Textarea id="return-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          <FieldDescription>{t("NoteHint")}</FieldDescription>
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tCommon("Close")}
        </Button>
        <Button type="button" variant="success" disabled={busy} onClick={() => void save()}>
          {t("Record")}
        </Button>
      </DialogFooter>
    </>
  );
}
