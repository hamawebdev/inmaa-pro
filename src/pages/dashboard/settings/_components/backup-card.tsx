import * as React from "react";

import { DatabaseBackup, Download, Upload } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useErrorMessage } from "@/i18n/errors";
import { backupDatabase, restoreDatabase } from "@/features/core/services/backup";

/**
 * Backup and restore. New in the desktop build — with everything in one local
 * file, this is the only recovery path if that file is lost.
 *
 * Restore goes through an AlertDialog rather than the `confirm()` the delete
 * buttons elsewhere use: it replaces the entire database, and a native confirm
 * neither states that clearly nor lays out right-to-left in Arabic.
 */
export function BackupCard() {
  const t = useTranslations("Settings.Backup");
  const errorMessage = useErrorMessage();
  const [busy, setBusy] = React.useState<"backup" | "restore" | null>(null);

  const handleBackup = async () => {
    setBusy("backup");
    try {
      const result = await backupDatabase({ title: t("Back Up Now"), filterName: t("Title") });
      if (result.success) {
        toast.success(t("Backup Saved", { path: result.path }));
      } else if (!result.cancelled) {
        // The reason is raw OS/SQLite text in English: kept for support, not shown.
        console.error("Backup failed:", result.error);
        toast.error(errorMessage(result.error, t("Backup Failed")));
      }
    } finally {
      setBusy(null);
    }
  };

  const handleRestore = async () => {
    setBusy("restore");
    try {
      const result = await restoreDatabase({ title: t("Restore"), filterName: t("Title") });
      // On success the app relaunches, so this only runs on failure or cancel.
      if (!result.success && !result.cancelled) {
        console.error("Restore failed:", result.error);
        toast.error(errorMessage(result.error, t("Restore Failed")));
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <DatabaseBackup className="size-4" />
          {t("Title")}
        </CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button onClick={handleBackup} disabled={busy !== null}>
          <Download className="size-4 ltr:mr-1 rtl:ml-1" />
          {busy === "backup" ? t("Backing Up") : t("Back Up Now")}
        </Button>

        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" disabled={busy !== null}>
              <Upload className="size-4 ltr:mr-1 rtl:ml-1" />
              {busy === "restore" ? t("Restoring") : t("Restore")}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader className="rtl:text-right">
              <AlertDialogTitle>{t("Restore Title")}</AlertDialogTitle>
              <AlertDialogDescription className="rtl:text-right">{t("Restore Description")}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>{t("Cancel")}</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleRestore}
                disabled={busy !== null}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {t("Confirm Restore")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
