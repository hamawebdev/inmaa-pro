import { useTranslations } from "use-intl";

import { DetailScreen } from "@/components/detail-screen";
import { PrintButton } from "@/components/print";
import { ScreenTabs } from "@/components/screen-tabs";
import type { WorkerFormData } from "@/features/people/forms/worker-form-data";
import { WORKER_SHEET_PARTS, type WorkerSheetPart } from "@/features/people/sheets/worker-sheet-parts";
import { WorkerSheet } from "@/features/people/sheets/worker-sheets";

/**
 * The screen that shows his worker form as it will print, empty or filled.
 *
 * Closest academy screen: the ID card page (employees/[id]/card), a print
 * button above the thing that prints. Here that is Foundation's print sheet,
 * as on the sample at Settings (settings/print-sample).
 *
 * The switch chooses the pages of the job: all four, the registration alone or
 * the regulations alone. It is a route like every other switch in the program,
 * so each choice can be opened and printed by its own address.
 */

/** Where each choice of pages lives: `…/print`, `…/print-registration`, `…/print-regulations`. */
function partHref(base: string, part: WorkerSheetPart): string {
  return part === "all" ? `${base}/print` : `${base}/print-${part}`;
}

export function WorkerPrintScreen({
  base,
  part,
  data,
  title,
  description,
  note,
}: {
  /** The record's own path, or the workers list for the blank form. */
  base: string;
  part: WorkerSheetPart;
  data: WorkerFormData;
  title: string;
  description: string;
  /** A line above the sheet, for something the reader must know before printing. */
  note?: string;
}) {
  const t = useTranslations("WorkerPrint");
  const tNav = useTranslations("Nav");

  return (
    <DetailScreen
      section="workers"
      title={title}
      description={description}
      back={{ href: "/dashboard/workers", label: tNav("WorkersList") }}
      actions={<PrintButton />}
    >
      <div className="space-y-5">
        <ScreenTabs
          section="workers"
          items={WORKER_SHEET_PARTS.map((id) => ({ id, label: t(`Parts.${id}`), href: partHref(base, id) }))}
          value={part}
          ariaLabel={t("PartsLabel")}
        />
        {note && <p className="text-base font-semibold text-warning-ink">{note}</p>}
        <WorkerSheet part={part} data={data} />
      </div>
    </DetailScreen>
  );
}
