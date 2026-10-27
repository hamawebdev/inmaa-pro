import * as React from "react";

import { useQuery } from "@tanstack/react-query";
import { Check, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useLocale, useTranslations } from "use-intl";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addCommuneAction, listCommunesQuery, PLACES_PATH } from "@/features/core/services/places";
import { useErrorMessage } from "@/i18n/errors";
import { pathKey } from "@/lib/compat/revalidate";
import { WILAYAS } from "@/lib/geo/wilayas";

/**
 * A place as his forms ask for it: the wilaya, then the commune.
 *
 *     const [place, setPlace] = useState<PlaceValue>({ wilayaCode: "04", communeId: null });
 *     <CommunePicker id="residence" value={place} onChange={setPlace} />
 *
 * The 69 wilayas are a fixed list (src/lib/geo/wilayas.ts). The communes of
 * a wilaya are rows: the 29 of أم البواقي are seeded, and any other is added
 * here the first time the office needs it («إضافة بلدية»), once, for every
 * screen. Two spellings of one name are one commune (`ensureCommune`).
 *
 * The value is the stored shape: `wilayaCode` and `communeId`. Changing the
 * wilaya empties the commune. Save with `ensureZoneForCommune` where a zone
 * follows from the place (a site, a worker's residence).
 *
 * Both lists are the program's own dropdown: a choice applies on «تأكيد», and
 * the 69 wilayas (or a long list of communes) open with a search box.
 */
export interface PlaceValue {
  wilayaCode: string;
  communeId: string | null;
}

export function CommunePicker({
  id,
  value,
  onChange,
  disabled = false,
  invalid = false,
  className,
}: {
  id: string;
  value: PlaceValue;
  onChange: (value: PlaceValue) => void;
  disabled?: boolean;
  invalid?: boolean;
  className?: string;
}) {
  const t = useTranslations("Places");
  const tPickers = useTranslations("Pickers");
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const [adding, setAdding] = React.useState(false);
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  const communes = useQuery({
    queryKey: [...pathKey(PLACES_PATH), "communes", value.wilayaCode],
    queryFn: () => listCommunesQuery({ wilayaCode: value.wilayaCode }),
    enabled: value.wilayaCode !== "",
  });

  async function add() {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const result = await addCommuneAction({ wilayaCode: value.wilayaCode, nameAr: name });
      if (!result.success) {
        toast.error(errorMessage(result.error, t("AddFailed")));
        return;
      }
      // The list is refreshed by the action; the new commune is chosen at once.
      await communes.refetch();
      onChange({ wilayaCode: value.wilayaCode, communeId: result.data.id });
      setName("");
      setAdding(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className} data-commune-picker>
      <div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]">
        <Select
          value={value.wilayaCode}
          disabled={disabled}
          onValueChange={(wilayaCode) => {
            setAdding(false);
            onChange({ wilayaCode, communeId: null });
          }}
        >
          <SelectTrigger id={`${id}-wilaya`} aria-label={t("Wilaya")} className="w-full">
            <SelectValue placeholder={tPickers("Choose")} />
          </SelectTrigger>
          <SelectContent>
            {WILAYAS.map((wilaya) => (
              <SelectItem key={wilaya.code} value={wilaya.code}>
                {wilaya.code} — {locale === "ar" ? wilaya.nameAr : wilaya.nameFr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={value.communeId ?? ""}
          disabled={disabled || communes.isPending}
          onValueChange={(communeId) => onChange({ wilayaCode: value.wilayaCode, communeId: communeId || null })}
        >
          <SelectTrigger id={id} aria-label={t("Commune")} aria-invalid={invalid} className="w-full">
            <SelectValue placeholder={t("ChooseCommune")} />
          </SelectTrigger>
          <SelectContent>
            {(communes.data ?? []).map((commune) => (
              <SelectItem key={commune.id} value={commune.id}>
                {locale === "ar" || !commune.nameFr ? commune.nameAr : commune.nameFr}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!disabled && !adding && (
          <Button type="button" variant="outline" onClick={() => setAdding(true)} data-commune-add>
            <Plus />
            {t("AddCommune")}
          </Button>
        )}
      </div>
      {adding && (
        <div className="mt-3 flex min-w-0 flex-wrap items-center gap-3">
          <Input
            aria-label={t("NewCommuneName")}
            placeholder={t("NewCommuneName")}
            value={name}
            autoFocus
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              // Inside somebody's form: Enter adds the commune, it does not send the form.
              if (event.key === "Enter") {
                event.preventDefault();
                void add();
              }
            }}
            className="min-w-0 flex-1 basis-56"
          />
          <Button type="button" variant="success" loading={busy} disabled={!name.trim()} onClick={() => void add()}>
            <Check />
            {t("Add")}
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={t("Cancel")}
            disabled={busy}
            onClick={() => {
              setAdding(false);
              setName("");
            }}
          >
            <X />
          </Button>
        </div>
      )}
    </div>
  );
}
