import { useSearchParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { StaffCardsScreen } from "@/features/people/components/staff-cards-screen";

/**
 * The ID cards of the workers chosen in the list (`?ids=a,b,c`), eight to a
 * page. Section «عمال النظافة», below the tab «العمال». Owner: People.
 * Closest academy screen: the ID card page.
 */
export default function WorkerCardsPrintPage() {
  const [params] = useSearchParams();
  const tNav = useTranslations("Nav");
  const ids = (params.get("ids") ?? "").split(",").filter(Boolean);
  return (
    <StaffCardsScreen ids={ids} section="workers" back={{ href: "/dashboard/workers", label: tNav("WorkersList") }} />
  );
}
