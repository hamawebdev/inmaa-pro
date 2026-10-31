import { requireCapability, requireSection } from "@/lib/access/session";
import { holdsBooks, requireBooks } from "@/lib/sync/books";
import { appendChained, invoiceContentDigest } from "@/lib/chain";
import { assertClockSane } from "@/lib/clock/sanity";
import { newId } from "@/lib/db/rows";
import { emit } from "@/lib/events";
import { logChange, logDisclose } from "@/lib/log";
import { peekLegalNumber } from "@/lib/numbering";
import { MISSING_FOR_INVOICE } from "@/features/clients/rules/client-identifiers";
import { listComplaintCredits } from "@/features/operations/services/complaints";
import { WEEKDAY_AR, weekdayOf } from "@/lib/options";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import { money, type LocalDate } from "@/lib/units";

import { paymentState } from "../rules/alerts";
import { amountInWordsAr } from "../rules/amount-in-words-ar";
import { amountInWordsFr } from "../rules/amount-in-words-fr";
import { shareByWeights } from "../rules/centimes";
import { formatDate } from "../rules/dates";
import {
  computeInvoiceTotals,
  missedVisitDeduction,
  shareBeforeTax,
  type InvoiceTotals,
} from "../rules/invoice-totals";
import type { BuyerSnapshot, InvoiceSheetData, SellerSnapshot } from "../sheets/invoice-sheet";
import {
  CLIENT_AT_FAULT_REMARK,
  COMPLETION_LABEL,
  JOB_UNIT_LABEL,
  LUMP_SUM_UNIT_LABEL,
  MAKEUP_REMARK,
  NOBODY_TO_SIGN_LABEL,
  NOT_SIGNED_OFF_REMARK,
  PERIOD_UNIT_LABEL,
  signOffLabel,
  VISIT_STATUS_LABEL,
  VISIT_UNIT_LABEL,
} from "../sheets/statement-labels";
import type { VisitStatementData } from "../sheets/visit-statement-sheet";
import {
  DIVISIONS,
  INVOICE_LINE_KINDS,
  PAYMENT_METHODS,
  SERVICE_TYPES,
  type Division,
  type InvoiceLineKind,
  type PaymentMethod,
  type PaymentState,
  type ServiceType,
  type TaxMode,
} from "../validators/option-codes";

import { readInvoiceSettings, readStampSettings, readTaxSettings } from "./money-settings";
import { readFileParty, readSeller, type FileParty } from "./parties";
import { rebalanceFile } from "./credit";
import { MONEY_PATHS } from "./paths";
import { readFileBilling, type FileBilling } from "./terms";
import {
  awaitsSignOff,
  isBilled,
  isOpenVisit,
  isPricedExtra,
  isProgrammeVisit,
  readBillingVisits,
  type BillingVisit,
} from "./visits";

/**
 * «الفواتير» (#19, #31): an invoice is issued from dues that are ready, with
 * the statement of the visits it bills, and is never changed afterwards.
 *
 *  - **Ready.** A period's due once the period has ended and each of its
 *    visits is closed and, when Settings ask for it, signed off; a per-visit
 *    due once its visit is billable; a job's due once its visits are done.
 *    "Billable" is read from Operations (`Visit.billable`, the returned order)
 *    and from the office's own decision when it took one (services/visits.ts).
 *  - **Issuing** is one transaction: the clock is checked, the number is the
 *    next of the legal sequence, the invoice commits to its lines and visit
 *    rows by a digest computed before anything is written, the rows go
 *    through Foundation's chain, and the dues take their share of the total.
 *  - **Voiding** writes a `VOIDED` event with the reason typed; the invoice,
 *    its lines and its number stay, and its dues go back to "not invoiced".
 *
 * No draft row yet: the screen shows the proposal `prepareInvoice` computes,
 * and `issueInvoice` computes it again inside its own transaction, so what is
 * issued is what the database holds at that instant, not what a screen showed.
 */

// ── Ready or not ─────────────────────────────────────────────────────────────

export const DUE_READINESS = ["READY", "PERIOD_OPEN", "VISITS_OPEN", "AWAITING_SIGNOFF", "NOTHING_DONE"] as const;
export type DueReadiness = (typeof DUE_READINESS)[number];

/**
 * The kinds of due this service knows how to invoice: a period, a visit, a job, the first deep clean of a
 * contract (`INITIAL_JOB`, once its visit is done) and a priced extra visit (`EXTRA`).
 */
const INVOICED_KINDS = ["SCHEDULE", "VISIT", "SINGLE", "INITIAL_JOB", "EXTRA"] as const;
type InvoicedKind = (typeof INVOICED_KINDS)[number];

interface DueToInvoice {
  id: string;
  fileId: string;
  seq: number;
  kind: InvoicedKind;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  visitId: string | null;
  dueDate: LocalDate;
  expectedAmount: number;
}

/** A visit priced or billed apart from the period and the job: the first deep clean, an extra visit priced alone. */
const billedApart = (visit: BillingVisit) => visit.origin === "INITIAL" || isPricedExtra(visit);

/** The first deep clean was done: the office's decision wins, else its visit is done (and signed off when asked). */
function cleanDelivered(visit: BillingVisit, requireSignOff: boolean): boolean {
  if (visit.decision) return visit.decision.billable;
  return visit.status === "DONE" && (!requireSignOff || visit.signedOff);
}

/**
 * The visits a due is the price of: its period's, its own, the whole job's, or the first deep clean.
 *
 * A make-up belongs to the period of the visit it stands in for, wherever its own date falls (MON-02): the
 * period waits for it, counts it as delivered and states it, and the period it is dated in leaves it out.
 */
function visitsOfDue(due: DueToInvoice, visits: readonly BillingVisit[]): BillingVisit[] {
  if (due.kind === "VISIT" || due.kind === "EXTRA") return visits.filter((visit) => visit.id === due.visitId);
  if (due.kind === "INITIAL_JOB") return visits.filter((visit) => visit.origin === "INITIAL");
  if (due.kind === "SINGLE") return visits.filter((visit) => !billedApart(visit));
  const { periodStart, periodEnd } = due;
  if (periodStart === null || periodEnd === null) return [];
  const byId = new Map(visits.map((visit) => [visit.id, visit]));
  const inPeriod = (date: string) => date >= periodStart && date <= periodEnd;
  return visits.filter((visit) => {
    if (billedApart(visit)) return false;
    const source = visit.origin === "MAKEUP" && visit.sourceVisitId ? byId.get(visit.sourceVisitId) : undefined;
    return source ? inPeriod(source.visitDate) : inPeriod(visit.visitDate);
  });
}

function readinessOf(
  due: DueToInvoice,
  visits: readonly BillingVisit[],
  today: LocalDate,
  requireSignOff: boolean,
): DueReadiness {
  const own = visitsOfDue(due, visits);
  if (due.kind === "SCHEDULE" && due.periodEnd !== null && due.periodEnd > today) return "PERIOD_OPEN";
  if (own.some(isOpenVisit)) return "VISITS_OPEN";
  if (own.some((visit) => awaitsSignOff(visit, requireSignOff))) return "AWAITING_SIGNOFF";
  if (due.kind === "INITIAL_JOB") {
    return own.some((visit) => cleanDelivered(visit, requireSignOff)) ? "READY" : "NOTHING_DONE";
  }
  // A period is invoiced even when nothing was done in it: the missed visits come off it. A visit or a job is not.
  if (due.kind !== "SCHEDULE" && !own.some((visit) => isBilled(visit, requireSignOff))) return "NOTHING_DONE";
  return "READY";
}

export interface InvoiceCandidate {
  dueId: string;
  fileId: string;
  fileNumber: string;
  clientName: string;
  division: Division;
  serviceType: ServiceType;
  kind: InvoicedKind;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  dueDate: LocalDate;
  expectedAmount: number;
  /** Visits the due is the price of, and how many of them are billed. */
  visits: number;
  billed: number;
  readiness: DueReadiness;
}

/**
 * The dues that are not invoiced yet and have begun: what the issue screen
 * lists, the ready ones first. A due whose period or visit is still to come is
 * left out; so is one already taken into an invoice.
 */
export async function listInvoiceCandidates(ex: Executor, ctx: ServiceContext): Promise<InvoiceCandidate[]> {
  requireSection(ctx, "MONEY", "READ");
  const { requireSignOff } = await readInvoiceSettings(ex);
  const rows = await ex
    .selectFrom("PaymentDue")
    .innerJoin("File", "File.id", "PaymentDue.fileId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select([
      "PaymentDue.id",
      "PaymentDue.fileId",
      "PaymentDue.seq",
      "PaymentDue.kind",
      "PaymentDue.periodStart",
      "PaymentDue.periodEnd",
      "PaymentDue.visitId",
      "PaymentDue.dueDate",
      "PaymentDue.expectedAmount",
      "File.number as fileNumber",
      "File.division",
      "File.serviceType",
      "Client.name as clientName",
    ])
    .where("PaymentDue.cancelledAt", "is", null)
    .where("PaymentDue.invoiceId", "is", null)
    .where("PaymentDue.kind", "in", [...INVOICED_KINDS])
    .where("PaymentDue.periodStart", "<=", ctx.today)
    .where("File.deletedAt", "is", null)
    .orderBy("PaymentDue.periodStart")
    .orderBy("File.number")
    .execute();

  const visitsByFile = new Map<string, BillingVisit[]>();
  const candidates: InvoiceCandidate[] = [];
  for (const row of rows) {
    if (!visitsByFile.has(row.fileId))
      visitsByFile.set(row.fileId, await readBillingVisits(ex, { fileId: row.fileId }));
    const visits = visitsByFile.get(row.fileId) ?? [];
    const due = row as unknown as DueToInvoice;
    const own = visitsOfDue(due, visits);
    candidates.push({
      dueId: row.id,
      fileId: row.fileId,
      fileNumber: row.fileNumber,
      clientName: row.clientName,
      division: row.division as Division,
      serviceType: row.serviceType as ServiceType,
      kind: due.kind,
      periodStart: due.periodStart,
      periodEnd: due.periodEnd,
      dueDate: due.dueDate,
      expectedAmount: row.expectedAmount,
      visits: own.length,
      billed: own.filter((visit) => isBilled(visit, requireSignOff)).length,
      readiness: readinessOf(due, visits, ctx.today, requireSignOff),
    });
  }
  return candidates.sort((a, b) => Number(b.readiness === "READY") - Number(a.readiness === "READY"));
}

// ── The proposal ─────────────────────────────────────────────────────────────

export const INVOICE_BLOCKERS = [
  "NO_SUCH_FILE",
  "NO_DUE_CHOSEN",
  "DUE_GONE",
  "PERIOD_OPEN",
  "VISITS_OPEN",
  "AWAITING_SIGNOFF",
  "NOTHING_DONE",
  "NO_TAX_MODE",
  "SELLER_INCOMPLETE",
  "BUYER_NO_ADDRESS",
  "BUYER_TRADE_REGISTER_UNANSWERED",
  "BUYER_NO_TRADE_REGISTER",
  "BUYER_NO_NIF",
  "BUYER_NO_NIS",
  "NOTHING_TO_INVOICE",
] as const;
export type InvoiceBlocker = (typeof INVOICE_BLOCKERS)[number];

/** Each reason an invoice cannot be issued, as the sentence the office reads. */
export const INVOICE_REFUSALS: Readonly<Record<InvoiceBlocker, string>> = {
  NO_SUCH_FILE: "This file does not exist.",
  NO_DUE_CHOSEN: "Choose what to invoice.",
  DUE_GONE: "This due can no longer be invoiced: it was cancelled or is already on an invoice.",
  PERIOD_OPEN: "This period has not ended yet.",
  VISITS_OPEN: "Some visits to invoice are not closed yet.",
  AWAITING_SIGNOFF: "A visit that was done is not signed off yet: type its returned order in first.",
  NOTHING_DONE: "No visit was done that can be invoiced.",
  NO_TAX_MODE: "Choose the centre's tax regime in Settings before the first invoice.",
  SELLER_INCOMPLETE:
    "The centre's trade register, NIS, NIF, article number and address are needed before the first invoice.",
  BUYER_NO_ADDRESS: "This client has no address to print on the invoice.",
  // An organisation's identifiers: Clients' own sentences, the ones its card shows (INV-4).
  BUYER_TRADE_REGISTER_UNANSWERED: MISSING_FOR_INVOICE.tradeRegisterAnswer,
  BUYER_NO_TRADE_REGISTER: MISSING_FOR_INVOICE.rcNumber,
  BUYER_NO_NIF: MISSING_FOR_INVOICE.nif,
  BUYER_NO_NIS: MISSING_FOR_INVOICE.nis,
  NOTHING_TO_INVOICE: "There is nothing to invoice: the total is zero.",
};

export interface ProposedLine {
  seq: number;
  kind: InvoiceLineKind;
  description: string;
  /** Thousandths. */
  quantity: number;
  unitLabel: string;
  unitPrice: number;
  /** Negative for missed visits and a complaint's discount. */
  amount: number;
  dueId: string | null;
  visitId: string | null;
  /** The settled complaint whose agreed discount this line carries (INT-3, MON-04). */
  complaintId?: string | null;
}

export interface ProposedVisit {
  seq: number;
  visitId: string;
  visitDate: LocalDate;
  dayName: string;
  arrival: string | null;
  departure: string | null;
  workersCount: number;
  workedMin: number | null;
  completion: string;
  signOff: string | null;
  signedBy: string | null;
  billable: boolean;
  remark: string | null;
  /** For the screen only, never frozen: where the visit comes from, and the office's decision on it (MON-05). */
  origin: string;
  decision: BillingVisit["decision"];
}

export interface InvoiceProposal {
  fileId: string;
  fileNumber: string;
  clientName: string;
  division: Division | null;
  serviceType: ServiceType | null;
  /** The methods the file's form ticks: the first is proposed. */
  fileMethods: PaymentMethod[];
  paymentMethod: PaymentMethod;
  periodStart: LocalDate | null;
  periodEnd: LocalDate | null;
  dueDate: LocalDate;
  taxMode: TaxMode | null;
  lines: ProposedLine[];
  visits: ProposedVisit[];
  totals: InvoiceTotals | null;
  /** Why it cannot be issued as it stands. Empty: it can. */
  blockers: InvoiceBlocker[];
}

export interface InvoiceInput {
  fileId: string;
  dueIds: readonly string[];
  /** «طريقة السداد»: one, chosen at issue. Left out, the first the file's form ticks. */
  paymentMethod?: PaymentMethod | null;
}

/** What `issueInvoice` writes besides what the proposal shows. */
interface Prepared extends InvoiceProposal {
  file: FileBilling | null;
  dues: DueToInvoice[];
  seller: SellerSnapshot | null;
  buyer: BuyerSnapshot | null;
  clientId: string | null;
  vatRate: number;
  pricesIncludeVat: boolean;
  ifuMention: { ar: string; fr: string } | null;
}

function statementRow(visit: BillingVisit, division: Division, billed: boolean, requireSignOff: boolean) {
  const remarks: string[] = [];
  if (visit.decision) remarks.push(visit.decision.reason);
  else if (visit.clientAtFault && visit.status !== "DONE") remarks.push(CLIENT_AT_FAULT_REMARK);
  if (visit.origin === "MAKEUP") remarks.push(MAKEUP_REMARK);
  if (awaitsSignOff(visit, requireSignOff)) remarks.push(NOT_SIGNED_OFF_REMARK);
  return {
    visitId: visit.id,
    visitDate: visit.visitDate,
    dayName: WEEKDAY_AR[weekdayOf(visit.visitDate)],
    arrival: visit.arrival,
    departure: visit.departure,
    workersCount: visit.workersCount,
    workedMin: visit.workedMin,
    // A visit that did not take place has no completion to show: its status says what happened.
    completion:
      (visit.completion && COMPLETION_LABEL[visit.completion]) ?? VISIT_STATUS_LABEL[visit.status] ?? visit.status,
    signOff: signOffLabel(division, visit.signoffStatus) ?? (visit.signoffAbsentReason ? NOBODY_TO_SIGN_LABEL : null),
    signedBy: visit.signoffName,
    billable: billed,
    remark: remarks.filter((text) => text.trim() !== "").join("، ") || null,
  };
}

async function prepare(ex: Executor, ctx: ServiceContext, input: InvoiceInput): Promise<Prepared> {
  const blockers: InvoiceBlocker[] = [];
  const block = (blocker: InvoiceBlocker) => {
    if (!blockers.includes(blocker)) blockers.push(blocker);
  };
  const file = await readFileBilling(ex, ctx, input.fileId);
  const empty: Prepared = {
    fileId: input.fileId,
    fileNumber: file?.number ?? "",
    clientName: "",
    division: file?.division ?? null,
    serviceType: file?.serviceType ?? null,
    fileMethods: file?.paymentMethods ?? [],
    paymentMethod: input.paymentMethod ?? file?.paymentMethods[0] ?? "CASH",
    periodStart: null,
    periodEnd: null,
    dueDate: ctx.today,
    taxMode: null,
    lines: [],
    visits: [],
    totals: null,
    blockers,
    file,
    dues: [],
    seller: null,
    buyer: null,
    clientId: file?.clientId ?? null,
    vatRate: 0,
    pricesIncludeVat: true,
    ifuMention: null,
  };
  if (!file) {
    block("NO_SUCH_FILE");
    return empty;
  }
  if (!(PAYMENT_METHODS as readonly string[]).includes(empty.paymentMethod)) {
    throw new Error(`money: unknown payment method ${empty.paymentMethod}`);
  }

  const party = await readFileParty(ex, ctx, file);
  const seller = await readSeller(ex);
  const tax = await readTaxSettings(ex);
  const settings = await readInvoiceSettings(ex);
  if (tax.mode === null) block("NO_TAX_MODE");
  // Decree 05-468 and DESIGN.md section 11: the seller's identifiers, article number and address (INV-3).
  if (!seller.rc || !seller.nis || !seller.nif || !seller.articleNumber || !seller.address) block("SELLER_INCOMPLETE");
  // What the client lacks, as Clients' card says it (`getClientForInvoice().missing`).
  const BLOCKER_OF: Record<FileParty["missing"][number], InvoiceBlocker> = {
    ADDRESS: "BUYER_NO_ADDRESS",
    tradeRegisterAnswer: "BUYER_TRADE_REGISTER_UNANSWERED",
    rcNumber: "BUYER_NO_TRADE_REGISTER",
    nif: "BUYER_NO_NIF",
    nis: "BUYER_NO_NIS",
  };
  for (const code of party.missing) block(BLOCKER_OF[code]);

  const wanted = [...new Set(input.dueIds)];
  if (wanted.length === 0) block("NO_DUE_CHOSEN");
  const rows = wanted.length
    ? await ex
        .selectFrom("PaymentDue")
        .select([
          "id",
          "fileId",
          "seq",
          "kind",
          "periodStart",
          "periodEnd",
          "visitId",
          "dueDate",
          "expectedAmount",
          "invoiceId",
          "cancelledAt",
        ])
        .where("id", "in", wanted)
        .orderBy("periodStart")
        .orderBy("seq")
        .execute()
    : [];
  const dues: DueToInvoice[] = [];
  for (const row of rows) {
    const invoiced = (INVOICED_KINDS as readonly string[]).includes(row.kind);
    if (row.fileId !== file.id || row.invoiceId !== null || row.cancelledAt !== null || !invoiced) block("DUE_GONE");
    else dues.push(row as unknown as DueToInvoice);
  }
  if (rows.length !== wanted.length) block("DUE_GONE");

  const visits = await readBillingVisits(ex, { fileId: file.id });
  const lines: Omit<ProposedLine, "seq">[] = [];
  const stated = new Map<string, BillingVisit>();
  for (const due of dues) {
    const readiness = readinessOf(due, visits, ctx.today, settings.requireSignOff);
    if (readiness !== "READY") block(readiness);
    const own = visitsOfDue(due, visits);
    for (const visit of own) stated.set(visit.id, visit);

    if (due.kind === "VISIT") {
      const visit = own[0];
      lines.push({
        kind: "VISIT",
        description: `زيارة يوم ${formatDate(visit?.visitDate ?? due.periodStart ?? ctx.today)}`,
        quantity: 1000,
        unitLabel: VISIT_UNIT_LABEL,
        unitPrice: due.expectedAmount,
        amount: due.expectedAmount,
        dueId: due.id,
        visitId: due.visitId,
      });
      continue;
    }
    if (due.kind === "EXTRA") {
      const visit = own[0];
      lines.push({
        kind: "EXTRA",
        description: `زيارة إضافية يوم ${formatDate(visit?.visitDate ?? due.periodStart ?? ctx.today)}`,
        quantity: 1000,
        unitLabel: VISIT_UNIT_LABEL,
        unitPrice: due.expectedAmount,
        amount: due.expectedAmount,
        dueId: due.id,
        visitId: due.visitId,
      });
      continue;
    }
    if (due.kind === "INITIAL_JOB") {
      // His quote's word for the line kind: «عمل أولي (مرة واحدة)», the day it was done beside it.
      const done = own.find((visit) => cleanDelivered(visit, settings.requireSignOff));
      lines.push({
        kind: "SERVICE",
        description: `عمل أولي (مرة واحدة)${done ? ` يوم ${formatDate(done.visitDate)}` : ""}`,
        quantity: 1000,
        unitLabel: JOB_UNIT_LABEL,
        unitPrice: due.expectedAmount,
        amount: due.expectedAmount,
        dueId: due.id,
        visitId: done?.id ?? null,
      });
      continue;
    }
    if (due.kind === "SINGLE") {
      lines.push({
        kind: "SERVICE",
        description: "خدمة تنظيف عند الطلب",
        quantity: 1000,
        unitLabel: JOB_UNIT_LABEL,
        unitPrice: due.expectedAmount,
        amount: due.expectedAmount,
        dueId: due.id,
        visitId: null,
      });
      continue;
    }

    // A period: its price, less the visits of its programme that were neither done nor made up.
    const programme = own.filter(isProgrammeVisit);
    const delivered = programme.filter(
      (visit) =>
        isBilled(visit, settings.requireSignOff) ||
        visits.some(
          (other) =>
            other.origin === "MAKEUP" && other.sourceVisitId === visit.id && isBilled(other, settings.requireSignOff),
        ),
    );
    const missed = programme.length - delivered.length;
    lines.push({
      kind: "SERVICE",
      description: `خدمة التنظيف من ${formatDate(due.periodStart ?? ctx.today)} إلى ${formatDate(due.periodEnd ?? ctx.today)}`,
      quantity: 1000,
      unitLabel: file.frequency && file.frequency !== "PER_VISIT" ? PERIOD_UNIT_LABEL[file.frequency] : JOB_UNIT_LABEL,
      unitPrice: due.expectedAmount,
      amount: due.expectedAmount,
      dueId: due.id,
      visitId: null,
    });
    if (missed > 0 && programme.length > 0) {
      const deduction = missedVisitDeduction({
        rule: settings.rule,
        periodAmount: due.expectedAmount,
        plannedVisits: programme.length,
        missedVisits: missed,
        fixedAmount: settings.fixedAmount ?? 0,
      });
      if (deduction !== 0) {
        // Every line multiplies out (INV-6): so many visits at a price each when the deduction divides into whole
        // centimes per visit, else one lump sum, the count of the visits in its description.
        const perVisit = deduction / missed;
        const divides = Number.isInteger(perVisit);
        lines.push({
          kind: "MISSED_VISIT",
          description: `زيارات غير منجزة (${missed} من ${programme.length})`,
          quantity: divides ? missed * 1000 : 1000,
          unitLabel: divides ? VISIT_UNIT_LABEL : LUMP_SUM_UNIT_LABEL,
          unitPrice: divides ? perVisit : deduction,
          amount: deduction,
          dueId: due.id,
          visitId: null,
        });
      }
    }
  }

  if (dues.length > 0) lines.push(...(await complaintDiscounts(ex, ctx, file.id, lines)));

  const pricesIncludeVat = file.amountIncludesVat ?? tax.pricesIncludeVat;
  let totals: InvoiceTotals | null = null;
  if (tax.mode !== null && lines.length > 0) {
    totals = computeInvoiceTotals({
      lineAmounts: lines.map((line) => line.amount),
      taxMode: tax.mode,
      vatRate: tax.vatRate,
      pricesIncludeVat,
      paymentMethod: empty.paymentMethod,
      stamp: await readStampSettings(ex),
    });
    if (totals.totalTTC <= 0) block("NOTHING_TO_INVOICE");
  }
  // Under VAT every line shows its price before tax (Decree 05-468). A price typed with the tax in it is
  // brought back line by line from the totals above, which keep the agreed total to the centime.
  const shown =
    totals && tax.mode === "VAT" && pricesIncludeVat ? linesBeforeTax(lines, totals.totalTTC, totals.totalHT) : lines;
  if (totals && shown !== lines) {
    totals = {
      ...totals,
      grossAmount: shown.filter((line) => line.amount > 0).reduce((sum, line) => sum + line.amount, 0),
      discountAmount: -shown.filter((line) => line.amount < 0).reduce((sum, line) => sum + line.amount, 0),
    };
  }

  const periodStarts = dues.flatMap((due) => (due.periodStart ? [due.periodStart] : [])).sort();
  const periodEnds = dues.flatMap((due) => (due.periodEnd ? [due.periodEnd] : [])).sort();
  const earliestDue = dues.map((due) => due.dueDate).sort()[0];
  const statement = [...stated.values()].sort((a, b) =>
    a.visitDate === b.visitDate ? a.id.localeCompare(b.id) : a.visitDate < b.visitDate ? -1 : 1,
  );

  return {
    ...empty,
    clientName: party.clientName,
    periodStart: periodStarts[0] ?? null,
    periodEnd: periodEnds[periodEnds.length - 1] ?? null,
    // «تاريخ التسديد»: the due's own date, never before the invoice itself.
    dueDate: earliestDue && earliestDue > ctx.today ? earliestDue : ctx.today,
    taxMode: tax.mode,
    lines: shown.map((line, index) => ({ seq: index + 1, ...line })),
    visits: statement.map((visit, index) => ({
      seq: index + 1,
      ...statementRow(
        visit,
        file.division,
        // The first deep clean is billed by its own due, when that due is on this invoice.
        visit.origin === "INITIAL"
          ? dues.some((due) => due.kind === "INITIAL_JOB") && cleanDelivered(visit, settings.requireSignOff)
          : isBilled(visit, settings.requireSignOff),
        settings.requireSignOff,
      ),
      origin: visit.origin,
      decision: visit.decision,
    })),
    totals,
    dues,
    seller,
    buyer: party.buyer,
    clientId: party.clientId,
    vatRate: tax.vatRate,
    pricesIncludeVat,
    ifuMention: tax.mode === "IFU" ? tax.ifuMention : null,
  };
}

/**
 * The discounts agreed to settle the file's complaints (INT-3, MON-04), as lines of the next invoice: each
 * complaint Operations settled with «خصم متفق عليه», less what live invoices already took of it, never
 * more than the invoice comes to (what is left goes on the next one). Each line is tied to the due that
 * weighs most, so the totals, the tax and the dues' shares all carry it.
 */
async function complaintDiscounts(
  ex: Executor,
  ctx: ServiceContext,
  fileId: string,
  lines: readonly Omit<ProposedLine, "seq">[],
): Promise<Omit<ProposedLine, "seq">[]> {
  const credits = await listComplaintCredits(ex, ctx, { fileId });
  if (credits.length === 0) return [];
  const taken = await ex
    .selectFrom("InvoiceLine")
    .select(["InvoiceLine.complaintId", "InvoiceLine.amount"])
    .where(
      "InvoiceLine.complaintId",
      "in",
      credits.map((credit) => credit.complaintId),
    )
    .where(({ not, exists, selectFrom }) =>
      not(
        exists(
          selectFrom("LegalEvent")
            .select("LegalEvent.id")
            .whereRef("LegalEvent.invoiceId", "=", "InvoiceLine.invoiceId")
            .where("LegalEvent.type", "=", "VOIDED"),
        ),
      ),
    )
    .execute();
  const weightOf = new Map<string, number>();
  for (const line of lines) {
    if (line.dueId) weightOf.set(line.dueId, (weightOf.get(line.dueId) ?? 0) + line.amount);
  }
  const heaviest = [...weightOf.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  let room = lines.reduce((sum, line) => sum + line.amount, 0);
  const discounts: Omit<ProposedLine, "seq">[] = [];
  for (const credit of credits) {
    const used = -taken.filter((line) => line.complaintId === credit.complaintId).reduce((sum, l) => sum + l.amount, 0);
    const amount = Math.min(credit.amount - used, room);
    if (amount <= 0) continue;
    discounts.push({
      kind: "DISCOUNT",
      description: `خصم متفق عليه (الشكوى رقم ${credit.number})`,
      quantity: 1000,
      unitLabel: LUMP_SUM_UNIT_LABEL,
      unitPrice: -amount,
      amount: -amount,
      dueId: heaviest,
      visitId: null,
      complaintId: credit.complaintId,
    });
    room -= amount;
  }
  return discounts;
}

/** What an invoice of these dues would say, and why it cannot be issued yet when it cannot. Writes nothing. */
export async function prepareInvoice(ex: Executor, ctx: ServiceContext, input: InvoiceInput): Promise<InvoiceProposal> {
  requireSection(ctx, "MONEY", "READ");
  const prepared = await prepare(ex, ctx, input);
  return {
    fileId: prepared.fileId,
    fileNumber: prepared.fileNumber,
    clientName: prepared.clientName,
    division: prepared.division,
    serviceType: prepared.serviceType,
    fileMethods: prepared.fileMethods,
    paymentMethod: prepared.paymentMethod,
    periodStart: prepared.periodStart,
    periodEnd: prepared.periodEnd,
    dueDate: prepared.dueDate,
    taxMode: prepared.taxMode,
    lines: prepared.lines,
    visits: prepared.visits,
    totals: prepared.totals,
    blockers: prepared.blockers,
  };
}

/**
 * The lines before tax of a price typed with its tax in it (`shareBeforeTax`). Each still multiplies
 * out (INV-6): so many units at a price each when its amount divides by its quantity in whole
 * centimes, else one lump sum.
 */
function linesBeforeTax<Line extends { quantity: number; unitPrice: number; amount: number; unitLabel: string }>(
  lines: readonly Line[],
  totalWithTax: number,
  totalBeforeTax: number,
): Line[] {
  const amounts = shareBeforeTax(
    lines.map((line) => money(line.amount)),
    money(totalWithTax),
    money(totalBeforeTax),
  );
  return lines.map((line, index) => {
    const amount = amounts[index];
    const each = (amount * 1000) / line.quantity;
    return Number.isInteger(each)
      ? { ...line, amount, unitPrice: each }
      : { ...line, amount, quantity: 1000, unitPrice: amount, unitLabel: LUMP_SUM_UNIT_LABEL };
  });
}

// ── Issuing ──────────────────────────────────────────────────────────────────

export interface IssueInvoiceInput extends InvoiceInput {
  note?: string | null;
  /** The manager looked at a clock that jumped forward and confirmed it (`assertClockSane`). */
  confirmedClockJump?: boolean;
}

export interface IssuedInvoice {
  id: string;
  number: string;
}

export async function issueInvoice(
  ex: Executor,
  ctx: ServiceContext,
  input: IssueInvoiceInput,
): Promise<IssuedInvoice> {
  requireSection(ctx, "MONEY", "WRITE");
  requireCapability(ctx, "invoice.issue");
  await requireBooks(ex, ctx);
  if (ctx.userId === null) throw new Error("money: an invoice is issued by somebody");
  await assertClockSane(ex, ctx, { confirmedJump: input.confirmedClockJump });

  const prepared = await prepare(ex, ctx, input);
  if (prepared.blockers.length > 0) throw new ServiceError(INVOICE_REFUSALS[prepared.blockers[0]]);
  const { file, totals, seller, buyer, clientId } = prepared;
  if (!file || !totals || !seller || !buyer || !clientId || !prepared.taxMode) {
    throw new Error("money: an invoice with no blocker is missing a part");
  }

  const issueDate = ctx.today;
  const next = await peekLegalNumber(ex, ctx, "INVOICE", { date: issueDate });
  const invoiceId = newId();
  const lines = prepared.lines.map((line) => ({
    id: newId(),
    invoiceId,
    seq: line.seq,
    kind: line.kind,
    description: line.description,
    quantity: line.quantity,
    unitLabel: line.unitLabel,
    unitPrice: line.unitPrice,
    amount: line.amount,
    dueId: line.dueId,
    visitId: line.visitId,
    complaintId: line.complaintId ?? null,
    createdAt: ctx.now,
  }));
  const visits = prepared.visits.map((row) => ({
    id: newId(),
    invoiceId,
    seq: row.seq,
    visitId: row.visitId,
    visitDate: row.visitDate,
    dayName: row.dayName,
    arrival: row.arrival,
    departure: row.departure,
    workersCount: row.workersCount,
    workedMin: row.workedMin,
    completion: row.completion,
    signOff: row.signOff,
    signedBy: row.signedBy,
    billable: row.billable ? 1 : 0,
    remark: row.remark,
    createdAt: ctx.now,
  }));
  // Before anything is written: the invoice commits to exactly these rows.
  const contentDigest = await invoiceContentDigest({ lines, visits });

  await appendChained(ex, ctx, "Invoice", {
    id: invoiceId,
    numberSeq: next.seq,
    numberYear: next.year,
    number: next.display,
    fileId: file.id,
    clientId,
    division: file.division,
    serviceType: file.serviceType,
    branchId: file.branchId,
    issueDate,
    issuedAt: ctx.now,
    issuedByUserId: ctx.userId,
    periodStart: prepared.periodStart,
    periodEnd: prepared.periodEnd,
    taxMode: prepared.taxMode,
    vatRate: totals.vatRate,
    // Whether the invoice's lines carry the tax: under VAT they never do any more (Decree 05-468, the coordinator's
    // ruling); a price agreed with the tax in it is the file's (`File.amountIncludesVat`) and the total with tax.
    pricesIncludeVat: prepared.pricesIncludeVat && prepared.taxMode !== "VAT" ? 1 : 0,
    grossAmount: totals.grossAmount,
    discountAmount: totals.discountAmount,
    totalHT: totals.totalHT,
    vatAmount: totals.vatAmount,
    totalTTC: totals.totalTTC,
    paymentMethod: prepared.paymentMethod,
    stampDuty: totals.stampDuty,
    netToPay: totals.netToPay,
    amountWordsAr: amountInWordsAr(totals.netToPay),
    amountWordsFr: amountInWordsFr(totals.netToPay),
    dueDate: prepared.dueDate,
    paymentPlace: file.paymentPlace,
    sellerSnapshot: JSON.stringify(seller),
    buyerSnapshot: JSON.stringify(buyer),
    ifuMention: prepared.ifuMention ? JSON.stringify(prepared.ifuMention) : null,
    note: input.note?.trim() || null,
    replacesInvoiceId: null,
    contentDigest,
    createdAt: ctx.now,
    createdByUserId: ctx.userId,
  });
  for (const line of lines) await appendChained(ex, ctx, "InvoiceLine", line);
  for (const row of visits) await appendChained(ex, ctx, "InvoiceVisit", row);

  // Each due takes its share of the total with tax, by its lines; the last takes the remainder.
  const weights = prepared.dues.map((due) =>
    Math.max(
      0,
      lines.filter((line) => line.dueId === due.id).reduce((sum, line) => sum + line.amount, 0),
    ),
  );
  const shares = shareByWeights(totals.totalTTC, weights);
  for (const [index, due] of prepared.dues.entries()) {
    await ex
      .updateTable("PaymentDue")
      .set({ invoiceId, amount: money(shares[index]), updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", due.id)
      .execute();
  }
  // A due now below what was paid on it gives the excess to the file's next dues, else to its credit (INV-2).
  await rebalanceFile(ex, ctx, { fileId: file.id });

  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "ISSUE",
    entity: "Invoice",
    entityId: invoiceId,
    entityLabel: next.display,
    subject: { kind: "CLIENT", id: clientId, label: prepared.clientName },
    context: { file: file.number, totalTTC: totals.totalTTC, method: prepared.paymentMethod },
  });
  await emit(ex, ctx, "invoice.issued", { invoiceId });
  return { id: invoiceId, number: next.display };
}

// ── Voiding ──────────────────────────────────────────────────────────────────

async function voidEventOf(ex: Executor, invoiceId: string) {
  return ex
    .selectFrom("LegalEvent")
    .select(["id", "reason", "createdAt"])
    .where("invoiceId", "=", invoiceId)
    .where("type", "=", "VOIDED")
    .executeTakeFirst();
}

/**
 * Voids an invoice: the reason typed is written as a `VOIDED` event, and the
 * dues it billed go back to "not invoiced" at the amount the terms expect.
 * The invoice, its lines and its number stay; its sheet prints «ملغاة».
 * What was already paid on those dues stays paid: a payment is voided on its own.
 */
export async function voidInvoice(
  ex: Executor,
  ctx: ServiceContext,
  input: { invoiceId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "MONEY", "WRITE");
  requireCapability(ctx, "invoice.void");
  await requireBooks(ex, ctx);
  if (ctx.userId === null) throw new Error("money: an invoice is voided by somebody");
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("A reason is required.");
  const invoice = await ex
    .selectFrom("Invoice")
    .select(["id", "number", "clientId", "fileId"])
    .where("id", "=", input.invoiceId)
    .executeTakeFirst();
  if (!invoice) throw new ServiceError("This invoice does not exist.");
  if (await voidEventOf(ex, invoice.id)) throw new ServiceError("This invoice is already voided.");

  await appendChained(ex, ctx, "LegalEvent", {
    id: newId(),
    invoiceId: invoice.id,
    paymentId: null,
    receiptId: null,
    type: "VOIDED",
    reason,
    createdAt: ctx.now,
    createdByUserId: ctx.userId,
  });
  const dues = await ex
    .selectFrom("PaymentDue")
    .select(["id", "expectedAmount"])
    .where("invoiceId", "=", invoice.id)
    .execute();
  for (const due of dues) {
    await ex
      .updateTable("PaymentDue")
      .set({ invoiceId: null, amount: due.expectedAmount, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", due.id)
      .execute();
  }
  // Back to its amount before the invoice, a due may now hold less than was paid on it (INV-2).
  await rebalanceFile(ex, ctx, { fileId: invoice.fileId });
  await logChange(ex, ctx, {
    owner: "MONEY",
    action: "VOID",
    reason,
    entity: "Invoice",
    entityId: invoice.id,
    entityLabel: invoice.number,
    subject: { kind: "CLIENT", id: invoice.clientId },
  });
  await emit(ex, ctx, "invoice.voided", { invoiceId: invoice.id });
  return { id: invoice.id };
}

// ── Reading ──────────────────────────────────────────────────────────────────

export interface InvoiceListRow {
  id: string;
  number: string;
  issueDate: LocalDate;
  fileId: string;
  fileNumber: string;
  clientName: string;
  division: Division;
  serviceType: ServiceType;
  totalTTC: number;
  netToPay: number;
  paymentMethod: PaymentMethod;
  dueDate: LocalDate;
  voided: boolean;
  /** What its dues have received so far. Stamp duty is never in it. */
  paid: number;
  remaining: number;
  /** Null for a voided invoice: it is owed nothing. */
  paymentState: PaymentState | null;
}

export interface InvoiceListFilter {
  from?: LocalDate | null;
  to?: LocalDate | null;
  fileId?: string | null;
}

/** The invoices issued, the latest first. `from` and `to` are issue dates, both included. */
export async function listInvoices(
  ex: Executor,
  ctx: ServiceContext,
  input: InvoiceListFilter = {},
): Promise<InvoiceListRow[]> {
  requireSection(ctx, "MONEY", "READ");
  return readInvoiceList(ex, input);
}

/** The list without the section check, for a reader that checked its own way (a file's part «التسديد»). */
export async function readInvoiceList(ex: Executor, input: InvoiceListFilter): Promise<InvoiceListRow[]> {
  let rows = ex
    .selectFrom("Invoice")
    .innerJoin("File", "File.id", "Invoice.fileId")
    .select([
      "Invoice.id",
      "Invoice.number",
      "Invoice.issueDate",
      "Invoice.fileId",
      "File.number as fileNumber",
      "Invoice.buyerSnapshot",
      "Invoice.division",
      "Invoice.serviceType",
      "Invoice.totalTTC",
      "Invoice.netToPay",
      "Invoice.paymentMethod",
      "Invoice.dueDate",
    ])
    .orderBy("Invoice.chainSeq", "desc");
  if (input.from) rows = rows.where("Invoice.issueDate", ">=", input.from);
  if (input.to) rows = rows.where("Invoice.issueDate", "<=", input.to);
  if (input.fileId) rows = rows.where("Invoice.fileId", "=", input.fileId);
  const invoices = await rows.execute();
  if (invoices.length === 0) return [];

  const ids = invoices.map((invoice) => invoice.id);
  const voids = new Set(
    (
      await ex
        .selectFrom("LegalEvent")
        .select("invoiceId")
        .where("type", "=", "VOIDED")
        .where("invoiceId", "in", ids)
        .execute()
    ).map((event) => event.invoiceId),
  );
  const dues = await ex
    .selectFrom("PaymentDue")
    .select(["invoiceId", "amount", "paidAmount"])
    .where("invoiceId", "in", ids)
    .execute();

  return invoices.map((invoice) => {
    const voided = voids.has(invoice.id);
    const paid = dues
      .filter((due) => due.invoiceId === invoice.id)
      .reduce((sum, due) => sum + Math.min(due.paidAmount, due.amount), 0);
    return {
      id: invoice.id,
      number: invoice.number,
      issueDate: invoice.issueDate as LocalDate,
      fileId: invoice.fileId,
      fileNumber: invoice.fileNumber,
      clientName: (JSON.parse(invoice.buyerSnapshot) as BuyerSnapshot).name,
      division: invoice.division as Division,
      serviceType: invoice.serviceType as ServiceType,
      totalTTC: invoice.totalTTC,
      netToPay: invoice.netToPay,
      paymentMethod: invoice.paymentMethod as PaymentMethod,
      dueDate: invoice.dueDate as LocalDate,
      voided,
      paid: voided ? 0 : paid,
      remaining: voided ? 0 : Math.max(0, invoice.totalTTC - paid),
      paymentState: voided ? null : paymentState(invoice.totalTTC, paid),
    };
  });
}

const oneOf = <T extends string>(list: readonly T[], value: string, what: string): T => {
  if (!(list as readonly string[]).includes(value)) throw new Error(`money: unknown ${what} ${value}`);
  return value as T;
};

export interface InvoiceSheet {
  id: string;
  fileId: string;
  invoice: InvoiceSheetData;
  /** The statement of the visits it bills; none when it bills no visit. */
  statement: VisitStatementData | null;
}

/** An invoice as it was issued, for its sheet: every word and figure from the stored rows. */
export async function getInvoiceSheet(
  ex: Executor,
  ctx: ServiceContext,
  input: { invoiceId: string },
): Promise<InvoiceSheet> {
  requireSection(ctx, "MONEY", "READ");
  const invoice = await ex.selectFrom("Invoice").selectAll().where("id", "=", input.invoiceId).executeTakeFirst();
  if (!invoice) throw new ServiceError("This invoice does not exist.");
  const file = await ex
    .selectFrom("File")
    .innerJoin("Site", "Site.id", "File.siteId")
    .leftJoin("Commune", "Commune.id", "Site.communeId")
    .select(["File.number", "Site.address", "Commune.nameAr as commune"])
    .where("File.id", "=", invoice.fileId)
    .executeTakeFirstOrThrow();
  const lines = await ex
    .selectFrom("InvoiceLine")
    .selectAll()
    .where("invoiceId", "=", invoice.id)
    .orderBy("seq")
    .execute();
  const visits = await ex
    .selectFrom("InvoiceVisit")
    .selectAll()
    .where("invoiceId", "=", invoice.id)
    .orderBy("seq")
    .execute();
  const voidEvent = await voidEventOf(ex, invoice.id);
  const voided = voidEvent ? { date: ctx.toLocal(voidEvent.createdAt).date, reason: voidEvent.reason ?? "" } : null;
  // Everything the sheet says comes from what was frozen at issue (INV-7, INV-X1); an invoice issued
  // before the city, the site's address and the file number were frozen falls back to the rows as they are.
  const seller = JSON.parse(invoice.sellerSnapshot) as SellerSnapshot;
  const buyer = JSON.parse(invoice.buyerSnapshot) as BuyerSnapshot;
  const place = seller.city ?? (await getSetting(ex, "centre.city"));
  const fileNumber = buyer.fileNumber ?? file.number;
  const siteAddress = buyer.siteAddress ?? [file.address, file.commune].filter(Boolean).join("، ");
  const division = oneOf(DIVISIONS, invoice.division, "division");
  const serviceType = oneOf(SERVICE_TYPES, invoice.serviceType, "service type");

  const data: InvoiceSheetData = {
    number: invoice.number,
    issueDate: invoice.issueDate,
    place,
    fileNumber,
    division,
    serviceType,
    periodStart: invoice.periodStart,
    periodEnd: invoice.periodEnd,
    seller,
    buyer,
    lines: lines.map((line) => ({
      seq: line.seq,
      kind: oneOf(INVOICE_LINE_KINDS, line.kind, "line kind"),
      description: line.description,
      quantity: line.quantity,
      unitLabel: line.unitLabel,
      unitPrice: line.unitPrice,
      amount: line.amount,
    })),
    taxMode: oneOf(["VAT", "IFU"] as const, invoice.taxMode, "tax mode"),
    vatRate: invoice.vatRate,
    pricesIncludeVat: invoice.pricesIncludeVat === 1,
    grossAmount: invoice.grossAmount,
    discountAmount: invoice.discountAmount,
    totalHT: invoice.totalHT,
    vatAmount: invoice.vatAmount,
    totalTTC: invoice.totalTTC,
    paymentMethod: oneOf(PAYMENT_METHODS, invoice.paymentMethod, "payment method"),
    stampDuty: invoice.stampDuty,
    netToPay: invoice.netToPay,
    amountWordsAr: invoice.amountWordsAr,
    amountWordsFr: invoice.amountWordsFr,
    dueDate: invoice.dueDate,
    paymentPlace: invoice.paymentPlace,
    ifuMention: invoice.ifuMention ? (JSON.parse(invoice.ifuMention) as { ar: string; fr: string }) : null,
    note: invoice.note,
    voided,
    // Two laptops: the laptop without the books prints a copy, never a second original (DECISION section 5).
    copy: !(await holdsBooks(ex, ctx)),
  };
  const statement: VisitStatementData | null =
    visits.length === 0
      ? null
      : {
          invoiceNumber: invoice.number,
          issueDate: invoice.issueDate,
          fileNumber,
          clientName: buyer.name,
          siteAddress,
          division,
          serviceType,
          periodStart: invoice.periodStart,
          periodEnd: invoice.periodEnd,
          place,
          rows: visits.map((row) => ({
            seq: row.seq,
            visitDate: row.visitDate,
            dayName: row.dayName,
            arrival: row.arrival,
            departure: row.departure,
            workersCount: row.workersCount,
            workedMin: row.workedMin,
            completion: row.completion,
            signOff: row.signOff,
            signedBy: row.signedBy,
            billable: row.billable === 1,
            remark: row.remark,
          })),
          voided,
          copy: data.copy,
        };
  return { id: invoice.id, fileId: invoice.fileId, invoice: data, statement };
}

/**
 * The invoice went to paper: a `PRINTED` event on its chain, and the
 * disclosure the law asks for (a sheet naming a person was printed).
 *
 * Two laptops (coordinator's ruling): on the laptop without the books it
 * prints as a copy («نسخة»), with no event on the legal chain, the print
 * still in this laptop's own log. `asCopy` is what the sheet on screen says;
 * an original asked for where the books are not is refused, so the paper
 * always says what the record says.
 */
export async function recordInvoicePrinted(
  ex: Executor,
  ctx: ServiceContext,
  input: { invoiceId: string; asCopy?: boolean },
): Promise<{ id: string; copy: boolean }> {
  requireSection(ctx, "MONEY", "READ");
  if (ctx.userId === null) throw new Error("money: a sheet is printed by somebody");
  const invoice = await ex
    .selectFrom("Invoice")
    .select(["id", "number", "clientId"])
    .where("id", "=", input.invoiceId)
    .executeTakeFirst();
  if (!invoice) throw new ServiceError("This invoice does not exist.");
  const copy = input.asCopy ?? !(await holdsBooks(ex, ctx));
  if (!copy) {
    await appendChained(ex, ctx, "LegalEvent", {
      id: newId(),
      invoiceId: invoice.id,
      paymentId: null,
      receiptId: null,
      type: "PRINTED",
      reason: null,
      createdAt: ctx.now,
      createdByUserId: ctx.userId,
    });
  }
  await logDisclose(ex, ctx, {
    owner: "MONEY",
    action: "PRINT",
    entity: "Invoice",
    entityId: invoice.id,
    entityLabel: invoice.number,
    subject: { kind: "CLIENT", id: invoice.clientId },
    disclosure: "PRINT",
    context: copy ? { copy: true } : undefined,
  });
  return { id: invoice.id, copy };
}

// ── What the screens call ────────────────────────────────────────────────────

export const listInvoiceCandidatesQuery = query((ex: Executor, ctx: ServiceContext) => listInvoiceCandidates(ex, ctx));
export const prepareInvoiceQuery = query(prepareInvoice);
export const listInvoicesQuery = query(listInvoices);
export const getInvoiceSheetQuery = query(getInvoiceSheet);
export const issueInvoiceAction = action(issueInvoice, { revalidate: [...MONEY_PATHS] });
export const voidInvoiceAction = action(voidInvoice, { revalidate: [...MONEY_PATHS] });
export const recordInvoicePrintedAction = action(recordInvoicePrinted);
