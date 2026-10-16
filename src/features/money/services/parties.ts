import type { Executor } from "@/lib/service/context";
import { getSettings } from "@/lib/settings";

import type { BuyerSnapshot, SellerSnapshot } from "../sheets/invoice-sheet";

import type { FileBilling } from "./terms";

/**
 * The two parties of a legal document, as they are frozen on it when it is
 * issued: the centre from Settings, the client from Clients' tables (read
 * only: CONTRACTS.md section 2, "M (buyer block of an invoice, payer)").
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
  /** «السجل التجاري»: نعم, لا, or not answered yet (null). An organisation's invoice waits for the answer (INV-4). */
  tradeRegister: boolean | null;
  buyer: BuyerSnapshot;
}

/** The client of a file as an invoice names it: the billing name and address when the office wrote them. */
export async function readFileParty(ex: Executor, file: FileBilling): Promise<FileParty> {
  const client = await ex
    .selectFrom("Client")
    .select([
      "id",
      "number",
      "name",
      "legalForm",
      "hasTradeRegister",
      "rcNumber",
      "nis",
      "nif",
      "articleNumber",
      "billingName",
      "billingAddress",
    ])
    .where("id", "=", file.clientId)
    .executeTakeFirst();
  if (!client) throw new Error(`money: file ${file.id} has no client`);
  const site = await ex
    .selectFrom("Site")
    .leftJoin("Commune", "Commune.id", "Site.communeId")
    .select(["Site.address", "Site.commonName", "Commune.nameAr as commune", "Commune.wilayaCode as wilayaCode"])
    .where("Site.id", "=", file.siteId)
    .executeTakeFirst();

  // A billing address the office typed stands alone; the site's commune and wilaya go only with the site's address (INV-8).
  const billing = orNull(client.billingAddress);
  const address = billing ?? orNull(site?.address);
  const siteAddress = [orNull(site?.address), orNull(site?.commune)].filter(Boolean).join("، ");
  return {
    clientId: client.id,
    clientName: client.name,
    clientNumber: client.number,
    siteAddress,
    siteName: orNull(site?.commonName),
    tradeRegister: client.hasTradeRegister === null ? null : client.hasTradeRegister === 1,
    buyer: {
      name: orNull(client.billingName) ?? client.name,
      legalForm: orNull(client.legalForm),
      address,
      commune: billing ? null : orNull(site?.commune),
      wilayaCode: billing ? null : orNull(site?.wilayaCode),
      hasTradeRegister: client.hasTradeRegister === 1,
      rc: orNull(client.rcNumber),
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
