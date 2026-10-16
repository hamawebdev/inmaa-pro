import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { StaffCardsScreen } from "@/features/people/components/staff-cards-screen";

/**
 * A worker's ID card, to print (scope R9). Section «عمال النظافة», below the
 * tab «العمال». Owner: People. Closest academy screen: the ID card page.
 */
export default function WorkerCardPrintPage() {
  const { id = "" } = useParams<{ id: string }>();
  const t = useTranslations("Cards");
  return (
    <StaffCardsScreen
      ids={[id]}
      section="workers"
      back={{ href: `/dashboard/workers/${id}`, label: t("BackToFile") }}
    />
  );
}
