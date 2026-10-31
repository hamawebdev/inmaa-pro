import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { KeyRound, MonitorSmartphone } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listAccountsQuery, USERS_PATH } from "@/features/core/services/users";
import { syncApi } from "@/features/sync/api";
import { useInstantText } from "@/features/sync/use-instant-text";
import { groupPairingCode, isolate } from "@/features/sync/view";
import { useErrorMessage } from "@/i18n/errors";
import { MANAGER_ROLE, ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/access/catalogue";
import { isPasswordLongEnough, MIN_PASSWORD_LENGTH } from "@/lib/auth";
import { pathKey } from "@/lib/compat/revalidate";
import { programClock } from "@/lib/service/program";
import type { PairingCodeAnswer } from "@/lib/sync/services/types";

/** The roles the assistant's account may be given: every one but the manager's (DECISION section 9). */
const ASSISTANT_ROLES = ROLE_CODES.filter((role) => role !== MANAGER_ROLE);

/**
 * «إضافة الحاسوب الثاني» (DECISION section 2): whose account signs in on the
 * second laptop, then the pairing code, read aloud to the assistant. A centre
 * with no account but the manager's creates hers here (section 9); her role
 * and rights are changed later in Settings › المستخدمون والصلاحيات, as today.
 */
export function PairDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useTranslations("Sync.Pair");
  const tCommon = useTranslations("Common");
  const locale = useLocale() as "ar" | "fr" | "en";
  const errorMessage = useErrorMessage();
  const instant = useInstantText();

  const accounts = useQuery({
    queryKey: [...pathKey(USERS_PATH)],
    queryFn: () => listAccountsQuery(undefined),
    enabled: open,
  });
  // The manager's own account never signs in on the assistant's laptop.
  const others = (accounts.data ?? []).filter((account) => account.isActive && account.roleId !== MANAGER_ROLE);

  const [mode, setMode] = React.useState<"existing" | "new">("existing");
  const [accountId, setAccountId] = React.useState("");
  const [displayName, setDisplayName] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [roleId, setRoleId] = React.useState<RoleCode>("ADMINISTRATION");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [answer, setAnswer] = React.useState<PairingCodeAnswer | null>(null);
  const [expired, setExpired] = React.useState(false);

  const creating = mode === "new" || (accounts.isSuccess && others.length === 0);
  const signsInAs = answer
    ? ((accounts.data ?? []).find((account) => account.id === answer.accountId)?.displayName ?? displayName)
    : "";

  // The code dies after 30 minutes: say so rather than let it be read out in vain.
  React.useEffect(() => {
    if (!answer) return;
    const check = () => setExpired(programClock().now().getTime() >= Date.parse(answer.expiresAt));
    check();
    const timer = window.setInterval(check, 15_000);
    return () => window.clearInterval(timer);
  }, [answer]);

  function close(next: boolean) {
    if (next || busy) return;
    setMode("existing");
    setAccountId("");
    setDisplayName("");
    setUsername("");
    setPassword("");
    setAnswer(null);
    setExpired(false);
    onOpenChange(false);
  }

  const ready = creating
    ? displayName.trim() !== "" && username.trim() !== "" && isPasswordLongEnough(password)
    : accountId !== "";

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    try {
      const result = await syncApi.addSecondLaptop(
        creating
          ? { newAccount: { displayName: displayName.trim(), username: username.trim(), roleId, password } }
          : { accountId },
      );
      if (!result.success) return void toast.error(errorMessage(result.error, t("Failed")));
      setPassword("");
      setAnswer(result.data);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-xl" data-sync-pair={answer ? "code" : "account"}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MonitorSmartphone className="size-5" />
            {t("Title")}
          </DialogTitle>
          <DialogDescription>{answer ? t("CodeHint") : t("Description")}</DialogDescription>
        </DialogHeader>

        {answer ? (
          <div className="flex min-w-0 flex-col gap-4">
            <div className="border-app flex min-w-0 flex-col items-center gap-2 rounded-xl border-info/35 bg-info/8 p-5 text-center">
              <p className="flex items-center gap-2 text-base font-bold text-muted-foreground">
                <KeyRound className="size-5" aria-hidden />
                {t("CodeTitle")}
              </p>
              {/* Left to right, in groups of four, large enough to read across a desk. */}
              <p
                dir="ltr"
                data-sync-code
                className={
                  "flex flex-wrap justify-center gap-x-4 gap-y-1 font-mono text-3xl font-bold tracking-widest tabular-nums select-all tall:text-4xl" +
                  (expired ? " text-muted-foreground line-through" : "")
                }
              >
                {groupPairingCode(answer.code).map((group, i) => (
                  <span key={i}>{group}</span>
                ))}
              </p>
            </div>
            <p className={expired ? "text-base font-bold text-destructive" : "text-base"}>
              {expired ? t("Expired") : t("Expires", { time: isolate(instant(answer.expiresAt).time) })}
            </p>
            {signsInAs && <p className="text-base">{t("SignInAs", { name: signsInAs })}</p>}
          </div>
        ) : (
          <form id="sync_pair_form" className="flex min-w-0 flex-col gap-5" onSubmit={submit}>
            {accounts.isSuccess && others.length === 0 ? (
              <p className="text-base leading-relaxed text-muted-foreground">{t("NoOtherAccount")}</p>
            ) : (
              <RadioGroup
                value={mode}
                onValueChange={(value) => setMode(value as "existing" | "new")}
                className="flex flex-col gap-3"
              >
                {(["existing", "new"] as const).map((value) => (
                  <label key={value} className="flex cursor-pointer items-center gap-3 text-base">
                    <RadioGroupItem value={value} id={`sync_pair_${value}`} />
                    {value === "existing" ? t("Existing") : t("New")}
                  </label>
                ))}
              </RadioGroup>
            )}

            {creating ? (
              <div className="grid min-w-0 gap-x-5 gap-y-4 sm:grid-cols-2">
                <div className="grid min-w-0 content-start gap-2 sm:col-span-2">
                  <Label htmlFor="sync_pair_name">{t("DisplayName")}</Label>
                  <Input id="sync_pair_name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
                  <p className="text-sm text-muted-foreground">{t("DisplayNameHint")}</p>
                </div>
                <div className="grid min-w-0 content-start gap-2">
                  <Label htmlFor="sync_pair_username">{t("Username")}</Label>
                  <Input
                    id="sync_pair_username"
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                  />
                </div>
                <div className="grid min-w-0 content-start gap-2">
                  <Label htmlFor="sync_pair_role">{t("Role")}</Label>
                  <Select value={roleId} onValueChange={(value) => setRoleId(value as RoleCode)}>
                    <SelectTrigger id="sync_pair_role" className="w-full">
                      <SelectValue placeholder={t("ChooseRole")} />
                    </SelectTrigger>
                    <SelectContent>
                      {ASSISTANT_ROLES.map((role) => (
                        <SelectItem key={role} value={role}>
                          {ROLE_LABELS[role][locale] ?? ROLE_LABELS[role].ar}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid min-w-0 content-start gap-2 sm:col-span-2">
                  <Label htmlFor="sync_pair_password">{t("Password")}</Label>
                  <Input
                    id="sync_pair_password"
                    dir="ltr"
                    type="password"
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                  <p className="text-sm text-muted-foreground">{t("PasswordHint", { min: MIN_PASSWORD_LENGTH })}</p>
                </div>
              </div>
            ) : (
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="sync_pair_account">{t("Account")}</Label>
                <Select value={accountId} onValueChange={setAccountId}>
                  <SelectTrigger id="sync_pair_account" className="w-full">
                    <SelectValue placeholder={t("ChooseAccount")} />
                  </SelectTrigger>
                  <SelectContent>
                    {others.map((account) => (
                      <SelectItem key={account.id} value={account.id}>
                        {account.displayName} · {account.role[locale] ?? account.role.ar} ·{" "}
                        <Ltr>{account.username}</Ltr>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form>
        )}

        <DialogFooter>
          {answer ? (
            <Button type="button" onClick={() => close(false)}>
              {tCommon("Close")}
            </Button>
          ) : (
            <>
              <Button type="button" variant="outline" onClick={() => close(false)} disabled={busy}>
                {tCommon("Cancel")}
              </Button>
              <Button type="submit" form="sync_pair_form" variant="success" loading={busy} disabled={!ready}>
                <KeyRound />
                {t("Next")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
