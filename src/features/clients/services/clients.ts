import { z } from "zod";

import { getFilePaymentSummary } from "@/features/money/services/dues";
import { getSanctionStates } from "@/features/people/services/sanctions";
import type { SanctionState } from "@/features/people/validators/staff-codes";
import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logCollect, logConsult, logErase } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { normaliseName, phoneKeys } from "@/lib/text/normalise";
import { FILES_PATH } from "@/navigation/file-parts";

import { missingIdentifiersOf, type MissingIdentifier } from "../rules/client-identifiers";
import type { Division, FileStage, FormKind } from "../validators/option-lists";

/**
 * «العملاء» (plan feature 1): the clients the centre knows, and one client's
 * card: who he is, his sites, his files, whether he is suspended or penalised,
 * and the legal identifiers an organisation's invoice needs (LAW 05-468:
 * RC, NIS, NIF; Money refuses an organisation's first invoice without its RC).
 */

export const CLIENTS_PATH = "/dashboard/clients";

export type ClientType = "PERSON" | "ORGANISATION" | "BUILDING" | "COMPLEX";

export interface ClientListRow {
  id: string;
  number: string;
  name: string;
  managerName: string | null;
  clientType: string;
  phone: string;
  divisions: Division[];
  sites: number;
  files: number;
  /** Files at «متعاقد» and not closed. */
  liveFiles: number;
  lastRegistered: string | null;
  sanction: SanctionState | null;
  missingIdentifiers: MissingIdentifier[];
}

/** The clients, the newest first, found by name, manager, common name, number or phone. */
export async function listClients(
  ex: Executor,
  ctx: ServiceContext,
  input: { search?: string; division?: Division } = {},
): Promise<ClientListRow[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const typed = (input.search ?? "").trim();
  const key = normaliseName(typed).replace(/[%_]/g, "");
  const digits = typed.replace(/\D/g, "");
  let rows = ex
    .selectFrom("Client as c")
    .select([
      "c.id",
      "c.number",
      "c.numberSeq",
      "c.name",
      "c.managerName",
      "c.clientType",
      "c.phone1",
      "c.hasTradeRegister",
      "c.rcNumber",
      "c.nif",
      "c.nis",
      "c.createdAt",
    ])
    .where("c.deletedAt", "is", null);
  if (typed) {
    rows = rows.where((eb) => {
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
    });
  }
  if (input.division) {
    const division = input.division;
    rows = rows.where((eb) =>
      eb.exists(
        eb
          .selectFrom("Site as d")
          .select("d.id")
          .whereRef("d.clientId", "=", "c.id")
          .where("d.division", "=", division),
      ),
    );
  }
  const clients = await rows.orderBy("c.createdAt", "desc").orderBy("c.numberSeq", "desc").execute();
  if (clients.length === 0) return [];
  const ids = clients.map((client) => client.id);
  const [sites, files, states] = await Promise.all([
    ex
      .selectFrom("Site")
      .select(["clientId", "division"])
      .where("clientId", "in", ids)
      .where("deletedAt", "is", null)
      .execute(),
    ex
      .selectFrom("File")
      .select(["clientId", "stage", "closedAt", "registrationDate"])
      .where("clientId", "in", ids)
      .where("deletedAt", "is", null)
      .execute(),
    getSanctionStates(ex, ctx, { kind: "CLIENT", ids }),
  ]);
  return clients.map((client) => {
    const own = files.filter((file) => file.clientId === client.id);
    const ownSites = sites.filter((site) => site.clientId === client.id);
    return {
      id: client.id,
      number: client.number,
      name: client.name,
      managerName: client.managerName,
      clientType: client.clientType,
      phone: client.phone1,
      divisions: [...new Set(ownSites.map((site) => site.division as Division))],
      sites: ownSites.length,
      files: own.length,
      liveFiles: own.filter((file) => file.stage === "CONTRACTED" && file.closedAt === null).length,
      lastRegistered:
        own
          .map((file) => file.registrationDate)
          .sort()
          .at(-1) ?? null,
      sanction: states[client.id]?.state ?? null,
      missingIdentifiers: missingIdentifiersOf(client),
    };
  });
}

export interface ClientIdentifiers {
  legalForm: string | null;
  rcNumber: string | null;
  nis: string | null;
  nif: string | null;
  articleNumber: string | null;
  billingName: string | null;
  billingAddress: string | null;
  phone2: string | null;
  email: string | null;
  note: string | null;
}

export const CONTACT_FLAGS = [
  "signsHandover",
  "receivesInvoice",
  "isCoordinator",
  "holdsKey",
  "followsService",
] as const;
export type ContactFlag = (typeof CONTACT_FLAGS)[number];

export interface ContactView {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  phone2: string | null;
  siteId: string | null;
  note: string | null;
  flags: Record<ContactFlag, boolean>;
}

export interface ClientCard {
  id: string;
  number: string;
  name: string;
  clientType: string;
  managerName: string | null;
  capacity: string | null;
  sector: string | null;
  hasTradeRegister: boolean | null;
  phone: string;
  identifiers: ClientIdentifiers;
  missingIdentifiers: MissingIdentifier[];
  contacts: ContactView[];
  sites: {
    id: string;
    division: Division;
    commonName: string | null;
    address: string;
    communeName: string | null;
  }[];
  files: {
    id: string;
    number: string;
    formKind: FormKind;
    division: Division;
    stage: FileStage;
    closed: boolean;
    registrationDate: string;
    startDate: string | null;
    endDate: string | null;
    siteId: string;
    /** The last visit done and the next one to come (Operations' visits, read as CONTRACTS section 2 allows). */
    lastVisit: string | null;
    nextVisit: string | null;
    /** Money's payment state of the file («حالة الدفع»), or null when nothing is due yet. */
    payment: { state: string; remaining: number; overdue: number } | null;
    /** The average of the client's overall ratings on the file's signed-off visits (1 to 5), and how many. */
    rating: { average: number; count: number } | null;
  }[];
}

/** Opens a client's card: a person's file opened, logged once a day per reader. */
export async function openClientCard(
  ex: Executor,
  ctx: ServiceContext,
  input: { clientId: string },
): Promise<ClientCard> {
  requireSection(ctx, "REQUESTS", "READ");
  const client = await ex
    .selectFrom("Client")
    .selectAll()
    .where("id", "=", input.clientId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!client) throw new ServiceError("This client does not exist.");

  let already = ex
    .selectFrom("AuditLog")
    .select("id")
    .where("operation", "=", "CONSULT")
    .where("entity", "=", "Client")
    .where("entityId", "=", client.id)
    .where("localDate", "=", ctx.today);
  already = ctx.userId === null ? already.where("userId", "is", null) : already.where("userId", "=", ctx.userId);
  if (!(await already.executeTakeFirst())) {
    await logConsult(ex, ctx, {
      owner: "CLIENTS",
      action: "VIEW",
      entity: "Client",
      entityId: client.id,
      entityLabel: client.number,
      subject: { kind: "CLIENT", id: client.id, label: client.name },
    });
  }

  const [sites, files, contacts] = await Promise.all([
    ex
      .selectFrom("Site as s")
      .leftJoin("Commune as m", "m.id", "s.communeId")
      .select(["s.id", "s.division", "s.commonName", "s.address", "m.nameAr as communeName"])
      .where("s.clientId", "=", client.id)
      .where("s.deletedAt", "is", null)
      .orderBy("s.createdAt")
      .execute(),
    ex
      .selectFrom("File")
      .select([
        "id",
        "number",
        "formKind",
        "division",
        "stage",
        "closedAt",
        "registrationDate",
        "startDate",
        "endDate",
        "siteId",
      ])
      .where("clientId", "=", client.id)
      .where("deletedAt", "is", null)
      .orderBy("registrationDate", "desc")
      .orderBy("createdAt", "desc")
      .execute(),
    ex
      .selectFrom("Contact")
      .selectAll()
      .where("clientId", "=", client.id)
      .where("deletedAt", "is", null)
      .orderBy("createdAt")
      .execute(),
  ]);
  return {
    id: client.id,
    number: client.number,
    name: client.name,
    clientType: client.clientType,
    managerName: client.managerName,
    capacity: client.capacity,
    sector: client.sector,
    hasTradeRegister: client.hasTradeRegister === null ? null : client.hasTradeRegister === 1,
    phone: client.phone1,
    identifiers: {
      legalForm: client.legalForm,
      rcNumber: client.rcNumber,
      nis: client.nis,
      nif: client.nif,
      articleNumber: client.articleNumber,
      billingName: client.billingName,
      billingAddress: client.billingAddress,
      phone2: client.phone2,
      email: client.email,
      note: client.note,
    },
    missingIdentifiers: missingIdentifiersOf(client),
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      role: contact.role,
      phone: contact.phone,
      phone2: contact.phone2,
      siteId: contact.siteId,
      note: contact.note,
      flags: Object.fromEntries(CONTACT_FLAGS.map((flag) => [flag, contact[flag] === 1])) as Record<
        ContactFlag,
        boolean
      >,
    })),
    sites: sites.map((site) => ({
      id: site.id,
      division: site.division as Division,
      commonName: site.commonName,
      address: site.address,
      communeName: site.communeName ?? null,
    })),
    files: await Promise.all(
      files.map(async (file) => ({
        ...(await serviceSummaryOf(ex, ctx, file.id)),
        id: file.id,
        number: file.number,
        formKind: file.formKind as FormKind,
        division: file.division as Division,
        stage: file.stage as FileStage,
        closed: file.closedAt !== null,
        registrationDate: file.registrationDate,
        startDate: file.startDate,
        endDate: file.endDate,
        siteId: file.siteId,
      })),
    ),
  };
}

/** A file's last and next visit, its payment state and its rating, for the client card (scope section 3). */
async function serviceSummaryOf(ex: Executor, ctx: ServiceContext, fileId: string) {
  const [last, next, ratings] = await Promise.all([
    ex
      .selectFrom("Visit")
      .select("visitDate")
      .where("fileId", "=", fileId)
      .where("status", "=", "DONE")
      .orderBy("visitDate", "desc")
      .executeTakeFirst(),
    ex
      .selectFrom("Visit")
      .select("visitDate")
      .where("fileId", "=", fileId)
      .where("status", "in", ["CONFIRMED", "AWAITING_CONFIRMATION", "IN_PROGRESS"])
      .where("visitDate", ">=", ctx.today)
      .orderBy("visitDate")
      .executeTakeFirst(),
    ex
      .selectFrom("VisitReport as r")
      .innerJoin("Visit as v", "v.id", "r.visitId")
      .select("r.ratingOverall")
      .where("v.fileId", "=", fileId)
      .where("r.ratingOverall", "is not", null)
      .execute(),
  ]);
  const summary = await getFilePaymentSummary(ex, ctx, { fileId });
  const scores = ratings.map((row) => row.ratingOverall!);
  return {
    lastVisit: last?.visitDate ?? null,
    nextVisit: next?.visitDate ?? null,
    payment:
      summary.amount > 0 ? { state: summary.state, remaining: summary.remaining, overdue: summary.overdue } : null,
    rating: scores.length
      ? {
          average: Math.round((scores.reduce((sum, score) => sum + score, 0) / scores.length) * 10) / 10,
          count: scores.length,
        }
      : null,
  };
}

const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .nullish()
    .transform((value) => {
      const trimmed = value?.trim() ?? "";
      return trimmed === "" ? null : trimmed;
    });

export const clientIdentifiersSchema = z.object({
  /** «السجل التجاري» (لا / نعم) of an organisation, answered on the card when his form left it blank. */
  hasTradeRegister: z.boolean().nullish(),
  legalForm: optionalText(60),
  rcNumber: optionalText(40),
  nis: optionalText(40),
  nif: optionalText(40),
  articleNumber: optionalText(40),
  billingName: optionalText(200),
  billingAddress: optionalText(400),
  phone2: optionalText(30).refine(
    (value) => value === null || /^\d{9,10}$/.test(value.replace(/[\s./-]/g, "")),
    "The phone number has 9 or 10 digits.",
  ),
  email: optionalText(200).refine(
    (value) => value === null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value),
    "Enter a valid email address.",
  ),
  note: optionalText(2000),
});
export type ClientIdentifiersInput = z.input<typeof clientIdentifiersSchema>;

/**
 * Saves what the office keeps about a client beyond his forms: the legal
 * identifiers an invoice prints (RC, NIS, NIF, article number, legal form, the
 * name and address to bill), a second phone, an e-mail, a note. Only what
 * changed is sent and logged. What his forms print (name, manager, phone) is
 * changed from a file's «الاستمارة».
 */
export async function saveClientIdentifiers(
  ex: Executor,
  ctx: ServiceContext,
  input: { clientId: string; identifiers: ClientIdentifiersInput },
): Promise<{ clientId: string; changed: boolean }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const parsed = clientIdentifiersSchema.safeParse(input.identifiers);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  const before = await ex
    .selectFrom("Client")
    .selectAll()
    .where("id", "=", input.clientId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!before) throw new ServiceError("This client does not exist.");

  const { hasTradeRegister, ...values } = parsed.data;
  const { set, changes } = changedColumns(before, {
    ...values,
    ...(hasTradeRegister === undefined
      ? {}
      : { hasTradeRegister: hasTradeRegister === null ? null : hasTradeRegister ? 1 : 0 }),
    // The second phone finds him too («قديم», the sanction check).
    phoneKeys: phoneKeys([before.phone1, values.phone2]),
  });
  if (!changes) return { clientId: before.id, changed: false };
  await ex
    .updateTable("Client")
    .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  const { phoneKeys: _keys, ...logged } = changes;
  await logChange(ex, ctx, {
    owner: "CLIENTS",
    action: "UPDATE",
    entity: "Client",
    entityId: before.id,
    entityLabel: before.number,
    subject: { kind: "CLIENT", id: before.id, label: before.name },
    changes: logged,
  });
  return { clientId: before.id, changed: true };
}

export const contactSchema = z.object({
  name: z.string().trim().min(1, "The contact's name is required.").max(200),
  role: optionalText(100),
  phone: optionalText(30).refine(
    (value) => value === null || /^\d{9,10}$/.test(value.replace(/[\s./-]/g, "")),
    "The phone number has 9 or 10 digits.",
  ),
  phone2: optionalText(30).refine(
    (value) => value === null || /^\d{9,10}$/.test(value.replace(/[\s./-]/g, "")),
    "The phone number has 9 or 10 digits.",
  ),
  siteId: z.string().nullable(),
  note: optionalText(1000),
  flags: z.object(
    Object.fromEntries(CONTACT_FLAGS.map((flag) => [flag, z.boolean()])) as Record<ContactFlag, z.ZodBoolean>,
  ),
});
export type ContactInput = z.input<typeof contactSchema>;

/**
 * A contact person of the client (his forms' people on site): who signs the
 * hand-over, receives the invoice, coordinates the site, holds a key, follows
 * the service. One coordinator per site.
 */
export async function saveContact(
  ex: Executor,
  ctx: ServiceContext,
  input: { clientId: string; contactId?: string | null; contact: ContactInput },
): Promise<{ contactId: string; changed: boolean }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const parsed = contactSchema.safeParse(input.contact);
  if (!parsed.success) throw new ServiceError(parsed.error.issues[0]?.message ?? "Invalid form submission.");
  const contact = parsed.data;
  const client = await ex
    .selectFrom("Client")
    .select(["id", "name"])
    .where("id", "=", input.clientId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!client) throw new ServiceError("This client does not exist.");
  if (contact.siteId) {
    const site = await ex
      .selectFrom("Site")
      .select("id")
      .where("id", "=", contact.siteId)
      .where("clientId", "=", client.id)
      .executeTakeFirst();
    if (!site) throw new ServiceError("This site is not one of this client's sites in this division.");
    if (contact.flags.isCoordinator) {
      let other = ex
        .selectFrom("Contact")
        .select("id")
        .where("siteId", "=", contact.siteId)
        .where("isCoordinator", "=", 1)
        .where("deletedAt", "is", null);
      if (input.contactId) other = other.where("id", "<>", input.contactId);
      if (await other.executeTakeFirst()) throw new ServiceError("This site already has a coordinator.");
    }
  }
  const columns = {
    name: contact.name,
    role: contact.role,
    phone: contact.phone,
    phone2: contact.phone2,
    siteId: contact.siteId,
    note: contact.note,
    ...Object.fromEntries(CONTACT_FLAGS.map((flag) => [flag, contact.flags[flag] ? 1 : 0])),
  };
  const log = { owner: "CLIENTS", entity: "Contact" } as const;
  if (input.contactId) {
    const before = await ex
      .selectFrom("Contact")
      .selectAll()
      .where("id", "=", input.contactId)
      .where("clientId", "=", client.id)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!before) throw new ServiceError("This contact does not exist.");
    const { set, changes } = changedColumns(before, columns);
    if (!changes) return { contactId: before.id, changed: false };
    await ex
      .updateTable("Contact")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", before.id)
      .execute();
    await logChange(ex, ctx, {
      ...log,
      action: "UPDATE",
      entityId: before.id,
      entityLabel: contact.name,
      subject: { kind: "CONTACT", id: before.id, label: contact.name },
      changes,
    });
    return { contactId: before.id, changed: true };
  }
  const id = newId();
  await ex
    .insertInto("Contact")
    .values({
      id,
      clientId: client.id,
      ...(columns as typeof columns & Record<ContactFlag, number>),
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logCollect(ex, ctx, {
    ...log,
    action: "CREATE",
    entityId: id,
    entityLabel: contact.name,
    subject: { kind: "CONTACT", id, label: contact.name },
    context: { clientId: client.id },
  });
  return { contactId: id, changed: true };
}

/** A contact taken off the card, with the reason typed. */
export async function removeContact(
  ex: Executor,
  ctx: ServiceContext,
  input: { contactId: string; reason: string },
): Promise<{ contactId: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const before = await ex
    .selectFrom("Contact")
    .selectAll()
    .where("id", "=", input.contactId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!before) throw new ServiceError("This contact does not exist.");
  await ex
    .updateTable("Contact")
    .set({ deletedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", before.id)
    .execute();
  await logErase(ex, ctx, {
    owner: "CLIENTS",
    action: "SOFT_DELETE",
    reason,
    entity: "Contact",
    entityId: before.id,
    entityLabel: before.name,
    subject: { kind: "CONTACT", id: before.id, label: before.name },
  });
  return { contactId: before.id };
}

export const listClientsQuery = query(listClients);
export const saveContactAction = action(saveContact, { revalidate: [CLIENTS_PATH] });
export const removeContactAction = action(removeContact, { revalidate: [CLIENTS_PATH] });
export const openClientCardAction = action(openClientCard);
export const saveClientIdentifiersAction = action(saveClientIdentifiers, {
  revalidate: [CLIENTS_PATH, FILES_PATH],
});
