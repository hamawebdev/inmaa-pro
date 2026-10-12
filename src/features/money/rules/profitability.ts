import { assertInteger, mulDivRound, type BasisPoints, type Centimes } from "./centimes";
import { minutesBetween } from "./dates";

/**
 * What a contract really earns (plan feature 30).
 *
 * The plan's own example: a building estimated at 12 hours a week that takes
 * 16. The price was set on the estimate; the margin is made, or lost, on the
 * hours worked. So for one file and one period this compares
 *
 *     estimate: planned minutes × hourly cost, with the costs written on his form
 *     actual:   worked minutes × hourly cost, with what was handed out and spent
 *
 * and raises two flags: hours over the estimate by more than the tolerance,
 * and a margin below zero.
 *
 * Minutes are whole minutes; the hourly cost is centimes per hour. With no
 * hourly cost set, labour cannot be costed: the hours are still compared, and
 * the margins are `null` rather than a flattering figure.
 *
 * Cost and margin are for the manager only; that is the screen's business.
 */

export interface ProfitabilityInput {
  /** Invoiced before tax for the period (dues not yet invoiced at their expected amount). */
  revenue: Centimes;
  /** Planned visits × workers × the visit's length. */
  estimatedMinutes: number;
  /** The sum of each worker's time on the visits done. */
  workedMinutes: number;
  /** Centimes per hour: the worker's own rate, else the setting. `null` when neither is set. */
  hourlyCost: Centimes | null;
  /**
   * Worked time worker by worker, each at their own hourly cost. When given,
   * it replaces `workedMinutes × hourlyCost` for the actual labour; a worker
   * with no rate of their own is costed at `hourlyCost`.
   */
  workedByWorker?: readonly { minutes: number; hourlyCost: Centimes | null }[];
  /** «مصاريفها» for materials and for transport, when «على عاتق المركز». */
  estimatedMaterials: Centimes;
  estimatedTransport: Centimes;
  /** Hand-outs to the job, less returns, at the average cost frozen on each line. */
  materials: Centimes;
  /** Transport expenses tagged to the file; the estimate when there are none. */
  transport: Centimes;
  /** Any other expense tagged to the file. */
  other: Centimes;
  /** Setting `costing.hoursOverrunPercent`, in basis points (1000 = 10%). */
  hoursOverrunTolerance: BasisPoints;
}

export interface CostSide {
  minutes: number;
  /** `null` when no hourly cost is set. */
  labour: Centimes | null;
  materials: Centimes;
  transport: Centimes;
  other: Centimes;
  cost: Centimes | null;
  margin: Centimes | null;
  /** The margin as a share of revenue, in basis points. `null` with no revenue or no hourly cost. */
  marginRate: BasisPoints | null;
}

export interface Profitability {
  revenue: Centimes;
  estimate: CostSide;
  actual: CostSide;
  /** Worked against estimated time, in basis points: +3333 is a third over. `null` with no estimate. */
  hoursOverrun: BasisPoints | null;
  flags: {
    /** Worked time is over the estimate by more than the tolerance. */
    hoursOverEstimate: boolean;
    /** The contract costs more than it brings in. */
    negativeMargin: boolean;
    /** No hourly cost is set: margins cannot be shown. */
    hourlyCostMissing: boolean;
  };
}

/** The cost of `minutes` of work at `hourlyCost` centimes an hour. */
export function labourCost(minutes: number, hourlyCost: Centimes): Centimes {
  return mulDivRound(minutes, hourlyCost, 60);
}

/**
 * The time a period is expected to take: «عدد العمال» workers, from «وقت الوصول»
 * to «المغادرة», on each planned visit.
 */
export function estimatedMinutes(input: {
  plannedVisits: number;
  workers: number;
  arrival: string;
  departure: string;
}): number {
  assertInteger(input.plannedVisits, "planned visits");
  assertInteger(input.workers, "workers");
  return input.plannedVisits * input.workers * minutesBetween(input.arrival, input.departure);
}

function side(
  revenue: Centimes,
  minutes: number,
  labour: Centimes | null,
  materials: Centimes,
  transport: Centimes,
  other: Centimes,
): CostSide {
  const cost = labour === null ? null : labour + materials + transport + other;
  const margin = cost === null ? null : revenue - cost;
  return {
    minutes,
    labour,
    materials,
    transport,
    other,
    cost,
    margin,
    marginRate: margin === null || revenue <= 0 ? null : mulDivRound(margin, 10_000, revenue),
  };
}

export function contractProfitability(input: ProfitabilityInput): Profitability {
  for (const [name, value] of [
    ["revenue", input.revenue],
    ["estimated minutes", input.estimatedMinutes],
    ["worked minutes", input.workedMinutes],
  ] as const) {
    assertInteger(value, name);
  }

  const estimatedLabour = input.hourlyCost === null ? null : labourCost(input.estimatedMinutes, input.hourlyCost);

  let actualLabour: Centimes | null;
  if (input.workedByWorker) {
    const rates = input.workedByWorker.map((worker) => worker.hourlyCost ?? input.hourlyCost);
    actualLabour = rates.some((rate) => rate === null)
      ? null
      : input.workedByWorker.reduce((sum, worker, index) => sum + labourCost(worker.minutes, rates[index]!), 0);
  } else {
    actualLabour = input.hourlyCost === null ? null : labourCost(input.workedMinutes, input.hourlyCost);
  }

  const estimate = side(
    input.revenue,
    input.estimatedMinutes,
    estimatedLabour,
    input.estimatedMaterials,
    input.estimatedTransport,
    0,
  );
  const actual = side(input.revenue, input.workedMinutes, actualLabour, input.materials, input.transport, input.other);

  const hoursOverrun =
    input.estimatedMinutes > 0
      ? mulDivRound(input.workedMinutes - input.estimatedMinutes, 10_000, input.estimatedMinutes)
      : null;

  return {
    revenue: input.revenue,
    estimate,
    actual,
    hoursOverrun,
    flags: {
      hoursOverEstimate: hoursOverrun !== null && hoursOverrun > input.hoursOverrunTolerance,
      negativeMargin: actual.margin !== null && actual.margin < 0,
      hourlyCostMissing: estimatedLabour === null || actualLabour === null,
    },
  };
}
