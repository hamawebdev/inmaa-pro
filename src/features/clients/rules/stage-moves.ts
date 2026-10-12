import { FORM_DEFINITIONS } from "../forms/definitions";
import type { FieldKey, FormValues } from "../forms/values";
import { FILE_STAGES, FORM_KIND_OF, type EndKind, type FileStage, type FormKind } from "../validators/option-lists";

/**
 * The stages of a file and what each move requires (scope A5, the end-to-end
 * run of scope section 4, CONTRACTS.md section 4):
 *
 *     جديد → الزيارة → عرض سعر → متعاقد → انتهاء التعاقد
 *
 *  - «الزيارة»: a first visit is planned or its date is typed. A job priced by
 *    phone skips this stage.
 *  - «عرض سعر»: a quote has been issued, or «المبلغ إجمالي» is typed.
 *  - «متعاقد»: the sheet says everything the visits and the payments are built
 *    from (`missingToContract`). A contract needs nothing more; an on-demand
 *    file also needs its quote accepted, which is what confirms the job.
 *  - «انتهاء التعاقد»: «تاريخ النهاية» has passed, or the office ends the file
 *    with a reason (ended early, renewed, the last visit of an on-demand job
 *    is done).
 *
 * Going back is a correction and needs the manager, up to «عرض سعر». A signed
 * file does not go back: its visits and dues already exist, and nothing tells
 * Operations and Money to take them back (a question for the coordinator). A
 * closed file (a refused quote, a finished job) does not move.
 */

/** What his sheet must say before a file becomes «متعاقد»; a form answers for the ones it prints. */
const NEEDED_TO_CONTRACT: readonly FieldKey[] = [
  "contractKind",
  "contractDuration",
  "visitsPerWeek",
  "executionDays",
  "startDate",
  "endDate",
  "arrivalTime",
  "departureTime",
  "workersCount",
  "paymentMethods",
  "totalAmount",
  "firstDueDate",
  "paymentFrequency",
  "issuedDate",
];

/** An answer missing before «متعاقد»: one of his blanks, or what «المبلغ إجمالي» is the price of (office-only, A7). */
export type MissingField = FieldKey | "amountBasis";

/** The office-only answers a contract needs. */
export interface ContractOffice {
  amountBasis?: string | null;
}

function isAnswered(value: unknown): boolean {
  if (value === undefined || value === null || value === "") return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "number") return value > 0;
  return true;
}

/** The answers still missing before the file can become «متعاقد», in the order of his sheet, then the office's. */
export function missingToContract(kind: FormKind, values: FormValues, office: ContractOffice = {}): MissingField[] {
  const missing: MissingField[] = FORM_DEFINITIONS[kind].rows
    .map((row) => row.key)
    .filter((key): key is FieldKey => key !== null && NEEDED_TO_CONTRACT.includes(key) && !isAnswered(values[key]));
  if (FORM_KIND_OF[kind].serviceType === "CONTRACT" && !isAnswered(office.amountBasis)) missing.push("amountBasis");
  return missing;
}

/** «تاريخ النهاية» has passed: the day after it, the file is at «انتهاء التعاقد». */
export function hasExpired(endDate: string | null | undefined, today: string): boolean {
  return endDate !== undefined && endDate !== null && endDate !== "" && today > endDate;
}

export interface StageFacts {
  kind: FormKind;
  stage: FileStage;
  /** Closed with a reason (a refused quote, a finished job, …). */
  closed: boolean;
  values: FormValues;
  office?: ContractOffice;
  /** A first visit is planned, whether or not it has taken place. */
  firstVisitPlanned: boolean;
  quoteIssued: boolean;
  quoteAccepted: boolean;
  /** The reason the office gives for ending the file, or null. */
  endKind: EndKind | null;
  /** "YYYY-MM-DD", in the centre's time zone. */
  today: string;
  /** The user asking may move a file back (the manager, or capability `file.stageBack`). */
  byManager: boolean;
}

export type StageRefusal =
  | "CLOSED"
  | "SAME_STAGE"
  | "NOT_THE_NEXT_STAGE"
  | "NEEDS_MANAGER"
  | "SIGNED"
  | "NO_FIRST_VISIT"
  | "NO_QUOTE"
  | "QUOTE_NOT_ACCEPTED"
  | "MISSING_ANSWERS"
  | "NO_END_REASON";

export type StageMove = { allowed: true } | { allowed: false; refusal: StageRefusal; missing: MissingField[] };

const refuse = (refusal: StageRefusal, missing: MissingField[] = []): StageMove => ({
  allowed: false,
  refusal,
  missing,
});

/** The stages a file may go forward to from each stage. Only «الزيارة» can be skipped. */
const FORWARD: Record<FileStage, readonly FileStage[]> = {
  NEW: ["VISIT", "QUOTE"],
  VISIT: ["QUOTE"],
  QUOTE: ["CONTRACTED"],
  CONTRACTED: ["CONTRACT_ENDED"],
  CONTRACT_ENDED: [],
};

/** The stages of a signed contract. */
const SIGNED_STAGES: readonly FileStage[] = ["CONTRACTED", "CONTRACT_ENDED"];

/** Whether `to` is before the file's stage: a correction. */
export function isBackward(from: FileStage, to: FileStage): boolean {
  return FILE_STAGES.indexOf(to) < FILE_STAGES.indexOf(from);
}

/** Whether the file may move to the stage `to`, and if not, why. */
export function stageMove(facts: StageFacts, to: FileStage): StageMove {
  if (facts.closed) return refuse("CLOSED");
  if (to === facts.stage) return refuse("SAME_STAGE");
  if (isBackward(facts.stage, to)) {
    if (SIGNED_STAGES.includes(facts.stage)) return refuse("SIGNED");
    return facts.byManager ? { allowed: true } : refuse("NEEDS_MANAGER");
  }
  if (!FORWARD[facts.stage].includes(to)) return refuse("NOT_THE_NEXT_STAGE");

  switch (to) {
    case "VISIT":
      return facts.firstVisitPlanned || isAnswered(facts.values.firstVisitDate)
        ? { allowed: true }
        : refuse("NO_FIRST_VISIT");
    case "QUOTE":
      return facts.quoteIssued || isAnswered(facts.values.totalAmount) ? { allowed: true } : refuse("NO_QUOTE");
    case "CONTRACTED": {
      if (FORM_KIND_OF[facts.kind].serviceType === "ON_DEMAND" && !facts.quoteAccepted) {
        return refuse("QUOTE_NOT_ACCEPTED");
      }
      const missing = missingToContract(facts.kind, facts.values, facts.office);
      return missing.length === 0 ? { allowed: true } : refuse("MISSING_ANSWERS", missing);
    }
    default:
      return facts.endKind !== null || hasExpired(facts.values.endDate, facts.today)
        ? { allowed: true }
        : refuse("NO_END_REASON");
  }
}

/** The stages the file may move to now, forward ones first. */
export function openMoves(facts: StageFacts): FileStage[] {
  const forward = FORWARD[facts.stage].filter((to) => stageMove(facts, to).allowed);
  const back = FILE_STAGES.filter((to) => isBackward(facts.stage, to) && stageMove(facts, to).allowed);
  return [...forward, ...back];
}

/** The next stage forward the office would take, whether or not it is open yet: what the hub offers first. */
export function nextStages(stage: FileStage): readonly FileStage[] {
  return FORWARD[stage];
}
