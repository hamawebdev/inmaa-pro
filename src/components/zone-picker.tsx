import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { listZonesQuery, PLACES_PATH } from "@/features/core/services/places";
import { pathKey } from "@/lib/compat/revalidate";

/**
 * A zone of the centre: the areas its workers and supervisors are spread over
 * (أم البواقي, عين البيضاء, عين مليلة…).
 *
 *     <ZonePicker id="zone" value={zoneId} onChange={setZoneId} />
 *
 * A zone is made the first time a commune needs one (`ensureZoneForCommune`)
 * and named after it; Settings › قواعد العمل moves a commune to another zone.
 * `allowNone` adds the empty choice, for a filter or an optional zone.
 */
export function ZonePicker({
  id,
  value,
  onChange,
  disabled = false,
  allowNone = false,
  noneLabel,
  className,
}: {
  id: string;
  value: string | null;
  onChange: (zoneId: string | null) => void;
  disabled?: boolean;
  allowNone?: boolean;
  noneLabel?: string;
  className?: string;
}) {
  const t = useTranslations("Places");
  const zones = useQuery({
    queryKey: [...pathKey(PLACES_PATH), "zones"],
    queryFn: () => listZonesQuery(undefined),
  });
  return (
    <NativeSelect
      id={id}
      aria-label={t("Zone")}
      className={className}
      value={value ?? ""}
      disabled={disabled || zones.isPending}
      onChange={(event) => onChange(event.target.value || null)}
      data-zone-picker
    >
      {(allowNone || value === null) && (
        <NativeSelectOption value="">{noneLabel ?? t("ChooseZone")}</NativeSelectOption>
      )}
      {(zones.data ?? []).map((zone) => (
        <NativeSelectOption key={zone.id} value={zone.id}>
          {zone.name}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
