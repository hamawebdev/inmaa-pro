import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { KeyRound, Link2, Save, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import {
  createAccountAction,
  giveAccountPasswordAction,
  linkAccountToStaffAction,
  listLinkableEmployeesQuery,
  updateAccountAction,
  USERS_PATH,
  type AccountRow,
} from "@/features/core/services/users";
import { useErrorMessage } from "@/i18n/errors";
import { ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/access/catalogue";
import { isPasswordLongEnough, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * The dialogs of the accounts table: a new account, its name and role, a
 * password given to its owner, and its link to a centre employee. Each one
 * saves through its own action and refreshes the tab.
 */

function useRoleLabel() {
  const locale = useLocale();
  return (role: RoleCode) => ROLE_LABELS[role][locale as "ar" | "fr" | "en"] ?? ROLE_LABELS[role].ar;
}

function useEmployees(open: boolean) {
  return useQuery({
    queryKey: [...pathKey(USERS_PATH), "employees"],
    queryFn: () => listLinkableEmployeesQuery(undefined),
    enabled: open,
  });
}

function RoleSelect({ id, value, onChange }: { id: string; value: RoleCode; onChange: (role: RoleCode) => void }) {
  const roleLabel = useRoleLabel();
  return (
    <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value as RoleCode)}>
      {ROLE_CODES.map((role) => (
        <NativeSelectOption key={role} value={role}>
          {roleLabel(role)}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

function EmployeeSelect({
  id,
  value,
  onChange,
  open,
  exceptUserName,
}: {
  id: string;
  value: string;
  onChange: (staffMemberId: string) => void;
  open: boolean;
  exceptUserName?: string;
}) {
  const t = useTranslations("UsersTab");
  const employees = useEmployees(open);
  return (
    <NativeSelect id={id} value={value} onChange={(event) => onChange(event.target.value)}>
      <NativeSelectOption value="">{t("NoEmployee")}</NativeSelectOption>
      {(employees.data ?? []).map((employee) => (
        <NativeSelectOption
          key={employee.id}
          value={employee.id}
          disabled={employee.account !== null && employee.account !== exceptUserName}
        >
          {employee.label}
          {employee.account && employee.account !== exceptUserName ? ` (${employee.account})` : ""}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}

export function NewAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("UsersTab");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [username, setUsername] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [roleId, setRoleId] = React.useState<RoleCode>("RECEPTION_SALES");
  const [staffMemberId, setStaffMemberId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function close(next: boolean) {
    if (!next) {
      setUsername("");
      setDisplayName("");
      setRoleId("RECEPTION_SALES");
      setStaffMemberId("");
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await createAccountAction({
        username,
        displayName,
        roleId,
        staffMemberId: staffMemberId || null,
      });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("AccountCreated"));
      close(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("NewAccount")}</DialogTitle>
          <DialogDescription>{t("NewAccountHint")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="account_display_name">{t("DisplayName")}</Label>
            <Input id="account_display_name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} autoFocus />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account_username">{t("Username")}</Label>
            <Input
              id="account_username"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              value={username}
              onChange={(event) => setUsername(event.target.value)}
              className="text-start"
            />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account_role">{t("Role")}</Label>
            <RoleSelect id="account_role" value={roleId} onChange={setRoleId} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="account_employee">{t("Employee")}</Label>
            <EmployeeSelect id="account_employee" value={staffMemberId} onChange={setStaffMemberId} open={open} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {tCommon("Cancel")}
            </Button>
            <Button type="submit" variant="success" loading={busy} disabled={!username.trim() || !displayName.trim()}>
              <UserPlus />
              {t("Create")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function EditAccountDialog({
  account,
  onOpenChange,
}: {
  account: AccountRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("UsersTab");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [displayName, setDisplayName] = React.useState("");
  const [roleId, setRoleId] = React.useState<RoleCode>("RECEPTION_SALES");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (account) {
      setDisplayName(account.displayName);
      setRoleId(account.roleId as RoleCode);
    }
  }, [account]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!account || busy) return;
    setBusy(true);
    try {
      const result = await updateAccountAction({ userId: account.id, displayName, roleId });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("Saved"));
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("EditAccount")}</DialogTitle>
          <DialogDescription>{t("RoleTakesEffect")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="edit_display_name">{t("DisplayName")}</Label>
            <Input id="edit_display_name" value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="edit_role">{t("Role")}</Label>
            <RoleSelect id="edit_role" value={roleId} onChange={setRoleId} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("Cancel")}
            </Button>
            <Button type="submit" variant="success" loading={busy} disabled={!displayName.trim()}>
              <Save />
              {tCommon("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** A password the manager gives; its owner replaces it the first time he signs in with it. */
export function GivePasswordDialog({
  account,
  onOpenChange,
}: {
  account: AccountRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("UsersTab");
  const tAuth = useTranslations("Auth");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [password, setPassword] = React.useState("");
  const [again, setAgain] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  function close(next: boolean) {
    if (!next) {
      setPassword("");
      setAgain("");
      setError("");
    }
    onOpenChange(next);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!account || busy) return;
    if (!isPasswordLongEnough(password)) return setError(tAuth("PasswordTooShort", { min: MIN_PASSWORD_LENGTH }));
    if (password !== again) return setError(tAuth("PasswordsDoNotMatch"));
    setBusy(true);
    try {
      const result = await giveAccountPasswordAction({ userId: account.id, password });
      if (!result.success) {
        setError(errorMessage(result.error, t("SaveFailed")) ?? "");
        return;
      }
      toast.success(t("PasswordGiven", { name: account.displayName }));
      close(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={account !== null} onOpenChange={close}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("GivePasswordTitle", { name: account?.displayName ?? "" })}</DialogTitle>
          <DialogDescription>{t("GivePasswordHint")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          {(
            [
              ["give_password", tAuth("NewPassword"), password, setPassword],
              ["give_password_again", tAuth("ConfirmPassword"), again, setAgain],
            ] as const
          ).map(([id, label, value, set], index) => (
            <div key={id} className="grid gap-2">
              <Label htmlFor={id}>{label}</Label>
              <Input
                id={id}
                type="password"
                dir="ltr"
                autoComplete="new-password"
                autoFocus={index === 0}
                value={value}
                onChange={(event) => {
                  set(event.target.value);
                  if (error) setError("");
                }}
                aria-invalid={!!error}
              />
            </div>
          ))}
          {error && (
            <p role="alert" className="text-base font-bold text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => close(false)}>
              {tCommon("Cancel")}
            </Button>
            <Button type="submit" variant="success" loading={busy} disabled={!password || !again}>
              <KeyRound />
              {t("GivePassword")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function LinkEmployeeDialog({
  account,
  onOpenChange,
}: {
  account: AccountRow | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("UsersTab");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [staffMemberId, setStaffMemberId] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    if (account) setStaffMemberId(account.staffMemberId ?? "");
  }, [account]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!account || busy) return;
    setBusy(true);
    try {
      const result = await linkAccountToStaffAction({ userId: account.id, staffMemberId: staffMemberId || null });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("Saved"));
      onOpenChange(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={account !== null} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("LinkTitle", { name: account?.displayName ?? "" })}</DialogTitle>
          <DialogDescription>{t("LinkHint")}</DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div className="grid gap-2">
            <Label htmlFor="link_employee">{t("Employee")}</Label>
            <EmployeeSelect
              id="link_employee"
              value={staffMemberId}
              onChange={setStaffMemberId}
              open={account !== null}
              exceptUserName={account?.username}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              {tCommon("Cancel")}
            </Button>
            <Button type="submit" variant="success" loading={busy}>
              <Link2 />
              {tCommon("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
