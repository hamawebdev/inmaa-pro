import { DEMO_FILES } from "@/features/clients/demo";
import { moveFileStage, registerFile } from "@/features/clients/services/files";
import { entryValuesOf } from "@/features/operations/components/visit-entry/visit-entry-data";
import { assignVisitWorker, listSeatCandidates } from "@/features/operations/services/assignment";
import { recordOrderPrinted } from "@/features/operations/services/mission-order";
import { getVisitEntry, saveReturnedOrder } from "@/features/operations/services/visit-entry";
import type { ReturnedOrderValues } from "@/features/operations/validators/returned-order";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { dinarsToMoney, localDate } from "@/lib/units";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { addMinutesToTime } from "./rules/dates";
import { createExpense } from "./services/expenses";
import { issueInvoice } from "./services/invoices";
import { recordPayment } from "./services/payments";
import type { ExpenseFormValues } from "./validators/expense";

/**
 * Money's demo data (CLAUDE.md, "Demo data"), on top of the folders before it.
 *
 * Clients' files reached «متعاقد» this autumn, so none of their periods has
 * ended yet and nothing of theirs can be invoiced on the demo's Monday. One
 * older contract is therefore added here, a home cleaned every Tuesday since
 * August, typed in by reception at the end of July through Clients' own
 * services; Operations' services give its visits a team and sign them off.
 * Then, today, the accountant catches up: August is invoiced and paid in cash
 * at the desk, September is invoiced and still owed. A few expenses on each
 * line complete the month.
 *
 * The same contract lights Money's three tiles on the demo's Monday, 12
 * October 2026: it ends on 31 October (`contract.ending`, inside the 30 days
 * of `alerts.contractEndLeadDays`), its September due of 15 September is not
 * paid (`payment.overdue`), and its October due falls on Thursday 15
 * (`payment.dueSoon`, inside the 7 days of `alerts.paymentDueLeadDays`).
 *
 * Until Clients' demo holds a contract old enough to be invoiced, this is the
 * one; the numbers, the history and the log are what the program would hold.
 */

const at = (localDate: string, localTime = "09:00") => {
  const [hours, minutes] = localTime.split(":").map(Number);
  // The centre is at UTC+1 and keeps no summer time.
  return `${localDate}T${String(hours - 1).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:00.000Z`;
};

/** The Tuesdays of August and September 2026: the visits that were done. */
const DONE_VISITS = [
  "2026-08-04",
  "2026-08-11",
  "2026-08-18",
  "2026-08-25",
  "2026-09-01",
  "2026-09-08",
  "2026-09-15",
  "2026-09-22",
  "2026-09-29",
];

/** What was spent this autumn, on his four lines and on «عام». Invented amounts. */
const EXPENSES: readonly ExpenseFormValues[] = [
  {
    division: "COMMON",
    category: "RENT",
    date: "2026-10-02",
    amount: 30_000,
    method: "BANK_TRANSFER",
    paidTo: "صاحب المحل",
    spentByName: undefined,
    recurrence: "MONTHLY",
    note: "إيجار مقر المركز لشهر أكتوبر",
  },
  {
    division: "COMMON",
    category: "PHONE",
    date: "2026-10-05",
    amount: 3_000,
    method: "CASH",
    paidTo: "موبيليس",
    spentByName: undefined,
    recurrence: "MONTHLY",
    note: undefined,
  },
  {
    division: "COMMON",
    category: "ACCOUNTING",
    date: "2026-09-28",
    amount: 10_000,
    method: "BANK_TRANSFER",
    paidTo: "مكتب المحاسبة",
    spentByName: undefined,
    recurrence: "MONTHLY",
    note: undefined,
  },
  {
    division: "BUILDING",
    category: "TRANSPORT",
    date: "2026-10-08",
    amount: 2_500,
    method: "CASH",
    paidTo: "سيارة أجرة",
    spentByName: "مراد حداد",
    recurrence: "NONE",
    note: "نقل الفريق إلى العمارة B7",
  },
  {
    division: "HOUSING",
    category: "COMPENSATION",
    date: "2026-10-06",
    amount: 2_000,
    method: "CASH",
    paidTo: undefined,
    spentByName: undefined,
    recurrence: "NONE",
    note: "تعويض كأس مكسور عند عميل",
  },
  {
    division: "ORGANISATION",
    category: "TRANSPORT",
    date: "2026-10-10",
    amount: 1_800,
    method: "CASH",
    paidTo: "سيارة أجرة",
    spentByName: undefined,
    recurrence: "NONE",
    note: undefined,
  },
  {
    division: "COMPLEX",
    category: "MARKETING",
    date: "2026-10-07",
    amount: 4_500,
    method: "CASH",
    paidTo: "مطبعة الأمل",
    spentByName: "ياسين قاسمي",
    recurrence: "NONE",
    note: "لافتة عند مدخل الإقامة",
  },
];

/** A returned order as it comes back from a good morning: everyone on time, everything ticked, the client satisfied. */
function returnedSheet(
  blank: ReturnedOrderValues,
  visit: { visitDate: string; plannedStartTime: string; plannedDurationMin: number },
  signedBy: string,
): ReturnedOrderValues {
  const end = addMinutesToTime(visit.plannedStartTime, visit.plannedDurationMin);
  return {
    ...blank,
    returnedDate: visit.visitDate,
    workers: blank.workers.map((worker) => ({
      ...worker,
      attended: true,
      arrivedTime: visit.plannedStartTime,
      workStartTime: visit.plannedStartTime,
      workEndTime: end,
      leftTime: end,
      arrivalInitialled: true,
      departureInitialled: true,
      lateReason: "",
    })),
    checklist: blank.checklist.map((line) => ({ ...line, done: true })),
    problemOnSite: false,
    problemKinds: [],
    problemDetails: "",
    completion: "FULL",
    completionPercent: 100,
    incompleteReason: "",
    needsExtraVisit: false,
    needsSupervisor: false,
    signoffStatus: "ACCEPTED",
    signoffName: signedBy,
    signoffRole: "",
    signoffDate: visit.visitDate,
    signoffNotes: "",
    wantsOtherService: false,
    ratings: { quality: 5, punctuality: 5, behaviour: 5, materials: 4, overall: 5 },
    wouldRecommend: true,
    signedOnPaper: true,
    workerSigned: true,
  };
}

/** The older contract: Clients' home contract, written for another client, from 1 August to 31 October. */
async function olderContract(ex: Executor, tools: DemoTools) {
  const model = DEMO_FILES.find((file) => file.name === "housingContract");
  if (!model) throw new Error("money: Clients' demo has no home contract to start from");
  const clientName = "لعريبي سهام";
  const reception = await tools.sessionOf("RECEPTION_SALES");
  const registered = await registerFile(ex, tools.at(at("2026-07-27", "10:00"), reception), {
    ...model.input,
    values: {
      ...model.input.values,
      siteNumber: "8",
      clientName,
      address: "حي 08 ماي 1945، عمارة 3، الطابق الثاني",
      commonName: "شقة لعريبي قرب مركز البريد",
      phone: "0662 41 87 30",
      contractDuration: "M3",
      visitsPerWeek: 1,
      executionDays: ["TUE"],
      startDate: "2026-08-01",
      endDate: "2026-10-31",
      payerName: clientName,
      payerPhone: "0662 41 87 30",
      paymentMethods: ["CASH"],
      totalAmount: dinarsToMoney(12_000),
      // Paid on the 15th of each month: September's is overdue on the demo's Monday, October's falls on Thursday.
      firstDueDate: "2026-08-15",
      paymentFrequency: "MONTHLY",
      issuedDate: "2026-07-27",
    },
    office: { ...model.input.office, amountBasis: "PER_PAYMENT_PERIOD" },
    siteOffice: { ...model.input.siteOffice, keyHolderName: clientName, keyReceivedDate: "2026-07-29" },
  });
  // Priced by phone, signed two days later: «متعاقد» makes the visits (Operations) and the dues (Money).
  await moveFileStage(ex, tools.at(at("2026-07-28", "11:00")), { fileId: registered.fileId, to: "QUOTE" });
  await moveFileStage(ex, tools.at(at("2026-07-29", "16:00")), { fileId: registered.fileId, to: "CONTRACTED" });
  return { ...registered, clientName };
}

/** A team on the visit, its order printed in the morning, typed in whole after the team came back. */
async function doneVisit(ex: Executor, tools: DemoTools, visitId: string, signedBy: string) {
  const visit = await ex
    .selectFrom("Visit")
    .select(["id", "visitDate", "plannedStartTime", "plannedDurationMin", "workersNeeded"])
    .where("id", "=", visitId)
    .executeTakeFirstOrThrow();
  const morning = tools.at(at(visit.visitDate, "07:30"));
  const candidates = await listSeatCandidates(ex, morning, { visitId: visit.id });
  const team = candidates
    .filter(
      (candidate) =>
        !candidate.sanctioned && candidate.worstLevel !== "REFUSED" && candidate.worstLevel !== "NEEDS_MANAGER",
    )
    .slice(0, visit.workersNeeded);
  for (const candidate of team) await assignVisitWorker(ex, morning, { visitId: visit.id, workerId: candidate.id });
  await recordOrderPrinted(ex, morning, { visitId: visit.id });

  const afternoon = tools.at(at(visit.visitDate, "15:00"));
  const entry = await getVisitEntry(ex, afternoon, { visitId: visit.id });
  await saveReturnedOrder(ex, afternoon, {
    visitId: visit.id,
    values: returnedSheet(entryValuesOf(entry, visit.visitDate), visit, signedBy),
  });
}

export async function seedDemo(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};

  // ── July to September: the older contract, and its visits done ──
  const file = await olderContract(ex, tools);
  names.pastContract = file.fileId;
  names.pastContractClient = file.clientId;
  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "visitDate"])
    .where("fileId", "=", file.fileId)
    .where("visitDate", "in", DONE_VISITS.map(localDate))
    .orderBy("visitDate")
    .execute();
  for (const visit of visits) await doneVisit(ex, tools, visit.id, file.clientName);

  // ── Monday 12 October: the expenses of the month are typed in ──
  // (These come first today: the log's last entry is then today's, as on any working morning.)
  for (const values of EXPENSES) await createExpense(ex, ctx, { values });

  // ── The accountant invoices August and September; August is paid in cash at the desk ──
  const accountant = tools.at(ctx.now, await tools.sessionOf("ACCOUNTANT"));
  const dues = await ex
    .selectFrom("PaymentDue")
    .select(["id", "periodStart"])
    .where("fileId", "=", file.fileId)
    .where("cancelledAt", "is", null)
    .orderBy("periodStart")
    .execute();
  const august = dues.find((due) => due.periodStart === "2026-08-01");
  const september = dues.find((due) => due.periodStart === "2026-09-01");
  if (!august || !september) throw new Error("money: the older contract has no August or September due");

  const paid = await issueInvoice(ex, accountant, { fileId: file.fileId, dueIds: [august.id], paymentMethod: "CASH" });
  names.invoicePaid = paid.id;
  const payment = await recordPayment(ex, accountant, {
    fileId: file.fileId,
    receivedDate: ctx.today,
    method: "CASH",
    amount: dinarsToMoney(12_000),
    dueIds: [august.id],
  });
  names.paymentCash = payment.id;
  if (payment.receiptId) names.receiptPaid = payment.receiptId;

  const owed = await issueInvoice(ex, accountant, {
    fileId: file.fileId,
    dueIds: [september.id],
    paymentMethod: "CASH",
  });
  names.invoiceOutstanding = owed.id;
  names.dueOverdue = september.id;
  const october = dues.find((due) => due.periodStart === "2026-10-01");
  if (october) names.dueSoon = october.id;
  return names;
}
