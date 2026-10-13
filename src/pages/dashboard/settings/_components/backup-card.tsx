import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { DatabaseBackup, Download, FolderOpen, TriangleAlert, Upload } from "lucide-react";
import { toast } from "sonner";
import { useFormatter, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  listBackupRunsQuery,
  readBackupSettingsQuery,
  saveBackupSettingsAction,
  SETTINGS_PATH,
} from "@/features/core/services/backups";
import { useCan, useSectionLevel } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { MANAGER_ONLY_CAPABILITY } from "@/lib/access/catalogue";
import {
  backupDatabase,
  chooseBackupFolder,
  chooseRestoreSource,
  restoreDatabase,
  type RestoreCandidate,
} from "@/server/backup";

/**
 * Backup and restore (plan feature 33).
 *
 * The academy's card, with what this program adds to it: a copy made by
 * itself once a day into a folder or USB stick the manager chooses (never one
 * a cloud client synchronises), the list of the latest copies, and a restore
 * that says what it would cost before it replaces anything, keeps a copy of
 * what it replaces, and asks for the manager's reason.
 *
 * With everything in one local file, this card is the only way back if that
 * file is lost.
 */
const KEEP_CHOICES = [7, 14, 30, 60, 90] as const;

export function BackupCard() {
  const t = useTranslations("Settings.Backup");
  const errorMessage = useErrorMessage();
  const format = useFormatter();
  const writes = useSectionLevel("SETTINGS") === "WRITE";
  const mayBackUp = useCan("backup.run");
  const mayRestore = useCan(MANAGER_ONLY_CAPABILITY);
  const [busy, setBusy] = React.useState<"backup" | "folder" | "restore" | null>(null);
  const [candidate, setCandidate] = React.useState<RestoreCandidate | null>(null);

  const settings = useQuery({
    queryKey: [...pathKey(SETTINGS_PATH), "backup"],
    queryFn: () => readBackupSettingsQuery(undefined),
  });
  const runs = useQuery({
    queryKey: [...pathKey(SETTINGS_PATH), "backup", "runs"],
    queryFn: () => listBackupRunsQuery({ limit: 6 }),
  });

  async function save(patch: Parameters<typeof saveBackupSettingsAction>[0]) {
    const result = await saveBackupSettingsAction(patch);
    if (!result.success) toast.error(errorMessage(result.error, t("SaveFailed")));
    return result.success;
  }

  async function pickFolder() {
    setBusy("folder");
    try {
      const folder = await chooseBackupFolder(t("ChooseFolder"));
      if (folder && (await save({ folder }))) toast.success(t("FolderSaved"));
    } catch {
      toast.error(t("SaveFailed"));
    } finally {
      setBusy(null);
    }
  }

  async function backUpNow() {
    setBusy("backup");
    try {
      const outcome = await backupDatabase({ title: t("BackUpNow"), filterName: t("Title") });
      if (outcome.done) toast.success(t("BackupSaved", { path: outcome.path }));
      else if (!outcome.cancelled) {
        // The reason is raw OS text in English: kept for support, not shown.
        console.error("backup: failed", outcome.error);
        toast.error(errorMessage(outcome.error, t("BackupFailed")));
      }
    } finally {
      setBusy(null);
    }
  }

  async function pickRestore() {
    setBusy("restore");
    try {
      setCandidate(await chooseRestoreSource({ title: t("Restore"), filterName: t("Title") }));
    } catch (error) {
      console.error("backup: the copy could not be read", error);
      toast.error(t("RestoreFailed"));
    } finally {
      setBusy(null);
    }
  }

  /** What stopped a copy, in the reader's words where the program knows them. */
  function reasonOf(error: string | null): string {
    if (!error) return "";
    if (error.startsWith("FOLDER_SYNCED:")) return t("Errors.Synced", { client: error.slice("FOLDER_SYNCED:".length) });
    if (error === "FOLDER_MISSING") return t("Errors.Missing");
    if (error === "FOLDER_READ_ONLY") return t("Errors.ReadOnly");
    return t("Errors.Other");
  }

  return (
    <Card id="backup" data-settings-backup>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <DatabaseBackup className="size-5" />
          {t("Title")}
        </CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-6">
        {settings.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : settings.data ? (
          <section className="flex min-w-0 flex-col gap-4">
            <h3 className="text-lg font-bold">{t("Daily.Title")}</h3>
            <div className="grid min-w-0 gap-2">
              <Label>{t("Daily.Folder")}</Label>
              <div className="flex min-w-0 flex-wrap items-center gap-3">
                {settings.data.targetDir ? (
                  <Ltr className="min-w-0 rounded-md bg-muted px-3 py-2 font-mono text-base break-all">
                    {settings.data.targetDir}
                  </Ltr>
                ) : (
                  <StatusChip tone="warning" label={t("Daily.NoFolder")} />
                )}
                {writes && (
                  <Button
                    variant="outline"
                    onClick={() => void pickFolder()}
                    loading={busy === "folder"}
                    disabled={busy !== null}
                  >
                    <FolderOpen />
                    {t("ChooseFolder")}
                  </Button>
                )}
              </div>
              <p className="text-sm leading-relaxed text-muted-foreground tall:text-base">{t("Daily.FolderHint")}</p>
            </div>

            <div className="grid min-w-0 gap-x-6 gap-y-4 md:grid-cols-2">
              <div className="grid min-w-0 content-start gap-2">
                <Label>{t("Daily.Auto")}</Label>
                <div className="flex flex-wrap gap-2">
                  {([true, false] as const).map((on) => (
                    <Button
                      key={String(on)}
                      size="sm"
                      variant={settings.data.autoEnabled === on ? "default" : "outline"}
                      aria-pressed={settings.data.autoEnabled === on}
                      disabled={!writes || busy !== null}
                      onClick={() => void save({ autoEnabled: on })}
                    >
                      {on ? t("Daily.On") : t("Daily.Off")}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="grid min-w-0 content-start gap-2">
                <Label>{t("Daily.Keep")}</Label>
                <div className="flex flex-wrap gap-2">
                  {[...new Set([...KEEP_CHOICES, settings.data.keepCount])]
                    .sort((a, b) => a - b)
                    .map((count) => (
                      <Button
                        key={count}
                        size="sm"
                        variant={settings.data.keepCount === count ? "default" : "outline"}
                        aria-pressed={settings.data.keepCount === count}
                        disabled={!writes || busy !== null}
                        onClick={() => void save({ keepCount: count })}
                      >
                        <Ltr>{count}</Ltr>
                      </Button>
                    ))}
                </div>
              </div>
            </div>
          </section>
        ) : null}

        <section className="flex min-w-0 flex-col gap-3">
          <h3 className="text-lg font-bold">{t("Latest.Title")}</h3>
          {runs.data && runs.data.length === 0 && <p className="text-base text-muted-foreground">{t("Latest.None")}</p>}
          <ul className="flex min-w-0 flex-col">
            {(runs.data ?? []).map((run) => (
              <li
                key={run.id}
                className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-border/60 py-2"
              >
                <span className="whitespace-nowrap tabular-nums">
                  {format.dateTime(new Date(run.startedAt), {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                    hourCycle: "h23",
                  })}
                </span>
                <StatusChip
                  tone={!run.ok ? "danger" : run.kind === "RESTORE" ? "warning" : "success"}
                  label={t(`Kinds.${run.kind}`) + (run.ok ? "" : ` · ${t("Latest.Failed")}`)}
                />
                <span className="min-w-0 flex-1 text-base text-muted-foreground">
                  {run.ok ? <Ltr className="break-all">{run.targetPath}</Ltr> : reasonOf(run.error)}
                </span>
              </li>
            ))}
          </ul>
        </section>

        <div className="flex min-w-0 flex-wrap gap-3">
          {mayBackUp && (
            <Button onClick={() => void backUpNow()} loading={busy === "backup"} disabled={busy !== null}>
              <Download />
              {t("BackUpNow")}
            </Button>
          )}
          {mayRestore && (
            <Button
              variant="outline"
              onClick={() => void pickRestore()}
              loading={busy === "restore"}
              disabled={busy !== null}
            >
              <Upload />
              {t("Restore")}
            </Button>
          )}
        </div>
      </CardContent>

      <RestoreDialog candidate={candidate} onClose={() => setCandidate(null)} />
    </Card>
  );
}

/**
 * The last word before a restore. It is a dialog with a typed reason rather
 * than a yes or no: it replaces the whole database, and the log must carry the
 * manager's own words for it. The warnings come from the copy's manifest.
 */
function RestoreDialog({ candidate, onClose }: { candidate: RestoreCandidate | null; onClose: () => void }) {
  const t = useTranslations("Settings.Backup");
  const tCommon = useTranslations("Common");
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function close() {
    if (busy) return;
    setReason("");
    onClose();
  }

  async function restore() {
    if (!candidate || busy || !reason.trim()) return;
    setBusy(true);
    try {
      // On success the program restarts: this only comes back when it failed.
      const outcome = await restoreDatabase({ source: candidate.source, reason });
      if (outcome.error !== null) {
        console.error("backup: restore failed", outcome.error);
        toast.error(t("RestoreFailed"));
      }
    } finally {
      setBusy(false);
    }
  }

  const assessment = candidate?.assessment;
  return (
    <Dialog open={candidate !== null} onOpenChange={(open) => !open && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("RestoreTitle")}</DialogTitle>
          <DialogDescription>{t("RestoreDescription")}</DialogDescription>
        </DialogHeader>
        {candidate && assessment && (
          <div className="flex min-w-0 flex-col gap-4">
            <Ltr className="rounded-md bg-muted px-3 py-2 font-mono text-base break-all">{candidate.source}</Ltr>
            {assessment.warnings.map((warning) => (
              <div
                key={warning}
                role="alert"
                className="border-app flex min-w-0 items-start gap-3 rounded-xl border-warning-ink/35 bg-warning/10 p-4"
              >
                <TriangleAlert className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden />
                <p className="min-w-0 text-base leading-relaxed">
                  {warning === "OLDER_THAN_LAST_INVOICE"
                    ? t("Warnings.OLDER_THAN_LAST_INVOICE", {
                        current: assessment.current.lastInvoice?.number ?? "—",
                        currentDate: assessment.current.lastInvoice?.issueDate ?? "—",
                        backup: assessment.backup.lastInvoice?.number ?? t("Warnings.NoInvoice"),
                      })
                    : t(`Warnings.${warning}`)}
                </p>
              </div>
            ))}
            <div className="grid gap-2">
              <Label htmlFor="restore_reason">{t("RestoreReason")}</Label>
              <Textarea
                id="restore_reason"
                rows={2}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={busy}>
            {tCommon("Cancel")}
          </Button>
          <Button
            type="button"
            variant="destructive"
            loading={busy}
            disabled={!reason.trim()}
            onClick={() => void restore()}
          >
            <Upload />
            {t("ConfirmRestore")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
