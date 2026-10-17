import type { Capability, SectionCode, SectionLevel } from "@/lib/access/catalogue";
import { can, sectionLevel } from "@/lib/access/session";
import type { Session } from "@/lib/service/context";

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
 *
 * Each part also says what opens it (`opens`: any one of its keys is enough),
 * so that the hub leaves out what the reader could only be refused (S-31):
 *
 *     const parts = FILE_PARTS.filter((part) => mayOpenFilePart(session, part));
 *
 * The part's own services check again; this is what the screen shows.
 */

export type FilePartOwner = "clients" | "operations" | "money";

/** One way into a part: a level on a bar section (READ is met by WRITE), or a capability. */
export type FilePartKey = { section: SectionCode; level: SectionLevel } | { capability: Capability };

export interface FilePart {
  /** The path segment after `/dashboard/files/:id/`. Also the page's folder name. */
  id: string;
  labelKey: string;
  owner: FilePartOwner;
  /** What opens the part: any one of these. */
  opens: readonly FilePartKey[];
}

const FILE: readonly FilePartKey[] = [{ section: "REQUESTS", level: "READ" }];

export const FILE_PARTS = [
  // His sheet for the file, printed in his Word layout.
  { id: "form", labelKey: "FilePartForm", owner: "clients", opens: FILE },
  { id: "inspection", labelKey: "FilePartInspection", owner: "clients", opens: FILE },
  // The cost study: the centre's costs and margin.
  { id: "financial-study", labelKey: "FilePartFinancialStudy", owner: "clients", opens: [{ capability: "cost.read" }] },
  { id: "quote", labelKey: "FilePartQuote", owner: "clients", opens: FILE },
  { id: "contract", labelKey: "FilePartContract", owner: "clients", opens: FILE },
  // Daily, weekly and monthly task lists.
  { id: "tasks", labelKey: "FilePartTasks", owner: "operations", opens: FILE },
  { id: "visits", labelKey: "FilePartVisits", owner: "operations", opens: FILE },
  // Buildings and residential complexes only; the hub decides when to show it.
  { id: "residents", labelKey: "FilePartResidents", owner: "clients", opens: [{ capability: "residents.read" }] },
  { id: "handouts", labelKey: "FilePartHandouts", owner: "money", opens: [{ section: "STOCK", level: "READ" }] },
  {
    id: "payments",
    labelKey: "FilePartPayments",
    owner: "money",
    opens: [{ section: "MONEY", level: "READ" }, { capability: "payment.record" }],
  },
] as const satisfies readonly FilePart[];

export type FilePartId = (typeof FILE_PARTS)[number]["id"];

/** Whether the reader may open a part of a file (the manager and the program open them all). */
export function mayOpenFilePart(who: Session, part: Pick<FilePart, "opens">): boolean {
  return part.opens.some((key) => {
    if ("capability" in key) return can(who, key.capability);
    const held = sectionLevel(who, key.section);
    return held === "WRITE" || (held === "READ" && key.level === "READ");
  });
}

/** The list every file is opened from. */
export const FILES_PATH = "/dashboard/files";

export function fileHubHref(fileId: string): string {
  return `${FILES_PATH}/${encodeURIComponent(fileId)}`;
}

export function filePartHref(fileId: string, part: FilePartId): string {
  return `${fileHubHref(fileId)}/${part}`;
}
