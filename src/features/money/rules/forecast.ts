import { assertInteger, mulDivRound, type Centimes } from "./centimes";
import { addDays, addMonths, addToMonth, diffDays, monthOf, type IsoDate } from "./dates";
import type { DueTerms } from "./due-schedule";

/**
 * Money expected in and out over the coming months (plan feature 41).
 *
 * For each of the next months:
 *
 *  - **Expected receipts**: what remains on open dues, by due date. Dues are
 *    built from the files' terms, so this is known before any invoice exists.
 *  - **If renewed**: what would be added if the contracts ending in the window
 *    were renewed on the same terms. A second line, never mixed with the first:
 *    a renewal is a hope, a due is an agreement.
 *  - **Expected expenses**: the expenses marked monthly, the last closed pay
 *    run, and the average of everything else over the last three closed months.
 *  - **Net** and a running total, with and without the renewals.
 *
 * Two figures stand outside the months, so that nothing is hidden: what is
 * already overdue, and what falls due in the rest of the current month.
 */

export interface ForecastDue {
  dueDate: IsoDate;
  /** What is still to be paid on it. */
  remaining: Centimes;
}

export interface ForecastInput {
  today: IsoDate;
  /** Setting `forecast.months`. */
  months: number;
  /** Open dues: not cancelled, with something left to pay. */
  dues: readonly ForecastDue[];
  /** The dues a renewal of each ending contract would add (see `renewedTerms`). */
  duesIfRenewed: readonly ForecastDue[];
  /** The total of the expenses marked as coming back every month. */
  recurringExpenses: Centimes;
  /** The last closed pay run. */
  lastPayRun: Centimes;
  /** The other expenses of the last three closed months, one total per month. */
  otherExpensesOfLastMonths: readonly Centimes[];
}

export interface ForecastMonth {
  /** `YYYY-MM`. */
  month: string;
  receipts: Centimes;
  receiptsIfRenewed: Centimes;
  expenses: Centimes;
  net: Centimes;
  netIfRenewed: Centimes;
  running: Centimes;
  runningIfRenewed: Centimes;
}

export interface Forecast {
  /** «متأخرات»: due before today and not paid. */
  overdue: Centimes;
  /** Due from today to the end of the current month. */
  restOfCurrentMonth: Centimes;
  /** What each coming month is expected to cost. */
  monthlyExpenses: Centimes;
  months: ForecastMonth[];
}

/** The expenses expected in any one coming month. */
export function expectedMonthlyExpenses(input: {
  recurringExpenses: Centimes;
  lastPayRun: Centimes;
  otherExpensesOfLastMonths: readonly Centimes[];
}): Centimes {
  const others = input.otherExpensesOfLastMonths;
  const average =
    others.length === 0
      ? 0
      : mulDivRound(
          others.reduce((sum, amount) => sum + amount, 0),
          1,
          others.length,
        );
  return input.recurringExpenses + input.lastPayRun + average;
}

export function buildForecast(input: ForecastInput): Forecast {
  assertInteger(input.months, "months");
  if (input.months < 1) throw new RangeError("a forecast covers at least one month");

  const currentMonth = monthOf(input.today);
  const monthlyExpenses = expectedMonthlyExpenses(input);

  let overdue = 0;
  let restOfCurrentMonth = 0;
  const receipts = new Map<string, number>();
  for (const due of input.dues) {
    if (due.remaining <= 0) continue;
    if (due.dueDate < input.today) overdue += due.remaining;
    else if (monthOf(due.dueDate) === currentMonth) restOfCurrentMonth += due.remaining;
    else receipts.set(monthOf(due.dueDate), (receipts.get(monthOf(due.dueDate)) ?? 0) + due.remaining);
  }

  const renewals = new Map<string, number>();
  for (const due of input.duesIfRenewed) {
    if (due.remaining <= 0 || due.dueDate < input.today) continue;
    renewals.set(monthOf(due.dueDate), (renewals.get(monthOf(due.dueDate)) ?? 0) + due.remaining);
  }

  const months: ForecastMonth[] = [];
  let running = 0;
  let runningIfRenewed = 0;
  for (let index = 1; index <= input.months; index += 1) {
    const month = addToMonth(currentMonth, index);
    const expected = receipts.get(month) ?? 0;
    const ifRenewed = renewals.get(month) ?? 0;
    const net = expected - monthlyExpenses;
    const netIfRenewed = net + ifRenewed;
    running += net;
    runningIfRenewed += netIfRenewed;
    months.push({
      month,
      receipts: expected,
      receiptsIfRenewed: ifRenewed,
      expenses: monthlyExpenses,
      net,
      netIfRenewed,
      running,
      runningIfRenewed,
    });
  }

  return { overdue, restOfCurrentMonth, monthlyExpenses, months };
}

/**
 * The terms a contract would have if it were renewed as it is: it starts the
 * day after it ends, lasts as long, and its first due date keeps its place.
 *
 * A contract that runs a whole number of months (his «شهر», «3 أشهر»,
 * «6 أشهر», «سنة») is renewed by months, so 01/11–31/01 becomes 01/02–30/04;
 * any other length is renewed by days. Returns `null` for a request, or a
 * contract with no end date.
 */
export function renewedTerms(terms: DueTerms): DueTerms | null {
  if (terms.serviceType !== "CONTRACT" || terms.endDate === null) return null;
  const startDate = addDays(terms.endDate, 1);

  for (let months = 1; months <= 36; months += 1) {
    if (addMonths(terms.startDate, months) === startDate) {
      return {
        ...terms,
        startDate,
        endDate: addDays(addMonths(terms.startDate, months * 2), -1),
        firstDueDate: terms.firstDueDate === null ? null : addMonths(terms.firstDueDate, months),
      };
    }
  }

  const length = diffDays(terms.startDate, terms.endDate) + 1;
  return {
    ...terms,
    startDate,
    endDate: addDays(terms.endDate, length),
    firstDueDate: terms.firstDueDate === null ? null : addDays(terms.firstDueDate, length),
  };
}
