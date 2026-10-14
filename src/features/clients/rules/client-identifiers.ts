/**
 * The legal identifiers an invoice needs from its buyer (LAW 05-468). Money's
 * `issueInvoice` refuses an organisation with a trade register and no RC; the
 * client card and the file hub say so first.
 */

export type MissingIdentifier = "rcNumber";

/** What an organisation with a trade register still lacks before its first invoice. */
export function missingIdentifiersOf(client: {
  clientType: string;
  hasTradeRegister: number | boolean | null;
  rcNumber: string | null;
}): MissingIdentifier[] {
  const registered = client.hasTradeRegister === 1 || client.hasTradeRegister === true;
  return registered && !client.rcNumber ? ["rcNumber"] : [];
}
