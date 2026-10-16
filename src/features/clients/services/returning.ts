import { requireSection } from "@/lib/access/session";
import { logConsultOnce } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { normaliseName } from "@/lib/text/normalise";

import type { FormValues } from "../forms/values";
import { returningClientFill } from "../rules/returning-client";
import type { SiteOfficeInput } from "../validators/file-values";
import { FORM_KIND_OF, type Division, type FormKind } from "../validators/option-lists";

import { liveSheetValuesOf, loadFileRecord } from "./file-records";
import { siteOfficeOf } from "./file-reads";

/**
 * «قديم» (plan feature 40; his red note: «يضغط على زر قديم ☐ و يتم ملئها …
 * تلقائيا»): finding a client the centre already knows, and what a new file
 * for him starts with.
 *
 * The search is a list, not logged; the fill reads the client's latest file
 * and copies what `rules/returning-client.ts` says: who he is always, where the
 * site is and what it is made of when one of his sites is chosen.
 */

export interface ReturningSite {
  id: string;
  division: Division;
  commonName: string | null;
  address: string;
  communeName: string | null;
  /** The latest file of the site: what the description is copied from. */
  lastFileId: string | null;
  lastFileNumber: string | null;
}

export interface ReturningClient {
  id: string;
  number: string;
  name: string;
  managerName: string | null;
  phone: string;
  sites: ReturningSite[];
}

/** The clients a name, a common name, a file number or a phone finds, each with his sites. */
export async function findReturningClients(
  ex: Executor,
  ctx: ServiceContext,
  input: { search: string },
): Promise<ReturningClient[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const typed = input.search.trim();
  const key = normaliseName(typed).replace(/[%_]/g, "");
  const digits = typed.replace(/\D/g, "");
  if (typed === "") return [];

  const clients = await ex
    .selectFrom("Client as c")
    .select(["c.id", "c.number", "c.name", "c.managerName", "c.phone1"])
    .where("c.deletedAt", "is", null)
    .where((eb) => {
      const any = [eb("c.number", "=", typed)];
      if (key.length >= 2) {
        any.push(eb("c.nameKey", "like", `%${key}%`), eb("c.managerNameKey", "like", `%${key}%`));
        any.push(
          eb.exists(
            eb
              .selectFrom("Site as s")
              .select("s.id")
              .whereRef("s.clientId", "=", "c.id")
              .where("s.commonNameKey", "like", `%${key}%`),
          ),
        );
      }
      if (digits.length >= 4) any.push(eb("c.phoneKeys", "like", `%${digits}%`));
      return eb.or(any);
    })
    .orderBy("c.name")
    .limit(20)
    .execute();
  if (clients.length === 0) return [];

  const ids = clients.map((client) => client.id);
  const sites = await ex
    .selectFrom("Site as s")
    .leftJoin("Commune as m", "m.id", "s.communeId")
    .select(["s.id", "s.clientId", "s.division", "s.commonName", "s.address", "m.nameAr as communeName"])
    .where("s.clientId", "in", ids)
    .where("s.deletedAt", "is", null)
    .orderBy("s.createdAt")
    .execute();
  const files = await ex
    .selectFrom("File")
    .select(["id", "siteId", "number", "registrationDate", "createdAt"])
    .where("clientId", "in", ids)
    .where("deletedAt", "is", null)
    .orderBy("registrationDate", "desc")
    .orderBy("createdAt", "desc")
    .execute();

  return clients.map((client) => ({
    id: client.id,
    number: client.number,
    name: client.name,
    managerName: client.managerName,
    phone: client.phone1,
    sites: sites
      .filter((site) => site.clientId === client.id)
      .map((site) => {
        const last = files.find((file) => file.siteId === site.id);
        return {
          id: site.id,
          division: site.division as Division,
          commonName: site.commonName,
          address: site.address,
          communeName: site.communeName ?? null,
          lastFileId: last?.id ?? null,
          lastFileNumber: last?.number ?? null,
        };
      }),
  }));
}

export interface ReturningFillResult {
  clientId: string;
  clientNumber: string;
  clientName: string;
  /** The site the file is for, or null for a new site of his. */
  siteId: string | null;
  /** The file the form was filled from, kept on the new file as `copiedFromFileId`. */
  copiedFromFileId: string | null;
  values: FormValues;
  /** The site's office block, when the site is his own: it is the site's, so the form shows it as it is. */
  siteOffice: SiteOfficeInput | null;
}

/**
 * What a new file of this form starts with for a returning client: who he is,
 * and, when one of his sites of this division is chosen, where it is and what
 * it is made of, from that site's latest file.
 */
export async function getReturningFill(
  ex: Executor,
  ctx: ServiceContext,
  input: { kind: FormKind; clientId: string; siteId?: string | null },
): Promise<ReturningFillResult> {
  requireSection(ctx, "REQUESTS", "READ");
  const client = await ex
    .selectFrom("Client")
    .select(["id", "number", "name"])
    .where("id", "=", input.clientId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!client) throw new ServiceError("This client does not exist.");

  const { division } = FORM_KIND_OF[input.kind];
  const site = input.siteId
    ? await ex
        .selectFrom("Site")
        .select(["id", "division"])
        .where("id", "=", input.siteId)
        .where("clientId", "=", client.id)
        .where("deletedAt", "is", null)
        .executeTakeFirst()
    : undefined;
  // A site of another division cannot carry this file: the client is known, the site is new.
  const sameSite = site !== undefined && site.division === division;

  let files = ex
    .selectFrom("File")
    .select("id")
    .where("clientId", "=", client.id)
    .where("deletedAt", "is", null)
    .orderBy("registrationDate", "desc")
    .orderBy("createdAt", "desc");
  if (sameSite) files = files.where("siteId", "=", site.id);
  const latest = await files.executeTakeFirst();
  const record = latest ? await loadFileRecord(ex, latest.id) : null;
  if (!record) {
    return {
      clientId: client.id,
      clientNumber: client.number,
      clientName: client.name,
      siteId: null,
      copiedFromFileId: null,
      values: { clientName: client.name, dossierNumber: client.number },
      siteOffice: null,
    };
  }

  // Reading his previous file is opening a person's file (audit LOG-15): once a day per reader and file.
  await logConsultOnce(ex, ctx, {
    owner: "CLIENTS",
    action: "VIEW",
    entity: "File",
    entityId: record.file.id,
    entityLabel: record.file.number,
    subject: { kind: "CLIENT", id: client.id, label: client.name },
    context: { purpose: "RETURNING_FILL" },
  });
  const values = returningClientFill({
    kind: input.kind,
    previous: liveSheetValuesOf(record),
    site: sameSite ? "same" : "new",
    purpose: "returning",
  });
  return {
    clientId: client.id,
    clientNumber: client.number,
    clientName: client.name,
    siteId: sameSite ? site.id : null,
    copiedFromFileId: sameSite ? record.file.id : null,
    values: { ...values, dossierNumber: client.number },
    siteOffice: sameSite ? siteOfficeOf(record.site) : null,
  };
}

export const findReturningClientsQuery = query(findReturningClients);
// The fill writes its line in the log: an action.
export const getReturningFillAction = action(getReturningFill);
