import * as React from "react";

import { Cloud, Save } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { syncApi } from "@/features/sync/api";
import { useErrorMessage } from "@/i18n/errors";

/**
 * Not set up yet: the manager types the mailbox address and the setup key the
 * developer gave her (DECISION section 10). Once, on the director's laptop.
 */
export function SetUpCard({ onDone }: { onDone: () => void }) {
  const t = useTranslations("Sync.SetUp");
  const errorMessage = useErrorMessage();
  const [origin, setOrigin] = React.useState("");
  const [setupKey, setSetupKey] = React.useState("");
  const [deviceName, setDeviceName] = React.useState(() => t("DeviceNameDefault"));
  const [busy, setBusy] = React.useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const result = await syncApi.setUp({
        origin: origin.trim(),
        setupKey: setupKey.trim(),
        deviceName: deviceName.trim(),
      });
      if (!result.success) return void toast.error(errorMessage(result.error, t("Failed")));
      toast.success(t("Done"));
      setSetupKey("");
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-sync-setup>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Cloud className="size-5" />
          {t("Title")}
        </CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex min-w-0 flex-col gap-5" onSubmit={submit}>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="sync_origin">{t("Origin")}</Label>
            {/* An address reads left to right in every language. */}
            <Input
              id="sync_origin"
              dir="ltr"
              autoComplete="off"
              spellCheck={false}
              className="font-mono"
              value={origin}
              onChange={(event) => setOrigin(event.target.value)}
            />
            <p className="text-sm text-muted-foreground tall:text-base">{t("OriginHint")}</p>
          </div>
          <div className="grid min-w-0 gap-x-6 gap-y-5 md:grid-cols-2">
            <div className="grid min-w-0 content-start gap-2">
              <Label htmlFor="sync_setup_key">{t("SetupKey")}</Label>
              <Input
                id="sync_setup_key"
                dir="ltr"
                type="password"
                autoComplete="off"
                spellCheck={false}
                className="font-mono"
                value={setupKey}
                onChange={(event) => setSetupKey(event.target.value)}
              />
            </div>
            <div className="grid min-w-0 content-start gap-2">
              <Label htmlFor="sync_device_name">{t("DeviceName")}</Label>
              <Input id="sync_device_name" value={deviceName} onChange={(event) => setDeviceName(event.target.value)} />
            </div>
          </div>
          <PageActions className="mt-0 pt-5 tall:mt-0 tall:pt-6">
            <Button
              type="submit"
              variant="success"
              loading={busy}
              disabled={!origin.trim() || !setupKey.trim() || !deviceName.trim()}
            >
              <Save />
              {t("Submit")}
            </Button>
          </PageActions>
        </form>
      </CardContent>
    </Card>
  );
}
