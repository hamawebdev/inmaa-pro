import * as React from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { PageActions } from "@/components/screen";
import { MediaUploadField, createEmptyUploadSelection, type UploadSelection } from "@/components/media-upload-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useErrorMessage } from "@/i18n/errors";
import { LOGO_UPLOAD_RULE } from "@/lib/uploads";
import { getCurrentAdminBranding } from "@/server/branding";
import { updateAdminBranding } from "@/features/core/services/branding";

/**
 * The centre's own name and logo.
 *
 * First card on the screen because it is the one setting that reaches paper —
 * every printed student card, teacher card and payment receipt carries these,
 * so getting them wrong is visible outside the building.
 *
 * Saves behind an explicit button rather than on change, unlike the language and
 * theme cards below: these three fields are typed together and only make sense
 * committed as one, and a half-typed centre name written on every keystroke
 * would reach the print templates.
 */
export function CentreIdentityCard() {
  const t = useTranslations("Settings.Identity");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const qc = useQueryClient();

  const { data: branding, isPending } = useQuery({
    queryKey: ["branding"],
    queryFn: getCurrentAdminBranding,
  });

  const [academyName, setAcademyName] = React.useState<string | null>(null);
  const [adminName, setAdminName] = React.useState<string | null>(null);
  const [logo, setLogo] = React.useState<UploadSelection>(createEmptyUploadSelection);

  // Local state wins once touched, and falls back to the query until then — so
  // the fields fill in when the data arrives without clobbering typing.
  const nameValue = academyName ?? branding?.academyName ?? "";
  const adminValue = adminName ?? branding?.adminName ?? "";

  const save = useMutation({
    mutationFn: () =>
      updateAdminBranding({
        academyName: nameValue,
        adminName: adminValue,
        logoFile: logo.file,
        removeLogo: logo.removeExisting,
      }),
    onSuccess: async (result) => {
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      setLogo(createEmptyUploadSelection());
      await qc.invalidateQueries({ queryKey: ["branding"] });
      toast.success(t("Saved"));
    },
    onError: () => toast.error(t("SaveFailed")),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("Title")}</CardTitle>
        <CardDescription>{t("Description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {isPending ? (
          <Skeleton className="h-56 w-full" />
        ) : (
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="centre_name">{t("CentreName")}</Label>
                <Input
                  id="centre_name"
                  value={nameValue}
                  onChange={(e) => setAcademyName(e.target.value)}
                  aria-invalid={!nameValue.trim()}
                />
              </div>
              <div className="grid min-w-0 gap-2">
                <Label htmlFor="admin_name">{t("ManagerName")}</Label>
                <Input id="admin_name" value={adminValue} onChange={(e) => setAdminName(e.target.value)} />
              </div>
            </div>

            <MediaUploadField
              label={t("Logo")}
              description={t("LogoHint")}
              rule={LOGO_UPLOAD_RULE}
              existingUrl={branding?.logoUrl}
              value={logo}
              onChange={setLogo}
              disabled={save.isPending}
              previewAlt={t("Logo")}
            />

            <PageActions className="mt-0 pt-5 tall:mt-0 tall:pt-6">
              <Button type="submit" variant="success" loading={save.isPending} disabled={!nameValue.trim()}>
                <Save />
                {tCommon("Save")}
              </Button>
            </PageActions>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
