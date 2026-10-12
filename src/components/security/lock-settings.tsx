import * as React from "react";

import { House, LockKeyhole, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { ErrorState } from "@/components/error-state";
import { PasswordCreateDialog } from "@/components/security/password-dialogs";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useSaveSettings, useSettings } from "@/hooks/use-settings";
import { isPasswordSet, verifyPassword } from "@/lib/auth";
import { LOCKABLE_SECTIONS, parseLockedSections, serializeLockedSections } from "@/lib/lockable-sections";
import { useUnlockStore } from "@/stores/unlock-store";

/**
 * The owner's choice of which sections the manager password protects.
 *
 * Rendered in two places from this one definition — a card on the Settings page
 * and the dialog behind the bottom bar's Lock item — so the two can never drift.
 *
 * **Self-gating**: when a password is set and the session is locked, this asks
 * for the password before revealing the list. Without that, an assistant
 * standing on an unprotected page could simply open the lock menu and untick
 * everything, which would make the whole feature decorative.
 */

/** Settings-page presentation of the same picker the lock dialog shows. */
export function LockSettingsCard() {
  const t = useTranslations("Auth");
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LockKeyhole className="size-5" />
          {t("LockSettings")}
        </CardTitle>
        <CardDescription>{t("LockSettingsDesc")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LockSettings />
      </CardContent>
    </Card>
  );
}

export function LockSettings() {
  const { data: settings, isPending, isError, refetch } = useSettings();
  const unlocked = useUnlockStore((s) => s.unlocked);

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  // Fail closed: a settings read that failed must not reveal the controls that
  // decide what is protected.
  if (isError) return <ErrorState onRetry={() => void refetch()} />;

  const passwordSet = isPasswordSet(settings);

  if (passwordSet && !unlocked) return <VerifyPrompt />;

  return <SectionPicker lockedPages={settings?.locked_pages} passwordSet={passwordSet} />;
}

/**
 * The password check guarding the list itself. Unlocks the whole session on
 * success, exactly like the route gate — a manager who proves who they are at
 * one door should not be asked again at the next.
 */
function VerifyPrompt() {
  const t = useTranslations("Auth");
  const unlock = useUnlockStore((s) => s.unlock);
  const [value, setValue] = React.useState("");
  const [error, setError] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    try {
      if (await verifyPassword(value)) {
        unlock();
        return;
      }
      setError(t("WrongPassword"));
      setValue("");
    } catch {
      toast.error(t("UnlockFailed"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <p className="flex items-start gap-2.5 text-base text-muted-foreground">
        <LockKeyhole className="mt-0.5 size-5 shrink-0" />
        {t("LockSettingsGated")}
      </p>
      <div className="grid max-w-xs gap-2">
        <Label htmlFor="lock_settings_password">{t("Password")}</Label>
        <Input
          id="lock_settings_password"
          // Same reason as the lock screen: a password rendered right-to-left in
          // Arabic is genuinely confusing to read back.
          dir="ltr"
          type="password"
          autoComplete="off"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            if (error) setError("");
          }}
          aria-invalid={!!error}
        />
        {error && (
          <p role="alert" className="text-base font-bold text-destructive">
            {error}
          </p>
        )}
      </div>
      <Button type="submit" loading={busy} disabled={!value.trim()}>
        {t("Unlock")}
      </Button>
    </form>
  );
}

function SectionPicker({ lockedPages, passwordSet }: { lockedPages: string | undefined; passwordSet: boolean }) {
  const t = useTranslations("Auth");
  const tNav = useTranslations("Nav");
  const save = useSaveSettings();
  const [createOpen, setCreateOpen] = React.useState(false);

  // Local state wins once the user has touched anything: this component is the
  // only writer, so it cannot go stale, and the checkbox responds on the click
  // instead of after the save round-trips through a query invalidation.
  const [selection, setSelection] = React.useState<string[] | null>(null);
  const locked = selection ?? parseLockedSections(lockedPages);

  function toggle(id: string, on: boolean) {
    const previous = locked;
    const next = on ? [...locked, id] : locked.filter((x) => x !== id);
    setSelection(next);
    save.mutate(
      { locked_pages: serializeLockedSections(next) },
      {
        onSuccess: () => toast.success(t("LockPagesSaved")),
        onError: () => {
          // Put the checkbox back where it was — leaving it ticked would tell
          // the owner a section is protected when nothing was written.
          setSelection(previous);
          toast.error(t("LockPagesSaveFailed"));
        },
      },
    );
  }

  return (
    <div className="space-y-5">
      {!passwordSet && (
        <div className="border-app space-y-3 rounded-xl border-destructive/45 bg-destructive/5 p-4">
          <p className="flex items-start gap-2.5 text-base">
            <ShieldAlert className="mt-0.5 size-5 shrink-0 text-destructive" />
            {t("NoPasswordWarning")}
          </p>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            {t("SetPassword")}
          </Button>
        </div>
      )}

      <div className="grid gap-1 sm:grid-cols-2">
        {LOCKABLE_SECTIONS.map((section) => {
          const id = `lock_section_${section.id}`;
          return (
            <div key={section.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-muted/50">
              <Checkbox
                id={id}
                checked={locked.includes(section.id)}
                onCheckedChange={(c) => toggle(section.id, c === true)}
              />
              <Label htmlFor={id} className="flex-1 cursor-pointer font-medium">
                {tNav(section.labelKey)}
              </Label>
            </div>
          );
        })}
      </div>

      {/* Stated, not silently omitted: an owner scanning the list for Overview
          needs to know why it is missing rather than assume a bug. */}
      <p className="flex items-start gap-2.5 text-base text-muted-foreground">
        <House className="mt-0.5 size-5 shrink-0" />
        {t("HomeAlwaysOpen")}
      </p>

      <PasswordCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
