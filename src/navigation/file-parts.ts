/**
 * The ten parts of a service-request file, in the order the hub lists them.
 *
 * A file (`/dashboard/files/:id`) is a hub page with one page per part, each
 * with a back action, as the academy does for a student. Three owners build
 * those pages, so the list lives here, with Foundation: the hub page reads it
 * and links to every part without knowing who built which, and no owner edits
 * another's file to add a link.
 *
 * Each part's page is `src/pages/dashboard/files/[id]/<id>/page.tsx`, declared
 * in its owner's route list. The label is a key in the `Nav` namespace.
 */

export type FilePartOwner = "clients" | "operations" | "money";

export interface FilePart {
  /** The path segment after `/dashboard/files/:id/`. Also the page's folder name. */
  id: string;
  labelKey: string;
  owner: FilePartOwner;
}

export const FILE_PARTS = [
  // His sheet for the file, printed in his Word layout.
  { id: "form", labelKey: "FilePartForm", owner: "clients" },
  { id: "inspection", labelKey: "FilePartInspection", owner: "clients" },
  { id: "financial-study", labelKey: "FilePartFinancialStudy", owner: "clients" },
  { id: "quote", labelKey: "FilePartQuote", owner: "clients" },
  { id: "contract", labelKey: "FilePartContract", owner: "clients" },
  // Daily, weekly and monthly task lists.
  { id: "tasks", labelKey: "FilePartTasks", owner: "operations" },
  { id: "visits", labelKey: "FilePartVisits", owner: "operations" },
  // Buildings and residential complexes only; the hub decides when to show it.
  { id: "residents", labelKey: "FilePartResidents", owner: "clients" },
  { id: "handouts", labelKey: "FilePartHandouts", owner: "money" },
  { id: "payments", labelKey: "FilePartPayments", owner: "money" },
] as const satisfies readonly FilePart[];

export type FilePartId = (typeof FILE_PARTS)[number]["id"];

/** The list every file is opened from. */
export const FILES_PATH = "/dashboard/files";

export function fileHubHref(fileId: string): string {
  return `${FILES_PATH}/${encodeURIComponent(fileId)}`;
}

export function filePartHref(fileId: string, part: FilePartId): string {
  return `${fileHubHref(fileId)}/${part}`;
}
