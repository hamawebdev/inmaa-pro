import { Plus, Printer } from "lucide-react";
import { Link } from "react-router-dom";
import { useTranslations } from "use-intl";

import { SectionScreen } from "@/components/section-screen";
import { Button } from "@/components/ui/button";
import { FILES_PATH } from "@/navigation/file-parts";

import { FilesView, useFilesFilter } from "./_components/files-view";

/**
 * Section «طلبات الخدمة», tab «الملفات»: the files of his four divisions.
 *
 * Closest academy screens: the groups' level switch and the attendance
 * family's two-axis list (see ./_components/files-view.tsx).
 */
export default function FilesPage() {
  const tNav = useTranslations("Nav");
  const t = useTranslations("Files");
  const tForms = useTranslations("FileForms");
  const { division, service } = useFilesFilter();
  const params = new URLSearchParams({ division });
  if (service !== "ALL") params.set("service", service);

  return (
    <SectionScreen
      section="requests"
      title={tNav("RequestsHeading")}
      actions={
        <>
          <Button asChild variant="outline">
            <Link to={`${FILES_PATH}/empty-forms`}>
              <Printer />
              {tForms("EmptyForms")}
            </Link>
          </Button>
          <Button asChild variant="add">
            <Link to={`${FILES_PATH}/new?${params.toString()}`}>
              <Plus />
              {t("NewFile")}
            </Link>
          </Button>
        </>
      }
    >
      <FilesView />
    </SectionScreen>
  );
}
