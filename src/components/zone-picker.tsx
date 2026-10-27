import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "use-intl";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listZonesQuery, PLACES_PATH } from "@/features/core/services/places";
import { pathKey } from "@/lib/compat/revalidate";

/** The item that stands for no zone (null), when `allowNone`: the dropdown keeps "" for "nothing chosen yet". */
const NONE = "__none__";

/**
 * A zone of the centre: the areas its workers and supervisors are spread over
 * (أم البواقي, عين البيضاء, عين مليلة…).
 *
 *     <ZonePicker id="zone" value={zoneId} onChange={setZoneId} />
 *
 * A zone is made the first time a commune needs one (`ensureZoneForCommune`)
 * and named after it; Settings › قواعد العمل moves a commune to another zone.
 * `allowNone` adds the empty choice, for a filter or an optional zone; without
 * it an empty value shows `noneLabel` (or «اختر المنطقة») as the field's
 * placeholder. The program's own dropdown: the choice applies on «تأكيد».
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
  const none = noneLabel ?? t("ChooseZone");
  return (
    <Select
      value={value ?? (allowNone ? NONE : "")}
      disabled={disabled || zones.isPending}
      onValueChange={(next) => onChange(next === NONE || next === "" ? null : next)}
    >
      <SelectTrigger id={id} aria-label={t("Zone")} className={className} data-zone-picker>
        <SelectValue placeholder={none} />
      </SelectTrigger>
      <SelectContent>
        {allowNone && <SelectItem value={NONE}>{none}</SelectItem>}
        {(zones.data ?? []).map((zone) => (
          <SelectItem key={zone.id} value={zone.id}>
            {zone.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
