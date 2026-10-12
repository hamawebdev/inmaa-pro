import { PageBreak, PrintSheet } from "@/components/print";
import type { WorkerFormData } from "@/features/people/forms/worker-form-data";

import { WORKER_FORM_MARGINS } from "./his-type";
import { RegistrationBack, RegistrationFront } from "./worker-registration";
import { Regulations, type WorkerRegulationsData } from "./worker-regulations";
import type { WorkerSheetPart } from "./worker-sheet-parts";

/**
 * His worker form on paper: «-01- تسجيل عامل نظافة».
 *
 * Four A4 pages, as his Word file prints: the registration on pages 1 and 2,
 * the internal regulations with the worker's acknowledgement on pages 3 and 4,
 * his letterhead and his margins on every page.
 *
 * Each sheet is a picture of the object it is given. `EMPTY_WORKER_FORM` prints
 * the blank form the office hands out; a worker's record prints it filled.
 *
 * Pages 1 and 2 each end where his do: his file fills the rest of each with
 * empty paragraphs, which a page break says more plainly. Pages 3 and 4 are one
 * run of text and break where the page is full, as in Word.
 */

/** The whole form in one job: the registration, then the regulations. */
export function WorkerFormSheet({ data }: { data: WorkerFormData }) {
  return (
    <PrintSheet letterhead="worker" margins={WORKER_FORM_MARGINS}>
      <RegistrationFront data={data} />
      <PageBreak />
      <RegistrationBack data={data} />
      <PageBreak />
      <Regulations data={data} />
    </PrintSheet>
  );
}

/** Pages 1 and 2: «استمارة التسجيل بمركز إنماء». */
export function WorkerRegistrationSheet({ data }: { data: WorkerFormData }) {
  return (
    <PrintSheet letterhead="worker" margins={WORKER_FORM_MARGINS}>
      <RegistrationFront data={data} />
      <PageBreak />
      <RegistrationBack data={data} />
    </PrintSheet>
  );
}

/** Pages 3 and 4: «النظام الداخلي لعمال وعاملات النظافة», with the worker's acknowledgement. */
export function WorkerRegulationsSheet({ data }: { data: WorkerRegulationsData }) {
  return (
    <PrintSheet letterhead="worker" margins={WORKER_FORM_MARGINS}>
      <Regulations data={data} />
    </PrintSheet>
  );
}

/** The sheet for one choice of pages. */
export function WorkerSheet({ part, data }: { part: WorkerSheetPart; data: WorkerFormData }) {
  if (part === "registration") return <WorkerRegistrationSheet data={data} />;
  if (part === "regulations") return <WorkerRegulationsSheet data={data} />;
  return <WorkerFormSheet data={data} />;
}
