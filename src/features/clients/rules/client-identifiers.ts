/**
 * What an organisation's first invoice needs from its buyer (LAW 05-468; the
 * coordinator's ruling on Money's INV-4): its NIF and NIS always, its RC when
 * «السجل التجاري» is نعم, and an answer to «السجل التجاري» when it was left
 * unanswered. The client card, the file hub and Money's `issueInvoice` (through
 * `getClientForInvoice`) say it with the same words.
 */

export const MISSING_IDENTIFIERS = ["tradeRegisterAnswer", "rcNumber", "nif", "nis"] as const;
export type MissingIdentifier = (typeof MISSING_IDENTIFIERS)[number];

/** The sentence a refused invoice reads, for each missing identifier (Money throws it as a ServiceError). */
export const MISSING_FOR_INVOICE: Readonly<Record<MissingIdentifier, string>> = {
  tradeRegisterAnswer: "Say on the client's card whether the organisation has a trade register.",
  // Money's own sentence, already in its catalogue.
  rcNumber: "This client's trade register number is needed on the invoice.",
  nif: "This client's tax identification number (NIF) is needed on the invoice.",
  nis: "This client's statistical identification number (NIS) is needed on the invoice.",
};

export function missingIdentifiersOf(client: {
  clientType: string;
  hasTradeRegister: number | boolean | null;
  rcNumber: string | null;
  nif: string | null;
  nis: string | null;
}): MissingIdentifier[] {
  if (client.clientType !== "ORGANISATION") return [];
  const missing: MissingIdentifier[] = [];
  if (client.hasTradeRegister === null) missing.push("tradeRegisterAnswer");
  else if ((client.hasTradeRegister === 1 || client.hasTradeRegister === true) && !client.rcNumber) {
    missing.push("rcNumber");
  }
  if (!client.nif) missing.push("nif");
  if (!client.nis) missing.push("nis");
  return missing;
}
