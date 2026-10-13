import * as React from "react";

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
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { centreToday } from "@/features/money/components/centre-today";
import {
  recordMaintenanceAction,
  setMaintenancePlanAction,
  type EquipmentUnitRow,
} from "@/features/stock/services/maintenance";
import {
  ITEM_CONDITIONS,
  MAINTENANCE_KINDS,
  type ItemCondition,
  type MaintenanceKind,
} from "@/features/stock/validators/option-codes";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { dinarsToMoney } from "@/lib/units";

export type MaintenanceMode = "record" | "plan";

/**
 * The two things done to a machine from its row: recording a service or a
 * repair (what was done, by whom, for how much, in what condition it is
 * left), and setting how often it is serviced. The academy's expense dialog.
 */
export function MaintenanceDialog({
  unit,
  mode,
  onClose,
}: {
  unit: EquipmentUnitRow | null;
  mode: MaintenanceMode;
  onClose: () => void;
}) {
  return (
    <Dialog open={unit !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        {unit &&
          (mode === "plan" ? <PlanForm unit={unit} onClose={onClose} /> : <RecordForm unit={unit} onClose={onClose} />)}
      </DialogContent>
    </Dialog>
  );
}

function PlanForm({ unit, onClose }: { unit: EquipmentUnitRow; onClose: () => void }) {
  const t = useTranslations("MaintenanceForm");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [interval, setInterval] = React.useState(unit.intervalDays === null ? "" : String(unit.intervalDays));
  const [nextDate, setNextDate] = React.useState<string>(unit.nextMaintenanceDate ?? "");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const result = await setMaintenancePlanAction({
      unitId: unit.id,
      intervalDays: interval.trim() === "" ? null : Number(interval),
      nextDate: nextDate || null,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("PlanSaved"));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("PlanTitle", { piece: unit.itemName, number: unit.number })}</DialogTitle>
        <DialogDescription>{t("PlanDescription")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="plan-interval">{t("Interval")}</FieldLabel>
          <Input
            id="plan-interval"
            type="number"
            inputMode="numeric"
            min={1}
            step={1}
            value={interval}
            onChange={(event) => setInterval(event.target.value)}
          />
          <FieldDescription>{t("IntervalHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="plan-next">{t("NextDate")}</FieldLabel>
          <Input id="plan-next" type="date" value={nextDate} onChange={(event) => setNextDate(event.target.value)} />
          <FieldDescription>{t("NextDateHint")}</FieldDescription>
        </Field>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tCommon("Cancel")}
        </Button>
        <Button type="button" variant="success" disabled={busy} onClick={() => void save()}>
          {tCommon("Save")}
        </Button>
      </DialogFooter>
    </>
  );
}

function RecordForm({ unit, onClose }: { unit: EquipmentUnitRow; onClose: () => void }) {
  const t = useTranslations("MaintenanceForm");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const kindLabel = useCodeLabel("StockCodes.MaintenanceKinds");
  const conditionLabel = useCodeLabel("StockCodes.Conditions");
  const today = centreToday();
  const [kind, setKind] = React.useState<MaintenanceKind>("PREVENTIVE");
  const [date, setDate] = React.useState(today);
  const [description, setDescription] = React.useState("");
  const [cost, setCost] = React.useState("");
  const [provider, setProvider] = React.useState("");
  const [condition, setCondition] = React.useState<ItemCondition>("GOOD");
  const [busy, setBusy] = React.useState(false);

  async function save() {
    setBusy(true);
    const result = await recordMaintenanceAction({
      unitId: unit.id,
      date,
      kind,
      description,
      cost: cost.trim() === "" ? 0 : dinarsToMoney(Number(cost) || 0),
      provider,
      conditionAfter: condition,
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("Recorded"));
    onClose();
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t("RecordTitle", { piece: unit.itemName, number: unit.number })}</DialogTitle>
        <DialogDescription>{t("RecordDescription")}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="maintenance-kind">{t("Kind")}</FieldLabel>
          <Select value={kind} onValueChange={(value) => setKind(value as MaintenanceKind)}>
            <SelectTrigger id="maintenance-kind">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MAINTENANCE_KINDS.map((code) => (
                <SelectItem key={code} value={code}>
                  {kindLabel(code)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="maintenance-date">{t("Date")}</FieldLabel>
          <Input
            id="maintenance-date"
            type="date"
            max={today}
            value={date}
            onChange={(event) => setDate(event.target.value)}
          />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="maintenance-description">{t("What")}</FieldLabel>
          <Textarea
            id="maintenance-description"
            rows={2}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="maintenance-cost">{t("Cost")}</FieldLabel>
          <Input
            id="maintenance-cost"
            type="number"
            inputMode="decimal"
            min={0}
            step={0.01}
            placeholder="0.00"
            value={cost}
            onChange={(event) => setCost(event.target.value)}
          />
          <FieldDescription>{t("CostHint")}</FieldDescription>
        </Field>
        <Field>
          <FieldLabel htmlFor="maintenance-provider">{t("Provider")}</FieldLabel>
          <Input id="maintenance-provider" value={provider} onChange={(event) => setProvider(event.target.value)} />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="maintenance-condition">{t("ConditionAfter")}</FieldLabel>
          <Select value={condition} onValueChange={(value) => setCondition(value as ItemCondition)}>
            <SelectTrigger id="maintenance-condition">
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
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onClose}>
          {tCommon("Cancel")}
        </Button>
        <Button type="button" variant="success" disabled={busy} onClick={() => void save()}>
          {t("Record")}
        </Button>
      </DialogFooter>
    </>
  );
}
