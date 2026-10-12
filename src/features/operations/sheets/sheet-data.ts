import type { ClockTime, IsoDate } from "../rules/calendar";
import type {
  Bearer,
  CallPurpose,
  CallResult,
  Completion,
  CorrectiveAction,
  Division,
  ForbiddenPlace,
  Ppe,
  ProblemKind,
  QualityLevel,
  Sex,
  SignoffStatus,
  SiteInstruction,
  TaskFrequency,
  TeamAccess,
  WorkerRole,
} from "../validators/option-codes";

import type { HandoutCondition, RatingKey } from "./print-labels";

/**
 * What each of Operations' printed sheets is a picture of.
 *
 * Plain objects: a service will build them from the database, and until then
 * ./samples.ts builds them by hand. Every value a person may not have typed yet
 * is nullable, and a sheet prints a dotted blank in its place. So the same
 * component prints a filled sheet and an empty one to write on.
 *
 * Dates are "YYYY-MM-DD", clock times "HH:MM".
 */

// ── The mission order ───────────────────────────────────────────────────────

export interface OrderWorker {
  name: string | null;
  /** Her registration number. */
  number: string | null;
  role: WorkerRole | null;
  sex: Sex | null;
  /** The times written on the returned order, when the order is reprinted with them. */
  arrived?: ClockTime | null;
  workStart?: ClockTime | null;
  workEnd?: ClockTime | null;
  left?: ClockTime | null;
  lateReason?: string | null;
}

export interface OrderTask {
  label: string;
  frequency: TaskFrequency;
  /** Carried over from a visit that left it undone. */
  carried?: boolean;
  /** Ticked on the returned order. */
  done?: boolean | null;
}

export interface OrderTaskGroup {
  /** The room, the space or the entrance; null for tasks of the whole site. */
  place: string | null;
  tasks: readonly OrderTask[];
}

export interface OrderArea {
  label: string;
  /** «المطلوب اليوم». */
  requiredToday: string | null;
  done?: boolean | null;
}

export interface OrderHandout {
  item: string;
  quantity: string | null;
  condition: HandoutCondition | null;
}

/** What came back on the order, for a reprint of a finished visit. Left out, the on-site part prints blank. */
export interface OrderReturn {
  /** The eight checks before leaving, in his order. */
  departureChecks: readonly boolean[];
  problemOnSite: boolean | null;
  problemKinds: readonly ProblemKind[];
  problemDetails: string | null;
  completion: Completion | null;
  completionPercent: number | null;
  incompleteReason: string | null;
  needsExtraVisit: boolean | null;
  needsSupervisor: boolean | null;
  signoff: {
    status: SignoffStatus | null;
    name: string | null;
    role: string | null;
    date: IsoDate | null;
    notes: string | null;
    wantsOtherService: boolean | null;
    otherService: string | null;
    ratings: Partial<Record<RatingKey, number | null>>;
    wouldRecommend: boolean | null;
  };
}

/**
 * A mission order for one visit and its team.
 *
 * It holds what the worker needs and nothing else. There is no place in this
 * object for a price, a payment, the contract or the client's own details, so
 * the sheet cannot print one by accident.
 */
export interface MissionOrderData {
  division: Division;
  /** «رقم أمر المهمة». */
  number: string | null;
  issuedOn: IsoDate | null;
  visitDate: IsoDate | null;
  startTime: ClockTime | null;
  endTime: ClockTime | null;
  /** «اليوم 2 من 3» of a job of several days. */
  jobDay: { no: number; count: number } | null;
  /** The visit's rank in the team's day. */
  dayRank: { no: number; count: number } | null;
  site: {
    /** The building, the organisation, or the kind of dwelling. Not the client's file. */
    label: string | null;
    address: string | null;
    commune: string | null;
    landmark: string | null;
    directions: string | null;
  };
  contact: {
    name: string | null;
    role: string | null;
    phone: string | null;
    meetingPoint: string | null;
    /** «الشخص المخول باستلام الخدمة». */
    receiver: string | null;
  };
  access: {
    ways: readonly TeamAccess[];
    guardName: string | null;
    guardPhone: string | null;
  };
  team: readonly OrderWorker[];
  supervisor: { name: string | null; phone: string | null };
  taskGroups: readonly OrderTaskGroup[];
  /** «مهام خاصة لهذا اليوم», by priority. */
  specialTasks: readonly string[];
  /** The floor and entrance table. Printed for buildings and complexes only. */
  areas: readonly OrderArea[];
  forbidden: { places: readonly ForbiddenPlace[]; details: string | null };
  instructions: {
    codes: readonly SiteInstruction[];
    extra: string | null;
    ppe: readonly Ppe[];
    safetyNotes: string | null;
  };
  /** Who provides the cleaning materials. Never their cost. */
  materialsBy: Bearer | null;
  handouts: readonly OrderHandout[];
  returned: OrderReturn | null;
}

// ── The supervisor's inspection sheet ───────────────────────────────────────

export interface InspectionSheetCriterion {
  code: string;
  label: string;
  /** The mark out of 10 typed from the returned sheet. */
  score?: number | null;
  notApplicable?: boolean;
  note?: string | null;
}

export interface InspectionSheetData {
  division: Division;
  number: string | null;
  plannedDate: IsoDate | null;
  supervisorName: string | null;
  site: { label: string | null; address: string | null; commune: string | null };
  /** The order of the visit inspected. */
  orderNumber: string | null;
  /** The workers on that visit. */
  team: readonly { name: string; present?: boolean | null; remark?: string | null }[];
  criteria: readonly InspectionSheetCriterion[];
  /** The quality under which a correction follows. */
  threshold: number;
  /** What came back on the sheet. Left out, it prints blank. */
  result: {
    doneDate: IsoDate | null;
    doneTime: ClockTime | null;
    total: number | null;
    level: QualityLevel | null;
    needsCorrection: boolean | null;
    action: CorrectiveAction | null;
    supervisorNotes: string | null;
    contactRemark: string | null;
  } | null;
}

// ── The supervisor's day sheet ──────────────────────────────────────────────

export interface DaySheetVisit {
  startTime: ClockTime | null;
  endTime: ClockTime | null;
  orderNumber: string | null;
  site: string | null;
  address: string | null;
  contactName: string | null;
  contactPhone: string | null;
  team: readonly string[];
  vehicle: string | null;
}

export interface SupervisorDaySheetData {
  supervisorName: string | null;
  date: IsoDate | null;
  zones: readonly string[];
  visits: readonly DaySheetVisit[];
  absences: readonly { worker: string; replacement: string | null; site: string; startTime: ClockTime | null }[];
  inspections: readonly { number: string | null; site: string }[];
  correctiveTasks: readonly { site: string; description: string; dueDate: IsoDate | null }[];
  /** Open complaints and problem reports on the day's sites. */
  openIssues: readonly { site: string; text: string }[];
  /** The team's phones. This sheet is the supervisor's own; the order never carries them. */
  workerPhones: readonly { name: string; phone: string }[];
}

// ── The client call list ────────────────────────────────────────────────────

export interface CallListRow {
  /** The client or the site, as the office knows it. */
  client: string | null;
  contactName: string | null;
  phones: readonly string[];
  startTime: ClockTime | null;
  workersCount: number | null;
  supervisorName: string | null;
  purpose: CallPurpose | null;
  result?: CallResult | null;
  note?: string | null;
}

export interface CallListData {
  /** The day of the visits the calls are about. */
  visitsDate: IsoDate | null;
  /** The day the calls are made. */
  callDate: IsoDate | null;
  /** The centre's own number, read out to the client. */
  centrePhone: string | null;
  rows: readonly CallListRow[];
}
