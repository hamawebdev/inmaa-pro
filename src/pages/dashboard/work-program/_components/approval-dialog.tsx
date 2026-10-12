import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { OctagonAlert, ShieldAlert } from "lucide-react";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RuleOverrideInput } from "@/features/operations/services/assignment";
import {
  WORK_PROGRAM_PATH,
  previewVisitMoveQuery,
  type MoveTarget,
  type WeekVisit,
} from "@/features/operations/services/week-programme";
import { useCodeLabel } from "@/i18n/use-code-label";
import { pathKey } from "@/lib/compat/revalidate";

import { LEVEL_LOOK } from "./visit-look";

/** A move the rules refused until the manager passes them. */
export interface ApprovalRequest {
  visit: WeekVisit;
  target: MoveTarget;
  /** The new day, as the screen words it («الثلاثاء 13 أكتوبر»). */
  dayLabel: string;
}

/**
 * The manager's approval of a move (scope section 5): what the rules say about
 * each worker at the new time, his reason, and the labour inspector's
 * derogation when a woman would work at night. Kept by the service as one
 * RuleOverride row per rule passed, and in the log.
 */
export function ApprovalDialog({
  request,
  onCancel,
  onApprove,
}: {
  request: ApprovalRequest | null;
  onCancel: () => void;
  /** Sends the move again with the approval; resolves when the answer is in. */
  onApprove: (override: RuleOverrideInput) => Promise<void>;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent className="sm:max-w-xl">
        {request && (
          <ApprovalForm
            key={`${request.visit.id}-${request.target.date}-${request.target.startTime}`}
            request={request}
            onCancel={onCancel}
            onApprove={onApprove}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ApprovalForm({
  request,
  onCancel,
  onApprove,
}: {
  request: ApprovalRequest;
  onCancel: () => void;
  onApprove: (override: RuleOverrideInput) => Promise<void>;
}) {
  const t = useTranslations("WeekProgramme.Approval");
  const ruleLabel = useCodeLabel("WorkRules");
  const [reason, setReason] = useState("");
  const [derogationRef, setDerogationRef] = useState("");
  const [sending, setSending] = useState(false);
  const { target } = request;

  const preview = useQuery({
    queryKey: [...pathKey(WORK_PROGRAM_PATH), "move-preview", target.visitId, target.date, target.startTime],
    queryFn: () => previewVisitMoveQuery(target),
    staleTime: 0,
  });
  const checks = preview.data?.checks ?? [];
  const refused = checks.some((check) => check.findings.some((finding) => finding.level === "REFUSED"));
  const needsDerogation = checks.some((check) =>
    check.findings.some((finding) => finding.code === "NIGHT_WOMAN" && finding.level === "NEEDS_MANAGER"),
  );
  const ready = !refused && reason.trim() !== "" && (!needsDerogation || derogationRef.trim() !== "");

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready) return;
    setSending(true);
    try {
      await onApprove({ reason: reason.trim(), derogationRef: needsDerogation ? derogationRef.trim() : null });
    } finally {
      setSending(false);
    }
  };

  return (
    <form onSubmit={submit} className="grid min-w-0 gap-5">
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <ShieldAlert aria-hidden className="size-5 text-warning-ink" />
          {t("Title")}
        </DialogTitle>
        <DialogDescription>{t("Description")}</DialogDescription>
      </DialogHeader>

      <dl className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 rounded-lg bg-muted/60 px-4 py-3 text-sm">
        <dt className="text-muted-foreground">{t("Visit")}</dt>
        <dd className="min-w-0 truncate font-bold">
          <bdi>{request.visit.siteLabel}</bdi> · <Ltr>{request.visit.number}</Ltr>
        </dd>
        <dt className="text-muted-foreground">{t("NewSlot")}</dt>
        <dd className="min-w-0 font-bold">
          {request.dayLabel} <Ltr>{target.startTime}</Ltr>
        </dd>
      </dl>

      <div className="grid min-w-0 gap-2">
        <p className="text-sm font-bold">{t("Rules")}</p>
        {preview.isPending ? (
          <p className="text-sm text-muted-foreground">{t("Checking")}</p>
        ) : (
          <ul className="grid min-w-0 gap-2">
            {checks
              .filter((check) => check.findings.length > 0)
              .map((check) => (
                <li key={check.workerId} className="grid min-w-0 gap-1.5 rounded-lg border border-border p-3">
                  <span className="font-bold">
                    <bdi>{`${check.firstName} ${check.lastName}`.trim()}</bdi>{" "}
                    <Ltr className="text-sm font-normal text-muted-foreground">{check.number}</Ltr>
                  </span>
                  <span className="flex min-w-0 flex-wrap gap-1.5">
                    {check.findings.map((finding) => (
                      <StatusChip
                        key={`${finding.code}-${finding.date ?? finding.weekStart ?? ""}`}
                        tone={LEVEL_LOOK[finding.level].tone}
                        icon={LEVEL_LOOK[finding.level].icon}
                        label={ruleLabel(finding.code)}
                      />
                    ))}
                  </span>
                </li>
              ))}
          </ul>
        )}
        {refused && (
          <p className="flex items-start gap-2 text-sm font-semibold text-destructive">
            <OctagonAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {t("Refused")}
          </p>
        )}
      </div>

      <div className="grid min-w-0 gap-2">
        <Label htmlFor="move-approval-reason">{t("Reason")}</Label>
        <Textarea
          id="move-approval-reason"
          rows={2}
          value={reason}
          disabled={refused}
          onChange={(event) => setReason(event.target.value)}
        />
      </div>
      {needsDerogation && (
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="move-approval-derogation">{t("Derogation")}</Label>
          <Input
            id="move-approval-derogation"
            dir="ltr"
            value={derogationRef}
            disabled={refused}
            onChange={(event) => setDerogationRef(event.target.value)}
          />
        </div>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={sending}>
          {t("Cancel")}
        </Button>
        <Button type="submit" disabled={!ready} loading={sending}>
          {t("Confirm")}
        </Button>
      </DialogFooter>
    </form>
  );
}
