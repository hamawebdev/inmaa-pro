import { useTranslations } from "use-intl";

import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useBranches } from "@/hooks/use-branches";

/**
 * Picks a branch (feature 47): the active ones, the main one first, and the
 * one already chosen even if it was switched off since.
 *
 *  - On a form (an account's branch): `<BranchPicker id value onChange />`.
 *  - As a list's or a report's filter: `allowAll`, where null is «كل الفروع»;
 *    start it at `useSession().branchId` or at null, as the screen needs. The
 *    service takes `branchId: string | null` and filters with
 *    `.$if(input.branchId != null, (qb) => qb.where("x.branchId", "=", input.branchId!))`.
 *
 * Draw it only when `useBranches().several`: with one branch there is
 * nothing to choose.
 */
export function BranchPicker({
  id,
  value,
  onChange,
  allowAll = false,
  disabled,
}: {
  id: string;
  value: string | null;
  onChange: (branchId: string | null) => void;
  allowAll?: boolean;
  disabled?: boolean;
}) {
  const t = useTranslations("Branches");
  const { branches } = useBranches();
  const shown = branches.filter((branch) => branch.isActive || branch.id === value);
  return (
    <NativeSelect
      id={id}
      value={value ?? ""}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
    >
      {allowAll && <NativeSelectOption value="">{t("All")}</NativeSelectOption>}
      {shown.map((branch) => (
        <NativeSelectOption key={branch.id} value={branch.id}>
          {branch.name}
          {branch.isActive ? "" : ` (${t("Off")})`}
        </NativeSelectOption>
      ))}
    </NativeSelect>
  );
}
