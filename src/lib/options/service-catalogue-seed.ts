/**
 * The two service lists of his forms as he gave them on 2026-10-11, «الخدمات المقدمة» and
 * «الخدمات المبرمجة»: what migration 0003 seeds into CatalogueService and CatalogueServiceDivision.
 *
 * From then on the lists are the manager's, edited in Settings › الخدمات (the developer, 2026-10-22), and
 * the program reads them from the database. Only these read this module: the generator that writes 0003
 * (scripts/generate-db-types.mjs), the documents check (scripts/db/check-docs.mjs), db:verify, and the tests
 * that need his lists without a database (`catalogueFromSeed`, src/features/core/services/service-catalogue.ts).
 * Once 0003 has shipped, a change here changes nothing on an installed copy: it needs a new migration.
 *
 * Plain Node loads this file (the scripts strip its types): no value import from "@/".
 */
import type { Division } from "./index.ts";

export const SERVICE_LIST_CODES = ["PROVIDED", "PROGRAMMED"] as const;
export type ServiceListCode = (typeof SERVICE_LIST_CODES)[number];

/** A service as his forms print it, with its French and English names. */
export interface SeedService {
  code: string;
  ar: string;
  fr: string;
  en: string;
}

/** «الخدمات المقدمة», every service of the four divisions' forms. */
export const SEED_PROVIDED_SERVICES: readonly SeedService[] = [
  { code: "FLOORS", ar: "تنظيف الأرضيات", fr: "Sols", en: "Floors" },
  { code: "KITCHEN", ar: "تنظيف المطبخ", fr: "Cuisine", en: "Kitchen" },
  { code: "CURTAINS", ar: "تنظيف الستائر", fr: "Rideaux", en: "Curtains" },
  { code: "WINDOWS", ar: "تنظيف النوافذ", fr: "Fenêtres", en: "Windows" },
  { code: "CEILINGS", ar: "تنظيف الأسقف", fr: "Plafonds", en: "Ceilings" },
  { code: "FRIDGE", ar: "تنظيف الثلاجة", fr: "Réfrigérateur", en: "Fridge" },
  { code: "BATHROOMS", ar: "تنظيف الحمامات", fr: "Salles de bain", en: "Bathrooms" },
  { code: "GLASS", ar: "تنظيف الزجاج", fr: "Vitres", en: "Glass" },
  { code: "OVEN", ar: "تنظيف الفرن", fr: "Four", en: "Oven" },
  { code: "CARPETS", ar: "تنظيف السجاد", fr: "Tapis", en: "Carpets" },
  { code: "CUPBOARDS", ar: "تنظيف الخزائن", fr: "Placards", en: "Cupboards" },
  { code: "CHILDREN_ROOMS", ar: "تنظيف غرف الأطفال", fr: "Chambres d'enfants", en: "Children's rooms" },
  { code: "GARAGE", ar: "تنظيف المرآب", fr: "Garage", en: "Garage" },
  { code: "FURNITURE", ar: "تنظيف الأثاث", fr: "Meubles", en: "Furniture" },
  { code: "SIGNS_ADS", ar: "اللوحات والإعلانات", fr: "Enseignes et publicités", en: "Signs and advertising" },
  { code: "TOILETS", ar: "تنظيف دورات المياه", fr: "Toilettes", en: "Toilets" },
  {
    code: "WASTE_SORTING",
    ar: "جمع وفرز النفايات",
    fr: "Collecte et tri des déchets",
    en: "Waste collection and sorting",
  },
  { code: "SHELVES", ar: "تنظيف الرفوف", fr: "Étagères", en: "Shelves" },
  { code: "OFFICES", ar: "تنظيف المكاتب", fr: "Bureaux", en: "Offices" },
  { code: "CAR_PARKS", ar: "تنظيف مواقف السيارات", fr: "Parkings", en: "Car parks" },
  { code: "APPLIANCES", ar: "تنظيف الأجهزة", fr: "Appareils", en: "Appliances" },
  { code: "RECEPTION_HALL", ar: "تنظيف قاعة الاستقبال", fr: "Hall d'accueil", en: "Reception hall" },
  { code: "MEETING_ROOMS", ar: "تنظيف قاعات الاجتماعات", fr: "Salles de réunion", en: "Meeting rooms" },
  { code: "STORES", ar: "تنظيف المخازن", fr: "Magasins", en: "Storerooms" },
  { code: "GARDENS", ar: "تنظيف الحدائق", fr: "Jardins", en: "Gardens" },
  { code: "COURTYARDS", ar: "الساحات", fr: "Cours", en: "Courtyards" },
  { code: "SWEEP_DUST", ar: "كنس وإزالة الغبار", fr: "Balayage et dépoussiérage", en: "Sweeping and dusting" },
  { code: "STAINS", ar: "تنظيف البقع", fr: "Taches", en: "Stains" },
  { code: "DOORS", ar: "تنظيف الأبواب", fr: "Portes", en: "Doors" },
  { code: "CORRIDORS", ar: "تنظيف الممرات", fr: "Couloirs", en: "Corridors" },
  { code: "WALLS", ar: "تنظيف الجدران", fr: "Murs", en: "Walls" },
  { code: "CORNERS", ar: "تنظيف الزوايا", fr: "Coins", en: "Corners" },
  { code: "MAILBOXES", ar: "تنظيف صناديق البريد", fr: "Boîtes aux lettres", en: "Mailboxes" },
  { code: "ENTRANCES", ar: "المداخل", fr: "Entrées", en: "Entrances" },
  { code: "PAVEMENTS", ar: "الأرصفة", fr: "Trottoirs", en: "Pavements" },
];

/** «الخدمات المبرمجة» (F2, F3, F4) and «نوع الخدمة المبرمجة» (F5, F6). «تنظيف غ..الضيوف» as he wrote it (scope A8). */
export const SEED_PROGRAMMED_SERVICES: readonly SeedService[] = [
  { code: "PERIODIC", ar: "تنظيف دوري", fr: "Nettoyage périodique", en: "Periodic cleaning" },
  { code: "AFTER_CONSTRUCTION", ar: "تنظيف بعد البناء", fr: "Après construction", en: "After construction" },
  { code: "AFTER_RENOVATION", ar: "تنظيف بعد الترميم", fr: "Après rénovation", en: "After renovation" },
  { code: "AFTER_BANQUETS", ar: "تنظيف بعد الولائم", fr: "Après un banquet", en: "After banquets" },
  {
    code: "COMPREHENSIVE_DEEP",
    ar: "تنظيف شامل وعميق",
    fr: "Nettoyage complet en profondeur",
    en: "Full deep cleaning",
  },
  { code: "COMPREHENSIVE", ar: "تنظيف شامل", fr: "Nettoyage complet", en: "Full cleaning" },
  { code: "GUESTS", ar: "تنظيف غ..الضيوف", fr: "Chambres d'amis", en: "Guest rooms" },
  { code: "AFTER_TRAVEL", ar: "تنظيف بعد السفر", fr: "Après un voyage", en: "After travel" },
  { code: "RAMADAN", ar: "تنظيف رمضان", fr: "Nettoyage du Ramadan", en: "Ramadan cleaning" },
  { code: "DEBRIS_REMOVAL", ar: "إزالة المخلفات", fr: "Évacuation des gravats", en: "Debris removal" },
  { code: "BEFORE_EVENTS", ar: "تنظيف قبل المناسبات", fr: "Avant un événement", en: "Before events" },
  { code: "AFTER_EVENTS", ar: "تنظيف بعد المناسبات", fr: "Après un événement", en: "After events" },
  { code: "DEEP", ar: "تنظيف عميق", fr: "Nettoyage en profondeur", en: "Deep cleaning" },
];

/**
 * What each division's forms offer, in print order: column by column, the first column on the right
 * (OPTION-CODES.md, PROVIDED_SERVICE). Housing F5, F6; organisation F3, F4; building F2, which complexes copy.
 */
export const SEED_PROVIDED_SERVICES_OF: Readonly<Record<Division, readonly string[]>> = {
  HOUSING: [
    ...["FLOORS", "KITCHEN", "CURTAINS", "WINDOWS"],
    ...["CEILINGS", "FRIDGE", "BATHROOMS"],
    ...["GLASS", "OVEN", "CARPETS"],
    ...["CUPBOARDS", "CHILDREN_ROOMS", "GARAGE"],
  ],
  ORGANISATION: [
    ...["FLOORS", "KITCHEN", "CURTAINS", "FURNITURE", "SIGNS_ADS"],
    ...["CEILINGS", "TOILETS", "WINDOWS", "WASTE_SORTING", "SHELVES"],
    ...["GLASS", "OFFICES", "CARPETS", "CAR_PARKS", "APPLIANCES"],
    ...["RECEPTION_HALL", "MEETING_ROOMS", "GARAGE", "STORES", "GARDENS"],
  ],
  BUILDING: [
    ...["FLOORS", "COURTYARDS", "SWEEP_DUST", "STAINS", "DOORS"],
    ...["CEILINGS", "CORRIDORS", "WINDOWS", "WASTE_SORTING", "WALLS"],
    ...["GLASS", "CORNERS", "MAILBOXES", "CAR_PARKS", "APPLIANCES"],
    ...["ENTRANCES", "PAVEMENTS", "GARAGE", "STORES", "GARDENS"],
  ],
  COMPLEX: [
    ...["FLOORS", "COURTYARDS", "SWEEP_DUST", "STAINS", "DOORS"],
    ...["CEILINGS", "CORRIDORS", "WINDOWS", "WASTE_SORTING", "WALLS"],
    ...["GLASS", "CORNERS", "MAILBOXES", "CAR_PARKS", "APPLIANCES"],
    ...["ENTRANCES", "PAVEMENTS", "GARAGE", "STORES", "GARDENS"],
  ],
};

/** What each division's forms offer, in print order (column by column, the first column on the right). */
export const SEED_PROGRAMMED_SERVICES_OF: Readonly<Record<Division, readonly string[]>> = {
  HOUSING: [
    ...["PERIODIC", "AFTER_CONSTRUCTION", "AFTER_RENOVATION"],
    ...["AFTER_BANQUETS", "COMPREHENSIVE", "GUESTS"],
    ...["AFTER_TRAVEL", "RAMADAN", "DEBRIS_REMOVAL"],
    ...["BEFORE_EVENTS", "AFTER_EVENTS", "DEEP"],
  ],
  ORGANISATION: [
    ...["PERIODIC", "AFTER_CONSTRUCTION", "AFTER_RENOVATION"],
    ...["AFTER_BANQUETS", "COMPREHENSIVE_DEEP", "GUESTS"],
    ...["AFTER_TRAVEL", "RAMADAN", "DEBRIS_REMOVAL"],
    ...["BEFORE_EVENTS", "AFTER_EVENTS"],
  ],
  BUILDING: [
    ...["PERIODIC", "AFTER_CONSTRUCTION", "AFTER_RENOVATION"],
    ...["AFTER_BANQUETS", "COMPREHENSIVE_DEEP", "GUESTS"],
    ...["AFTER_TRAVEL", "RAMADAN", "DEBRIS_REMOVAL"],
    ...["BEFORE_EVENTS", "AFTER_EVENTS"],
  ],
  COMPLEX: [
    ...["PERIODIC", "AFTER_CONSTRUCTION", "AFTER_RENOVATION"],
    ...["AFTER_BANQUETS", "COMPREHENSIVE_DEEP", "GUESTS"],
    ...["AFTER_TRAVEL", "RAMADAN", "DEBRIS_REMOVAL"],
    ...["BEFORE_EVENTS", "AFTER_EVENTS"],
  ],
};

/** Both lists, by the code `CatalogueService.list` stores. */
export const SEED_CATALOGUE: Readonly<
  Record<ServiceListCode, { services: readonly SeedService[]; of: Readonly<Record<Division, readonly string[]>> }>
> = {
  PROVIDED: { services: SEED_PROVIDED_SERVICES, of: SEED_PROVIDED_SERVICES_OF },
  PROGRAMMED: { services: SEED_PROGRAMMED_SERVICES, of: SEED_PROGRAMMED_SERVICES_OF },
};

/** The fixed ids of the seeded rows. */
export const seedServiceId = (list: ServiceListCode, code: string) => `svc-${list}-${code}`;
export const seedMembershipId = (list: ServiceListCode, code: string, division: Division) =>
  `svc-${list}-${code}-${division}`;
