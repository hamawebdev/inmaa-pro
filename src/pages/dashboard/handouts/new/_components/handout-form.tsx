import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { centreToday } from "@/features/money/components/centre-today";
import { useDateText } from "@/features/money/components/use-money-text";
import { formatQuantity } from "@/features/money/rules/quantities";
import {
  createHandOutAction,
  listFileVisitsForHandOutQuery,
  type HandOutChoices,
} from "@/features/stock/services/handouts";
import { HANDOUTS_PATH } from "@/features/stock/services/paths";
import {
  HANDOUT_PURPOSES,
  ITEM_CONDITIONS,
  type HandoutPurpose,
  type ItemCondition,
} from "@/features/stock/validators/option-codes";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

interface Line {
  key: number;
  itemId: string;
  unitId: string;
  qty: string;
  condition: ItemCondition;
  stayAtSite: boolean;
}

const NO_VISIT = "none";
const blankLine = (key: number): Line => ({
  key,
  itemId: "",
  unitId: "",
  qty: "1",
  condition: "GOOD",
  stayAtSite: false,
});

/**
 * The hand-out as the storekeeper types it: who receives, for which job and
 * visit, then one line per item. A machine followed one by one names the piece
 * that goes out; equipment says in what condition it is handed over, as on his
 * card, and whether it stays at the client's between visits («تخزين معدات»).
 *
 * Saving takes every line out of the store in one transaction and opens the
 * slip for the worker to sign. The service refuses what the store does not
 * hold; its sentence is shown as it is.
 */
export function HandoutForm({
  choices,
  preset,
}: {
  choices: HandOutChoices;
  preset: { fileId: string; visitId: string; workerId: string };
}) {
  const t = useTranslations("HandoutForm");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const dates = useDateText();
  const today = centreToday();
  const purposeLabel = useCodeLabel("StockCodes.Purposes");
  const kindLabel = useCodeLabel("StockCodes.Kinds");
  const unitLabel = useCodeLabel("StockCodes.Units");
  const conditionLabel = useCodeLabel("StockCodes.Conditions");
  const divisionLabel = useCodeLabel("Options.Division");
  const mayWrite = useSectionLevel("STOCK") === "WRITE";

  const [purpose, setPurpose] = React.useState<HandoutPurpose>("JOB");
  const [date, setDate] = React.useState(today);
  const [fileId, setFileId] = React.useState(
    choices.files.some((file) => file.id === preset.fileId) ? preset.fileId : "",
  );
  const [visitId, setVisitId] = React.useState(preset.visitId || NO_VISIT);
  const [workerId, setWorkerId] = React.useState(
    choices.workers.some((worker) => worker.id === preset.workerId) ? preset.workerId : "",
  );
  const [lines, setLines] = React.useState<Line[]>([blankLine(0)]);
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const nextKey = React.useRef(1);

  const { data: visits } = useQuery({
    queryKey: [...pathKey(HANDOUTS_PATH), "visits", fileId],
    queryFn: () => listFileVisitsForHandOutQuery({ fileId }),
    enabled: purpose === "JOB" && fileId !== "",
  });

  const change = (key: number, patch: Partial<Line>) =>
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));

  async function save() {
    setBusy(true);
    const result = await createHandOutAction({
      date,
      purpose,
      fileId: purpose === "JOB" ? fileId : null,
      visitId: purpose === "JOB" && visitId !== NO_VISIT ? visitId : null,
      workerId,
      note,
      lines: lines
        .filter((line) => line.itemId !== "")
        .map((line) => {
          const item = choices.items.find((candidate) => candidate.id === line.itemId);
          const equipment = item?.kind === "EQUIPMENT";
          return {
            itemId: line.itemId,
            unitId: item?.tracking === "UNIT" ? line.unitId : undefined,
            qty: item?.tracking === "UNIT" ? 1 : Number(line.qty) || 0,
            condition: equipment ? line.condition : undefined,
            stayAtSite: equipment && purpose === "JOB" ? line.stayAtSite : undefined,
          };
        }),
    });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("SaveFailed")));
      return;
    }
    toast.success(t("Saved", { number: result.data.number }));
    navigate(`/dashboard/handouts/${result.data.id}/print`);
  }

  return (
    <div className="space-y-6 tall:space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>{t("Who")}</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 tall:gap-5">
          <Field>
            <FieldLabel htmlFor="handout-purpose">{t("Purpose")}</FieldLabel>
            <Select value={purpose} onValueChange={(value) => setPurpose(value as HandoutPurpose)}>
              <SelectTrigger id="handout-purpose">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {HANDOUT_PURPOSES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {purposeLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="handout-worker">{t("Worker")}</FieldLabel>
            <Select value={workerId} onValueChange={setWorkerId}>
              <SelectTrigger id="handout-worker">
                <SelectValue placeholder={t("ChooseWorker")} />
              </SelectTrigger>
              <SelectContent>
                {choices.workers.map((worker) => (
                  <SelectItem key={worker.id} value={worker.id}>
                    {worker.name} · {worker.number}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="handout-date">{t("Date")}</FieldLabel>
            <Input
              id="handout-date"
              type="date"
              max={today}
              value={date}
              onChange={(event) => setDate(event.target.value)}
            />
          </Field>
          {purpose === "JOB" && (
            <>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="handout-file">{t("File")}</FieldLabel>
                <Select
                  value={fileId}
                  onValueChange={(value) => {
                    setFileId(value);
                    setVisitId(NO_VISIT);
                  }}
                >
                  <SelectTrigger id="handout-file">
                    <SelectValue placeholder={t("ChooseFile")} />
                  </SelectTrigger>
                  <SelectContent>
                    {choices.files.map((file) => (
                      <SelectItem key={file.id} value={file.id}>
                        {file.clientName} · {divisionLabel(file.division)} · {file.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="handout-visit">{t("Visit")}</FieldLabel>
                <Select value={visitId} onValueChange={setVisitId} disabled={fileId === ""}>
                  <SelectTrigger id="handout-visit">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_VISIT}>{t("NoVisit")}</SelectItem>
                    {(visits ?? []).map((visit) => (
                      <SelectItem key={visit.id} value={visit.id}>
                        {dates.long(visit.visitDate)} · {visit.number}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FieldDescription>{t("VisitHint")}</FieldDescription>
              </Field>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("What")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {choices.items.length === 0 && <p className="text-muted-foreground">{t("StoreEmpty")}</p>}
          {lines.map((line, index) => {
            const item = choices.items.find((candidate) => candidate.id === line.itemId);
            const byPiece = item?.tracking === "UNIT";
            const equipment = item?.kind === "EQUIPMENT";
            const taken = new Set(lines.filter((other) => other.key !== line.key).map((other) => other.unitId));
            const pieces = choices.pieces.filter((piece) => piece.itemId === line.itemId && !taken.has(piece.id));
            return (
              <div
                key={line.key}
                className="border-app grid items-end gap-3 rounded-lg border-border p-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_auto_auto]"
              >
                <Field>
                  <FieldLabel htmlFor={`line-item-${line.key}`}>{t("Item", { number: index + 1 })}</FieldLabel>
                  <Select
                    value={line.itemId}
                    onValueChange={(value) => change(line.key, { itemId: value, unitId: "" })}
                  >
                    <SelectTrigger id={`line-item-${line.key}`}>
                      <SelectValue placeholder={t("ChooseItem")} />
                    </SelectTrigger>
                    <SelectContent>
                      {choices.items.map((candidate) => (
                        <SelectItem key={candidate.id} value={candidate.id}>
                          {candidate.name} · {kindLabel(candidate.kind)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {item && (
                    <FieldDescription>
                      {t("InStore")} <Ltr>{formatQuantity(item.onHandQty)}</Ltr> {unitLabel(item.unit)}
                    </FieldDescription>
                  )}
                </Field>
                {byPiece ? (
                  <Field>
                    <FieldLabel htmlFor={`line-piece-${line.key}`}>{t("Piece")}</FieldLabel>
                    <Select value={line.unitId} onValueChange={(value) => change(line.key, { unitId: value })}>
                      <SelectTrigger id={`line-piece-${line.key}`}>
                        <SelectValue placeholder={t("ChoosePiece")} />
                      </SelectTrigger>
                      <SelectContent>
                        {pieces.map((piece) => (
                          <SelectItem key={piece.id} value={piece.id}>
                            {piece.number} · {conditionLabel(piece.condition)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                ) : (
                  <Field>
                    <FieldLabel htmlFor={`line-qty-${line.key}`}>{t("Quantity")}</FieldLabel>
                    <Input
                      id={`line-qty-${line.key}`}
                      type="number"
                      inputMode="decimal"
                      min={0.001}
                      step={0.001}
                      value={line.qty}
                      onChange={(event) => change(line.key, { qty: event.target.value })}
                    />
                  </Field>
                )}
                {equipment ? (
                  <Field>
                    <FieldLabel htmlFor={`line-condition-${line.key}`}>{t("Condition")}</FieldLabel>
                    <Select
                      value={line.condition}
                      onValueChange={(value) => change(line.key, { condition: value as ItemCondition })}
                    >
                      <SelectTrigger id={`line-condition-${line.key}`}>
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
                ) : (
                  <span aria-hidden className="hidden xl:block" />
                )}
                {equipment && purpose === "JOB" ? (
                  <Field orientation="horizontal" className="pb-2">
                    <Checkbox
                      id={`line-stay-${line.key}`}
                      checked={line.stayAtSite}
                      onCheckedChange={(checked) => change(line.key, { stayAtSite: checked === true })}
                    />
                    <FieldLabel htmlFor={`line-stay-${line.key}`}>{t("StayAtSite")}</FieldLabel>
                  </Field>
                ) : (
                  <span aria-hidden className="hidden xl:block" />
                )}
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

          <Field>
            <FieldLabel htmlFor="handout-note">{t("Note")}</FieldLabel>
            <Textarea id="handout-note" rows={2} value={note} onChange={(event) => setNote(event.target.value)} />
          </Field>
        </CardContent>
      </Card>

      {mayWrite ? (
        <PageActions>
          <Button asChild variant="outline">
            <Link to="/dashboard/handouts">{tCommon("Cancel")}</Link>
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
