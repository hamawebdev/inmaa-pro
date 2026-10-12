import * as React from "react";

import { KeyRound, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "use-intl";

import { PasswordChangeDialog, RecoveryRegenerateDialog } from "@/components/security/password-dialogs";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useSession } from "@/hooks/use-session";
import { MANAGER_ROLE, ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/access/catalogue";

/**
 * Who is signed in, and the two things he can do to his own account: change
 * his password, and (the manager) ask for a new recovery code.
 *
 * It stands where the academy's manager-password card stood: the same place
 * in the page's order, the same chip-then-buttons shape. The password is no
 * longer one shared secret that can be switched off: every account has its
 * own, so there is no "remove" here.
 */
export function AccountCard() {
  const t = useTranslations("Auth");
  const locale = useLocale();
  const session = useSession();
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [codeOpen, setCodeOpen] = React.useState(false);
  if (!session) return null;

  const labels = (ROLE_CODES as readonly string[]).includes(session.roleId ?? "")
    ? ROLE_LABELS[session.roleId as RoleCode]
    : null;
  const role = labels ? (labels[locale as keyof typeof labels] ?? labels.ar) : "";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5" />
          {t("MyAccount")}
        </CardTitle>
        <CardDescription>{t("MyAccountDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <span className="min-w-0 truncate text-lg font-bold tall:text-xl">{session.userName}</span>
          {role && <StatusChip tone="info" icon={UserRound} label={role} />}
        </div>

        <div className="flex min-w-0 flex-wrap gap-3">
          <Button variant="edit" onClick={() => setChangeOpen(true)}>
            {t("ChangePassword")}
          </Button>
          {session.roleId === MANAGER_ROLE && (
            <Button variant="outline" onClick={() => setCodeOpen(true)}>
              <KeyRound />
              {t("RegenerateRecovery")}
            </Button>
          )}
        </div>
      </CardContent>

      <PasswordChangeDialog open={changeOpen} onOpenChange={setChangeOpen} />
      <RecoveryRegenerateDialog open={codeOpen} onOpenChange={setCodeOpen} />
    </Card>
  );
}
