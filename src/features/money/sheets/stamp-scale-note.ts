import { formatMoney } from "../rules/centimes";
import type { StampSettings } from "../rules/stamp-duty";

import { CURRENCY } from "./print-labels";

/**
 * The scale of the stamp duty as one Arabic sentence, for the blank receipt a
 * collector fills in by hand: he works the duty out at the client's door, so
 * the rule must be on the paper in front of him.
 *
 * Written from the settings, so the sentence can never say something other
 * than what the program computes.
 */
export function stampScaleNote(settings: StampSettings): string {
  if (!settings.enabled || settings.bands.length === 0) return "لا يُحصَّل حق الطابع.";

  const money = (amount: number) => `${formatMoney(amount)} ${CURRENCY}`;
  const whole = settings.mode === "WHOLE";

  const bands = settings.bands.map((band, index) => {
    const rate = money(band.per100);
    if (band.upTo === null) return whole ? `${rate} فوق ذلك` : `ثم ${rate} لما فوق ذلك`;
    if (whole) return `${rate} إذا لم يتجاوز المبلغ ${money(band.upTo)}`;
    return index === 0 ? `${rate} حتى ${money(band.upTo)}` : `ثم ${rate} حتى ${money(band.upTo)}`;
  });

  const sentences = [
    whole
      ? `حق الطابع على التسديد نقدًا، لكل 100 ${CURRENCY} أو جزء منها من كامل المبلغ: ${bands.join("، ")}.`
      : `حق الطابع على التسديد نقدًا، لكل 100 ${CURRENCY} أو جزء منها: ${bands.join("، ")}.`,
  ];
  if (settings.minimum > 0) sentences.push(`الحد الأدنى ${money(settings.minimum)}.`);
  if (settings.maximum !== null) sentences.push(`الحد الأقصى ${money(settings.maximum)}.`);
  if (settings.exemptBelow > 0) sentences.push(`لا طابع على مبلغ يقل عن ${money(settings.exemptBelow)}.`);
  return sentences.join(" ");
}
