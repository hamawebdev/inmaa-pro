import * as React from "react";

import { Pencil, Plus, Power, PowerOff, Save } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { useConfirm } from "@/components/confirm-dialog";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { saveBranchAction, setBranchActiveAction, type BranchRow } from "@/features/core/services/branches";
import { useBranches } from "@/hooks/use-branches";
import { useSession } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { MANAGER_ROLE } from "@/lib/access/catalogue";
import { phoneText } from "@/lib/text/phone";

/**
 * The centre's branches (plan feature 47): one database, a branch on every
 * account and on what it writes. The main branch first. Adding, renaming and
 * switching off are the manager's; anyone who opens Settings reads the list.
 *
 * Closest academy screen: the settings cards with a list and a dialog (the
 * backup card's list, the accounts tab's dialogs).
 */
export function BranchesCard() {
  const t = useTranslations("Branches");
  const errorMessage = useErrorMessage();
  const isManager = useSession()?.roleId === MANAGER_ROLE;
  const { branches, isPending } = useBranches();
  const [editing, setEditing] = React.useState<BranchRow | "new" | null>(null);
  const [confirm, confirmDialog] = useConfirm();

  async function switchActive(branch: BranchRow) {
    if (branch.isActive) {
      const ok = await confirm({
        title: t("SwitchOffTitle", { name: branch.name }),
        description: t("SwitchOffHint"),
        confirmLabel: t("SwitchOff"),
        tone: "danger",
      });
      if (!ok) return;
    }
    const result = await setBranchActiveAction({ id: branch.id, active: !branch.isActive });
    if (!result.success) toast.error(errorMessage(result.error, t("SaveFailed")));
    else toast.success(branch.isActive ? t("SwitchedOff") : t("SwitchedOn"));
  }

  return (
    <Card data-settings-group="branches">
      <CardHeader>
        <CardTitle>{t("Title")}</CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-col gap-4">
        {isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ul className="flex min-w-0 flex-col">
            {branches.map((branch) => (
              <li
                key={branch.id}
                data-branch={branch.code}
                className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2 border-b border-border/60 py-3"
              >
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex flex-wrap items-center gap-2 text-lg font-bold">
                    {branch.name}
                    <Ltr className="text-base font-normal text-muted-foreground">{branch.code}</Ltr>
                  </span>
                  {(branch.address || branch.phone) && (
                    <span className="text-base text-muted-foreground">
                      {branch.address}
                      {branch.address && branch.phone ? " · " : ""}
                      {branch.phone && <Ltr>{phoneText(branch.phone)}</Ltr>}
                    </span>
                  )}
                </div>
                <StatusChip
                  tone={branch.isDefault ? "info" : branch.isActive ? "success" : "neutral"}
                  label={branch.isDefault ? t("Main") : branch.isActive ? t("Active") : t("Off")}
                />
                {isManager && (
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="edit" size="sm" onClick={() => setEditing(branch)}>
                      <Pencil />
                      {t("Edit")}
                    </Button>
                    {!branch.isDefault && (
                      <Button type="button" variant="outline" size="sm" onClick={() => void switchActive(branch)}>
                        {branch.isActive ? <PowerOff /> : <Power />}
                        {branch.isActive ? t("SwitchOff") : t("SwitchOn")}
                      </Button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        {isManager && (
          <div>
            <Button type="button" variant="add" onClick={() => setEditing("new")}>
              <Plus />
              {t("Add")}
            </Button>
          </div>
        )}
      </CardContent>
      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing === "new" ? t("Add") : t("Edit")}</DialogTitle>
            <DialogDescription>{t("DialogHint")}</DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <BranchForm
              key={editing === "new" ? "new" : editing.id}
              branch={editing === "new" ? null : editing}
              onDone={() => setEditing(null)}
            />
          )}
        </DialogContent>
      </Dialog>
      {confirmDialog}
    </Card>
  );
}

function BranchForm({ branch, onDone }: { branch: BranchRow | null; onDone: () => void }) {
  const t = useTranslations("Branches");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const [name, setName] = React.useState(branch?.name ?? "");
  const [code, setCode] = React.useState(branch?.code ?? "");
  const [address, setAddress] = React.useState(branch?.address ?? "");
  const [phone, setPhone] = React.useState(branch?.phone ?? "");
  const [city, setCity] = React.useState(branch?.city ?? "");
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await saveBranchAction({ id: branch?.id, name, code, address, phone, city });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("Saved"));
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="branch_name">{t("Name")}</Label>
          <Input id="branch_name" value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="branch_code">{t("Code")}</Label>
          <Input
            id="branch_code"
            dir="ltr"
            value={code}
            maxLength={6}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            className="text-start"
          />
        </div>
      </div>
      <div className="grid gap-2">
        <Label htmlFor="branch_address">{t("Address")}</Label>
        <Input id="branch_address" value={address} onChange={(event) => setAddress(event.target.value)} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="branch_phone">{t("Phone")}</Label>
          <Input
            id="branch_phone"
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="text-start"
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="branch_city">{t("City")}</Label>
          <Input id="branch_city" value={city} onChange={(event) => setCity(event.target.value)} />
        </div>
      </div>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onDone}>
          {tCommon("Cancel")}
        </Button>
        <Button type="submit" variant="success" loading={busy} disabled={!name.trim() || !code.trim()}>
          <Save />
          {tCommon("Save")}
        </Button>
      </DialogFooter>
    </form>
  );
}
