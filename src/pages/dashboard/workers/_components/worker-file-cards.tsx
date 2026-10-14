import { RefreshCw } from "lucide-react";
import * as React from "react";

import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { createEmptyUploadSelection, MediaUploadField, type UploadSelection } from "@/components/media-upload-field";
import { StatusChip, type StatusTone } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { useMay } from "@/features/people/components/may";
import { STATUS_TONE } from "@/features/people/components/status-tones";
import type { DocumentState } from "@/features/people/rules/documents";
import { setWorkerPhotoAction, setWorkerSignedScanAction } from "@/features/people/services/worker-files";
import type { StaffDocumentType } from "@/features/people/validators/staff-codes";
import type { WorkerFile } from "@/features/people/services/worker-reads";
import { useErrorMessage } from "@/i18n/errors";
import { checkUploadFile, PHOTO_UPLOAD_RULE, RECEIPT_UPLOAD_RULE } from "@/lib/uploads";
import { saveManagedUpload, saveUploadCopy } from "@/server/uploads";
import { staffName } from "@/lib/text/names";

/**
 * The cards of a worker's file that are not his form: her photo and the scan
 * of her signed pages, her documents at a glance, the decisions of management
 * and the history of her status.
 *
 * Closest academy screen: the employee file (employees/[id]), whose form holds
 * the photo and CV fields (`MediaUploadField`); the chips are the newer
 * generation's.
 */

const DOCUMENT_TONE: Record<DocumentState, StatusTone> = {
  VALID: "success",
  NO_EXPIRY: "success",
  EXPIRING: "warning",
  EXPIRED: "danger",
  MISSING: "neutral",
};

/** Her photo (an ordinary image) and the scan of her signed form (restricted: saved as a copy, never shown). */
export function WorkerAttachmentsCard({ file }: { file: WorkerFile }) {
  const t = useTranslations("Workers.File");
  const errorMessage = useErrorMessage();
  const [photo, setPhoto] = React.useState<UploadSelection>(createEmptyUploadSelection);
  const [scanError, setScanError] = React.useState<string>();
  const [busy, setBusy] = React.useState(false);
  const scanInput = React.useRef<HTMLInputElement>(null);
  const canWrite = useMay("staff.write");
  const readsHealth = useMay("staff.health.read");
  const readsScore = useMay("staff.hiringScore.read");
  const canScan = readsHealth || readsScore;
  const subject = { kind: "WORKER" as const, id: file.id, label: staffName(file.values) };

  const report = (result: { success: boolean; error?: string }, done: string) => {
    if (result.success) toast.success(done);
    else toast.error(errorMessage(result.error, t("FileFailed")));
  };

  const savePhoto = async () => {
    setBusy(true);
    try {
      // The bytes first, then the record: a file cannot be rolled back with a transaction.
      const url = photo.file
        ? await saveManagedUpload({
            entity: "StaffMember",
            field: "photoUrl",
            file: photo.file,
            rule: PHOTO_UPLOAD_RULE,
          })
        : null;
      report(await setWorkerPhotoAction({ id: file.id, url }), t("PhotoSaved"));
      setPhoto(createEmptyUploadSelection());
    } catch (error) {
      toast.error(errorMessage(error instanceof Error ? error.message : null, t("FileFailed")));
    } finally {
      setBusy(false);
    }
  };

  const saveScan = async (picked: File | undefined) => {
    if (!picked) return;
    const problem = checkUploadFile(picked, RECEIPT_UPLOAD_RULE);
    if (problem) {
      setScanError(t(problem === "type" ? "ScanWrongType" : "ScanTooLarge"));
      return;
    }
    setScanError(undefined);
    setBusy(true);
    try {
      const url = await saveManagedUpload({
        entity: "StaffConfidential",
        field: "signedFormScanUrl",
        file: picked,
        rule: RECEIPT_UPLOAD_RULE,
        restrictedCapability: "staff.health.read",
      });
      report(await setWorkerSignedScanAction({ id: file.id, url }), t("ScanSaved"));
    } catch (error) {
      toast.error(errorMessage(error instanceof Error ? error.message : null, t("FileFailed")));
    } finally {
      setBusy(false);
      if (scanInput.current) scanInput.current.value = "";
    }
  };

  const copyScan = async () => {
    if (!file.signedScan) return;
    const result = await saveUploadCopy(file.signedScan.url, t("ScanCopyTitle"), { owner: "PEOPLE", subject });
    if (result.success) toast.success(t("ScanCopied", { path: result.path }));
    else if (!result.cancelled) toast.error(errorMessage(result.error, t("FileFailed")));
  };

  return (
    <Card id="worker-card-attachments">
      <CardHeader>
        <CardTitle className="text-base">{t("AttachmentsTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div className="grid content-start gap-3">
          <MediaUploadField
            label={t("Photo")}
            rule={PHOTO_UPLOAD_RULE}
            existingUrl={file.photoUrl}
            value={photo}
            onChange={setPhoto}
            disabled={!canWrite || busy}
            previewAlt={subject.label}
          />
          {(photo.file || photo.removeExisting) && (
            <div>
              <Button type="button" variant="success" size="sm" disabled={busy} onClick={savePhoto}>
                {t("SavePhoto")}
              </Button>
            </div>
          )}
        </div>

        <Field data-invalid={Boolean(scanError)}>
          <FieldLabel htmlFor="worker-signed-scan">{t("Scan")}</FieldLabel>
          <Input
            id="worker-signed-scan"
            ref={scanInput}
            type="file"
            accept={RECEIPT_UPLOAD_RULE.accept}
            disabled={!canScan || busy}
            onChange={(event) => saveScan(event.target.files?.[0])}
          />
          <FieldDescription>{t("ScanHint")}</FieldDescription>
          {file.signedScan && (
            <div className="border-app flex flex-wrap items-center justify-between gap-3 rounded-md border-border bg-muted/10 px-3 py-2">
              <p className="min-w-0 truncate text-sm font-medium">
                {file.signedScan.originalName ?? t("ScanStored")}{" "}
                <Ltr className="text-muted-foreground">{file.signedScan.createdAt.slice(0, 10)}</Ltr>
              </p>
              {canScan && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={copyScan}>
                    {t("ScanCopy")}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={async () =>
                      report(await setWorkerSignedScanAction({ id: file.id, url: null }), t("ScanRemoved"))
                    }
                  >
                    {t("ScanRemove")}
                  </Button>
                </div>
              )}
            </div>
          )}
          <FieldError>{scanError}</FieldError>
        </Field>
      </CardContent>
    </Card>
  );
}

/** «الوثائق المسلمة» at a glance: which are handed in, which expire, which have expired. */
export function WorkerDocumentsCard({
  file,
  onRenew,
}: {
  file: WorkerFile;
  /** A document handed in again: a new certificate for one that expires. */
  onRenew?: (type: StaffDocumentType) => void;
}) {
  const t = useTranslations("Workers.File");
  const tForm = useTranslations("WorkerForm");
  return (
    <Card id="worker-card-documents-state">
      <CardHeader>
        <CardTitle className="text-base">{tForm("Labels.documentsDelivered")}</CardTitle>
        <CardDescription>{t("DocumentsHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-2 sm:grid-cols-2">
          {file.documents.map((document) => (
            <li
              key={document.type}
              className="border-app flex flex-wrap items-center justify-between gap-2 rounded-lg border-border px-4 py-2"
            >
              <span className="min-w-0">{tForm(`Documents.${document.type}`)}</span>
              <span className="flex items-center gap-2">
                {document.expiryDate && <Ltr className="text-muted-foreground tabular-nums">{document.expiryDate}</Ltr>}
                <StatusChip tone={DOCUMENT_TONE[document.state]} label={t(`DocumentStates.${document.state}`)} />
                {onRenew && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon-sm"
                    aria-label={t("Renew")}
                    title={t("Renew")}
                    onClick={() => onRenew(document.type)}
                  >
                    <RefreshCw />
                  </Button>
                )}
              </span>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

/** «قرار الإدارة» over time, and the days her status changed. */
export function WorkerHistoryCard({ file }: { file: WorkerFile }) {
  const t = useTranslations("Workers");
  const tForm = useTranslations("WorkerForm");
  return (
    <Card id="worker-card-history">
      <CardHeader>
        <CardTitle className="text-base">{t("File.HistoryTitle")}</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <div>
          <p className="mb-2 font-bold">{tForm("Labels.hiringDecision")}</p>
          {file.decisions.length === 0 ? (
            <p className="text-muted-foreground">{t("File.NoDecision")}</p>
          ) : (
            <ul className="grid gap-2">
              {file.decisions.map((decision, index) => (
                <li key={index} className="border-app rounded-lg border-border px-4 py-2">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    {tForm(`Decisions.${decision.decision}`)}
                    <Ltr className="font-normal text-muted-foreground tabular-nums">{decision.decisionDate}</Ltr>
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {decision.decidedBy ?? ""}
                    {decision.trialEndDate && (
                      <>
                        {decision.decidedBy ? " · " : ""}
                        {t("File.TrialUntil")} <Ltr className="tabular-nums">{decision.trialEndDate}</Ltr>
                      </>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className="mb-2 font-bold">{t("File.StatusHistory")}</p>
          <ul className="grid gap-2">
            {file.history.map((event, index) => (
              <li
                key={index}
                className="border-app flex flex-wrap items-center gap-2 rounded-lg border-border px-4 py-2"
              >
                <Ltr className="text-muted-foreground tabular-nums">{event.date}</Ltr>
                <StatusChip
                  tone={STATUS_TONE[event.toStatus as keyof typeof STATUS_TONE] ?? "neutral"}
                  label={t.has(`Statuses.${event.toStatus}`) ? t(`Statuses.${event.toStatus}`) : event.toStatus}
                />
                {event.reason && <span className="text-sm text-muted-foreground">{event.reason}</span>}
              </li>
            ))}
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}
