import { CalendarClock, CircleAlert, HandCoins } from "lucide-react";

import type { RegisterAlert } from "@/lib/alerts";
import { addDays } from "@/lib/clock";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { money } from "@/lib/units";

import { contractEndAlert } from "./rules/alerts";
import { PAYMENTS_PATH } from "./services/paths";
import type { FileStage, ServiceType } from "./validators/option-codes";

/**
 * Money's alerts (docs/data-model/DESIGN.md section 13): the two the scope
 * asks of the client's notes, a contract coming to its end and a payment
 * falling due, the second as two tiles, coming and late.
 *
 * Each count is a read, as the reader, every time the home screen opens. The
 * rules themselves are in ./rules/alerts.ts, tested there.
 */

export const FILES_LIST = "/dashboard/files";

/**
 * «عقد يقترب من نهايته» (A3): live contracts ending within the lead time with
 * no renewal signed, and contracts ended by their date that nobody renewed or
 * closed. The tile opens Clients' list of files on exactly those, or the one file.
 */
export async function findEndingContracts(
  ex: Executor,
  ctx: ServiceContext,
  input: { leadDays: number },
): Promise<string[]> {
  const files = await ex
    .selectFrom("File")
    .select(["id", "serviceType", "stage", "endDate", "endKind", "closedAt", "renewalDecision"])
    .select(({ exists, selectFrom }) =>
      exists(
        selectFrom("File as Successor")
          .select("Successor.id")
          .whereRef("Successor.renewalOfFileId", "=", "File.id")
          .where("Successor.stage", "=", "CONTRACTED")
          .where("Successor.deletedAt", "is", null),
      ).as("renewed"),
    )
    .where("serviceType", "=", "CONTRACT")
    .where("deletedAt", "is", null)
    .where("stage", "in", ["CONTRACTED", "CONTRACT_ENDED"])
    .where("closedAt", "is", null)
    .where("endDate", "is not", null)
    .orderBy("endDate")
    .execute();
  return files
    .filter(
      (file) =>
        contractEndAlert(
          {
            serviceType: file.serviceType as ServiceType,
            stage: file.stage as FileStage,
            endDate: file.endDate,
            closed: file.closedAt !== null,
            renewed: Boolean(file.renewed),
            endedByExpiry: file.endKind === "EXPIRED",
            willNotRenew: file.renewalDecision === "WILL_NOT_RENEW",
          },
          ctx.today,
          input.leadDays,
        ) !== null,
    )
    .map((file) => file.id);
}

/** Open dues, by when they fall: today to the lead time ahead, or before today. */
export async function countDues(
  ex: Executor,
  ctx: ServiceContext,
  input: { state: "DUE_SOON" | "OVERDUE"; leadDays: number },
): Promise<number> {
  let query = ex
    .selectFrom("PaymentDue")
    .select(({ fn }) => fn.countAll<number>().as("count"))
    .where("cancelledAt", "is", null)
    .whereRef("paidAmount", "<", "amount")
    .where("amount", ">", money(0));
  query =
    input.state === "OVERDUE"
      ? query.where("dueDate", "<", ctx.today)
      : query.where("dueDate", ">=", ctx.today).where("dueDate", "<=", addDays(ctx.today, input.leadDays));
  const row = await query.executeTakeFirst();
  return Number(row?.count ?? 0);
}

export function registerAlerts(register: RegisterAlert) {
  register({
    key: "contract.ending",
    section: "requests",
    severity: "warning",
    name: "ContractEnding",
    icon: CalendarClock,
    leadSetting: "alerts.contractEndLeadDays",
    route: FILES_LIST,
    count: async (ex, ctx, { days }) => {
      const ids = await findEndingContracts(ex, ctx, { leadDays: days ?? 30 });
      const route =
        ids.length === 0
          ? FILES_LIST
          : ids.length === 1
            ? `${FILES_LIST}/${ids[0]}`
            : `${FILES_LIST}?ids=${ids.join(",")}`;
      return { count: ids.length, route };
    },
  });
  register({
    key: "payment.overdue",
    section: "money",
    severity: "danger",
    name: "PaymentOverdue",
    icon: CircleAlert,
    leadSetting: "alerts.paymentDueLeadDays",
    route: `${PAYMENTS_PATH}?view=dues&state=OVERDUE`,
    count: (ex, ctx, { days }) => countDues(ex, ctx, { state: "OVERDUE", leadDays: days ?? 7 }),
  });
  register({
    key: "payment.dueSoon",
    section: "money",
    severity: "warning",
    name: "PaymentDueSoon",
    icon: HandCoins,
    leadSetting: "alerts.paymentDueLeadDays",
    route: `${PAYMENTS_PATH}?view=dues&state=DUE_SOON`,
    count: (ex, ctx, { days }) => countDues(ex, ctx, { state: "DUE_SOON", leadDays: days ?? 7 }),
  });
}
