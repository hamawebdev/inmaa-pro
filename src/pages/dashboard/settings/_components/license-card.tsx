import * as React from "react";

import { BadgeCheck, CalendarClock, CircleAlert, KeyRound } from "lucide-react";
import { useTranslations } from "use-intl";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useLicense } from "@/hooks/use-license";
import { licenseState, remainingKey, WARNING_MS } from "@/lib/license";

import { ActivateDialog } from "./activate-dialog";

/**
 * What the academy's licence says, in Settings, and where it is bought.
 *
 * Reporting only — nothing here decides anything, and no component anywhere
 * consults it to choose whether to render itself. Whether the app runs is
 * settled in Rust before a window exists; this card shows the answer and offers
 * the one action attached to it.
 *
 * The Activate button is deliberately available throughout the trial rather than
 * only once it runs out. An academy that has decided to buy should not have to
 * wait to be locked out first, and an owner who pays on day three and is then
 * shut down on day seven because nobody could enter the code early would be
 * right to be annoyed. It is the same code and the same command the lock screen
 * uses.
 *
 * The expired state is shown for completeness rather than because an academy
 * will see it here: an expired installation opens the lock window instead of the
 * app, so Settings is unreachable. It can only appear in the seconds between the
 * trial running out and the ticker swapping the window.
 */
export function LicenseCard() {
  const t = useTranslations("License");
  const { data: license, isPending } = useLicense();
  const [activateOpen, setActivateOpen] = React.useState(false);

  if (isPending || !license) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <KeyRound className="size-4" />
            {t("Title")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-8 w-64" />
        </CardContent>
      </Card>
    );
  }

  const state = licenseState(license);
  const bought = state === "unlocked";

  const { label, variant, Icon } = (() => {
    if (bought) {
      return { label: t("LifetimeActive"), variant: "success" as const, Icon: BadgeCheck };
    }
    if (state === "expired") {
      return { label: t("Expired"), variant: "destructive" as const, Icon: CircleAlert };
    }
    const remaining = license.remaining_ms ?? 0;
    const { key, count } = remainingKey(remaining);
    return {
      label: t(key, { count }),
      // Amber inside the final week: the academy is not in trouble yet, but this
      // is the point at which "I'll deal with it later" stops being free. Before
      // that it is a neutral fact, and a permanently red banner is a banner
      // nobody reads by day 25.
      variant: (remaining <= WARNING_MS ? "warning" : "info") as "warning" | "info",
      Icon: CalendarClock,
    };
  })();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <KeyRound className="size-4" />
          {bought ? t("LifetimeTitle") : t("Title")}
        </CardTitle>
        <CardDescription>
          {bought ? t("LifetimeDescription") : t("TrialDescription", { days: license.trial_days })}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-3">
        <Badge variant={variant}>
          <Icon />
          {label}
        </Badge>

        {/* Shown at all times, not only once locked: when the academy rings the
            number this is the first thing they will be asked for, and a support
            call that starts with "let it expire first" is a bad support call. */}
        <span className="text-base text-muted-foreground">
          {t("DeviceId")}
          {": "}
          <code dir="ltr" className="font-mono font-semibold select-all">
            {license.device_id}
          </code>
        </span>

        {/* Gone once bought, rather than disabled: there is nothing left to do,
            and a dead control invites an owner to wonder what it was for. */}
        {!bought && (
          <Button variant="outline" className="ms-auto" onClick={() => setActivateOpen(true)}>
            <KeyRound className="size-4 ltr:mr-1 rtl:ml-1" />
            {t("Activate")}
          </Button>
        )}
      </CardContent>

      {!bought && (
        <ActivateDialog
          open={activateOpen}
          onOpenChange={setActivateOpen}
          deviceId={license.device_id}
          phone={license.contact_phone}
        />
      )}
    </Card>
  );
}
