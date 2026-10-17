import { can, requireSection } from "@/lib/access/session";
import { logConsultOnce } from "@/lib/log";
import { action } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, type LocalDate } from "@/lib/units";

import { isIsoDate } from "../rules/dates";
import { DIVISIONS, SERVICE_TYPES, type Division, type ServiceType } from "../validators/option-codes";

import { computeFileProfitability } from "./profitability";
import { readFileBilling } from "./terms";

/**
 * The analytics of a period (features 30 and 41): each contract's revenue, cost and result, and the same
 * by service type, by zone and by client; then the money that came in and went out, month by month.
 *
 * Revenue is what the period earned before tax (its dues, as the contract's profitability counts it);
 * cost is the contract's actual cost (labour, materials, transport, the rest). Cost and result are for
 * those who hold `cost.read`, and reading them is logged once per user, period and day; without it the
 * same tables carry the revenue alone. A read that may write the log: the screen calls it as an action.
 */

export interface ContractProfit {
  fileId: string;
  fileNumber: string;
  clientId: string;
  clientName: string;
  division: Division;
  serviceType: ServiceType;
  zoneName: string | null;
  revenue: number;
  /** Null without `cost.read`; null too when no hourly cost is set. */
  estimatedCost: number | null;
  actualCost: number | null;
  result: number | null;
  /** The result as a share of revenue, in basis points. */
  resultRate: number | null;
  hoursOverEstimate: boolean;
}

export interface ProfitGroup {
  key: string;
  label: string;
  revenue: number;
  cost: number | null;
  result: number | null;
}

export interface CashMonth {
  month: string;
  moneyIn: number;
  moneyOut: number;
  net: number;
  running: number;
}

export interface PeriodAnalytics {
  from: LocalDate;
  to: LocalDate;
  /** Whether the reader sees costs: the screen draws the cost columns only then. */
  seesCost: boolean;
  contracts: ContractProfit[];
  byServiceType: ProfitGroup[];
  byZone: ProfitGroup[];
  byClient: ProfitGroup[];
  cashFlow: CashMonth[];
}

const NO_ZONE = "none";

function group(rows: readonly ContractProfit[], keyOf: (row: ContractProfit) => [string, string], seesCost: boolean) {
  const groups = new Map<string, ProfitGroup>();
  for (const row of rows) {
    const [key, label] = keyOf(row);
    const entry = groups.get(key) ?? { key, label, revenue: 0, cost: seesCost ? 0 : null, result: seesCost ? 0 : null };
    entry.revenue += row.revenue;
    if (seesCost && entry.cost !== null) {
      // A contract whose labour cannot be costed makes its group's cost unknown, not smaller than it is.
      entry.cost = row.actualCost === null ? null : entry.cost + row.actualCost;
    }
    entry.result = entry.cost === null ? null : entry.revenue - entry.cost;
    groups.set(key, entry);
  }
  return [...groups.values()].sort((a, b) => b.revenue - a.revenue || a.label.localeCompare(b.label));
}

export async function getPeriodAnalytics(
  ex: Executor,
  ctx: ServiceContext,
  input: { from: string; to: string; branchId?: string | null },
): Promise<PeriodAnalytics> {
  requireSection(ctx, "MONEY", "READ");
  if (!isIsoDate(input.from) || !isIsoDate(input.to)) throw new ServiceError("Enter a valid date.");
  if (input.from > input.to) throw new ServiceError("The start of the period cannot be after its end.");
  const from = localDate(input.from);
  const to = localDate(input.to);
  const seesCost = can(ctx, "cost.read");
  if (seesCost) {
    await logConsultOnce(ex, ctx, {
      owner: "MONEY",
      action: "VIEW_RESTRICTED",
      entity: "PeriodReport",
      entityId: `profitability:${from}:${to}:${input.branchId ?? "all"}`,
      context: { what: "PROFITABILITY", from, to },
    });
  }

  // The files the period concerns: a due of the period, or a visit in it.
  const active = await ex
    .selectFrom("File")
    .innerJoin("Client", "Client.id", "File.clientId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .leftJoin("Zone", "Zone.id", "Site.zoneId")
    .select(["File.id", "Client.id as clientId", "Client.name as clientName", "Zone.name as zoneName"])
    .where("File.deletedAt", "is", null)
    .$if(input.branchId != null, (qb) => qb.where("File.branchId", "=", input.branchId ?? ""))
    .where((eb) =>
      eb.or([
        eb.exists(
          eb
            .selectFrom("PaymentDue")
            .select("PaymentDue.id")
            .whereRef("PaymentDue.fileId", "=", "File.id")
            .where("PaymentDue.cancelledAt", "is", null)
            .where((due) =>
              due.or([
                due.and([due("PaymentDue.periodStart", ">=", from), due("PaymentDue.periodStart", "<=", to)]),
                due.and([
                  due("PaymentDue.periodStart", "is", null),
                  due("PaymentDue.dueDate", ">=", from),
                  due("PaymentDue.dueDate", "<=", to),
                ]),
              ]),
            ),
        ),
        eb.exists(
          eb
            .selectFrom("Visit")
            .select("Visit.id")
            .whereRef("Visit.fileId", "=", "File.id")
            .where("Visit.visitDate", ">=", from)
            .where("Visit.visitDate", "<=", to),
        ),
      ]),
    )
    .execute();

  const contracts: ContractProfit[] = [];
  for (const row of active) {
    const file = await readFileBilling(ex, ctx, row.id);
    if (!file || !(DIVISIONS as readonly string[]).includes(file.division)) continue;
    const profit = await computeFileProfitability(ex, ctx, { file, from, to });
    const { result } = profit;
    contracts.push({
      fileId: file.id,
      fileNumber: file.number,
      clientId: row.clientId,
      clientName: row.clientName,
      division: file.division,
      serviceType: (SERVICE_TYPES as readonly string[]).includes(file.serviceType) ? file.serviceType : "CONTRACT",
      zoneName: row.zoneName,
      revenue: result.revenue,
      estimatedCost: seesCost ? result.estimate.cost : null,
      actualCost: seesCost ? result.actual.cost : null,
      result: seesCost ? result.actual.margin : null,
      resultRate: seesCost ? result.actual.marginRate : null,
      hoursOverEstimate: seesCost && result.flags.hoursOverEstimate,
    });
  }
  contracts.sort((a, b) => b.revenue - a.revenue || a.fileNumber.localeCompare(b.fileNumber));

  // ── Money in and out, month by month ──
  // Cash, as the box and the bank saw it: a payment with its stamp duty and tax (the report's «المحصَّل»),
  // an expense as paid. Handing the tax and the stamp duty over is an expense of its own («ضرائب»).
  const payments = await ex
    .selectFrom("Payment")
    .select(["Payment.receivedDate", "Payment.totalReceived"])
    .where("Payment.receivedDate", ">=", from)
    .where("Payment.receivedDate", "<=", to)
    .$if(input.branchId != null, (qb) => qb.where("Payment.branchId", "=", input.branchId ?? ""))
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("LegalEvent")
            .select("LegalEvent.id")
            .whereRef("LegalEvent.paymentId", "=", "Payment.id")
            .where("LegalEvent.type", "=", "VOIDED"),
        ),
      ),
    )
    .execute();
  const expenses = await ex
    .selectFrom("Expense")
    .select(["date", "amount"])
    .where("deletedAt", "is", null)
    .where("date", ">=", from)
    .where("date", "<=", to)
    .$if(input.branchId != null, (qb) => qb.where("branchId", "=", input.branchId ?? ""))
    .execute();
  const months: string[] = [];
  for (let month = from.slice(0, 7); month <= to.slice(0, 7); ) {
    months.push(month);
    const [year, number] = month.split("-").map(Number);
    month = number === 12 ? `${year + 1}-01` : `${year}-${String(number + 1).padStart(2, "0")}`;
  }
  let running = 0;
  const cashFlow = months.map((month) => {
    const moneyIn = payments
      .filter((row) => row.receivedDate.startsWith(month))
      .reduce((sum, row) => sum + row.totalReceived, 0);
    const moneyOut = expenses.filter((row) => row.date.startsWith(month)).reduce((sum, row) => sum + row.amount, 0);
    running += moneyIn - moneyOut;
    return { month, moneyIn, moneyOut, net: moneyIn - moneyOut, running };
  });

  return {
    from,
    to,
    seesCost,
    contracts,
    byServiceType: group(contracts, (row) => [row.serviceType, row.serviceType], seesCost),
    byZone: group(contracts, (row) => [row.zoneName ?? NO_ZONE, row.zoneName ?? NO_ZONE], seesCost),
    byClient: group(contracts, (row) => [row.clientId, row.clientName], seesCost),
    cashFlow,
  };
}

export const getPeriodAnalyticsAction = action(getPeriodAnalytics);
