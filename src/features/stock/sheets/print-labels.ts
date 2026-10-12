import type { ItemCondition, Ppe, StockKind, Unit } from "../validators/option-codes";

/**
 * The Arabic words Stock's printed sheets use for stored codes.
 *
 * A printed sheet is always Arabic and worded as the client's own documents
 * are, so these are not in the message files.
 */

/** His notes, section ⑤: «جرد المعدات», «جرد المواد». */
export const STOCK_KIND_LABEL: Record<StockKind, string> = {
  EQUIPMENT: "المعدات",
  MATERIAL: "المواد",
};

/** «الحالة عند الاستلام» on his buildings worker card (item 11); the third is ours. */
export const ITEM_CONDITION_LABEL: Record<ItemCondition, string> = {
  GOOD: "جيدة",
  NEEDS_MAINTENANCE: "تحتاج صيانة",
  OUT_OF_SERVICE: "خارج الخدمة",
};

/** Our wording: his documents give no list of units. */
export const UNIT_LABEL: Record<Unit, string> = {
  PIECE: "قطعة",
  LITRE: "لتر",
  KG: "كلغ",
  BOX: "علبة",
  BAG: "كيس",
  PAIR: "زوج",
  ROLL: "لفة",
};

/** «معدات الوقاية» on his buildings worker card (item 12), in his order. */
export const PPE_LABEL: Record<Ppe, string> = {
  GLOVES: "قفازات",
  SHOES: "أحذية مناسبة",
  WORKWEAR: "لباس العمل",
  BADGE: "سترة/شارة تعريف",
  MASK: "كمامة عند الحاجة",
  EXTRA: "معدات حماية إضافية حسب طبيعة المهمة",
};

/** Article 5 of the internal regulations the worker signs with his registration form. */
export const REGULATIONS_ARTICLE_5 =
  "المادة 5: المعدات والمواد: يلتزم العامل بالمحافظة على الأدوات والمعدات والمواد المسلمة إليه، واستعمالها بالطريقة الصحيحة، والإبلاغ فورًا عن أي تلف أو نقص.";
