import { useQuery } from "@tanstack/react-query";
import { CalendarX, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useEntryDialog } from "@/features/people/components/entry-dialog";
import { Amount, DayDate, Nothing } from "@/features/people/components/figures";
import { centimesOf } from "@/features/people/components/format";
import { useMay } from "@/features/people/components/may";
import { useReasonDialog } from "@/features/people/components/reason-dialog";
import { SimpleTable } from "@/features/people/components/simple-table";
import {
  addPayItemAction,
  deletePayItemAction,
  endPayItemAction,
  listPayItemsQuery,
} from "@/features/people/services/pay-items";
import { PAY_ITEM_TYPES, type PayItemType } from "@/features/people/validators/staff-codes";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * A person's recurring allowances and deductions (`StaffPayItem`): what every
 * payslip of the months they cover adds or takes off.
 *
 * Closest academy component: a record's card of lines with an "add" button
 * (its payouts card in finance).
 */
export function PayItemsCard({ staffId }: { staffId: string }) {
  const t = useTranslations("Pay");
  const errorMessage = useErrorMessage();
  const writesPay = useMay("pay.write");
  const { today } = useCentreClock();
  const [ask, entryDialog] = useEntryDialog();
  const [askReason, reasonDialog] = useReasonDialog();
  const { data, isPending } = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "person", staffId, "items"],
    queryFn: () => listPayItemsQuery({ staffId }),
  });
  const done = (result: { success: boolean; error?: string }) => {
    if (result.success) toast.success(t("Items.Saved"));
    else toast.error(errorMessage(result.error, t("Entry.Failed")));
  };

  const add = async () => {
    const values = await ask({
      title: t("Items.Title"),
      confirmLabel: t("Items.Add"),
      fields: [
        {
          kind: "choice",
          name: "type",
          label: t("Items.Type"),
          required: true,
          defaultValue: "ALLOWANCE",
          options: PAY_ITEM_TYPES.map((code) => ({ value: code, label: t(`ItemTypes.${code}`) })),
        },
        { kind: "text", name: "label", label: t("Items.Label"), required: true },
        {
          kind: "number",
          name: "amount",
          label: t("Items.Amount"),
          step: "0.01",
          suffix: t("Entry.Dinars"),
          required: true,
        },
        {
          kind: "date",
          name: "fromDate",
          label: t("Items.From"),
          required: true,
          defaultValue: `${today.slice(0, 7)}-01`,
        },
        { kind: "date", name: "toDate", label: t("Items.To"), notBefore: "fromDate" },
        { kind: "tick", name: "contributable", label: t("Items.Contributable"), defaultValue: "1" },
        { kind: "tick", name: "taxable", label: t("Items.Taxable"), defaultValue: "1" },
      ],
    });
    if (!values) return;
    done(
      await addPayItemAction({
        staffId,
        type: values.type as PayItemType,
        label: values.label,
        amount: centimesOf(values.amount) ?? 0,
        fromDate: values.fromDate,
        toDate: values.toDate,
        contributable: values.contributable === "1",
        taxable: values.taxable === "1",
      }),
    );
  };
  const end = async (id: string) => {
    const values = await ask({
      title: t("Items.EndTitle"),
      confirmLabel: t("Items.End"),
      fields: [{ kind: "date", name: "toDate", label: t("Items.To"), required: true, defaultValue: today }],
    });
    if (values) done(await endPayItemAction({ id, toDate: values.toDate }));
  };
  const remove = async (id: string) => {
    const answer = await askReason({
      title: t("Items.DeleteTitle"),
      reasonLabel: t("Entry.VoidReason"),
      confirmLabel: t("Items.DeleteTitle"),
      confirmTone: "destructive",
    });
    if (answer) done(await deletePayItemAction({ id, reason: answer.reason }));
  };

  return (
    <Card>
      {entryDialog}
      {reasonDialog}
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <CardTitle>{t("Items.Title")}</CardTitle>
            <CardDescription>{t("Items.Hint")}</CardDescription>
          </div>
          {writesPay && (
            <Button variant="outline" size="sm" onClick={() => void add()}>
              <Plus />
              {t("Items.Add")}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <SimpleTable
          rows={data ?? []}
          rowKey={(item) => item.id}
          emptyMessage={t(isPending ? "Loading" : "Items.None")}
          columns={[
            {
              header: t("Items.Type"),
              cell: (item) => (
                <StatusChip
                  tone={item.type === "ALLOWANCE" ? "success" : "warning"}
                  label={t(`ItemTypes.${item.type}`)}
                />
              ),
            },
            { header: t("Items.Label"), cell: (item) => item.label },
            { header: t("Items.Amount"), numeric: true, cell: (item) => <Amount value={item.amount} /> },
            {
              header: t("Items.From"),
              cell: (item) => (
                <span className="whitespace-nowrap">
                  <DayDate date={item.fromDate} /> – {item.toDate ? <DayDate date={item.toDate} /> : <Nothing />}
                </span>
              ),
            },
            {
              header: "",
              cell: (item) => (
                <div className="flex items-center justify-end gap-2">
                  <StatusChip
                    tone={item.inForce ? "success" : "neutral"}
                    label={t(item.inForce ? "Items.InForce" : "Items.Ended")}
                  />
                  {writesPay && !item.toDate && (
                    <Button variant="outline" size="sm" onClick={() => void end(item.id)}>
                      <CalendarX />
                      {t("Items.End")}
                    </Button>
                  )}
                  {writesPay && (
                    <Button
                      variant="outline"
                      size="icon-sm"
                      aria-label={t("Items.DeleteTitle")}
                      title={t("Items.DeleteTitle")}
                      onClick={() => void remove(item.id)}
                    >
                      <Trash2 />
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </CardContent>
    </Card>
  );
}
