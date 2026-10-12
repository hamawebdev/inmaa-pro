import * as React from "react";

import { LockKeyhole, Settings2 } from "lucide-react";
import { useTranslations } from "use-intl";

import { LockSettingsDialog } from "@/components/security/lock-settings-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useSettings } from "@/hooks/use-settings";
import { isPasswordSet } from "@/lib/auth";
import { useUnlockStore } from "@/stores/unlock-store";

/**
 * The manager-password menu: re-lock on demand, and reach the section picker
 * from wherever the user happens to be standing.
 *
 * It owns the menu and the dialog but **not** the button — the caller passes its
 * own trigger as `children`, so the control can wear the bottom bar's shape
 * instead of a generic button's. Every navigation target in this app is sized
 * and spaced by one set of classes, and a lock control that opted out of that
 * would be the one item in the row that looked pasted on.
 *
 * The menu is always reachable, even in an academy that has never set a
 * password: hiding it when there is nothing to lock also hides the only way to
 * *discover* the feature, from precisely the academy that most needs to find it.
 * What changes is the *item* — "lock now" is disabled until there is a password
 * and an open session — while the way in to the settings stays put.
 */
export function LockMenu({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Auth");
  const { data: settings } = useSettings();
  const unlocked = useUnlockStore((s) => s.unlocked);
  const lock = useUnlockStore((s) => s.lock);
  const [settingsOpen, setSettingsOpen] = React.useState(false);

  // Locking only means something when there is a password to lock behind, and
  // only shows a change when the session is currently open.
  const canLock = isPasswordSet(settings) && unlocked;

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        {/* The trigger sits on the bottom edge of the window, so the menu opens
            upward, and `align="end"` keeps it inside the frame rather than
            centring it on a control that is already in the corner. */}
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-64">
          <DropdownMenuItem disabled={!canLock} onSelect={() => lock()}>
            <LockKeyhole />
            {t("LockNow")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <Settings2 />
            {t("LockSettings")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <LockSettingsDialog open={settingsOpen} onOpenChange={setSettingsOpen} />
    </>
  );
}
