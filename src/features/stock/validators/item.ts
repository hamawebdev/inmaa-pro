import { z } from "zod";

import { ITEM_CONDITIONS, STOCK_CATEGORIES, STOCK_KINDS, STOCK_TRACKINGS, UNITS } from "./option-codes";

/**
 * What the stock screens type in: an item of the inventory, and a hand-out.
 *
 * Quantities are typed in the item's unit (4.5 litres) and stored in
 * thousandths; the services convert. Every message is written here in words
 * the catalogue has: the same schema checks the dialog and the service.
 */

/** The largest quantity the program stores, in units: a million of anything is a typing slip. */
export const MAX_QUANTITY = 1_000_000;

const choice = <const T extends readonly [string, ...string[]]>(codes: T) =>
  z.enum(codes, { errorMap: () => ({ message: "Choose one of the options." }) });

/** Thousandths are whole: 0.125 is the finest quantity. */
export function isWholeThousandths(value: number): boolean {
  return Math.abs(value * 1000 - Math.round(value * 1000)) < 1e-6;
}

const quantity = z
  .number({ required_error: "This field is required.", invalid_type_error: "Must be a number." })
  .min(0, "A quantity cannot be negative.")
  .max(MAX_QUANTITY, "This quantity is too large.")
  .refine(isWholeThousandths, { message: "A quantity has at most three decimals." });

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" ? (value.trim() === "" ? undefined : value.trim()) : (value ?? undefined)),
    z
      .string({ invalid_type_error: "Invalid form submission." })
      .max(max, `Must be at most ${max} characters.`)
      .optional(),
  );

export const stockItemSchema = z.object({
  nameAr: z
    .string({ required_error: "This field is required.", invalid_type_error: "This field is required." })
    .trim()
    .min(1, "This field is required.")
    .max(120, "Must be at most 120 characters."),
  nameFr: optionalText(120),
  nameEn: optionalText(120),
  kind: choice(STOCK_KINDS),
  category: choice(STOCK_CATEGORIES).optional(),
  unit: choice(UNITS),
  tracking: choice(STOCK_TRACKINGS),
  /** «الحد الأدنى». Left empty: the item is not watched. */
  minLevel: quantity.optional(),
  note: optionalText(500),
});

export type StockItemValues = z.infer<typeof stockItemSchema>;

/** A new item may come with what is on the shelf today. */
export const newStockItemSchema = stockItemSchema.extend({ openingQty: quantity.optional() });
export type NewStockItemValues = z.infer<typeof newStockItemSchema>;

export const handOutLineSchema = z.object({
  itemId: z.string({ required_error: "This field is required." }).min(1, "This field is required."),
  /** The piece handed over, for an item followed one by one. */
  unitId: optionalText(80),
  qty: quantity.refine((value) => value > 0, { message: "A quantity must be more than zero." }),
  /** «الحالة عند الاستلام». Equipment only. */
  condition: choice(ITEM_CONDITIONS).optional(),
  /** The equipment stays at the client's between visits («تخزين معدات: نعم»). */
  stayAtSite: z.boolean().optional(),
});

export type HandOutLineValues = z.infer<typeof handOutLineSchema>;
