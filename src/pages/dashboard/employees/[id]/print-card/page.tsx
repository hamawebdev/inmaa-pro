import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { StaffCardsScreen } from "@/features/people/components/staff-cards-screen";

/**
 * An employee's ID card, to print (scope R9). Section «الموظفون», below the
 * tab «الموظفون». Owner: People. Closest academy screen: the ID card page.
 */
export default function EmployeeCardPrintPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Cards");
  return (
    <StaffCardsScreen
      ids={[id]}
      section="employees"
      back={{ href: `/dashboard/employees/${id}`, label: t("BackToFile") }}
    />
  );
}
