/**
 * A set of codes stored as JSON text (`["CASH","BANK_TRANSFER"]`), as the data
 * model stores every ticked set (DESIGN.md section 3). Anything that is not an
 * array of strings reads as no code at all.
 */
export function parseCodes(text: string | null | undefined): string[] {
  if (!text) return [];
  try {
    const value: unknown = JSON.parse(text);
    return Array.isArray(value) ? value.filter((code): code is string => typeof code === "string") : [];
  } catch {
    return [];
  }
}
