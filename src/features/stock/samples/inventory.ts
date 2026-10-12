import { toQty } from "@/lib/units";

import type { StockCategory, StockKind, StockTracking, Unit } from "../validators/option-codes";
import type { StockItemView } from "../views";

/**
 * Sample lines for «جرد المخزون», until the services read the database.
 *
 * The items are his: the store table of his first study (floor cleaner 30 for a
 * minimum of 10, glass cleaner 20 for 5, gloves 100 for 30, bags 500 for 100),
 * the worker's kit, the items handed to a worker (form 9, section 11) and the
 * equipment a building needs (form 8, section 18). The quantities other than
 * his four are invented, with a few at or below their minimum so the chip
 * shows, and two with no minimum at all.
 */

interface ItemSeed {
  code: string;
  ar: string;
  fr: string;
  en: string;
  kind: StockKind;
  category: StockCategory;
  unit: Unit;
  tracking?: StockTracking;
  onHand: number;
  min: number | null;
}

const ITEMS: readonly ItemSeed[] = [
  // ── «المواد» ──
  {
    code: "FLOOR_CLEANER",
    ar: "منظف أرضيات",
    fr: "Nettoyant sols",
    en: "Floor cleaner",
    kind: "MATERIAL",
    category: "CLEANING_PRODUCT",
    unit: "LITRE",
    onHand: 30,
    min: 10,
  },
  {
    code: "GLASS_CLEANER",
    ar: "منظف زجاج",
    fr: "Nettoyant vitres",
    en: "Glass cleaner",
    kind: "MATERIAL",
    category: "CLEANING_PRODUCT",
    unit: "LITRE",
    onHand: 20,
    min: 5,
  },
  {
    code: "PPE_GLOVES",
    ar: "قفازات",
    fr: "Gants",
    en: "Gloves",
    kind: "MATERIAL",
    category: "PPE",
    unit: "PAIR",
    onHand: 100,
    min: 30,
  },
  {
    code: "BIN_BAGS",
    ar: "أكياس نفايات",
    fr: "Sacs poubelle",
    en: "Bin bags",
    kind: "MATERIAL",
    category: "CONSUMABLE",
    unit: "PIECE",
    onHand: 500,
    min: 100,
  },
  {
    code: "MULTI_CLEANER",
    ar: "منظف متعدد الاستعمال",
    fr: "Nettoyant multi-usage",
    en: "All-purpose cleaner",
    kind: "MATERIAL",
    category: "CLEANING_PRODUCT",
    unit: "LITRE",
    onHand: 8,
    min: 10,
  },
  {
    code: "DISINFECTANT",
    ar: "مطهر",
    fr: "Désinfectant",
    en: "Disinfectant",
    kind: "MATERIAL",
    category: "CLEANING_PRODUCT",
    unit: "LITRE",
    onHand: 4.5,
    min: 5,
  },
  {
    code: "BATHROOM_CLEANER",
    ar: "منظف دورات/أسطح",
    fr: "Nettoyant sanitaires et surfaces",
    en: "Bathroom and surface cleaner",
    kind: "MATERIAL",
    category: "CLEANING_PRODUCT",
    unit: "LITRE",
    onHand: 12,
    min: 5,
  },
  {
    code: "SPONGES",
    ar: "إسفنج",
    fr: "Éponges",
    en: "Sponges",
    kind: "MATERIAL",
    category: "CONSUMABLE",
    unit: "PIECE",
    onHand: 40,
    min: 20,
  },
  {
    code: "MICROFIBRE_CLOTHS",
    ar: "فوط Microfiber",
    fr: "Chiffons microfibre",
    en: "Microfibre cloths",
    kind: "MATERIAL",
    category: "CONSUMABLE",
    unit: "PIECE",
    onHand: 30,
    min: 30,
  },
  {
    code: "WIPES",
    ar: "مناديل/أقمشة",
    fr: "Lingettes et chiffons",
    en: "Wipes and rags",
    kind: "MATERIAL",
    category: "CONSUMABLE",
    unit: "ROLL",
    onHand: 15,
    min: 6,
  },
  {
    code: "PPE_MASKS",
    ar: "كمامات",
    fr: "Masques",
    en: "Masks",
    kind: "MATERIAL",
    category: "PPE",
    unit: "BOX",
    onHand: 2,
    min: null,
  },
  {
    code: "PPE_WORKWEAR",
    ar: "لباس العمل",
    fr: "Tenues de travail",
    en: "Workwear",
    kind: "MATERIAL",
    category: "PPE",
    unit: "PIECE",
    onHand: 14,
    min: 6,
  },
  // ── «المعدات» ──
  {
    code: "BROOMS",
    ar: "مكانس",
    fr: "Balais",
    en: "Brooms",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    onHand: 12,
    min: 5,
  },
  {
    code: "MOPS",
    ar: "ممسحات",
    fr: "Balais à franges",
    en: "Mops",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    onHand: 10,
    min: 4,
  },
  {
    code: "BUCKETS",
    ar: "دلاء",
    fr: "Seaux",
    en: "Buckets",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    onHand: 3,
    min: 4,
  },
  {
    code: "VACUUM",
    ar: "مكانس كهربائية",
    fr: "Aspirateurs",
    en: "Vacuum cleaners",
    kind: "EQUIPMENT",
    category: "MACHINE",
    unit: "PIECE",
    tracking: "UNIT",
    onHand: 3,
    min: 1,
  },
  {
    code: "BINS",
    ar: "سلال/حاويات",
    fr: "Poubelles et bacs",
    en: "Bins and containers",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    onHand: 6,
    min: null,
  },
  {
    code: "LADDER",
    ar: "سلم",
    fr: "Échelle",
    en: "Ladder",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    tracking: "UNIT",
    onHand: 2,
    min: 1,
  },
  {
    code: "GLASS_TOOLS",
    ar: "معدات تنظيف الزجاج",
    fr: "Matériel de lavage des vitres",
    en: "Window-cleaning kit",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    onHand: 4,
    min: 2,
  },
  {
    code: "FLOOR_MACHINE",
    ar: "آلة تنظيف الأرضيات",
    fr: "Autolaveuse",
    en: "Floor-cleaning machine",
    kind: "EQUIPMENT",
    category: "MACHINE",
    unit: "PIECE",
    tracking: "UNIT",
    onHand: 0,
    min: 1,
  },
  {
    code: "KIT_BAGS",
    ar: "حقيبة معدات",
    fr: "Sacs à matériel",
    en: "Kit bags",
    kind: "EQUIPMENT",
    category: "TOOL",
    unit: "PIECE",
    onHand: 8,
    min: 3,
  },
];

export function sampleInventory(): StockItemView[] {
  return ITEMS.map((seed, index) => ({
    id: `sample-item-${index + 1}`,
    code: seed.code,
    nameAr: seed.ar,
    nameFr: seed.fr,
    nameEn: seed.en,
    kind: seed.kind,
    category: seed.category,
    unit: seed.unit,
    tracking: seed.tracking ?? "QUANTITY",
    minLevel: seed.min === null ? null : toQty(seed.min),
    onHandQty: toQty(seed.onHand),
    isActive: true,
  }));
}
