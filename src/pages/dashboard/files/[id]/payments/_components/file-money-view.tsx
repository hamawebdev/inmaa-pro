import { CircleDollarSign, Printer, Scale, Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { SectionHeading } from "@/components/screen";
import { StatCard } from "@/components/stat-card";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePaymentMethodLabel } from "@/features/money/components/labels";
import { DueStateChip, PaymentStateChip } from "@/features/money/components/state-chips";
import { MoneyValue } from "@/features/money/components/money-value";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import type { FileMoney } from "@/features/money/services/debts";
import type { DueLine } from "@/features/money/services/dues";
import { useSectionLevel } from "@/hooks/use-session";

/**
 * The file's money, top to bottom: three figures and «حالة الدفع», then what
 * is due and when, the invoices issued, and the payments received with their
 * receipts. The invoice's print is the money section's: it is offered to who
 * can open that section.
 */
export function FileMoneyView({ money: file }: { money: FileMoney }) {
  const t = useTranslations("FileMoney");
  const money = useMoneyText();
  const dates = useDateText();
  const methodLabel = usePaymentMethodLabel();
  const readsMoney = useSectionLevel("MONEY") !== null;
  const { summary } = file;

  const what = (due: DueLine) => {
    if (due.kind === "SCHEDULE" && due.periodStart && due.periodEnd) {
      return t("Period", { from: dates.short(due.periodStart), to: dates.long(due.periodEnd) });
    }
    if (due.kind === "VISIT" && due.periodStart) return t("Visit", { date: dates.long(due.periodStart) });
    return t("Job");
  };

  return (
    <div className="space-y-8 tall:space-y-10">
      <section className="space-y-4 tall:space-y-5">
        <div className="flex flex-wrap items-center gap-3">
          <SectionHeading>{t("State")}</SectionHeading>
          {summary.amount > 0 && <PaymentStateChip state={summary.state} />}
        </div>
        <div className="grid min-w-0 grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 tall:gap-6">
          <StatCard
            tone="requests"
            icon={CircleDollarSign}
            label={t("Amount")}
            value={<MoneyValue amount={summary.amount} compact />}
          />
          <StatCard
            tone="requests"
            icon={Wallet}
            label={t("Paid")}
            value={<MoneyValue amount={summary.paid} compact />}
          />
          <StatCard
            tone="requests"
            icon={Scale}
            label={t("Remaining")}
            value={<MoneyValue amount={summary.remaining} compact />}
            hint={summary.overdue > 0 ? t("OverdueHint", { amount: money(summary.overdue) }) : undefined}
          />
        </div>
      </section>

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("Dues")}</SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.What")}</TableHead>
              <TableHead>{t("Table.DueDate")}</TableHead>
              <TableHead>{t("Table.Amount")}</TableHead>
              <TableHead>{t("Table.Remaining")}</TableHead>
              <TableHead>{t("Table.State")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {file.dues.length === 0 ? (
              <TableEmpty colSpan={5}>{t("NoDues")}</TableEmpty>
            ) : (
              file.dues.map((due) => (
                <TableRow key={due.id}>
                  <TableCell>
                    <div className="max-w-64 min-w-0">
                      <p className="truncate leading-tight font-bold">{what(due)}</p>
                      {due.invoiceNumber && (
                        <p className="truncate text-sm leading-tight text-muted-foreground">
                          {t("Invoice")} <Ltr>{due.invoiceNumber}</Ltr>
                        </p>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">{dates.long(due.dueDate)}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{money(due.amount)}</TableCell>
                  <TableCell className="font-bold whitespace-nowrap tabular-nums">{money(due.remaining)}</TableCell>
                  <TableCell>
                    <DueStateChip state={due.state} daysLate={due.daysLate} />
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("Invoices")}</SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.Invoice")}</TableHead>
              <TableHead>{t("Table.Amount")}</TableHead>
              <TableHead>{t("Table.Remaining")}</TableHead>
              <TableHead>{t("Table.State")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("Table.Actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {file.invoices.length === 0 ? (
              <TableEmpty colSpan={5}>{t("NoInvoices")}</TableEmpty>
            ) : (
              file.invoices.map((invoice) => (
                <TableRow key={invoice.id}>
                  <TableCell>
                    <p className="leading-tight font-bold tabular-nums">
                      <Ltr>{invoice.number}</Ltr>
                    </p>
                    <p className="text-sm leading-tight whitespace-nowrap text-muted-foreground">
                      {dates.long(invoice.issueDate)}
                    </p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{money(invoice.totalTTC)}</TableCell>
                  <TableCell className="font-bold whitespace-nowrap tabular-nums">
                    {invoice.voided ? "—" : money(invoice.remaining)}
                  </TableCell>
                  <TableCell>
                    <PaymentStateChip state={invoice.voided ? null : invoice.paymentState} />
                  </TableCell>
                  <TableCell>
                    {readsMoney && (
                      <div className="flex justify-end">
                        <Button asChild variant="outline" size="sm" title={t("Print")}>
                          <Link to={`/dashboard/invoices/${invoice.id}/print`} aria-label={t("Print")}>
                            <Printer />
                            <span className="hidden xl:inline">{t("Print")}</span>
                          </Link>
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-4 tall:space-y-5">
        <SectionHeading>{t("Payments")}</SectionHeading>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Table.Date")}</TableHead>
              <TableHead>{t("Table.Payer")}</TableHead>
              <TableHead>{t("Table.Amount")}</TableHead>
              <TableHead>{t("Table.Receipt")}</TableHead>
              <TableHead>
                <span className="sr-only">{t("Table.Actions")}</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {file.payments.length === 0 ? (
              <TableEmpty colSpan={5}>{t("NoPayments")}</TableEmpty>
            ) : (
              file.payments.map((payment) => (
                <TableRow key={payment.id}>
                  <TableCell className="whitespace-nowrap">{dates.long(payment.receivedDate)}</TableCell>
                  <TableCell>
                    <div className="max-w-56 min-w-0">
                      <p className="truncate leading-tight">{payment.payerName}</p>
                      <p className="truncate text-sm leading-tight text-muted-foreground">
                        {methodLabel(payment.method)}
                      </p>
                    </div>
                  </TableCell>
                  <TableCell>
                    <p className="leading-tight font-bold whitespace-nowrap tabular-nums">{money(payment.amount)}</p>
                    {payment.stampDuty > 0 && (
                      <p className="text-sm leading-tight whitespace-nowrap text-muted-foreground">
                        {t("WithStamp", { stamp: money(payment.stampDuty) })}
                      </p>
                    )}
                  </TableCell>
                  <TableCell>
                    {payment.voided ? (
                      <StatusChip tone="neutral" label={t("Voided")} />
                    ) : payment.receiptNumber ? (
                      <span className="font-bold tabular-nums">
                        <Ltr>{payment.receiptNumber}</Ltr>
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {payment.receiptId && (
                      <div className="flex justify-end">
                        <Button asChild variant="outline" size="sm" title={t("PrintReceipt")}>
                          <Link
                            to={`/dashboard/payments/receipts/${payment.receiptId}/print`}
                            aria-label={t("PrintReceipt")}
                          >
                            <Printer />
                            <span className="hidden xl:inline">{t("PrintReceipt")}</span>
                          </Link>
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </section>
    </div>
  );
}
