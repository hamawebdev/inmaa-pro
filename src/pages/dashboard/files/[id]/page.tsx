import { Link, useParams } from "react-router-dom";
import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PagePlaceholder } from "@/components/page-placeholder";
import { Button } from "@/components/ui/button";
import { FILE_PARTS, filePartHref, FILES_PATH } from "@/navigation/file-parts";

/**
 * Placeholder. The file hub: one page per part of a service-request file.
 * Owner: Clients and contracts.
 *
 * The parts come from the registry in src/navigation/file-parts.ts, which is
 * Foundation's: three owners build those pages, and the hub links to all of
 * them without any owner editing another's file.
 */
export default function FileHubPage() {
  const { id = "" } = useParams();
  const tNav = useTranslations("Nav");

  return (
    <DetailScreen section="requests" title={tNav("FileHub")} back={{ href: FILES_PATH, label: tNav("Files") }}>
      <div className="space-y-6">
        <nav aria-label={tNav("FileParts")} className="flex flex-wrap gap-3">
          {FILE_PARTS.map((part) => (
            <Button key={part.id} asChild variant="outline">
              <Link to={filePartHref(id, part.id)}>{tNav(part.labelKey)}</Link>
            </Button>
          ))}
        </nav>
        <PagePlaceholder owner="clients" />
      </div>
    </DetailScreen>
  );
}
