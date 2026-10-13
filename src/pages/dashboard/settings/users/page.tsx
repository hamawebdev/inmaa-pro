import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { UserPlus, UsersRound } from "lucide-react";
import { useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { listAccountsQuery, listRoleGrantsQuery, USERS_PATH } from "@/features/core/services/users";
import { useCan } from "@/hooks/use-session";
import { pathKey } from "@/lib/compat/revalidate";

import { NewAccountDialog } from "./_components/account-dialogs";
import { AccountsTable } from "./_components/accounts-table";
import { RoleGrantsCard } from "./_components/role-grants";

/**
 * Settings › المستخدمون والصلاحيات: who signs in on this PC, and what each
 * role may open and do (plan feature 23).
 *
 * Closest academy screens: the employees list for the accounts (a table with
 * its "add" button in the header), and Settings' own cards for the roles. The
 * whole tab is for whoever manages accounts (`users.manage`: the manager).
 */
export default function SettingsUsersPage() {
  const t = useTranslations("UsersTab");
  const tSettings = useTranslations("Settings");
  const tNav = useTranslations("Nav");
  const manages = useCan("users.manage");
  const [creating, setCreating] = React.useState(false);

  const accounts = useQuery({
    queryKey: pathKey(USERS_PATH),
    queryFn: () => listAccountsQuery(undefined),
    enabled: manages,
  });
  const roles = useQuery({
    queryKey: [...pathKey(USERS_PATH), "roles"],
    queryFn: () => listRoleGrantsQuery(undefined),
    enabled: manages,
  });

  return (
    <SectionScreen
      section="settings"
      title={tNav("SettingsUsers")}
      description={tSettings("UsersDescription")}
      className="max-w-5xl"
      actions={
        manages && (
          <Button variant="add" onClick={() => setCreating(true)}>
            <UserPlus />
            {t("NewAccount")}
          </Button>
        )
      }
    >
      {!manages ? (
        <p className="text-lg text-muted-foreground">{t("ManagerOnly")}</p>
      ) : (
        <div className="flex flex-col gap-6 tall:gap-7">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <UsersRound className="size-5" />
                {t("Accounts.Title")}
              </CardTitle>
              <CardDescription>{t("Accounts.Description")}</CardDescription>
            </CardHeader>
            <CardContent>
              {accounts.isError ? (
                <ErrorState onRetry={() => void accounts.refetch()} />
              ) : accounts.data ? (
                <AccountsTable rows={accounts.data} />
              ) : (
                <Skeleton className="h-48 w-full" />
              )}
            </CardContent>
          </Card>

          {roles.isError ? (
            <ErrorState onRetry={() => void roles.refetch()} />
          ) : roles.data ? (
            <RoleGrantsCard roles={roles.data} />
          ) : (
            <Skeleton className="h-72 w-full rounded-xl" />
          )}

          <NewAccountDialog open={creating} onOpenChange={setCreating} />
        </div>
      )}
    </SectionScreen>
  );
}
