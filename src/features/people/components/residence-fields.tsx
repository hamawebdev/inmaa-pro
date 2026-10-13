import { useController, type Control, type FieldPath, type FieldValues } from "react-hook-form";

import { CommunePicker } from "@/components/commune-picker";
import { Field, FieldLabel } from "@/components/ui/field";
import { HOME_WILAYA_CODE } from "@/features/people/validators/staff-codes";

/**
 * «بلدية/ولاية إقامة»: Foundation's commune picker, the wilaya then the
 * commune, bound to the form's `residenceWilayaCode` and `residenceCommuneId`.
 * The centre's wilaya is chosen by default; a commune of another wilaya is
 * added from the picker the first time (`ensureCommune`). His one label
 * stands over the two lists, as over his two blanks.
 */
export function ResidenceField<T extends FieldValues>({
  control,
  label,
  className,
}: {
  control: Control<T>;
  label: string;
  className?: string;
}) {
  const wilaya = useController({ control, name: "residenceWilayaCode" as FieldPath<T> });
  const commune = useController({ control, name: "residenceCommuneId" as FieldPath<T> });
  return (
    <Field className={className}>
      <FieldLabel htmlFor="field-residence">{label}</FieldLabel>
      <CommunePicker
        id="field-residence"
        value={{
          wilayaCode: (wilaya.field.value as string) || HOME_WILAYA_CODE,
          communeId: (commune.field.value as string) || null,
        }}
        onChange={(next) => {
          wilaya.field.onChange(next.wilayaCode);
          commune.field.onChange(next.communeId ?? "");
        }}
      />
    </Field>
  );
}
