import { DEFAULT_PLACE } from "@/features/money/sheets/print-labels";

import type { HandoutSlipData } from "./handout-slip-sheet";

/**
 * Sample hand-out slips, so that the slip can be seen and printed before the
 * services that will feed it exist. The items are those of his own lists (the
 * buildings worker card, item 11; the store table of his study).
 *
 * The names are invented. This file goes when the print page reads real
 * records.
 */

/** Quantities are thousandths of the unit. */
const qty = (units: number) => Math.round(units * 1000);

const SLIPS: Record<string, HandoutSlipData> = {
  // Equipment and materials for one visit of a building contract.
  sample: {
    number: "000031/2026",
    date: "2026-11-02",
    place: DEFAULT_PLACE,
    purpose: "JOB",
    workerName: "فاطمة الزهراء مرابط",
    workerNumber: "0012/F",
    handedByName: "سميرة حداد",
    job: {
      fileNumber: "0007/BLC",
      clientName: "عمارة الياسمين (ممثل السكان)",
      siteAddress: "حي 200 مسكن، عمارة 12، أم البواقي",
      division: "BUILDING",
      serviceType: "CONTRACT",
      visitDate: "2026-11-02",
    },
    lines: [
      {
        kind: "EQUIPMENT",
        itemName: "ممسحة",
        unitCode: null,
        qty: qty(2),
        unit: "PIECE",
        condition: "GOOD",
        stayAtSite: true,
      },
      {
        kind: "EQUIPMENT",
        itemName: "دلو",
        unitCode: null,
        qty: qty(2),
        unit: "PIECE",
        condition: "GOOD",
        stayAtSite: true,
      },
      {
        kind: "EQUIPMENT",
        itemName: "مكنسة",
        unitCode: null,
        qty: qty(1),
        unit: "PIECE",
        condition: "GOOD",
        stayAtSite: false,
      },
      {
        kind: "EQUIPMENT",
        itemName: "آلة تنظيف الأرضيات",
        unitCode: "0003/2026",
        qty: qty(1),
        unit: "PIECE",
        condition: "NEEDS_MAINTENANCE",
        stayAtSite: false,
      },
      {
        kind: "MATERIAL",
        itemName: "منظف أرضيات",
        unitCode: null,
        qty: qty(3),
        unit: "LITRE",
        condition: null,
        stayAtSite: false,
      },
      {
        kind: "MATERIAL",
        itemName: "منظف زجاج",
        unitCode: null,
        qty: qty(1.5),
        unit: "LITRE",
        condition: null,
        stayAtSite: false,
      },
      {
        kind: "MATERIAL",
        itemName: "منظف دورات/أسطح",
        unitCode: null,
        qty: qty(1),
        unit: "LITRE",
        condition: null,
        stayAtSite: false,
      },
      {
        kind: "MATERIAL",
        itemName: "أكياس نفايات",
        unitCode: null,
        qty: qty(2),
        unit: "ROLL",
        condition: null,
        stayAtSite: false,
      },
      {
        kind: "MATERIAL",
        itemName: "قفازات",
        unitCode: null,
        qty: qty(4),
        unit: "PAIR",
        condition: null,
        stayAtSite: false,
      },
    ],
    ppe: ["GLOVES", "WORKWEAR", "BADGE"],
    note: "آلة تنظيف الأرضيات تُرجع إلى المخزن في نهاية اليوم.",
    cancelled: null,
  },
  // A worker's own kit, outside any job.
  "sample-kit": {
    number: "000032/2026",
    date: "2026-11-03",
    place: DEFAULT_PLACE,
    purpose: "WORKER_KIT",
    workerName: "أمينة شريف",
    workerNumber: "0015/F",
    handedByName: "سميرة حداد",
    job: null,
    lines: [
      {
        kind: "MATERIAL",
        itemName: "قفازات",
        unitCode: null,
        qty: qty(6),
        unit: "PAIR",
        condition: null,
        stayAtSite: false,
      },
      {
        kind: "MATERIAL",
        itemName: "كمامة",
        unitCode: null,
        qty: qty(1),
        unit: "BOX",
        condition: null,
        stayAtSite: false,
      },
      {
        kind: "MATERIAL",
        itemName: "فوط Microfiber",
        unitCode: null,
        qty: qty(5),
        unit: "PIECE",
        condition: null,
        stayAtSite: false,
      },
    ],
    ppe: ["GLOVES", "SHOES", "WORKWEAR", "BADGE", "MASK"],
    note: null,
    cancelled: null,
  },
};

/** The ids the hand-out print page answers to until hand-outs exist. */
export const SAMPLE_HANDOUT_IDS = Object.keys(SLIPS);

export function sampleHandout(id: string): HandoutSlipData {
  return SLIPS[id] ?? SLIPS.sample;
}
