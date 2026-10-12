import type { ContractDuration, ContractKind } from "../validators/option-lists";

/**
 * What the program proposes from «مدة العقد»: «تاريخ النهاية» and «نوع العقد».
 * Both are proposals: the office can type another date and tick the other box.
 */

const MONTHS: Record<ContractDuration, number> = { M1: 1, M3: 3, M6: 6, Y1: 12 };

/**
 * The last day of a contract that starts on `startDate` ("YYYY-MM-DD") and runs
 * for `duration`: the eve of the same day of the month, that many months on.
 * A start on the 1st therefore ends on the last day of a month. When the day
 * does not exist in the month of arrival (a start on the 31st, or on 29
 * February), the contract ends on that month's last day.
 *
 * Returns null when the start is not a date.
 */
export function proposedEndDate(startDate: string, duration: ContractDuration): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(startDate);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const start = new Date(Date.UTC(year, month - 1, day));
  if (start.getUTCFullYear() !== year || start.getUTCMonth() !== month - 1 || start.getUTCDate() !== day) return null;

  const monthsOn = month - 1 + MONTHS[duration];
  const sameDay = new Date(Date.UTC(year, monthsOn, day));
  // Day 0 of the following month is the last day of the month of arrival.
  const end =
    sameDay.getUTCDate() === day
      ? new Date(Date.UTC(year, monthsOn, day - 1))
      : new Date(Date.UTC(year, monthsOn + 1, 0));
  return end.toISOString().slice(0, 10);
}

/** «قصير» for a month or three, «طويل» for six months or a year (his forms do not say where the line is). */
export function proposedContractKind(duration: ContractDuration): ContractKind {
  return MONTHS[duration] <= 3 ? "SHORT" : "LONG";
}
