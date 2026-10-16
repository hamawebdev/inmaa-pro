import * as React from "react";

import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { intlLocaleFor } from "@/i18n/config";
import { useErrorMessage } from "@/i18n/errors";
import { useUploadSrc } from "@/lib/use-upload-src";
import { saveUploadCopy, type UploadCopyLog } from "@/server/uploads";
import {
  type UploadRule,
  checkUploadFile,
  getAllowedExtensions,
  getFileSizeParts,
  getMediaFileName,
  isPdfUrl,
} from "@/lib/uploads";

export type UploadSelection = {
  file: File | null;
  removeExisting: boolean;
  error?: string;
};

export function createEmptyUploadSelection(): UploadSelection {
  return { file: null, removeExisting: false };
}

type Props = {
  label: string;
  rule: UploadRule;
  existingUrl?: string | null;
  value: UploadSelection;
  onChange: (value: UploadSelection) => void;
  disabled?: boolean;
  description?: string;
  previewAlt?: string;
  saveCopyLabel?: string;
  removeLabel?: string;
  removeMessage?: string;
  colSpan2?: boolean;
  /**
   * What the log says when a copy of the stored file is saved (a disclosure,
   * src/server/uploads.ts): the owner and the person the file concerns.
   *
   * A restricted file (saved with `restrictedCapability`) needs nothing more
   * here: it is never previewed (the window cannot load it), and its copy is
   * checked against the capability and logged by the service. Leave the copy
   * out for a reader who may not open it with `mayCopy={false}`.
   */
  copyLog?: UploadCopyLog;
  /** Whether the stored file's «save a copy» is offered (default yes). */
  mayCopy?: boolean;
};

export function MediaUploadField({
  label,
  rule,
  existingUrl,
  value,
  onChange,
  disabled,
  description,
  previewAlt,
  saveCopyLabel,
  removeLabel,
  removeMessage,
  colSpan2 = false,
  copyLog,
  mayCopy = true,
}: Props) {
  const t = useTranslations("MediaUpload");
  const errorMessage = useErrorMessage();
  const localeCode = intlLocaleFor(useLocale());
  const inputRef = React.useRef<HTMLInputElement>(null);

  // "JPG, PNG, or WebP" / "JPG أو PNG أو WebP": the type codes stay as they are,
  // only the list around them is the reader's language.
  const allowedTypes = new Intl.ListFormat(localeCode, { type: "disjunction" }).format(getAllowedExtensions(rule));
  const maxSize = getFileSizeParts(rule.maxSizeBytes);
  const maxSizeLabel = t(maxSize.unit === "MB" ? "SizeMegabytes" : "SizeKilobytes", {
    size: maxSize.value.toLocaleString(localeCode),
  });

  const selectedPreviewUrl = React.useMemo(() => {
    if (!value.file || !value.file.type.startsWith("image/")) {
      return null;
    }

    return URL.createObjectURL(value.file);
  }, [value.file]);

  React.useEffect(() => {
    return () => {
      if (selectedPreviewUrl) {
        URL.revokeObjectURL(selectedPreviewUrl);
      }
    };
  }, [selectedPreviewUrl]);

  const showExistingFile = Boolean(existingUrl) && !value.file && !value.removeExisting;
  const showSelectedFile = Boolean(value.file);
  const showImagePreview =
    (showSelectedFile && Boolean(selectedPreviewUrl)) || (showExistingFile && existingUrl && !isPdfUrl(existingUrl));

  // A just-picked file is already a blob: URL; a stored one is a managed
  // upload path that has to be resolved to the asset protocol first.
  const resolvedExistingUrl = useUploadSrc(existingUrl);
  const previewSrc = showSelectedFile ? selectedPreviewUrl : resolvedExistingUrl;
  const displayName = showSelectedFile ? getMediaFileName(value.file) : getMediaFileName(existingUrl);

  const handleSaveCopy = async () => {
    const result = await saveUploadCopy(existingUrl, saveCopyLabel ?? t("SaveCopy"), copyLog);
    if (result.success) toast.success(t("CopySaved", { path: result.path }));
    else if (!result.cancelled) toast.error(errorMessage(result.error, t("CopyFailed")));
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) {
      onChange({ ...value, error: undefined });
      return;
    }

    const problem = checkUploadFile(nextFile, rule);
    if (problem) {
      onChange({
        ...value,
        error: problem === "type" ? t("InvalidType", { types: allowedTypes }) : t("TooLarge", { size: maxSizeLabel }),
      });
      event.target.value = "";
      return;
    }

    onChange({
      file: nextFile,
      removeExisting: false,
      error: undefined,
    });
  };

  const handleRemove = () => {
    if (inputRef.current) {
      inputRef.current.value = "";
    }

    if (value.file) {
      onChange({ file: null, removeExisting: false, error: undefined });
      return;
    }

    if (existingUrl && !value.removeExisting) {
      onChange({ file: null, removeExisting: true, error: undefined });
      return;
    }

    onChange({ file: null, removeExisting: false, error: undefined });
  };

  return (
    <Field className={colSpan2 ? "sm:col-span-2" : ""} data-invalid={Boolean(value.error)}>
      <FieldLabel>{label}</FieldLabel>
      <Input
        ref={inputRef}
        type="file"
        accept={rule.accept}
        disabled={disabled}
        aria-invalid={Boolean(value.error)}
        onChange={handleFileChange}
      />
      <FieldDescription>{description ?? t("HelperText", { types: allowedTypes, size: maxSizeLabel })}</FieldDescription>

      {showImagePreview && previewSrc ? (
        <div className="overflow-hidden rounded-md border border-border bg-muted/20">
          <img src={previewSrc} alt={previewAlt ?? label} className="h-40 w-full object-cover" />
        </div>
      ) : null}

      {(showExistingFile || showSelectedFile) && displayName ? (
        <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/10 px-3 py-2">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{displayName}</p>
            {showSelectedFile ? <p className="text-xs text-muted-foreground">{t("ReadyToUpload")}</p> : null}
          </div>
          {/* No "open" link: nothing leaves the window. A stored file is read
              by saving a copy; a stored image is also shown above. */}
          {showExistingFile && existingUrl && mayCopy ? (
            <Button type="button" variant="outline" size="sm" onClick={handleSaveCopy}>
              {saveCopyLabel ?? t("SaveCopy")}
            </Button>
          ) : null}
        </div>
      ) : null}

      {value.removeExisting && !value.file ? (
        <FieldDescription>{removeMessage ?? t("RemoveMessage")}</FieldDescription>
      ) : null}

      {showExistingFile || showSelectedFile || value.removeExisting ? (
        <div>
          <Button type="button" variant="outline" size="sm" onClick={handleRemove} disabled={disabled}>
            {removeLabel ?? t("Remove")}
          </Button>
        </div>
      ) : null}

      <FieldError>{value.error}</FieldError>
    </Field>
  );
}
