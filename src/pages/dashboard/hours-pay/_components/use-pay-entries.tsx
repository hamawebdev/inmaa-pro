import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useEntryDialog } from "@/features/people/components/entry-dialog";
import { centimesOf } from "@/features/people/components/format";
import { isolate } from "@/features/people/components/may";
import { useReasonDialog } from "@/features/people/components/reason-dialog";
import {
  listPayPeopleQuery,
  recordDebtAction,
  recordPayoutAction,
  voidPayoutAction,
} from "@/features/people/services/payouts";
import { PAYMENT_METHODS, type DebtReason, type PaymentMethod } from "@/features/people/validators/staff-codes";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useMoneyText } from "@/hooks/use-money-text";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

/** What the office types as a debt, and what takes one off. */
const DEBT_CHOICES: readonly DebtReason[] = ["DAMAGE", "LOSS", "OVERPAYMENT", "OTHER", "REPAID_IN_CASH", "WRITTEN_OFF"];

/**
 * The entries of the pay screens, each a short dialog: an advance, a wage paid
 * on a closed payslip, a debt or a repayment, and voiding a payment with its
 * reason. One hook, so that the list of advances, a payslip and a person's pay
 * page ask the same questions.
 *
 * Closest academy component: the payout and debt dialogs of its finance pages.
 */
export function usePayEntries({ withPeople = false }: { withPeople?: boolean } = {}) {
  const t = useTranslations("Pay");
  const methodLabel = useCodeLabel("Options.PaymentMethod");
  const errorMessage = useErrorMessage();
  const money = useMoneyText();
  const { today } = useCentreClock();
  const [ask, entryDialog] = useEntryDialog();
  const [askReason, reasonDialog] = useReasonDialog();
  const { data: people } = useQuery({
    queryKey: [...pathKey("/dashboard/hours-pay"), "people"],
    queryFn: () => listPayPeopleQuery(undefined),
    enabled: withPeople,
  });

  const methods = PAYMENT_METHODS.map((code) => ({ value: code, label: methodLabel(code) }));
  const amountField = (defaultValue = "") =>
    ({
      kind: "number",
      name: "amount",
      label: t("Entry.Amount"),
      step: "0.01",
      suffix: t("Entry.Dinars"),
      required: true,
      defaultValue,
    }) as const;

  /** An advance to a person: goes on the ledger, to be taken back on the next payslip. */
  const advance = async (staffId?: string) => {
    const values = await ask({
      title: t("Entry.AdvanceTitle"),
      description: t("Entry.AdvanceDescription"),
      confirmLabel: t("Entry.AdvanceConfirm"),
      fields: [
        ...(staffId
          ? []
          : [
              {
                kind: "choice" as const,
                name: "staffId",
                label: t("Entry.Person"),
                required: true,
                options: (people ?? []).map((person) => ({
                  value: person.id,
                  label: `${person.name} · ${isolate(person.number)}`,
                })),
              },
            ]),
        { kind: "date", name: "date", label: t("Entry.Date"), required: true, defaultValue: today },
        amountField(),
        {
          kind: "choice",
          name: "method",
          label: t("Entry.Method"),
          required: true,
          options: methods,
          defaultValue: "CASH",
        },
        { kind: "note", name: "note", label: t("Entry.Note") },
      ],
    });
    if (!values) return;
    const result = await recordPayoutAction({
      staffId: staffId ?? values.staffId,
      date: values.date,
      amount: centimesOf(values.amount) ?? 0,
      kind: "ADVANCE",
      wageMethod: values.method as PaymentMethod,
      note: values.note,
    });
    if (result.success) toast.success(t("Entry.AdvanceSaved", { number: isolate(result.data.number) }));
    else toast.error(errorMessage(result.error, t("Entry.Failed")));
  };

  /** A wage paid on a closed payslip: all that is left by default, or a part of it. */
  const payWage = async (payslip: { id: string; staffId: string; left: number }) => {
    const values = await ask({
      title: t("Entry.WageTitle"),
      description: t("Entry.WageDescription", { left: isolate(money(payslip.left)) }),
      confirmLabel: t("Entry.WageConfirm"),
      fields: [
        { kind: "date", name: "date", label: t("Entry.Date"), required: true, defaultValue: today },
        amountField(String(payslip.left / 100)),
        {
          kind: "choice",
          name: "method",
          label: t("Entry.Method"),
          required: true,
          options: methods,
          defaultValue: "CASH",
        },
        { kind: "note", name: "note", label: t("Entry.Note") },
      ],
    });
    if (!values) return;
    const result = await recordPayoutAction({
      staffId: payslip.staffId,
      date: values.date,
      amount: centimesOf(values.amount) ?? 0,
      kind: "WAGE",
      wageMethod: values.method as PaymentMethod,
      payslipId: payslip.id,
      note: values.note,
    });
    if (result.success) toast.success(t("Entry.WageSaved", { number: isolate(result.data.number) }));
    else toast.error(errorMessage(result.error, t("Entry.Failed")));
  };

  /** A debt typed by the office, a repayment in cash, or a debt written off. */
  const debt = async (staffId: string) => {
    const values = await ask({
      title: t("Entry.DebtTitle"),
      confirmLabel: t("Entry.DebtConfirm"),
      fields: [
        {
          kind: "choice",
          name: "reason",
          label: t("Entry.DebtReason"),
          required: true,
          options: DEBT_CHOICES.map((code) => ({ value: code, label: t(`DebtReasons.${code}`) })),
        },
        { kind: "date", name: "date", label: t("Entry.Date"), required: true, defaultValue: today },
        amountField(),
        { kind: "note", name: "note", label: t("Entry.DebtNote"), required: true },
      ],
    });
    if (!values) return;
    const result = await recordDebtAction({
      staffId,
      date: values.date,
      reason: values.reason as DebtReason,
      amount: centimesOf(values.amount) ?? 0,
      note: values.note,
    });
    if (result.success) toast.success(t("Entry.DebtSaved"));
    else toast.error(errorMessage(result.error, t("Entry.Failed")));
  };

  /** Voids a payment, with the reason the log keeps. */
  const voidPayout = async (payout: { id: string; number: string }) => {
    const answer = await askReason({
      title: t("Entry.VoidTitle", { number: isolate(payout.number) }),
      description: t("Entry.VoidDescription"),
      reasonLabel: t("Entry.VoidReason"),
      confirmLabel: t("Entry.VoidConfirm"),
      confirmTone: "destructive",
    });
    if (!answer) return;
    const result = await voidPayoutAction({ payoutId: payout.id, reason: answer.reason });
    if (result.success) toast.success(t("Entry.Voided"));
    else toast.error(errorMessage(result.error, t("Entry.Failed")));
  };

  return {
    advance,
    payWage,
    debt,
    voidPayout,
    dialogs: (
      <>
        {entryDialog}
        {reasonDialog}
      </>
    ) as React.ReactNode,
  };
}
