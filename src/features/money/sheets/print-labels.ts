import type { Division, PaymentMethod, ServiceType } from "../validators/option-codes";

/**
 * The Arabic words Money's printed sheets use for stored codes.
 *
 * A printed sheet is always Arabic and worded as the client's own forms are,
 * whatever the language of the interface, so these are not in the message
 * files. Each is copied from the document named beside it.
 */

/** His notes, sections ④ and ⑤. */
export const DIVISION_LABEL: Record<Division, string> = {
  HOUSING: "المنازل",
  ORGANISATION: "المؤسسات",
  BUILDING: "العمارات",
  COMPLEX: "التجمعات السكنية",
};

/** The title box of his five client forms: «نوع الخدمة : عقد (عمارة)». */
export const SERVICE_TYPE_LABEL: Record<ServiceType, string> = {
  ON_DEMAND: "عند الطلب",
  CONTRACT: "عقد",
};

/** «طريقة السداد» on his five client forms, in their order. */
export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CASH: "نقدًا",
  BANK_TRANSFER: "تحويل بنكي",
  POSTAL_TRANSFER: "تحويل بريدي",
};

/** The currency as his forms write it after an amount: «… دج». Foundation's word for paper. */
export { MONEY_UNIT_AR as CURRENCY } from "@/lib/units";

/** Where his forms are drawn up: «حررت: بأم البواقي، بتاريخ: …». A setting later (`centre.city`). */
export const DEFAULT_PLACE = "أم البواقي";
