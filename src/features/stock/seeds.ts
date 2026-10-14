import type { RegisterSeed } from "@/lib/seeds";
import type { Executor, ServiceContext } from "@/lib/service/context";

import type { StockCategory, StockKind, StockTracking, Unit } from "./validators/option-codes";

/**
 * Stock's owner seeds (BUILD-NOTES "Owner seeds", OPTION-CODES "Seeded stock
 * items"): the 29 items of his lists, so that a real installation starts with
 * his store and not an empty list. Fourteen materials (D8 item 17, D9 item 11,
 * D1, D6 item 17), nine pieces of equipment (D8 item 18, D9 item 11, D6 item
 * 17) and the six items of the protective kit (D9 item 12).
 *
 * Every row is the office's to edit: it may rename an item, set its minimum,
 * stop using it. So a step inserts only the codes that are missing, with a
 * fixed id, and never touches a row that exists. Quantities are not seeded:
 * the store starts at nothing, and its first count or purchase fills it. No
 * minimum is seeded either: a minimum is the office's decision (his own table
 * in D1 is an example), and an empty store with minimums would light the
 * low-stock tile before anything was counted.
 */

interface SeededItem {
  code: string;
  nameAr: string;
  nameFr: string;
  nameEn: string;
  kind: StockKind;
  category: StockCategory;
  unit: Unit;
  tracking?: StockTracking;
}

const material = (
  code: string,
  nameAr: string,
  nameFr: string,
  nameEn: string,
  category: StockCategory,
  unit: Unit,
): SeededItem => ({ code, nameAr, nameFr, nameEn, kind: "MATERIAL", category, unit });

const equipment = (
  code: string,
  nameAr: string,
  nameFr: string,
  nameEn: string,
  category: StockCategory,
  tracking: StockTracking = "QUANTITY",
): SeededItem => ({ code, nameAr, nameFr, nameEn, kind: "EQUIPMENT", category, unit: "PIECE", tracking });

/** In the order of OPTION-CODES: materials, equipment, then the protective kit. */
export const SEEDED_STOCK_ITEMS: readonly SeededItem[] = [
  material("FLOOR_CLEANER", "منظف أرضيات", "Nettoyant sols", "Floor cleaner", "CLEANING_PRODUCT", "LITRE"),
  material("GLASS_CLEANER", "منظف زجاج", "Nettoyant vitres", "Glass cleaner", "CLEANING_PRODUCT", "LITRE"),
  material(
    "BATHROOM_CLEANER",
    "منظف دورات/أسطح",
    "Nettoyant sanitaires et surfaces",
    "Bathroom and surface cleaner",
    "CLEANING_PRODUCT",
    "LITRE",
  ),
  material("DISINFECTANT", "مطهرات", "Désinfectant", "Disinfectant", "CLEANING_PRODUCT", "LITRE"),
  material(
    "MULTI_CLEANER",
    "منظف متعدد الاستعمال",
    "Nettoyant multi-usage",
    "All-purpose cleaner",
    "CLEANING_PRODUCT",
    "LITRE",
  ),
  material("SPECIAL_CLEANERS", "منظفات خاصة", "Nettoyants spéciaux", "Special cleaners", "CLEANING_PRODUCT", "LITRE"),
  material("WASTE_BAGS", "أكياس نفايات", "Sacs poubelle", "Bin bags", "CONSUMABLE", "PIECE"),
  material("CLOTHS", "مناديل/أقمشة", "Chiffons", "Cloths", "CONSUMABLE", "PIECE"),
  material("MICROFIBER", "فوط Microfiber", "Lavettes microfibre", "Microfibre cloths", "CONSUMABLE", "PIECE"),
  material("SPONGE", "إسفنج", "Éponges", "Sponges", "CONSUMABLE", "PIECE"),
  material("BRUSHES", "فرش", "Brosses", "Brushes", "CONSUMABLE", "PIECE"),
  material("GLOVES", "قفازات", "Gants de ménage", "Cleaning gloves", "CONSUMABLE", "PAIR"),
  material("MASK", "كمامة", "Masques", "Masks", "CONSUMABLE", "PIECE"),
  material("OTHER_MATERIAL", "مواد أخرى", "Autres produits", "Other materials", "CONSUMABLE", "PIECE"),
  equipment("BROOM", "مكنسة", "Balai", "Broom", "TOOL"),
  equipment("MOP", "ممسحة", "Serpillière", "Mop", "TOOL"),
  equipment("BUCKET", "دلو", "Seau", "Bucket", "TOOL"),
  equipment("VACUUM", "مكنسة كهربائية", "Aspirateur", "Vacuum cleaner", "MACHINE", "UNIT"),
  equipment("BINS", "سلال/حاويات", "Poubelles et bacs", "Bins", "TOOL"),
  equipment("LADDER", "سلم", "Échelle", "Ladder", "TOOL"),
  equipment("GLASS_TOOLS", "معدات تنظيف الزجاج", "Matériel pour vitres", "Window-cleaning tools", "TOOL"),
  equipment("FLOOR_MACHINE", "آلة تنظيف الأرضيات", "Autolaveuse", "Floor-cleaning machine", "MACHINE", "UNIT"),
  equipment("OTHER_EQUIPMENT", "معدات أخرى", "Autre matériel", "Other equipment", "TOOL"),
  material("PPE_GLOVES", "قفازات", "Gants de protection", "Protective gloves", "PPE", "PAIR"),
  material("PPE_SHOES", "أحذية مناسبة", "Chaussures adaptées", "Suitable shoes", "PPE", "PAIR"),
  material("PPE_WORKWEAR", "لباس العمل", "Tenue de travail", "Workwear", "PPE", "PIECE"),
  material("PPE_BADGE", "سترة/شارة تعريف", "Gilet ou badge", "Vest or ID badge", "PPE", "PIECE"),
  material("PPE_MASK", "كمامة عند الحاجة", "Masque si nécessaire", "Mask when needed", "PPE", "PIECE"),
  material(
    "PPE_EXTRA",
    "معدات حماية إضافية حسب طبيعة المهمة",
    "Protection supplémentaire selon la tâche",
    "Extra protection for the task",
    "PPE",
    "PIECE",
  ),
];

/** The fixed id of a seeded item: `stock-item-floor-cleaner`. */
export const seededItemId = (code: string) => `stock-item-${code.toLowerCase().replace(/_/g, "-")}`;

/** Inserts the seeded items that are missing. Answers how many were added. */
export async function seedStockItems(ex: Executor, ctx: ServiceContext): Promise<number> {
  const present = await ex.selectFrom("StockItem").select(["id", "code"]).execute();
  const codes = new Set(present.map((row) => row.code));
  const ids = new Set(present.map((row) => row.id));
  let added = 0;
  for (const item of SEEDED_STOCK_ITEMS) {
    const id = seededItemId(item.code);
    if (codes.has(item.code) || ids.has(id)) continue;
    await ex
      .insertInto("StockItem")
      .values({
        id,
        code: item.code,
        nameAr: item.nameAr,
        nameFr: item.nameFr,
        nameEn: item.nameEn,
        kind: item.kind,
        category: item.category,
        unit: item.unit,
        tracking: item.tracking ?? "QUANTITY",
        minLevel: null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })
      .execute();
    added += 1;
  }
  return added;
}

export function registerSeeds(seed: RegisterSeed) {
  seed("the 29 stock items of his lists", async (ex, ctx) => {
    await seedStockItems(ex, ctx);
  });
}
