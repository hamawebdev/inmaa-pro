import * as React from "react";

import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { PageActions } from "@/components/screen";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatQuantity } from "@/features/money/rules/quantities";
import { closeCountAction, saveCountLineAction, type CountSheet } from "@/features/stock/services/counts";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";

type Line = CountSheet["lines"][number];

/**
 * The count's lines. Each is saved when the storekeeper leaves its field, so a
 * count can be typed over several sittings; the difference shows at once, and
 * a difference asks for its reason before the count can close.
 */
export function CountSheetView({ count }: { count: CountSheet }) {
  const t = useTranslations("Counts");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const level = useSectionLevel("STOCK");
  const manages = useCan("stock.manage");
  const open = count.status === "OPEN";
  const mayType = open && level === "WRITE";
  const mayClose = mayType && manages;
  const [busy, setBusy] = React.useState(false);
  const typed = count.lines.filter((line) => line.countedQty !== null).length;

  async function close() {
    setBusy(true);
    const result = await closeCountAction({ countId: count.id });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("CloseFailed")));
      return;
    }
    toast.success(t("Closed", { count: result.data.adjusted }));
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="me-auto text-lg font-bold tall:text-xl">{t("Typed", { typed, lines: count.lines.length })}</h3>
        {open ? (
          <StatusChip tone="progress" label={t("States.OPEN")} />
        ) : (
          <StatusChip tone="success" label={t("States.CLOSED")} />
        )}
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t("Table.Item")}</TableHead>
            <TableHead>{t("Table.Record")}</TableHead>
            <TableHead>{t("Table.Counted")}</TableHead>
            <TableHead>{t("Table.Difference")}</TableHead>
            <TableHead>{t("Table.Reason")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {count.lines.map((line) => (
            <CountLine key={line.id} line={line} editable={mayType} />
          ))}
        </TableBody>
      </Table>
      {open && (
        <PageActions note={!mayClose ? <p className="text-muted-foreground">{t("ReadOnly")}</p> : undefined}>
          <Button asChild variant="outline">
            <Link to="/dashboard/inventory/counts">{tCommon("Close")}</Link>
          </Button>
          {mayClose && (
            <Button variant="success" disabled={busy || typed < count.lines.length} onClick={() => void close()}>
              {t("CloseCount")}
            </Button>
          )}
        </PageActions>
      )}
    </div>
  );
}

function CountLine({ line, editable }: { line: Line; editable: boolean }) {
  const t = useTranslations("Counts");
  const errorMessage = useErrorMessage();
  const unitLabel = useCodeLabel("StockCodes.Units");
  const [counted, setCounted] = React.useState(line.countedQty === null ? "" : String(line.countedQty / 1000));
  const [note, setNote] = React.useState(line.note ?? "");

  const typedQty = counted.trim() === "" ? null : Number(counted);
  const difference =
    typedQty === null || Number.isNaN(typedQty) ? line.difference : Math.round(typedQty * 1000) - line.systemQty;

  async function save() {
    if (typedQty === null || Number.isNaN(typedQty)) return;
    if (line.countedQty === Math.round(typedQty * 1000) && (line.note ?? "") === note.trim()) return;
    const result = await saveCountLineAction({ lineId: line.id, countedQty: typedQty, note });
    if (!result.success) toast.error(errorMessage(result.error, t("SaveFailed")));
  }

  return (
    <TableRow>
      <TableCell>
        <span className="block max-w-40 truncate font-bold xl:max-w-64">{line.itemName}</span>
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        <Ltr>{formatQuantity(line.systemQty)}</Ltr> {unitLabel(line.unit)}
      </TableCell>
      <TableCell>
        {editable ? (
          <Input
            type="number"
            inputMode="decimal"
            min={0}
            step={0.001}
            className="w-28"
            aria-label={t("CountedOf", { item: line.itemName })}
            value={counted}
            onChange={(event) => setCounted(event.target.value)}
            onBlur={() => void save()}
          />
        ) : (
          <span className="tabular-nums">
            {line.countedQty === null ? "—" : <Ltr>{formatQuantity(line.countedQty)}</Ltr>}
          </span>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap tabular-nums">
        {difference === null ? (
          "—"
        ) : (
          <span className={difference < 0 ? "font-bold text-destructive" : difference > 0 ? "font-bold" : undefined}>
            <Ltr>{formatQuantity(difference)}</Ltr>
          </span>
        )}
      </TableCell>
      <TableCell>
        {editable ? (
          <Input
            className="min-w-32"
            aria-label={t("ReasonOf", { item: line.itemName })}
            value={note}
            onChange={(event) => setNote(event.target.value)}
            onBlur={() => void save()}
          />
        ) : (
          <span className="block max-w-48 truncate text-muted-foreground">{line.note ?? ""}</span>
        )}
      </TableCell>
    </TableRow>
  );
}
