/**
 * The two money columns of the printed payslip (PEO-07): what is earned, and
 * what is taken off. An unpaid absence, or a correction that lowers the base,
 * is a reduction of what is earned, in the first column with its minus sign;
 * social security, income tax, the debts taken back and the deductions are
 * the second. So «المجموع» of the first, less «المقتطع», is «الصافي للدفع».
 */

/** The line types printed in the column «المقتطع». */
export const TAKEN_OFF_TYPES: ReadonlySet<string> = new Set(["CNAS", "IRG", "ADVANCE_REPAYMENT", "DEDUCTION"]);

export function payslipColumns(items: ReadonlyArray<{ type: string; amount: number }>): {
  earned: number;
  takenOff: number;
} {
  let earned = 0;
  let takenOff = 0;
  for (const item of items) {
    if (TAKEN_OFF_TYPES.has(item.type)) takenOff -= item.amount;
    else earned += item.amount;
  }
  return { earned, takenOff };
}
