import { platform, version } from "@tauri-apps/plugin-os";
import { Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { Ltr } from "@/components/ltr";
import { SectionScreen } from "@/components/section-screen";
import { LockSettingsCard } from "@/components/security/lock-settings";
import { ManagerPasswordSection } from "@/components/security/manager-password-section";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_CONFIG } from "@/config/app-config";

import { AppearanceCard, LanguageCard } from "./_components/appearance-cards";
import { BackupCard } from "./_components/backup-card";
import { CentreIdentityCard } from "./_components/centre-identity-card";
import { LicenseCard } from "./_components/license-card";

/**
 * Settings › عام: everything the centre configures once and then leaves alone.
 *
 * These are the academy shell's cards, in the academy's order, which runs from
 * what the centre *is* to what the program *does with it*:
 *
 *  1. Identity, first because it is the only setting that reaches paper.
 *  2. Language and appearance: how this machine shows everything above.
 *  3. The password, then the picker that depends on it — choosing what to
 *     protect only makes sense once you have seen whether protection is on.
 *  4. Backup, because it is the one action here with no undo.
 *  5. The licence, then System — two footers more than settings. The licence
 *     sits beside the version and the OS because that is the block a support
 *     call asks you to read out.
 *
 * The other three tabs (work rules, users and permissions, the log) are their
 * own pages beside this one.
 */
export default function SettingsPage() {
  const t = useTranslations("Settings");
  const tNav = useTranslations("Nav");

  // plugin-os exposes platform()/version() synchronously under Tauri.
  const osInfo = `${platform()} ${version()}`;

  return (
    <SectionScreen
      section="settings"
      title={tNav("SettingsHeading")}
      description={t("Description")}
      className="max-w-4xl"
    >
      <div className="flex flex-col gap-6 tall:gap-7">
        <CentreIdentityCard />
        <LanguageCard />
        <AppearanceCard />

        <ManagerPasswordSection />
        <LockSettingsCard />

        <BackupCard />

        <LicenseCard />

        <Card>
          <CardHeader>
            <CardTitle>{t("System.Title")}</CardTitle>
            <CardDescription>{t("System.Description")}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-base break-words tall:text-lg">
              {APP_CONFIG.name} <Ltr>{APP_CONFIG.version}</Ltr>
            </p>
            <p className="text-base break-words text-muted-foreground tall:text-lg">
              <Ltr>{osInfo}</Ltr>
            </p>
            {/* For a new PC: shows what its printer does with the paper's edges
                before a real contract is printed. */}
            <Button asChild variant="outline" className="mt-3">
              <Link to="/dashboard/settings/print-sample">
                <Printer />
                {t("System.SampleSheet")}
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </SectionScreen>
  );
}
