import * as React from "react";

import { KeyRound, LockKeyhole, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { PasswordChangeDialog } from "@/components/security/password-dialogs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { leaveSession } from "@/features/core/services/session";
import { useSession } from "@/hooks/use-session";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/access/catalogue";

/**
 * The lock menu: who is signed in, «قفل الآن», and the way to change one's own
 * password from wherever one happens to be standing.
 *
 * It owns the menu and the dialog but **not** the button: the caller passes its
 * own trigger as `children`, so the control can wear the bottom bar's shape
 * instead of a generic button's. Every navigation target in this app is sized
 * and spaced by one set of classes, and a lock control that opted out of that
 * would be the one item in the row that looked pasted on.
 *
 * «قفل الآن» signs out: the program goes back to the sign-in window, and the
 * next person signs in under his own name. The password item is here, and not
 * only in Settings, because most roles cannot open Settings at all.
 */
export function LockMenu({ children }: { children: React.ReactNode }) {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const session = useSession();
  const [passwordOpen, setPasswordOpen] = React.useState(false);

  const labels = (ROLE_CODES as readonly string[]).includes(session?.roleId ?? "")
    ? ROLE_LABELS[session?.roleId as RoleCode]
    : null;
  const role = labels ? (labels[locale as keyof typeof labels] ?? labels.ar) : "";

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
        {/* The trigger sits on the bottom edge of the window, so the menu opens
            upward, and `align="end"` keeps it inside the frame rather than
            centring it on a control that is already in the corner. */}
        <DropdownMenuContent side="top" align="end" sideOffset={10} className="w-72">
          {session && (
            <>
              <DropdownMenuLabel className="flex items-center gap-3">
                <UserRound className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="flex min-w-0 flex-col">
                  <span className="truncate text-base font-bold">{session.userName}</span>
                  {role && <span className="truncate text-sm font-normal text-muted-foreground">{role}</span>}
                </span>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem data-lock-now onSelect={() => void leaveSession()}>
            <LockKeyhole />
            {t("LockNow")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setPasswordOpen(true)}>
            <KeyRound />
            {t("ChangePassword")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <PasswordChangeDialog open={passwordOpen} onOpenChange={setPasswordOpen} />
    </>
  );
}
