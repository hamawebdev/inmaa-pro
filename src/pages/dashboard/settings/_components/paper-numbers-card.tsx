import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { FileStack } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { Ltr } from "@/components/ltr";
import { DateField } from "@/components/pickers";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  declarePaperNumbersAction,
  listPaperNumbersQuery,
  PAPER_NUMBERS_PATH,
  type PaperNumbersRow,
} from "@/features/core/services/paper-numbers";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useDateText } from "@/hooks/use-date-text";
import { useSession } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { MANAGER_ROLE } from "@/lib/access/catalogue";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * Invoices and receipts issued on paper this year (RULINGS item 4): the
 * manager declares the last paper number of each, once, and the program goes
 * on after it. Beside the numbering card in Settings › قواعد العمل.
 *
 * Closest academy screen: the settings cards that save behind their own
 * button (the identity card).
 */
export function PaperNumbersCard() {
  const t = useTranslations("PaperNumbers");
  const rows = useQuery({
    queryKey: [...pathKey(PAPER_NUMBERS_PATH), "paper-numbers"],
    queryFn: () => listPaperNumbersQuery(undefined),
  });

  return (
    <Card data-settings-group="paperNumbers">
      <CardHeader>
        <CardTitle>{t("Title")}</CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        {rows.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          (rows.data ?? []).map((row) => <PaperKeyBlock key={row.key} row={row} />)
        )}
      </CardContent>
    </Card>
  );
}

function PaperKeyBlock({ row }: { row: PaperNumbersRow }) {
  const t = useTranslations("PaperNumbers");
  const errorMessage = useErrorMessage();
  const dates = useDateText();
  const { today } = useCentreClock();
  const isManager = useSession()?.roleId === MANAGER_ROLE;
  const [confirm, confirmDialog] = useConfirm();
  const [lastValue, setLastValue] = React.useState("");
  const [lastDate, setLastDate] = React.useState(today);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const id = row.key.toLowerCase();
  const number = Number(lastValue);
  const ready = Number.isInteger(number) && number >= 1 && reason.trim() !== "" && lastDate !== "";

  async function declare(event: React.FormEvent) {
    event.preventDefault();
    if (!ready || busy) return;
    const ok = await confirm({
      title: t(`${row.key}.Confirm`, { number }),
      description: t("ConfirmHint"),
      confirmLabel: t("Declare"),
      tone: "danger",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const result = await declarePaperNumbersAction({ key: row.key, lastValue: number, lastDate, reason });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("Failed")));
        return;
      }
      toast.success(t("Declared"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      data-paper-key={row.key}
      className="flex min-w-0 flex-col gap-3 border-b border-border/60 pb-5 last:border-0"
    >
      <h3 className="flex items-center gap-2 text-lg font-bold">
        <FileStack className="size-5 text-muted-foreground" aria-hidden />
        {t(`${row.key}.Label`)}
      </h3>
      {row.opening ? (
        <p className="text-base leading-relaxed">
          {t("DeclaredLine", { by: row.opening.byUserName ?? "—", date: dates.ofInstant(row.opening.createdAt) })}{" "}
          <Ltr className="font-bold">1 – {row.opening.toValue}</Ltr>
          <span className="block text-muted-foreground">{row.opening.reason}</span>
        </p>
      ) : row.lastValue > 0 ? (
        <p className="text-base leading-relaxed text-muted-foreground">
          {t("AlreadyNumbered", { count: row.lastValue })}
        </p>
      ) : isManager ? (
        <form className="flex min-w-0 flex-col gap-4" onSubmit={declare}>
          <div className="grid min-w-0 gap-4 sm:grid-cols-2">
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`paper_${id}_number`}>{t("LastNumber")}</Label>
              <Input
                id={`paper_${id}_number`}
                dir="ltr"
                inputMode="numeric"
                value={lastValue}
                onChange={(event) => setLastValue(event.target.value.replace(/\D/g, ""))}
                className="text-start"
              />
            </div>
            <div className="grid min-w-0 gap-2">
              <Label htmlFor={`paper_${id}_date`}>{t("LastDate")}</Label>
              <DateField
                id={`paper_${id}_date`}
                value={lastDate}
                max={today}
                min={`${row.year}-01-01`}
                onChange={setLastDate}
              />
            </div>
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={`paper_${id}_reason`}>{t("Reason")}</Label>
            <Textarea
              id={`paper_${id}_reason`}
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
          <div>
            <Button type="submit" variant="success" loading={busy} disabled={!ready}>
              {t("Declare")}
            </Button>
          </div>
        </form>
      ) : (
        <p className="text-base text-muted-foreground">{t("NotDeclared")}</p>
      )}
      {confirmDialog}
    </section>
  );
}
