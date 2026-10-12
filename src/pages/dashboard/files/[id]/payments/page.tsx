import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PagePlaceholder } from "@/components/page-placeholder";
import { fileHubHref } from "@/navigation/file-parts";

/**
 * Placeholder. A file's part «التسديد». Owner: Money and stock.
 *
 * A part is a detail page: it has a back action to the file, not a tab strip.
 */
export default function FilePaymentsPage() {
  const { id = "" } = useParams();
  const tNav = useTranslations("Nav");

  return (
    <DetailScreen
      section="requests"
      title={tNav("FilePartPayments")}
      back={{ href: fileHubHref(id), label: tNav("FileHub") }}
    >
      <PagePlaceholder owner="money" />
    </DetailScreen>
  );
}
