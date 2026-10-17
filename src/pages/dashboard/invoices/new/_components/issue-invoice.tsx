import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { CircleAlert, FileCheck2, Scale } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { Ltr } from "@/components/ltr";
import { PageActions, SectionHeading } from "@/components/screen";
import { StatusChip } from "@/components/status-chip";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldLabel } from "@/components/ui/field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableEmpty, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { asksClockConfirmation } from "@/features/money/components/clock-jump";
import { useDivisionLabel, usePaymentMethodLabel } from "@/features/money/components/labels";
import { ScreenSkeleton } from "@/features/money/components/screen-skeleton";
import { ReadinessChip } from "@/features/money/components/state-chips";
import { useDateText, useMoneyText } from "@/features/money/components/use-money-text";
import { formatQuantity } from "@/features/money/rules/quantities";
import {
  INVOICE_REFUSALS,
  issueInvoiceAction,
  listInvoiceCandidatesQuery,
  prepareInvoiceQuery,
  type InvoiceCandidate,
  type InvoiceProposal,
  type ProposedVisit,
} from "@/features/money/services/invoices";
import { INVOICES_PATH } from "@/features/money/services/paths";
import { PAYMENT_METHODS, type PaymentMethod } from "@/features/money/validators/option-codes";
import { useCan, useSectionLevel, useSession } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

import { VisitBillingDialog } from "./visit-billing-dialog";

interface Selection {
  fileId: string;
  dueIds: string[];
}

/**
 * The two halves of the issue screen: the dues not invoiced yet, ready ones
 * first, and the invoice the ticked ones make. One invoice is one file: ticking
 * a due of another file starts the choice again.
 *
 * The proposal is computed by the service from the database as it is; issuing
 * computes it again inside its own transaction, so what is issued is never a
 * screen's stale copy.
 */
export function IssueInvoice() {
  const t = useTranslations("IssueInvoice");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const navigate = useNavigate();
  const session = useSession();
  const [confirm, confirmDialog] = useConfirm();
  const money = useMoneyText();
  const level = useSectionLevel("MONEY");
  const issues = useCan("invoice.issue");
  const mayIssue = level === "WRITE" && issues;

  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [method, setMethod] = React.useState<PaymentMethod | null>(null);
  const [busy, setBusy] = React.useState(false);

  const { data: candidates } = useQuery({
    queryKey: [...pathKey(INVOICES_PATH), "candidates"],
    queryFn: () => listInvoiceCandidatesQuery(undefined),
  });
  const { data: proposal } = useQuery({
    queryKey: [...pathKey(INVOICES_PATH), "proposal", selection?.fileId ?? "", ...(selection?.dueIds ?? []), method],
    queryFn: () =>
      prepareInvoiceQuery({ fileId: selection?.fileId ?? "", dueIds: selection?.dueIds ?? [], paymentMethod: method }),
    enabled: selection !== null,
  });

  function toggle(candidate: InvoiceCandidate) {
    if (!selection || selection.fileId !== candidate.fileId) {
      setSelection({ fileId: candidate.fileId, dueIds: [candidate.dueId] });
      setMethod(null);
      return;
    }
    const dueIds = selection.dueIds.includes(candidate.dueId)
      ? selection.dueIds.filter((id) => id !== candidate.dueId)
      : [...selection.dueIds, candidate.dueId];
    setSelection(dueIds.length > 0 ? { fileId: selection.fileId, dueIds } : null);
  }

  async function issue(shown: InvoiceProposal) {
    if (!selection) return;
    const agreed = await confirm({
      title: t("ConfirmTitle", { client: shown.clientName }),
      description: t("ConfirmDescription", { amount: money(shown.totals?.netToPay ?? 0) }),
      confirmLabel: t("Issue"),
    });
    if (!agreed) return;
    setBusy(true);
    const input = { fileId: selection.fileId, dueIds: selection.dueIds, paymentMethod: method ?? shown.paymentMethod };
    let result = await issueInvoiceAction(input);
    if (!result.success && asksClockConfirmation(result.error, session)) {
      const confirmed = await confirm({
        title: t("ClockTitle"),
        description: errorMessage(result.error),
        confirmLabel: t("ClockConfirm"),
      });
      if (confirmed) result = await issueInvoiceAction({ ...input, confirmedClockJump: true });
    }
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("IssueFailed")));
      return;
    }
    toast.success(t("Issued", { number: result.data.number }));
    navigate(`/dashboard/invoices/${result.data.id}/print`);
  }

  if (!candidates) return <ScreenSkeleton />;

  return (
    <div className="space-y-8 tall:space-y-10">
      <section className="space-y-4">
        <SectionHeading>{t("WhatToInvoice")}</SectionHeading>
        <CandidatesTable candidates={candidates} selection={selection} onToggle={toggle} />
      </section>

      {selection && proposal && (
        <section className="space-y-4">
          <SectionHeading>{t("TheInvoice")}</SectionHeading>
          <ProposalCard
            proposal={proposal}
            method={method ?? proposal.paymentMethod}
            onMethod={setMethod}
            mayDecide={mayIssue}
          />
          {mayIssue ? (
            <PageActions>
              <Button asChild variant="outline">
                <Link to="/dashboard/invoices">{tCommon("Cancel")}</Link>
              </Button>
              <Button
                variant="success"
                disabled={busy || proposal.blockers.length > 0}
                onClick={() => void issue(proposal)}
              >
                <FileCheck2 />
                {t("Issue")}
              </Button>
            </PageActions>
          ) : (
            <PageActions note={<p className="text-muted-foreground">{t("ReadOnly")}</p>}>{null}</PageActions>
          )}
        </section>
      )}
      {confirmDialog}
    </div>
  );
}

function CandidatesTable({
  candidates,
  selection,
  onToggle,
}: {
  candidates: readonly InvoiceCandidate[];
  selection: Selection | null;
  onToggle: (candidate: InvoiceCandidate) => void;
}) {
  const t = useTranslations("IssueInvoice");
  const money = useMoneyText();
  const dates = useDateText();
  const divisionLabel = useDivisionLabel();

  const what = (candidate: InvoiceCandidate) => {
    if (candidate.kind === "SCHEDULE" && candidate.periodStart && candidate.periodEnd) {
      return t("Period", { from: dates.short(candidate.periodStart), to: dates.long(candidate.periodEnd) });
    }
    if (candidate.kind === "VISIT" && candidate.periodStart)
      return t("Visit", { date: dates.long(candidate.periodStart) });
    if (candidate.kind === "EXTRA" && candidate.periodStart)
      return t("Extra", { date: dates.long(candidate.periodStart) });
    if (candidate.kind === "INITIAL_JOB") return t("InitialJob");
    return t("Job");
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12">
            <span className="sr-only">{t("Table.Choose")}</span>
          </TableHead>
          <TableHead>{t("Table.Client")}</TableHead>
          <TableHead>{t("Table.What")}</TableHead>
          <TableHead>{t("Table.Visits")}</TableHead>
          <TableHead>{t("Table.Amount")}</TableHead>
          <TableHead>{t("Table.State")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {candidates.length === 0 ? (
          <TableEmpty colSpan={6}>{t("NothingToInvoice")}</TableEmpty>
        ) : (
          candidates.map((candidate) => {
            const checked = selection?.fileId === candidate.fileId && selection.dueIds.includes(candidate.dueId);
            const id = `due-${candidate.dueId}`;
            return (
              <TableRow key={candidate.dueId} data-state={checked ? "selected" : undefined}>
                <TableCell>
                  <Checkbox
                    id={id}
                    checked={checked}
                    onCheckedChange={() => onToggle(candidate)}
                    aria-label={t("Table.ChooseDue", { client: candidate.clientName })}
                  />
                </TableCell>
                <TableCell>
                  <label htmlFor={id} className="block min-w-0 cursor-pointer">
                    <span className="block font-bold">{candidate.clientName}</span>
                    <span className="block text-sm text-muted-foreground">
                      {divisionLabel(candidate.division)} · <Ltr>{candidate.fileNumber}</Ltr>
                    </span>
                  </label>
                </TableCell>
                <TableCell>
                  <span className="block">{what(candidate)}</span>
                  <span className="block text-sm whitespace-nowrap text-muted-foreground">
                    {t("DueOn", { date: dates.long(candidate.dueDate) })}
                  </span>
                </TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {t("VisitsBilled", { billed: candidate.billed, visits: candidate.visits })}
                </TableCell>
                <TableCell className="font-bold whitespace-nowrap tabular-nums">
                  {money(candidate.expectedAmount)}
                </TableCell>
                <TableCell>
                  <ReadinessChip readiness={candidate.readiness} />
                </TableCell>
              </TableRow>
            );
          })
        )}
      </TableBody>
    </Table>
  );
}

function ProposalCard({
  proposal,
  method,
  onMethod,
  mayDecide,
}: {
  proposal: InvoiceProposal;
  method: PaymentMethod;
  onMethod: (method: PaymentMethod) => void;
  /** Whether the reader may take the office's billing decision on a visit (MON-05). */
  mayDecide: boolean;
}) {
  const t = useTranslations("IssueInvoice");
  const [deciding, setDeciding] = React.useState<ProposedVisit | null>(null);
  const errorMessage = useErrorMessage();
  const money = useMoneyText();
  const dates = useDateText();
  const divisionLabel = useDivisionLabel();
  const methodLabel = usePaymentMethodLabel();
  // The file's own methods first, in the order his form ticks them; then the others.
  const methods = [...proposal.fileMethods, ...PAYMENT_METHODS.filter((code) => !proposal.fileMethods.includes(code))];
  const totals = proposal.totals;
  const billedVisits = proposal.visits.filter((visit) => visit.billable).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span>{proposal.clientName}</span>
          <span className="text-base font-normal text-muted-foreground">
            {proposal.division ? divisionLabel(proposal.division) : null} · <Ltr>{proposal.fileNumber}</Ltr>
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {proposal.blockers.length > 0 && (
          <Alert variant="destructive">
            <CircleAlert />
            <AlertTitle>{t("CannotIssue")}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc space-y-1 ps-5">
                {proposal.blockers.map((blocker) => (
                  <li key={blocker}>{errorMessage(INVOICE_REFUSALS[blocker])}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Field>
            <FieldLabel htmlFor="invoice-method">{t("Method")}</FieldLabel>
            <Select value={method} onValueChange={(value) => onMethod(value as PaymentMethod)}>
              <SelectTrigger id="invoice-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {methods.map((code) => (
                  <SelectItem key={code} value={code}>
                    {methodLabel(code)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div>
            <p className="text-sm text-muted-foreground">{t("DueDate")}</p>
            <p className="text-lg font-bold">{dates.long(proposal.dueDate)}</p>
          </div>
          <div>
            <p className="text-sm text-muted-foreground">{t("Statement")}</p>
            <p className="text-lg font-bold">
              {t("StatementVisits", { billed: billedVisits, visits: proposal.visits.length })}
            </p>
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("Lines.Description")}</TableHead>
              <TableHead>{t("Lines.Quantity")}</TableHead>
              <TableHead>{t("Lines.UnitPrice")}</TableHead>
              <TableHead className="text-end">{t("Lines.Amount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {proposal.lines.length === 0 ? (
              <TableEmpty colSpan={4}>{t("NoLines")}</TableEmpty>
            ) : (
              proposal.lines.map((line) => (
                <TableRow key={line.seq}>
                  {/* The line's words are the invoice's own, in Arabic, as they will print. */}
                  <TableCell lang="ar" dir="rtl" className="text-start">
                    {line.description}
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">
                    <Ltr>{formatQuantity(line.quantity)}</Ltr> <span lang="ar">{line.unitLabel}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums">{money(line.unitPrice)}</TableCell>
                  <TableCell className="text-end font-bold whitespace-nowrap tabular-nums">
                    <Ltr>{money(line.amount)}</Ltr>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>

        {totals && (
          <dl className="ms-auto grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-2 text-lg">
            {totals.discountAmount > 0 && (
              <>
                <dt className="text-muted-foreground">{t("Totals.Gross")}</dt>
                <dd className="text-end tabular-nums">{money(totals.grossAmount)}</dd>
                <dt className="text-muted-foreground">{t("Totals.Discount")}</dt>
                <dd className="text-end tabular-nums">
                  <Ltr>{money(-totals.discountAmount)}</Ltr>
                </dd>
              </>
            )}
            {proposal.taxMode === "VAT" && (
              <>
                <dt className="text-muted-foreground">{t("Totals.HT")}</dt>
                <dd className="text-end tabular-nums">{money(totals.totalHT)}</dd>
                <dt className="text-muted-foreground">{t("Totals.Vat")}</dt>
                <dd className="text-end tabular-nums">{money(totals.vatAmount)}</dd>
              </>
            )}
            <dt className="font-bold">{t("Totals.TTC")}</dt>
            <dd className="text-end font-bold tabular-nums">{money(totals.totalTTC)}</dd>
            {totals.stampDuty > 0 && (
              <>
                <dt className="text-muted-foreground">{t("Totals.Stamp")}</dt>
                <dd className="text-end tabular-nums">{money(totals.stampDuty)}</dd>
                <dt className="font-bold">{t("Totals.Net")}</dt>
                <dd className="text-end font-bold tabular-nums">{money(totals.netToPay)}</dd>
              </>
            )}
          </dl>
        )}

        {proposal.visits.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold">{t("Statement")}</h3>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("StatementTable.Date")}</TableHead>
                  <TableHead>{t("StatementTable.Completion")}</TableHead>
                  <TableHead>{t("StatementTable.Billed")}</TableHead>
                  {mayDecide && (
                    <TableHead className="w-12">
                      <span className="sr-only">{t("StatementTable.Decision")}</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {proposal.visits.map((visit) => (
                  <TableRow key={visit.visitId}>
                    <TableCell className="whitespace-nowrap">{dates.long(visit.visitDate)}</TableCell>
                    <TableCell>
                      {/* The statement's words, as they will print. */}
                      <span lang="ar" dir="rtl" className="block">
                        {visit.completion}
                      </span>
                      {visit.remark && (
                        <span lang="ar" dir="rtl" className="block text-sm text-muted-foreground">
                          {visit.remark}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <StatusChip
                        tone={visit.billable ? "success" : "neutral"}
                        label={t(visit.billable ? "StatementTable.Yes" : "StatementTable.No")}
                      />
                    </TableCell>
                    {mayDecide && (
                      <TableCell>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => setDeciding(visit)}
                          aria-label={t("StatementTable.DecideFor", { date: dates.long(visit.visitDate) })}
                        >
                          <Scale />
                          {t("StatementTable.Decision")}
                        </Button>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
        <VisitBillingDialog visit={deciding} onClose={() => setDeciding(null)} />
      </CardContent>
    </Card>
  );
}
