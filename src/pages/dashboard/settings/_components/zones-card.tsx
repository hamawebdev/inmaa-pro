import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { MapPinned, Save } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "use-intl";

import { CommunePicker, type PlaceValue } from "@/components/commune-picker";
import { PageActions } from "@/components/screen";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ZonePicker } from "@/components/zone-picker";
import { listCommunesQuery, PLACES_PATH, remapCommuneAction } from "@/features/core/services/places";
import { useCan } from "@/hooks/use-session";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * Zones and communes (DESIGN.md section 11: a list kept as a table, edited in
 * Settings › قواعد العمل). A commune gets a zone of its own name the first
 * time a site or a residence is saved there; this card moves it to another
 * zone, and the sites of that commune follow (`zone.remapped`). Adding a
 * commune the seed does not hold is the picker's own «إضافة بلدية».
 */
export function ZonesCard() {
  const t = useTranslations("Places");
  const tCommon = useTranslations("Common");
  const errorMessage = useErrorMessage();
  const mayWrite = useCan("settings.rules");
  const [place, setPlace] = React.useState<PlaceValue>({ wilayaCode: "04", communeId: null });
  const [zoneId, setZoneId] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // The same query as the picker's: the commune's present zone comes with its row.
  const communes = useQuery({
    queryKey: [...pathKey(PLACES_PATH), "communes", place.wilayaCode],
    queryFn: () => listCommunesQuery({ wilayaCode: place.wilayaCode }),
  });
  const commune = communes.data?.find((row) => row.id === place.communeId) ?? null;
  const target = zoneId ?? commune?.zoneId ?? null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!commune || !target || busy) return;
    setBusy(true);
    try {
      const result = await remapCommuneAction({ communeId: commune.id, toZoneId: target });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("SaveFailed")));
        return;
      }
      toast.success(t("ZoneSaved"));
      setZoneId(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card data-settings-group="zones">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MapPinned className="size-5" />
          {t("ZonesTitle")}
        </CardTitle>
        <CardDescription>{t("ZonesDescription")}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="flex min-w-0 flex-col gap-5" onSubmit={save}>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="zones_commune">{t("Commune")}</Label>
            <CommunePicker
              id="zones_commune"
              value={place}
              disabled={!mayWrite}
              onChange={(next) => {
                setPlace(next);
                setZoneId(null);
              }}
            />
          </div>
          <div className="grid min-w-0 gap-2 md:max-w-md">
            <Label htmlFor="zones_zone">{t("Zone")}</Label>
            <ZonePicker
              id="zones_zone"
              value={target}
              onChange={setZoneId}
              disabled={!mayWrite || !commune}
              allowNone={!commune?.zoneId}
              noneLabel={commune ? t("NoZoneYet") : t("ChooseCommuneFirst")}
            />
          </div>
          {mayWrite && (
            <PageActions className="mt-0 pt-5 tall:mt-0 tall:pt-6">
              <Button
                type="submit"
                variant="success"
                loading={busy}
                disabled={!commune || !target || target === commune.zoneId}
              >
                <Save />
                {tCommon("Save")}
              </Button>
            </PageActions>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
