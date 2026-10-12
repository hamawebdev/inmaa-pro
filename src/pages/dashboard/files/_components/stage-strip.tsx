import * as React from "react";

import { ArrowLeft, Check, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatSheetDate } from "@/features/clients/forms/answers";
import { labelKeyOf } from "@/features/clients/forms/screen-labels";
import type { FileHub, StageOption } from "@/features/clients/services/file-reads";
import { moveFileStageAction, STAGE_REFUSALS } from "@/features/clients/services/files";
import { FILE_STAGES, type FileStage } from "@/features/clients/validators/option-lists";
import { useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { useCodeLabel } from "@/i18n/use-code-label";
import { cn } from "@/lib/utils";

import { ReasonDialog } from "./reason-dialog";
import { stageTone } from "./stage-tone";

/**
 * Where the file stands among his five stages, what it can do next, and why
 * not yet. Going back is the manager's correction, with a reason.
 *
 * Closest academy screen: the student overview's header block
 * (students/[id]/overview/page.tsx); the steps are drawn as the newer
 * generation's chips.
 */
export function StageStrip({ hub }: { hub: FileHub }) {
  const t = useTranslations("FileHub");
  const tForm = useTranslations("FileForm");
  const stageLabel = useCodeLabel("Options.FileStage");
  const closeLabel = useCodeLabel("FileOptions.CloseReason");
  const errorMessage = useErrorMessage();
  const locale = useLocale();
  const [confirm, confirmDialog] = useConfirm();
  const [back, setBack] = React.useState<FileStage | null>(null);
  const [busy, setBusy] = React.useState(false);
  const current = FILE_STAGES.indexOf(hub.stage);
  // A role that only reads the requests sees where the file stands, not the moves its service would refuse.
  const canWrite = useSectionLevel("REQUESTS") === "WRITE";

  async function move(to: FileStage, reason?: string) {
    setBusy(true);
    const result = await moveFileStageAction({ fileId: hub.id, to, reason });
    setBusy(false);
    if (!result.success) {
      toast.error(errorMessage(result.error, t("MoveFailed")));
      return;
    }
    setBack(null);
    toast.success(t("Moved", { stage: stageLabel(to) }));
  }

  async function forward(option: StageOption) {
    const contract = option.to === "CONTRACTED";
    const ok = await confirm({
      title: contract ? t("ConfirmContractTitle") : t("ConfirmMove", { stage: stageLabel(option.to) }),
      description: contract ? t("ConfirmContract") : undefined,
      confirmLabel: t("MoveTo", { stage: stageLabel(option.to) }),
    });
    if (ok) await move(option.to);
  }

  /** Why a stage is not open yet, in words, with what is missing on the form. */
  function why(option: StageOption): string | null {
    if (option.allowed || !option.refusal) return null;
    const sentence = errorMessage(STAGE_REFUSALS[option.refusal]) ?? "";
    if (option.missing.length === 0) return sentence;
    const fields = option.missing
      .map((key) => (key === "amountBasis" ? t("AmountBasis") : tForm(`Labels.${labelKeyOf(hub.kind, key)}`)))
      .join(locale === "ar" ? "، " : ", ");
    return `${sentence} ${t("Missing", { fields })}`;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-3">
          <CardTitle className="text-base">{t("StageTitle")}</CardTitle>
          <StatusChip tone={stageTone(hub.stage)} label={stageLabel(hub.stage)} />
          {hub.isReturning && <StatusChip tone="neutral" label={t("Returning")} />}
          {hub.closed && (
            <StatusChip tone="danger" label={t("ClosedSince", { reason: closeLabel(hub.closeReason ?? "OTHER") })} />
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <ol className="flex min-w-0 flex-wrap items-center gap-2">
          {FILE_STAGES.map((stage, index) => {
            const done = index < current;
            const here = index === current;
            return (
              <li key={stage} className="flex items-center gap-2">
                {index > 0 && <ArrowLeft aria-hidden className="size-4 text-muted-foreground ltr:rotate-180" />}
                <span
                  aria-current={here ? "step" : undefined}
                  className={cn(
                    "border-app inline-flex items-center gap-2 rounded-full px-3 py-1 text-base",
                    here && "border-section-requests bg-section-requests/12 font-bold text-section-requests",
                    done && "border-success/35 bg-success/10 text-success",
                    !here && !done && "border-border text-muted-foreground",
                  )}
                >
                  {done ? <Check aria-hidden className="size-4" /> : <Ltr className="text-sm">{index + 1}</Ltr>}
                  {stageLabel(stage)}
                </span>
              </li>
            );
          })}
        </ol>
        <p className="text-sm text-muted-foreground">
          {t("StageSince", { date: formatSheetDate(hub.stageChangedOn) })}
        </p>

        {canWrite && !hub.closed && hub.nextStages.length > 0 && (
          <div className="space-y-3">
            <h3 className="text-base font-bold">{t("NextStage")}</h3>
            {hub.nextStages.map((option, index) => (
              <div key={option.to} className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                <Button
                  type="button"
                  variant={index === 0 ? "default" : "outline"}
                  disabled={!option.allowed || busy}
                  onClick={() => void forward(option)}
                >
                  {t("MoveTo", { stage: stageLabel(option.to) })}
                </Button>
                {!option.allowed && (
                  <p className="min-w-0 flex-1 basis-72 text-base text-muted-foreground">{why(option)}</p>
                )}
              </div>
            ))}
          </div>
        )}

        {canWrite && !hub.closed && hub.backStages.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {hub.backStages.map((stage) => (
              <Button
                key={stage}
                type="button"
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() => setBack(stage)}
              >
                <Undo2 />
                {t("MoveBack", { stage: stageLabel(stage) })}
              </Button>
            ))}
          </div>
        )}
      </CardContent>
      {confirmDialog}
      <ReasonDialog
        open={back !== null}
        title={back ? t("BackTitle", { stage: stageLabel(back) }) : ""}
        description={t("BackDescription")}
        confirmLabel={back ? t("MoveBack", { stage: stageLabel(back) }) : ""}
        busy={busy}
        onCancel={() => setBack(null)}
        onConfirm={(reason) => {
          if (back) void move(back, reason);
        }}
      />
    </Card>
  );
}
