import { useQuery } from "@tanstack/react-query";
import { useWatch, type Control, type FieldPath, type FieldValues } from "react-hook-form";
import { useLocale } from "use-intl";

import { listCommunesQuery, PLACES_PATH } from "@/features/core/services/places";
import { ChoiceField, TextField } from "@/features/people/components/form-fields";
import { HOME_WILAYA_CODE } from "@/features/people/validators/staff-codes";
import { pathKey } from "@/lib/compat/revalidate";
import { WILAYAS } from "@/lib/geo/wilayas";

/**
 * «بلدية/ولاية إقامة»: the two blanks of his form, in his order, the commune
 * then the wilaya. The wilaya is one of the 69, the centre's by default. In the
 * centre's wilaya the commune is picked from its list; in another it is typed,
 * and kept the first time it is used (`ensureCommune`).
 *
 * Built here because the shared components have no commune picker yet; the
 * worker's registration and the employee's file both use it. The form holds
 * three values: `residenceWilayaCode`, `residenceCommuneId` (picked) and
 * `residenceCommuneName` (typed); the wilaya says which of the two counts.
 *
 * Closest academy component: none (its people have a free address only); the
 * two fields are drawn as the form's own birth commune and wilaya.
 */
export function ResidenceFields<T extends FieldValues>({
  control,
  communeLabel,
  wilayaLabel,
}: {
  control: Control<T>;
  communeLabel: string;
  wilayaLabel: string;
}) {
  const locale = useLocale();
  const name = (field: string) => field as FieldPath<T>;
  const wilaya = useWatch({ control, name: name("residenceWilayaCode") }) as string | undefined;
  const { data: communes = [] } = useQuery({
    queryKey: [...pathKey(PLACES_PATH), "communes", HOME_WILAYA_CODE],
    queryFn: () => listCommunesQuery({ wilayaCode: HOME_WILAYA_CODE }),
  });

  return (
    <>
      {(wilaya || HOME_WILAYA_CODE) === HOME_WILAYA_CODE ? (
        <ChoiceField
          control={control}
          name={name("residenceCommuneId")}
          label={communeLabel}
          options={communes.map((commune) => ({
            value: commune.id,
            label: locale === "ar" ? commune.nameAr : (commune.nameFr ?? commune.nameAr),
          }))}
        />
      ) : (
        <TextField control={control} name={name("residenceCommuneName")} label={communeLabel} />
      )}
      <ChoiceField
        control={control}
        name={name("residenceWilayaCode")}
        label={wilayaLabel}
        options={WILAYAS.map((each) => ({
          value: each.code,
          label: `${each.code} ${locale === "ar" ? each.nameAr : each.nameFr}`,
        }))}
      />
    </>
  );
}
