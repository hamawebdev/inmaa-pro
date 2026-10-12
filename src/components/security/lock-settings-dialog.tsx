import { useTranslations } from "use-intl";

import { LockSettings } from "@/components/security/lock-settings";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/** The lock picker, reachable from the bottom bar without going to Settings. */
export function LockSettingsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const t = useTranslations("Auth");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("LockSettings")}</DialogTitle>
          <DialogDescription>{t("LockSettingsDesc")}</DialogDescription>
        </DialogHeader>
        <LockSettings />
      </DialogContent>
    </Dialog>
  );
}
