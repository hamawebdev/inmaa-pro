import * as React from "react";

import { KeyRound, ShieldCheck, ShieldOff } from "lucide-react";
import { useTranslations } from "use-intl";

import {
  PasswordChangeDialog,
  PasswordCreateDialog,
  PasswordRemoveDialog,
  RecoveryRegenerateDialog,
} from "@/components/security/password-dialogs";
import { StatusChip } from "@/components/status-chip";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useSettings } from "@/hooks/use-settings";
import { isPasswordSet, isRecoverySet } from "@/lib/auth";

/**
 * Whether protection is switched on, and every way to change that.
 *
 * Placed **before** the section picker on the Settings screen, deliberately:
 * choosing what to protect only makes sense once the reader has seen whether
 * protection exists at all. The picker on its own, in an academy with no
 * password, is a list of checkboxes that do nothing.
 */
export function ManagerPasswordSection() {
  const t = useTranslations("Auth");
  const { data: settings, isPending } = useSettings();

  const [createOpen, setCreateOpen] = React.useState(false);
  const [changeOpen, setChangeOpen] = React.useState(false);
  const [removeOpen, setRemoveOpen] = React.useState(false);
  const [regenOpen, setRegenOpen] = React.useState(false);

  const passwordSet = isPasswordSet(settings);
  const recoverySet = isRecoverySet(settings);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <KeyRound className="size-5" />
          {t("ManagerPassword")}
        </CardTitle>
        <CardDescription>{t("ManagerPasswordDesc")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <StatusChip
              tone={passwordSet ? "success" : "neutral"}
              icon={passwordSet ? ShieldCheck : ShieldOff}
              label={passwordSet ? t("PasswordOn") : t("PasswordOff")}
            />

            <div className="flex min-w-0 flex-wrap gap-3">
              {passwordSet ? (
                <>
                  <Button variant="edit" onClick={() => setChangeOpen(true)}>
                    {t("ChangePassword")}
                  </Button>
                  {/* Offered only when a code exists to replace. An academy
                      whose recovery hash was cleared by a failed create has
                      nothing to regenerate and would get a confusing no-op. */}
                  {recoverySet && (
                    <Button variant="outline" onClick={() => setRegenOpen(true)}>
                      <KeyRound />
                      {t("RegenerateRecovery")}
                    </Button>
                  )}
                  <Button variant="destructive" onClick={() => setRemoveOpen(true)}>
                    {t("RemovePassword")}
                  </Button>
                </>
              ) : (
                <Button onClick={() => setCreateOpen(true)}>
                  <KeyRound />
                  {t("SetPassword")}
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>

      <PasswordCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <PasswordChangeDialog open={changeOpen} onOpenChange={setChangeOpen} />
      <PasswordRemoveDialog open={removeOpen} onOpenChange={setRemoveOpen} />
      <RecoveryRegenerateDialog open={regenOpen} onOpenChange={setRegenOpen} />
    </Card>
  );
}
