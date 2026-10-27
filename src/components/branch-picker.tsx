import { useTranslations } from "use-intl";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useBranches } from "@/hooks/use-branches";

/** The item that stands for «كل الفروع» (null): the dropdown keeps "" for "nothing chosen yet". */
const ALL = "__all__";

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
 * nothing to choose. The program's own dropdown: the choice applies on «تأكيد».
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
  const tPickers = useTranslations("Pickers");
  const { branches } = useBranches();
  const shown = branches.filter((branch) => branch.isActive || branch.id === value);
  return (
    <Select
      value={value ?? (allowAll ? ALL : "")}
      disabled={disabled}
      onValueChange={(next) => onChange(next === ALL || next === "" ? null : next)}
    >
      <SelectTrigger id={id} className="w-full">
        <SelectValue placeholder={tPickers("Choose")} />
      </SelectTrigger>
      <SelectContent>
        {allowAll && <SelectItem value={ALL}>{t("All")}</SelectItem>}
        {shown.map((branch) => (
          <SelectItem key={branch.id} value={branch.id}>
            {branch.name}
            {branch.isActive ? "" : ` (${t("Off")})`}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
