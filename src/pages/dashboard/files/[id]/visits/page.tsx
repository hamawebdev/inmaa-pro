import { useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { fileHubHref } from "@/navigation/file-parts";

import { FileVisits } from "./_components/file-visits";

/**
 * A file's part «الزيارات» (#7): the programme its form calls for, the button
 * that makes the missing visits, and every visit of the file.
 *
 * Closest academy screen: the attendance overview
 * (pages/dashboard/attendance/_components/staff-attendance-overview.tsx), a
 * table with row buttons under a summary card. A part is a detail page: it has
 * a back action to the file, not a tab strip.
 */
export default function FileVisitsPage() {
  const { id = "" } = useParams();
  const tNav = useTranslations("Nav");

  return (
    <DetailScreen
      section="requests"
      title={tNav("FilePartVisits")}
      back={{ href: fileHubHref(id), label: tNav("FileHub") }}
    >
      <FileVisits fileId={id} />
    </DetailScreen>
  );
}
