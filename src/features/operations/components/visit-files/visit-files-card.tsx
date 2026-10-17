import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Camera, Download, FileUp, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { PHOTO_UPLOAD_RULE, RECEIPT_UPLOAD_RULE, isPdfUrl } from "@/lib/uploads";
import { useUploadSrc } from "@/lib/use-upload-src";
import { saveManagedUpload, saveUploadCopy } from "@/server/uploads";

import { VISITS_PATH } from "../../services/paths";
import {
  addVisitPhotoAction,
  getVisitFilesQuery,
  setVisitScanAction,
  type VisitScanField,
} from "../../services/visit-files";

/**
 * What is attached to a visit (#13, #15): the supervisor's photos at the site, only with the client's agreement
 * to photos there, and the scans of the returned order and of the sign-off slip. Nothing opens outside the
 * program: an image shows here, a PDF is saved as a copy.
 */
export function VisitFilesCard({ visitId }: { visitId: string }) {
  const t = useTranslations("VisitFiles");
  const errorMessage = useErrorMessage();
  const writes = useSectionLevel("REQUESTS") === "WRITE";
  const typesOrders = useCan("visit.enterOrder");
  const [busy, setBusy] = React.useState(false);
  const photoInput = React.useRef<HTMLInputElement>(null);
  const files = useQuery({
    queryKey: [...pathKey(`${VISITS_PATH}/${visitId}`), "files"],
    queryFn: () => getVisitFilesQuery({ visitId }),
  });
  const data = files.data;

  const addPhoto = async (file: File) => {
    if (!data?.supervisor) return;
    setBusy(true);
    try {
      const url = await saveManagedUpload({
        entity: "Visit",
        field: "photos",
        file,
        rule: PHOTO_UPLOAD_RULE,
        photo: { siteId: data.siteId, takenByEmployeeId: data.supervisor.id },
      });
      const result = await addVisitPhotoAction({ visitId, url });
      if (!result.success) toast.error(errorMessage(result.error, t("PhotoFailed")));
      else toast.success(t("PhotoAdded"));
    } catch (error) {
      toast.error(errorMessage(error instanceof Error ? error.message : "", t("PhotoFailed")));
    } finally {
      setBusy(false);
    }
  };

  const setScan = async (field: VisitScanField, file: File | null) => {
    setBusy(true);
    try {
      const url = file
        ? await saveManagedUpload({ entity: "VisitReport", field, file, rule: RECEIPT_UPLOAD_RULE })
        : null;
      const result = await setVisitScanAction({ visitId, field, url });
      if (!result.success) toast.error(errorMessage(result.error, t("ScanFailed")));
      else toast.success(t(url ? "ScanAttached" : "ScanRemoved"));
    } catch (error) {
      toast.error(errorMessage(error instanceof Error ? error.message : "", t("ScanFailed")));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Title")}</CardTitle>
        <CardDescription>{t("Hint")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {!data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <section className="space-y-3">
              <h3 className="font-bold">{t("Photos")}</h3>
              <p className="text-sm text-muted-foreground">
                {!data.photoConsent
                  ? t("NoConsent")
                  : data.supervisor
                    ? t("PhotosBy", { name: data.supervisor.name })
                    : t("NoSupervisor")}
              </p>
              {data.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                  {data.photos.map((photo) => (
                    <Photo key={photo.url} url={photo.url} caption={photo.caption} />
                  ))}
                </div>
              )}
              {writes && data.photoConsent && data.supervisor && (
                <>
                  <input
                    ref={photoInput}
                    type="file"
                    accept={PHOTO_UPLOAD_RULE.accept}
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) void addPhoto(file);
                    }}
                  />
                  <Button type="button" variant="add" disabled={busy} onClick={() => photoInput.current?.click()}>
                    <Camera />
                    {t("AddPhoto")}
                  </Button>
                </>
              )}
            </section>

            <section className="space-y-3">
              <h3 className="font-bold">{t("Scans")}</h3>
              {!data.reportId && <p className="text-sm text-muted-foreground">{t("ScansAfterTyping")}</p>}
              {data.reportId && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {(["orderScanUrl", "signoffScanUrl"] as const).map((field) => (
                    <ScanRow
                      key={field}
                      label={t(`Scan.${field}`)}
                      url={data[field]}
                      busy={busy}
                      mayChange={writes && typesOrders}
                      onChoose={(file) => void setScan(field, file)}
                      onRemove={() => void setScan(field, null)}
                    />
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function Photo({ url, caption }: { url: string; caption: string | null }) {
  const src = useUploadSrc(url);
  return src ? (
    <img src={src} alt={caption ?? ""} className="aspect-square w-full rounded-lg border object-cover" />
  ) : (
    <div className="aspect-square w-full rounded-lg border bg-muted" />
  );
}

function ScanRow({
  label,
  url,
  busy,
  mayChange,
  onChoose,
  onRemove,
}: {
  label: string;
  url: string | null;
  busy: boolean;
  mayChange: boolean;
  onChoose: (file: File) => void;
  onRemove: () => void;
}) {
  const t = useTranslations("VisitFiles");
  const input = React.useRef<HTMLInputElement>(null);
  const src = useUploadSrc(url && !isPdfUrl(url) ? url : null);
  return (
    <div className="space-y-2 rounded-xl border p-3">
      <p className="text-sm font-bold">{label}</p>
      {url ? (
        src ? (
          <img src={src} alt={label} className="max-h-40 w-full rounded-lg border object-contain" />
        ) : (
          <p className="text-sm text-muted-foreground">{t("PdfAttached")}</p>
        )
      ) : (
        <p className="text-sm text-muted-foreground">{t("NoScan")}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {url && (
          <Button type="button" variant="outline" size="sm" onClick={() => void saveUploadCopy(url, label)}>
            <Download />
            {t("SaveCopy")}
          </Button>
        )}
        {mayChange && (
          <>
            <input
              ref={input}
              type="file"
              accept={RECEIPT_UPLOAD_RULE.accept}
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) onChoose(file);
              }}
            />
            <Button type="button" variant="outline" size="sm" disabled={busy} onClick={() => input.current?.click()}>
              <FileUp />
              {t(url ? "ReplaceScan" : "AttachScan")}
            </Button>
            {url && (
              <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRemove}>
                <Trash2 />
                {t("RemoveScan")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
