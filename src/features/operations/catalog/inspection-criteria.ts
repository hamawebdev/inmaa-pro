import type { Division } from "../validators/option-codes";

/**
 * The points a supervisor marks, per division: the rows the data model seeds
 * into its table of criteria, and what a blank inspection sheet prints.
 *
 * Homes and organisations take the seven points of his study («نظام مراقبة
 * الجودة», 1.md); buildings and complexes take the eight of his buildings
 * worker card («تقييم المشرف», 9.md section 17). The manager may later change
 * the list and its weights; the wording here is his.
 */

export interface SeedCriterion {
  code: string;
  label: string;
  weight: number;
}

const STUDY_CRITERIA: readonly SeedCriterion[] = [
  { code: "FLOORS", label: "الأرضيات", weight: 1 },
  { code: "GLASS", label: "الزجاج", weight: 1 },
  { code: "BATHROOMS", label: "الحمامات", weight: 1 },
  { code: "ENTRANCES", label: "المداخل", weight: 1 },
  { code: "ODOURS", label: "الروائح", weight: 1 },
  { code: "DUST", label: "الغبار", weight: 1 },
  { code: "EQUIPMENT", label: "المعدات", weight: 1 },
];

const CARD_CRITERIA: readonly SeedCriterion[] = [
  { code: "FLOORS", label: "الأرضيات", weight: 1 },
  { code: "STAIRS", label: "السلالم", weight: 1 },
  { code: "CORRIDORS", label: "الممرات", weight: 1 },
  { code: "LIFTS", label: "المصاعد", weight: 1 },
  { code: "ENTRANCES", label: "المداخل", weight: 1 },
  { code: "WASTE", label: "جمع النفايات", weight: 1 },
  { code: "INSTRUCTIONS", label: "الالتزام بالتعليمات", weight: 1 },
  { code: "APPEARANCE", label: "المظهر المهني", weight: 1 },
];

export const SEED_INSPECTION_CRITERIA: Record<Division, readonly SeedCriterion[]> = {
  HOUSING: STUDY_CRITERIA,
  ORGANISATION: STUDY_CRITERIA,
  BUILDING: CARD_CRITERIA,
  COMPLEX: CARD_CRITERIA,
};
