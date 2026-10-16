import { getClientForInvoice, type ClientForInvoice } from "@/features/clients/services/exports";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { getSettings } from "@/lib/settings";

import type { BuyerSnapshot, SellerSnapshot } from "../sheets/invoice-sheet";

import type { FileBilling } from "./terms";

/**
 * The two parties of a legal document, as they are frozen on it when it is
 * issued: the centre from Settings, the client through Clients'
 * `getClientForInvoice` (CONTRACTS.md section 3).
 */

const orNull = (text: string | null | undefined) => (text && text.trim() !== "" ? text.trim() : null);

export async function readSeller(ex: Executor): Promise<SellerSnapshot> {
  const centre = await getSettings(ex, [
    "centre.nameAr",
    "centre.nameLatin",
    "centre.legalForm",
    "centre.address",
    "centre.phone",
    "centre.rc",
    "centre.nis",
    "centre.nif",
    "centre.nin",
    "centre.articleNumber",
    "centre.bankName",
    "centre.bankAccount",
    "centre.ccpNumber",
    "centre.city",
    "centre.ccpKey",
  ]);
  return {
    nameAr: centre["centre.nameAr"],
    nameLatin: orNull(centre["centre.nameLatin"]),
    legalForm: orNull(centre["centre.legalForm"]),
    address: orNull(centre["centre.address"]),
    phone: orNull(centre["centre.phone"]),
    rc: orNull(centre["centre.rc"]),
    nis: orNull(centre["centre.nis"]),
    nif: orNull(centre["centre.nif"]),
    nin: orNull(centre["centre.nin"]),
    articleNumber: orNull(centre["centre.articleNumber"]),
    bankName: orNull(centre["centre.bankName"]),
    bankAccount: orNull(centre["centre.bankAccount"]),
    ccpNumber: orNull(centre["centre.ccpNumber"]),
    ccpKey: orNull(centre["centre.ccpKey"]),
    city: orNull(centre["centre.city"]),
  };
}

export interface FileParty {
  clientId: string;
  /** The client as its file names it. */
  clientName: string;
  clientNumber: string;
  /** The site's address with its commune: what a statement and a slip print. */
  siteAddress: string;
  siteName: string | null;
  /**
   * What the client still lacks before an invoice, as Clients' card says it (`getClientForInvoice`):
   * the address, an organisation's answer to «السجل التجاري», its RC, NIF and NIS.
   */
  missing: ClientForInvoice["missing"];
  buyer: BuyerSnapshot;
}

/**
 * The client of a file as an invoice names it, through Clients' own read
 * (`getClientForInvoice`): the billing name, the billing address alone or the
 * site's with its commune and wilaya, the identifiers. The site's address is
 * read beside it for the visit statement, which names the place cleaned.
 */
export async function readFileParty(ex: Executor, ctx: ServiceContext, file: FileBilling): Promise<FileParty> {
  const client = await getClientForInvoice(ex, ctx, { clientId: file.clientId, fileId: file.id });
  if (!client) throw new Error(`money: file ${file.id} has no client`);
  const own = await ex
    .selectFrom("Client")
    .select(["name", "number"])
    .where("id", "=", file.clientId)
    .executeTakeFirstOrThrow();
  const site = await ex
    .selectFrom("Site")
    .leftJoin("Commune", "Commune.id", "Site.communeId")
    .select(["Site.address", "Site.commonName", "Commune.nameAr as commune"])
    .where("Site.id", "=", file.siteId)
    .executeTakeFirst();
  const siteAddress = [orNull(site?.address), orNull(site?.commune)].filter(Boolean).join("، ");
  return {
    clientId: client.id,
    clientName: own.name,
    clientNumber: own.number,
    siteAddress,
    siteName: orNull(site?.commonName),
    missing: client.missing,
    buyer: {
      name: client.name,
      legalForm: orNull(client.legalForm),
      // Clients' address carries its own commune and wilaya when it is the site's (INV-8): nothing is added to it.
      address: orNull(client.address),
      commune: null,
      wilayaCode: null,
      hasTradeRegister: client.hasTradeRegister,
      rc: orNull(client.rc),
      nis: orNull(client.nis),
      nif: orNull(client.nif),
      articleNumber: orNull(client.articleNumber),
      payerName: orNull(file.payerName),
      payerPhone: orNull(file.payerPhone),
      siteAddress: siteAddress || null,
      fileNumber: file.number,
    },
  };
}
