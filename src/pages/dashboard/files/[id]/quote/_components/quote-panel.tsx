import * as React from "react";

import { Check, FileOutput, GitBranchPlus, Printer, Send, Undo2, X } from "lucide-react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ChoiceField, Fact, FieldGrid, TextField } from "@/features/clients/components/part-fields";
import {
  addQuoteFollowUpAction,
  cancelQuoteAction,
  decideQuoteAction,
  issueQuoteAction,
  recordQuoteResultAction,
  reviseQuoteAction,
  submitQuoteAction,
  type QuoteView,
} from "@/features/clients/services/quotes";
import { QUOTE_RESULTS, type QuoteResult } from "@/features/clients/validators/pricing";
import { useCentreClock } from "@/hooks/use-centre-clock";
import { useMoneyText } from "@/hooks/use-money-text";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { filePartHref } from "@/navigation/file-parts";

import { ReasonDialog } from "../../../_components/reason-dialog";

import { QUOTE_RESULT_TONE, QUOTE_STATUS_TONE, quoteLabel } from "./quote-tone";

/**
 * A quote as it stands: its number, where it is on its way to the client, its
 * lines, and the one or two things that can be done to it now.
 *
 * Closest academy screen: the student overview card (students/[id]/page.tsx):
 * facts in a grid under a title with its chips, the actions in the card's head.
 */

type Ask = "APPROVE" | "SEND_BACK" | "CANCEL" | null;

export function QuotePanel({
  fileId,
  quote,
  contract,
  children,
}: {
  fileId: string;
  quote: QuoteView;
  /** Whether the client's yes can take the file to «متعاقد» at once, and why not. */
  contract: { allowed: boolean; refusal: string | null };
  /** The form of a quote being prepared, in place of its lines. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("Quotes");
  const statusLabel = useCodeLabel("FileOptions.QuoteStatus");
  const resultLabel = useCodeLabel("FileOptions.QuoteResult");
  const kindLabel = useCodeLabel("FileOptions.QuoteLineKind");
  const money = useMoneyText();
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = React.useState(false);
  const [ask, setAsk] = React.useState<Ask>(null);
  const [answering, setAnswering] = React.useState(false);
  const can = (step: QuoteView["steps"][number]) => quote.steps.includes(step);

  async function run<T>(act: Promise<{ success: true; data: T } | { success: false; error: string }>, done: string) {
    setBusy(true);
    const result = await act;
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("Failed")));
      return false;
    }
    toast.success(done);
    return true;
  }

  const printable = quote.status === "APPROVED" || quote.status === "ISSUED" || quote.status === "SUPERSEDED";
  return (
    <Card>
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <CardTitle className="text-base">
            {t("QuoteNumber")} <Ltr className="tabular-nums">{quoteLabel(quote)}</Ltr>
          </CardTitle>
          <StatusChip tone={QUOTE_STATUS_TONE[quote.status]} label={statusLabel(quote.status)} />
          {quote.status === "ISSUED" && (
            <StatusChip tone={QUOTE_RESULT_TONE[quote.result]} label={resultLabel(quote.result)} />
          )}
        </div>
        <CardDescription>{t(`StatusHint.${quote.status}`)}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex min-w-0 flex-wrap gap-3">
          {can("SUBMIT") && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => void run(submitQuoteAction({ quoteId: quote.id }), t("Submitted"))}
            >
              <Send />
              {t("Submit")}
            </Button>
          )}
          {can("DECIDE") && (
            <>
              <Button type="button" variant="success" disabled={busy} onClick={() => setAsk("APPROVE")}>
                <Check />
                {t("Approve")}
              </Button>
              <Button type="button" variant="outline" disabled={busy} onClick={() => setAsk("SEND_BACK")}>
                <Undo2 />
                {t("SendBack")}
              </Button>
            </>
          )}
          {can("ISSUE") && (
            <Button
              type="button"
              variant="success"
              disabled={busy}
              onClick={() => void run(issueQuoteAction({ quoteId: quote.id }), t("Issued"))}
            >
              <FileOutput />
              {t("Issue")}
            </Button>
          )}
          {can("ANSWER") && (
            <Button type="button" disabled={busy} onClick={() => setAnswering(true)}>
              <Check />
              {t("Answer")}
            </Button>
          )}
          {can("REVISE") && (
            <Button
              type="button"
              variant="edit"
              disabled={busy}
              onClick={() => void run(reviseQuoteAction({ quoteId: quote.id }), t("Revised"))}
            >
              <GitBranchPlus />
              {t("Revise")}
            </Button>
          )}
          {printable && (
            <Button asChild variant="info">
              <Link to={`${filePartHref(fileId, "quote")}/${encodeURIComponent(quote.id)}/print`}>
                <Printer />
                {t("Print")}
              </Link>
            </Button>
          )}
          {can("CANCEL") && (
            <Button type="button" variant="outline" disabled={busy} onClick={() => setAsk("CANCEL")}>
              <X />
              {t("CancelQuote")}
            </Button>
          )}
        </div>

        {quote.approvalNote && (
          <Fact label={quote.status === "NEEDS_REVIEW" ? t("ManagerAsks") : t("ManagerNote")}>
            {quote.approvalNote}
            {quote.approvedByName ? ` · ${quote.approvedByName}` : ""}
          </Fact>
        )}

        {children ?? (
          <>
            <div className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-4">
              <Fact label={t("Date")} ltr>
                {quote.terms.date}
              </Fact>
              <Fact label={t("ValidUntil")} ltr>
                {quote.terms.validUntil}
              </Fact>
              <Fact label={t("IssuedOn")} ltr>
                {quote.issuedDate}
              </Fact>
              <Fact label={t("Total")} ltr>
                {money(quote.total)}
              </Fact>
              {quote.costTotal !== null && (
                <Fact label={t("Cost")} ltr>
                  {money(quote.costTotal)}
                </Fact>
              )}
              {quote.marginBp !== null && (
                <Fact label={t("Margin")} ltr>
                  {`${(quote.marginBp / 100).toFixed(2).replace(".", ",")} %`}
                </Fact>
              )}
            </div>
            <ul className="divide-y rounded-lg border">
              {quote.lines.map((line, index) => (
                <li key={index} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-6 gap-y-1 p-4">
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{line.label}</span>
                    <span className="ms-3 text-sm text-muted-foreground">{kindLabel(line.kind)}</span>
                  </span>
                  <Ltr className="shrink-0 tabular-nums">{money(line.amount)}</Ltr>
                </li>
              ))}
              {quote.discount > 0 && (
                <li className="flex min-w-0 items-baseline justify-between gap-6 p-4 text-muted-foreground">
                  <span>{t("Discount")}</span>
                  <Ltr className="shrink-0 tabular-nums">{`- ${money(quote.discount)}`}</Ltr>
                </li>
              )}
            </ul>
            {(quote.terms.includedText || quote.terms.excludedText) && (
              <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
                <Fact label={t("Included")}>{quote.terms.includedText}</Fact>
                <Fact label={t("Excluded")}>{quote.terms.excludedText}</Fact>
              </div>
            )}
          </>
        )}

        {quote.status === "ISSUED" && <Answer quote={quote} />}
        {quote.status === "ISSUED" && quote.result !== "ACCEPTED" && quote.steps.length > 0 && (
          <FollowUps quote={quote} busy={busy} run={run} />
        )}
      </CardContent>

      <ReasonDialog
        open={ask !== null}
        title={ask === "APPROVE" ? t("Approve") : ask === "SEND_BACK" ? t("SendBack") : t("CancelQuote")}
        description={
          ask === "APPROVE" ? t("ApproveHint") : ask === "SEND_BACK" ? t("SendBackHint") : t("CancelQuoteHint")
        }
        confirmLabel={ask === "APPROVE" ? t("Approve") : ask === "SEND_BACK" ? t("SendBack") : t("CancelQuote")}
        busy={busy}
        onCancel={() => setAsk(null)}
        onConfirm={(reason) => {
          const asked = ask;
          setAsk(null);
          if (asked === "CANCEL") void run(cancelQuoteAction({ quoteId: quote.id, reason }), t("Cancelled"));
          else if (asked) {
            void run(
              decideQuoteAction({ quoteId: quote.id, approve: asked === "APPROVE", note: reason }),
              asked === "APPROVE" ? t("Approved") : t("SentBack"),
            );
          }
        }}
      />
      {answering && (
        <AnswerDialog
          quote={quote}
          contract={contract}
          busy={busy}
          onClose={() => setAnswering(false)}
          onSave={async (input) => {
            const ok = await run(recordQuoteResultAction({ quoteId: quote.id, ...input }), t("Answered"));
            if (ok) setAnswering(false);
          }}
        />
      )}
    </Card>
  );
}

function Answer({ quote }: { quote: QuoteView }) {
  const t = useTranslations("Quotes");
  if (quote.result === "PENDING") return null;
  return (
    <div className="grid min-w-0 grid-cols-2 gap-4 lg:grid-cols-4">
      <Fact label={t("AnswerDate")} ltr>
        {quote.resultDate}
      </Fact>
      {quote.postponedUntil && (
        <Fact label={t("PostponedUntil")} ltr>
          {quote.postponedUntil}
        </Fact>
      )}
      <Fact label={t("AnswerNote")} className="col-span-2">
        {quote.resultNote}
      </Fact>
    </div>
  );
}

function AnswerDialog({
  quote,
  contract,
  busy,
  onClose,
  onSave,
}: {
  quote: QuoteView;
  contract: { allowed: boolean; refusal: string | null };
  busy: boolean;
  onClose: () => void;
  onSave: (input: {
    result: QuoteResult;
    resultDate: string;
    note: string | null;
    postponedUntil: string | null;
    contract: boolean;
    close: boolean;
  }) => Promise<void>;
}) {
  const t = useTranslations("Quotes");
  const tCommon = useTranslations("Common");
  const tErrors = useErrorMessage();
  const resultLabel = useCodeLabel("FileOptions.QuoteResult");
  const { today } = useCentreClock();
  const [result, setResult] = React.useState<QuoteResult>(quote.result === "PENDING" ? "ACCEPTED" : quote.result);
  const [resultDate, setResultDate] = React.useState(quote.resultDate ?? today);
  const [note, setNote] = React.useState(quote.resultNote ?? "");
  const [postponedUntil, setPostponedUntil] = React.useState(quote.postponedUntil ?? "");
  const [toContract, setToContract] = React.useState(contract.allowed);
  const [close, setClose] = React.useState(false);
  const contractId = React.useId();
  const closeId = React.useId();

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("Answer")}</DialogTitle>
        </DialogHeader>
        <FieldGrid>
          <ChoiceField
            label={t("AnswerResult")}
            value={result}
            options={QUOTE_RESULTS.filter((code) => code !== "PENDING")}
            labelOf={resultLabel}
            onChange={(next) => next && setResult(next)}
          />
          <TextField label={t("AnswerDate")} type="date" value={resultDate} onChange={setResultDate} />
          {result === "POSTPONED" && (
            <TextField label={t("PostponedUntil")} type="date" value={postponedUntil} onChange={setPostponedUntil} />
          )}
          <TextField label={t("AnswerNote")} multiline value={note} onChange={setNote} className="sm:col-span-2" />
        </FieldGrid>
        {result === "ACCEPTED" && (
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Checkbox
                id={contractId}
                checked={toContract && contract.allowed}
                disabled={!contract.allowed}
                onCheckedChange={(checked) => setToContract(checked === true)}
              />
              <Label htmlFor={contractId} className="font-normal">
                {t("ToContract")}
              </Label>
            </div>
            {!contract.allowed && contract.refusal && (
              <p className="text-sm text-muted-foreground">{tErrors(contract.refusal)}</p>
            )}
          </div>
        )}
        {result === "REFUSED" && (
          <div className="flex items-center gap-3">
            <Checkbox id={closeId} checked={close} onCheckedChange={(checked) => setClose(checked === true)} />
            <Label htmlFor={closeId} className="font-normal">
              {t("CloseFile")}
            </Label>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            {tCommon("Cancel")}
          </Button>
          <Button
            type="button"
            variant="success"
            disabled={busy || resultDate === ""}
            onClick={() =>
              void onSave({
                result,
                resultDate,
                note: note.trim() === "" ? null : note.trim(),
                postponedUntil: result === "POSTPONED" && postponedUntil !== "" ? postponedUntil : null,
                contract: result === "ACCEPTED" && toContract && contract.allowed,
                close: result === "REFUSED" && close,
              })
            }
          >
            {t("SaveAnswer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FollowUps({
  quote,
  busy,
  run,
}: {
  quote: QuoteView;
  busy: boolean;
  run: <T>(
    act: Promise<{ success: true; data: T } | { success: false; error: string }>,
    done: string,
  ) => Promise<boolean>;
}) {
  const t = useTranslations("Quotes");
  const { today } = useCentreClock();
  const [date, setDate] = React.useState(today);
  const [note, setNote] = React.useState("");
  const [next, setNext] = React.useState("");

  return (
    <div className="space-y-4 rounded-lg border p-4">
      <p className="font-semibold">{t("FollowUps")}</p>
      {quote.followUps.length === 0 ? (
        <p className="text-muted-foreground">{t("NoFollowUps")}</p>
      ) : (
        <ul className="space-y-2">
          {quote.followUps.map((followUp) => (
            <li key={followUp.id} className="flex min-w-0 flex-wrap items-baseline gap-x-4 gap-y-1">
              <Ltr className="shrink-0 tabular-nums">{followUp.date}</Ltr>
              <span className="min-w-0 break-words">{followUp.note ?? "—"}</span>
              {followUp.nextFollowUpDate && (
                <span className="text-sm text-muted-foreground">
                  {t("NextFollowUp")} <Ltr className="tabular-nums">{followUp.nextFollowUpDate}</Ltr>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <FieldGrid>
        <TextField label={t("FollowUpDate")} type="date" value={date} onChange={setDate} />
        <TextField label={t("NextFollowUp")} type="date" value={next} onChange={setNext} />
        <TextField label={t("FollowUpNote")} value={note} onChange={setNote} className="sm:col-span-2" />
      </FieldGrid>
      <Button
        type="button"
        variant="add"
        disabled={busy || date === ""}
        onClick={async () => {
          const ok = await run(
            addQuoteFollowUpAction({
              quoteId: quote.id,
              date,
              note: note.trim() === "" ? null : note.trim(),
              nextFollowUpDate: next === "" ? null : next,
            }),
            t("FollowUpAdded"),
          );
          if (ok) {
            setNote("");
            setNext("");
          }
        }}
      >
        {t("AddFollowUp")}
      </Button>
    </div>
  );
}
