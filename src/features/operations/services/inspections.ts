import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange, logDisclose } from "@/lib/log";
import { nextNumber } from "@/lib/numbering";
import { DIVISIONS, type Division } from "@/lib/options";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSettings } from "@/lib/settings";
import { staffName } from "@/lib/text/names";
import { localDate, localTime, type LocalDate } from "@/lib/units";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { SEED_INSPECTION_CRITERIA } from "../catalog/inspection-criteria";
import {
  addDays,
  dateOfDayNumber,
  datesBetween,
  dayNumber,
  isIsoDate,
  monthOf,
  weekdayOf,
  weekStartOf,
  type IsoDate,
  type Weekday,
} from "../rules/calendar";
import {
  correctiveTaskFor,
  DEFAULT_CORRECTIVE_DUE_DAYS,
  DEFAULT_INSPECTION_THRESHOLD,
  inspectionTotal,
  weakCriteria,
  type CriterionMark,
} from "../rules/inspection-score";
import type { InspectionSheetData } from "../sheets/sheet-data";
import {
  inspectionResultSchema,
  markOf,
  type InspectionResultAction,
  type InspectionResultValues,
  type InspectionStatus,
} from "../validators/inspection";
import type { CorrectiveAction, QualityLevel } from "../validators/option-codes";
import { createCorrectiveTask, listEmployeeChoices } from "./corrective-tasks";
import { OPEN_STATUSES, programmeSettings } from "./programme";

/**
 * Supervisor inspections (#17), as an office form: the sheet is printed from
 * the inspection, taken to the site, marked by hand, brought back and typed in.
 *
 * Each file's plan (`FileProgramme`: weekly, monthly or none, a preferred day,
 * a supervisor) keeps one PLANNED inspection per week or month of its plan
 * (`planInspections`, run from «تخطيط التفتيش»). One may also be added by hand.
 * Typed in, it is DONE with its score out of 100; under the threshold, or when
 * the supervisor ticked «يحتاج إلى تصحيح», it leaves one corrective task. One
 * still PLANNED `inspection.missedAfterDays` after its date becomes MISSED
 * (`markMissedInspections`, for the day-start job). Never deleted.
 */

export const INSPECTIONS_PATH = "/dashboard/quality";

/** How far ahead «تخطيط التفتيش» may plan. */
const MAX_PLAN_DAYS = 366;
/** The visits offered to link to an inspection: this many days either side of its date. */
const VISIT_CHOICE_DAYS = 14;

const blankToNull = (text: string | null | undefined) => {
  const trimmed = text?.trim() ?? "";
  return trimmed === "" ? null : trimmed;
};
const yesNo = (value: number | null) => (value === null ? null : value === 1);
const flag = (value: boolean | null) => (value === null ? null : value ? 1 : 0);

// ── The criteria ────────────────────────────────────────────────────────────

/**
 * French and English names of the seeded points, for the screens (the sheet is
 * always in his Arabic words).
 */
const CRITERION_NAMES: Readonly<Record<string, { fr: string; en: string }>> = {
  FLOORS: { fr: "Sols", en: "Floors" },
  GLASS: { fr: "Vitres", en: "Glass" },
  BATHROOMS: { fr: "Sanitaires", en: "Bathrooms" },
  ENTRANCES: { fr: "Entrées", en: "Entrances" },
  ODOURS: { fr: "Odeurs", en: "Odours" },
  DUST: { fr: "Poussière", en: "Dust" },
  EQUIPMENT: { fr: "Matériel", en: "Equipment" },
  STAIRS: { fr: "Escaliers", en: "Stairs" },
  CORRIDORS: { fr: "Couloirs", en: "Corridors" },
  LIFTS: { fr: "Ascenseurs", en: "Lifts" },
  WASTE: { fr: "Collecte des déchets", en: "Waste collection" },
  INSTRUCTIONS: { fr: "Respect des consignes", en: "Following instructions" },
  APPEARANCE: { fr: "Tenue professionnelle", en: "Professional appearance" },
};

/** The fixed id of a seeded point: `criterion-HOUSING-FLOORS`. */
export const criterionId = (division: Division, code: string) => `criterion-${division}-${code}`;

/**
 * The 30 points the program starts with (seven for homes and organisations,
 * eight for buildings and complexes), inserted when missing, with fixed ids.
 * A row the manager edited is never overwritten, and a point he removed (made
 * inactive) stays as he left it. Run as often as wanted: it moves to the seed
 * registry (`src/lib/seeds`) as Operations' step.
 */
export async function ensureInspectionCriteria(ex: Executor, ctx: ServiceContext): Promise<{ inserted: number }> {
  const existing = await ex.selectFrom("InspectionCriterion").select(["id", "division", "code"]).execute();
  const have = new Set(existing.flatMap((row) => [row.id, `${row.division}:${row.code}`]));
  const rows = DIVISIONS.flatMap((division) =>
    SEED_INSPECTION_CRITERIA[division]
      .map((criterion, index) => ({ criterion, index }))
      .filter(
        ({ criterion }) =>
          !have.has(criterionId(division, criterion.code)) && !have.has(`${division}:${criterion.code}`),
      )
      .map(({ criterion, index }) => ({
        id: criterionId(division, criterion.code),
        code: criterion.code,
        division,
        labelAr: criterion.label,
        labelFr: CRITERION_NAMES[criterion.code]?.fr ?? null,
        labelEn: CRITERION_NAMES[criterion.code]?.en ?? null,
        weight: criterion.weight,
        sortOrder: index + 1,
        isActive: 1,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })),
  );
  if (rows.length > 0) await ex.insertInto("InspectionCriterion").values(rows).execute();
  return { inserted: rows.length };
}

/** A point of an inspection: a line of «عناصر التقييم». */
export interface InspectionPoint {
  code: string;
  /** His word, as the sheet prints it. */
  label: string;
  /** The same point for a French or an English screen, when the list has it. */
  labelFr: string | null;
  labelEn: string | null;
  weight: number;
  score: number | null;
  notApplicable: boolean;
  note: string | null;
}

/** A division's active points, in the manager's order; the seeded list until the table has them. */
async function divisionPoints(ex: Executor, division: string): Promise<InspectionPoint[]> {
  const rows = await ex
    .selectFrom("InspectionCriterion")
    .select(["code", "labelAr", "labelFr", "labelEn", "weight", "isActive"])
    .where("division", "=", division)
    .orderBy("sortOrder")
    .orderBy("code")
    .execute();
  const seeded = SEED_INSPECTION_CRITERIA[division as Division] ?? [];
  const list =
    rows.length > 0
      ? rows
          .filter((row) => row.isActive === 1)
          .map((row) => ({
            code: row.code,
            label: row.labelAr,
            labelFr: row.labelFr,
            labelEn: row.labelEn,
            weight: row.weight,
          }))
      : seeded.map((criterion) => ({
          code: criterion.code,
          label: criterion.label,
          labelFr: CRITERION_NAMES[criterion.code]?.fr ?? null,
          labelEn: CRITERION_NAMES[criterion.code]?.en ?? null,
          weight: criterion.weight,
        }));
  return list.map((point) => ({ ...point, score: null, notApplicable: false, note: null }));
}

/**
 * The points of one inspection: its own lines once it has them (frozen at the
 * first print or the first typing, so the paper and the screen agree), else
 * its division's points as they stand.
 */
async function pointsOf(ex: Executor, inspection: { id: string; division: string }): Promise<InspectionPoint[]> {
  const lines = await ex
    .selectFrom("InspectionScore")
    .leftJoin("InspectionCriterion", (join) =>
      join
        .onRef("InspectionCriterion.code", "=", "InspectionScore.criterionCode")
        .on("InspectionCriterion.division", "=", inspection.division),
    )
    .select([
      "InspectionScore.criterionCode",
      "InspectionScore.label",
      "InspectionScore.weight",
      "InspectionScore.score",
      "InspectionScore.notApplicable",
      "InspectionScore.note",
      "InspectionCriterion.labelFr",
      "InspectionCriterion.labelEn",
      "InspectionCriterion.sortOrder",
    ])
    .where("InspectionScore.inspectionId", "=", inspection.id)
    .execute();
  if (lines.length === 0) return divisionPoints(ex, inspection.division);
  const seededOrder = (SEED_INSPECTION_CRITERIA[inspection.division as Division] ?? []).map((point) => point.code);
  const rank = (line: (typeof lines)[number]) => {
    const seeded = seededOrder.indexOf(line.criterionCode);
    return line.sortOrder ?? (seeded === -1 ? 1000 : seeded + 1);
  };
  return [...lines]
    .sort((a, b) => rank(a) - rank(b) || a.criterionCode.localeCompare(b.criterionCode))
    .map((line) => ({
      code: line.criterionCode,
      label: line.label,
      labelFr: line.labelFr ?? CRITERION_NAMES[line.criterionCode]?.fr ?? null,
      labelEn: line.labelEn ?? CRITERION_NAMES[line.criterionCode]?.en ?? null,
      weight: line.weight,
      score: line.score,
      notApplicable: line.notApplicable === 1,
      note: line.note,
    }));
}

/** Writes the inspection's own lines from its division's points, once (the print or the first typing). */
async function freezePoints(ex: Executor, ctx: ServiceContext, inspection: { id: string; division: string }) {
  const there = await ex
    .selectFrom("InspectionScore")
    .select("id")
    .where("inspectionId", "=", inspection.id)
    .executeTakeFirst();
  if (there) return;
  const known = await ex
    .selectFrom("InspectionCriterion")
    .select("id")
    .where("division", "=", inspection.division)
    .executeTakeFirst();
  // Before the seed registry runs, the first use writes the seeded points.
  if (!known) await ensureInspectionCriteria(ex, ctx);
  const points = await divisionPoints(ex, inspection.division);
  if (points.length === 0) return;
  await ex
    .insertInto("InspectionScore")
    .values(
      points.map((point) => ({
        id: newId(),
        inspectionId: inspection.id,
        criterionCode: point.code,
        label: point.label,
        weight: point.weight,
        score: null,
        notApplicable: 0,
        note: null,
        createdAt: ctx.now,
        updatedAt: ctx.now,
      })),
    )
    .execute();
}

// ── Reading one inspection ──────────────────────────────────────────────────

async function inspectionOf(ex: Executor, inspectionId: string) {
  const row = await ex
    .selectFrom("Inspection")
    .innerJoin("File", "File.id", "Inspection.fileId")
    .selectAll("Inspection")
    .select(["File.division", "File.number as fileNumber"])
    .where("Inspection.id", "=", inspectionId)
    .executeTakeFirst();
  if (!row) throw new ServiceError("This inspection does not exist.");
  return row;
}

export interface InspectionWorker {
  workerId: string;
  firstName: string;
  lastName: string;
  number: string;
  /** «حاضر(ة)»: null until the sheet is typed in. */
  present: boolean | null;
  remark: string | null;
}

export interface InspectionVisitChoice {
  id: string;
  number: string;
  visitDate: LocalDate;
  startTime: string;
  status: string;
  /** The workers holding a seat. */
  team: Omit<InspectionWorker, "present" | "remark">[];
}

/** The workers holding a seat on these visits, in the order they were given. */
async function teamsOf(ex: Executor, visitIds: readonly string[]) {
  const teams = new Map<string, InspectionVisitChoice["team"]>();
  if (visitIds.length === 0) return teams;
  const seats = await ex
    .selectFrom("VisitWorker")
    .innerJoin("StaffMember", "StaffMember.id", "VisitWorker.workerId")
    .select([
      "VisitWorker.visitId",
      "VisitWorker.workerId",
      "StaffMember.firstName",
      "StaffMember.lastName",
      "StaffMember.number",
    ])
    .where("VisitWorker.visitId", "in", [...new Set(visitIds)])
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .orderBy("VisitWorker.createdAt")
    .execute();
  for (const seat of seats) {
    const team = teams.get(seat.visitId) ?? [];
    if (!team.some((member) => member.workerId === seat.workerId)) {
      team.push({ workerId: seat.workerId, firstName: seat.firstName, lastName: seat.lastName, number: seat.number });
    }
    teams.set(seat.visitId, team);
  }
  return teams;
}

/** The workers noted on the inspection, else the team of the visit inspected. */
async function workersOf(
  ex: Executor,
  inspection: { id: string; visitId: string | null },
): Promise<InspectionWorker[]> {
  const notes = await ex
    .selectFrom("InspectionWorkerNote")
    .innerJoin("StaffMember", "StaffMember.id", "InspectionWorkerNote.workerId")
    .select([
      "InspectionWorkerNote.workerId",
      "InspectionWorkerNote.present",
      "InspectionWorkerNote.remark",
      "StaffMember.firstName",
      "StaffMember.lastName",
      "StaffMember.number",
    ])
    .where("InspectionWorkerNote.inspectionId", "=", inspection.id)
    .orderBy("InspectionWorkerNote.createdAt")
    .orderBy("StaffMember.lastName")
    .execute();
  if (notes.length > 0) {
    return notes.map((note) => ({
      workerId: note.workerId,
      firstName: note.firstName,
      lastName: note.lastName,
      number: note.number,
      present: note.present === 1,
      remark: note.remark,
    }));
  }
  if (!inspection.visitId) return [];
  const team = (await teamsOf(ex, [inspection.visitId])).get(inspection.visitId) ?? [];
  return team.map((member) => ({ ...member, present: null, remark: null }));
}

export interface InspectionDetail {
  inspection: {
    id: string;
    number: string;
    status: InspectionStatus;
    /** From a file's plan (its week or month), or added by hand. */
    planned: boolean;
    plannedDate: LocalDate;
    doneDate: LocalDate | null;
    doneAtTime: string | null;
    sheetPrintedAt: string | null;
    scoreTotal: number | null;
    thresholdUsed: number | null;
    belowThreshold: boolean | null;
    correctionNeeded: boolean | null;
    overallLevel: QualityLevel | null;
    recommendedAction: InspectionResultAction | null;
    supervisorNotes: string | null;
    clientRemark: string | null;
    enteredAt: string | null;
    visitId: string | null;
    supervisorEmployeeId: string | null;
  };
  file: { id: string; number: string; division: Division; clientName: string };
  site: { label: string; address: string; commune: string | null };
  supervisor: { id: string; firstName: string; lastName: string } | null;
  /** The quality under which a correction follows: the one used when typed, else the setting. */
  threshold: number;
  points: InspectionPoint[];
  workers: InspectionWorker[];
  /** The file's visits near the inspection's date, to name the one inspected. */
  visits: InspectionVisitChoice[];
  correctiveTask: {
    id: string;
    status: string;
    action: CorrectiveAction;
    dueDate: LocalDate;
    description: string;
  } | null;
}

async function thresholdSetting(ex: Executor): Promise<number> {
  const value = (await getSettings(ex, ["inspection.threshold"]))["inspection.threshold"];
  return Number.isSafeInteger(value) && value > 0 && value <= 100 ? value : DEFAULT_INSPECTION_THRESHOLD;
}

async function buildDetail(ex: Executor, inspectionId: string): Promise<InspectionDetail> {
  const inspection = await inspectionOf(ex, inspectionId);
  const place = await ex
    .selectFrom("File")
    .innerJoin("Site", "Site.id", "File.siteId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .leftJoin("Commune", "Commune.id", "Site.communeId")
    .select([
      "File.id",
      "File.number",
      "File.division",
      "Client.name as clientName",
      "Site.commonName",
      "Site.address",
      "Site.floorAndDoor",
      "Site.district",
      "Commune.nameAr as communeName",
    ])
    .where("File.id", "=", inspection.fileId)
    .executeTakeFirstOrThrow();

  const supervisor = inspection.supervisorEmployeeId
    ? await ex
        .selectFrom("StaffMember")
        .select(["id", "firstName", "lastName"])
        .where("id", "=", inspection.supervisorEmployeeId)
        .executeTakeFirst()
    : undefined;

  // The visits near the date (not those a programme change dropped), and the one inspected wherever it falls.
  const around = inspection.doneDate ?? inspection.plannedDate;
  const visitRows = await ex
    .selectFrom("Visit")
    .select(["id", "number", "visitDate", "plannedStartTime", "status"])
    .where("fileId", "=", inspection.fileId)
    .where((eb) =>
      eb.or([
        eb.and([
          eb("visitDate", ">=", localDate(addDays(around, -VISIT_CHOICE_DAYS))),
          eb("visitDate", "<=", localDate(addDays(around, VISIT_CHOICE_DAYS))),
          eb("status", "!=", "CANCELLED"),
        ]),
        eb("id", "=", inspection.visitId ?? ""),
      ]),
    )
    .orderBy("visitDate")
    .orderBy("plannedStartTime")
    .execute();
  const teams = await teamsOf(
    ex,
    visitRows.map((visit) => visit.id),
  );

  const task = await ex
    .selectFrom("CorrectiveTask")
    .select(["id", "status", "action", "dueDate", "description"])
    .where("inspectionId", "=", inspection.id)
    .orderBy("createdAt", "desc")
    .executeTakeFirst();

  return {
    inspection: {
      id: inspection.id,
      number: inspection.number,
      status: inspection.status as InspectionStatus,
      planned: inspection.planPeriod !== null,
      plannedDate: inspection.plannedDate,
      doneDate: inspection.doneDate,
      doneAtTime: inspection.doneAtTime,
      sheetPrintedAt: inspection.sheetPrintedAt,
      scoreTotal: inspection.scoreTotal,
      thresholdUsed: inspection.thresholdUsed,
      belowThreshold: yesNo(inspection.belowThreshold),
      correctionNeeded: yesNo(inspection.correctionNeeded),
      overallLevel: inspection.overallLevel as QualityLevel | null,
      recommendedAction: inspection.recommendedAction as InspectionResultAction | null,
      supervisorNotes: inspection.supervisorNotes,
      clientRemark: inspection.clientRemark,
      enteredAt: inspection.enteredAt,
      visitId: inspection.visitId,
      supervisorEmployeeId: inspection.supervisorEmployeeId,
    },
    file: {
      id: place.id,
      number: place.number,
      division: place.division as Division,
      clientName: place.clientName,
    },
    site: {
      label: place.commonName ?? place.address,
      address: [place.address, place.floorAndDoor, place.district].filter(Boolean).join("، "),
      commune: place.communeName,
    },
    supervisor: supervisor ?? null,
    threshold: inspection.thresholdUsed ?? (await thresholdSetting(ex)),
    points: await pointsOf(ex, inspection),
    workers: await workersOf(ex, inspection),
    visits: visitRows.map((visit) => ({
      id: visit.id,
      number: visit.number,
      visitDate: visit.visitDate,
      startTime: visit.plannedStartTime,
      status: visit.status,
      team: teams.get(visit.id) ?? [],
    })),
    correctiveTask: task
      ? {
          id: task.id,
          status: task.status,
          action: task.action as CorrectiveAction,
          dueDate: task.dueDate,
          description: task.description,
        }
      : null,
  };
}

/** One inspection, as its page shows it: the sheet's facts, its points and its workers. */
export async function getInspection(
  ex: Executor,
  ctx: ServiceContext,
  input: { inspectionId: string },
): Promise<InspectionDetail> {
  requireSection(ctx, "REQUESTS", "READ");
  return buildDetail(ex, input.inspectionId);
}

function sheetOf(detail: InspectionDetail): InspectionSheetData {
  const { inspection } = detail;
  const done = inspection.status === "DONE";
  return {
    division: detail.file.division,
    number: inspection.number,
    plannedDate: inspection.plannedDate,
    supervisorName: detail.supervisor ? staffName(detail.supervisor) : null,
    site: { label: detail.site.label, address: detail.site.address || null, commune: detail.site.commune },
    orderNumber: detail.visits.find((visit) => visit.id === inspection.visitId)?.number ?? null,
    team: detail.workers.map((worker) => ({
      name: staffName(worker),
      present: done ? worker.present : null,
      remark: worker.remark,
    })),
    criteria: detail.points.map((point) => ({
      code: point.code,
      label: point.label,
      score: point.score,
      notApplicable: point.notApplicable,
      note: point.note,
    })),
    threshold: detail.threshold,
    result: done
      ? {
          doneDate: inspection.doneDate,
          doneTime: inspection.doneAtTime,
          total: inspection.scoreTotal,
          level: inspection.overallLevel,
          needsCorrection: inspection.correctionNeeded,
          action: inspection.recommendedAction,
          supervisorNotes: inspection.supervisorNotes,
          contactRemark: inspection.clientRemark,
        }
      : null,
  };
}

/** The supervisor's sheet of a stored inspection: blank to take to the site, or as it was typed in. */
export async function getInspectionSheet(
  ex: Executor,
  ctx: ServiceContext,
  input: { inspectionId: string },
): Promise<InspectionSheetData> {
  requireSection(ctx, "REQUESTS", "READ");
  return sheetOf(await buildDetail(ex, input.inspectionId));
}

// ── The list ────────────────────────────────────────────────────────────────

export interface InspectionLine {
  id: string;
  number: string;
  status: InspectionStatus;
  plannedDate: LocalDate;
  doneDate: LocalDate | null;
  file: { id: string; number: string; division: Division };
  site: string;
  clientName: string;
  commune: string | null;
  supervisor: { id: string; firstName: string; lastName: string } | null;
  scoreTotal: number | null;
  thresholdUsed: number | null;
  belowThreshold: boolean | null;
  visit: { id: string; number: string } | null;
  sheetPrinted: boolean;
  /** Still planned, its date past. */
  late: boolean;
  correctiveTaskId: string | null;
}

/**
 * The inspections. `due` keeps those still planned for today or a day already
 * past (the alert `inspection.due`). Earliest first, or latest first with
 * `latestFirst`.
 */
export async function listInspections(
  ex: Executor,
  ctx: ServiceContext,
  input: {
    status?: InspectionStatus | readonly InspectionStatus[];
    due?: boolean;
    from?: string;
    to?: string;
    latestFirst?: boolean;
  } = {},
): Promise<InspectionLine[]> {
  requireSection(ctx, "REQUESTS", "READ");
  let rows = ex
    .selectFrom("Inspection")
    .innerJoin("File", "File.id", "Inspection.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .leftJoin("Commune", "Commune.id", "Site.communeId")
    .leftJoin("Visit", "Visit.id", "Inspection.visitId")
    .leftJoin("StaffMember as Supervisor", "Supervisor.id", "Inspection.supervisorEmployeeId")
    .select([
      "Inspection.id",
      "Inspection.number",
      "Inspection.status",
      "Inspection.plannedDate",
      "Inspection.doneDate",
      "Inspection.scoreTotal",
      "Inspection.thresholdUsed",
      "Inspection.belowThreshold",
      "Inspection.sheetPrintedAt",
      "Inspection.visitId",
      "Inspection.supervisorEmployeeId",
      "File.id as fileId",
      "File.number as fileNumber",
      "File.division",
      "Site.commonName",
      "Site.address",
      "Client.name as clientName",
      "Commune.nameAr as communeName",
      "Visit.number as visitNumber",
      "Supervisor.firstName as supervisorFirstName",
      "Supervisor.lastName as supervisorLastName",
      (eb) =>
        eb
          .selectFrom("CorrectiveTask")
          .select("CorrectiveTask.id")
          .whereRef("CorrectiveTask.inspectionId", "=", "Inspection.id")
          .orderBy("CorrectiveTask.createdAt", "desc")
          .limit(1)
          .as("correctiveTaskId"),
    ]);
  const statuses = input.status === undefined ? null : typeof input.status === "string" ? [input.status] : input.status;
  if (statuses) rows = rows.where("Inspection.status", "in", statuses.length > 0 ? [...statuses] : [""]);
  if (input.due)
    rows = rows.where("Inspection.status", "=", "PLANNED").where("Inspection.plannedDate", "<=", ctx.today);
  if (input.from && isIsoDate(input.from)) rows = rows.where("Inspection.plannedDate", ">=", localDate(input.from));
  if (input.to && isIsoDate(input.to)) rows = rows.where("Inspection.plannedDate", "<=", localDate(input.to));
  const direction = input.latestFirst ? "desc" : "asc";
  const found = await rows
    .orderBy("Inspection.plannedDate", direction)
    .orderBy("Inspection.numberYear", direction)
    .orderBy("Inspection.numberSeq", direction)
    .execute();

  return found.map((row) => ({
    id: row.id,
    number: row.number,
    status: row.status as InspectionStatus,
    plannedDate: row.plannedDate,
    doneDate: row.doneDate,
    file: { id: row.fileId, number: row.fileNumber, division: row.division as Division },
    site: row.commonName ?? row.address,
    clientName: row.clientName,
    commune: row.communeName,
    supervisor:
      row.supervisorEmployeeId && row.supervisorLastName !== null
        ? { id: row.supervisorEmployeeId, firstName: row.supervisorFirstName ?? "", lastName: row.supervisorLastName }
        : null,
    scoreTotal: row.scoreTotal,
    thresholdUsed: row.thresholdUsed,
    belowThreshold: yesNo(row.belowThreshold),
    visit: row.visitId && row.visitNumber ? { id: row.visitId, number: row.visitNumber } : null,
    sheetPrinted: row.sheetPrintedAt !== null,
    late: row.status === "PLANNED" && row.plannedDate < ctx.today,
    correctiveTaskId: row.correctiveTaskId ?? null,
  }));
}

/** How many inspections are still planned for today or a day past: the count of the alert `inspection.due`. */
export async function countInspectionsDue(ex: Executor, ctx: ServiceContext): Promise<number> {
  const row = await ex
    .selectFrom("Inspection")
    .select((eb) => eb.fn.countAll<number>().as("count"))
    .where("status", "=", "PLANNED")
    .where("plannedDate", "<=", ctx.today)
    .executeTakeFirstOrThrow();
  return Number(row.count);
}

/** A live file, for the dialog «تفتيش جديد», with its visits of the weeks around today. */
export interface InspectableFile {
  id: string;
  number: string;
  division: Division;
  clientName: string;
  site: string;
  visits: { id: string; number: string; visitDate: LocalDate; startTime: string }[];
}

export async function listInspectableFiles(ex: Executor, ctx: ServiceContext): Promise<InspectableFile[]> {
  requireSection(ctx, "REQUESTS", "READ");
  const files = await ex
    .selectFrom("File")
    .innerJoin("Site", "Site.id", "File.siteId")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select(["File.id", "File.number", "File.division", "Client.name as clientName", "Site.commonName", "Site.address"])
    .where("File.stage", "=", "CONTRACTED")
    .where("File.closedAt", "is", null)
    .where("File.deletedAt", "is", null)
    .orderBy("Client.name")
    .orderBy("File.number")
    .execute();
  if (files.length === 0) return [];
  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "fileId", "number", "visitDate", "plannedStartTime"])
    .where(
      "fileId",
      "in",
      files.map((file) => file.id),
    )
    .where("status", "!=", "CANCELLED")
    .where("visitDate", ">=", localDate(addDays(ctx.today, -VISIT_CHOICE_DAYS)))
    .where("visitDate", "<=", localDate(addDays(ctx.today, VISIT_CHOICE_DAYS)))
    .orderBy("visitDate")
    .orderBy("plannedStartTime")
    .execute();
  return files.map((file) => ({
    id: file.id,
    number: file.number,
    division: file.division as Division,
    clientName: file.clientName,
    site: file.commonName ?? file.address,
    visits: visits
      .filter((visit) => visit.fileId === file.id)
      .map((visit) => ({
        id: visit.id,
        number: visit.number,
        visitDate: visit.visitDate,
        startTime: visit.plannedStartTime,
      })),
  }));
}

// ── Planning ────────────────────────────────────────────────────────────────

interface PlanPeriod {
  /** `planPeriod`: the Saturday of the week, or the month. */
  key: string;
  start: IsoDate;
  end: IsoDate;
}

function lastDayOfMonth(month: string): IsoDate {
  const [year, number] = month.split("-").map(Number);
  const next = number === 12 ? `${year + 1}-01-01` : `${year}-${String(number + 1).padStart(2, "0")}-01`;
  return addDays(next, -1);
}

/** The weeks (from Saturday) or the months that touch `from` … `to`. */
export function planPeriods(frequency: "WEEKLY" | "MONTHLY", from: IsoDate, to: IsoDate): PlanPeriod[] {
  const periods: PlanPeriod[] = [];
  if (to < from) return periods;
  if (frequency === "WEEKLY") {
    for (let start = weekStartOf(from); start <= to; start = addDays(start, 7)) {
      periods.push({ key: start, start, end: addDays(start, 6) });
    }
    return periods;
  }
  for (let month = monthOf(from); `${month}-01` <= to; month = monthOf(addDays(lastDayOfMonth(month), 1))) {
    periods.push({ key: month, start: `${month}-01`, end: lastDayOfMonth(month) });
  }
  return periods;
}

/**
 * The day an inspection of a period falls on: the plan's weekday, on a visit
 * day when one falls on it; else the first visit day; else the first working
 * day. Null when the window holds no such day.
 */
export function plannedDateIn(
  window: readonly IsoDate[],
  preferred: Weekday | null,
  visitDates: ReadonlySet<IsoDate>,
  workingWeekdays: readonly Weekday[],
): IsoDate | null {
  if (preferred !== null) {
    const onDay = window.filter((date) => weekdayOf(date) === preferred);
    const withVisit = onDay.find((date) => visitDates.has(date));
    if (withVisit) return withVisit;
    if (onDay.length > 0) return onDay[0];
  }
  return (
    window.find((date) => visitDates.has(date)) ??
    window.find((date) => workingWeekdays.includes(weekdayOf(date))) ??
    null
  );
}

/** The zone's supervisor on a day. */
async function zoneSupervisorOn(ex: Executor, zoneId: string | null, date: IsoDate): Promise<string | null> {
  if (!zoneId) return null;
  const row = await ex
    .selectFrom("SupervisorAssignment")
    .select("supervisorEmployeeId")
    .where("zoneId", "=", zoneId)
    .where("fromDate", "<=", localDate(date))
    .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">=", localDate(date))]))
    .orderBy("fromDate", "desc")
    .executeTakeFirst();
  return row?.supervisorEmployeeId ?? null;
}

export interface PlannedInspection {
  id: string;
  number: string;
  fileId: string;
  plannedDate: LocalDate;
}

/**
 * «تخطيط التفتيش»: for every live file whose plan is weekly or monthly, one
 * PLANNED inspection per week or month from today (or the plan's start) up to
 * `upTo`, never past the contract's end. A week or month that already has its
 * inspection, whatever became of it, gets no other: run it as often as wanted.
 */
export async function planInspections(
  ex: Executor,
  ctx: ServiceContext,
  input: { upTo: string },
): Promise<{ created: number; inspections: PlannedInspection[] }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  if (!isIsoDate(input.upTo)) throw new ServiceError("Enter a valid date.");
  if (dayNumber(input.upTo) - dayNumber(ctx.today) > MAX_PLAN_DAYS) {
    throw new ServiceError("Inspections are planned at most a year ahead.");
  }
  if (input.upTo < ctx.today) return { created: 0, inspections: [] };

  const plans = await ex
    .selectFrom("FileProgramme")
    .innerJoin("File", "File.id", "FileProgramme.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .select([
      "FileProgramme.inspectionFrequency",
      "FileProgramme.inspectionDayOfWeek",
      "FileProgramme.inspectionSupervisorEmployeeId",
      "FileProgramme.inspectionStartDate",
      "File.id as fileId",
      "File.number as fileNumber",
      "File.endDate",
      "Site.zoneId",
    ])
    .where("FileProgramme.inspectionIsActive", "=", 1)
    .where("FileProgramme.inspectionFrequency", "in", ["WEEKLY", "MONTHLY"])
    .where("FileProgramme.inspectionStartDate", "is not", null)
    .where("File.stage", "=", "CONTRACTED")
    .where("File.closedAt", "is", null)
    .where("File.deletedAt", "is", null)
    .orderBy("File.number")
    .execute();
  const { workingWeekdays } = await programmeSettings(ex);

  const toCreate: Array<{
    fileId: string;
    fileNumber: string;
    planPeriod: string;
    plannedDate: IsoDate;
    visitId: string | null;
    supervisorEmployeeId: string | null;
  }> = [];
  for (const plan of plans) {
    const startDate = plan.inspectionStartDate ?? ctx.today;
    const from = startDate > ctx.today ? startDate : ctx.today;
    // `upTo` says which weeks or months are planned; each is planned whole, up to the contract's end.
    const end = plan.endDate;
    const lastStart = end && end < input.upTo ? end : input.upTo;
    if (lastStart < from) continue;
    const periods = planPeriods(plan.inspectionFrequency === "WEEKLY" ? "WEEKLY" : "MONTHLY", from, lastStart);
    if (periods.length === 0) continue;
    const lastPeriodEnd = periods[periods.length - 1].end;
    const last = end && end < lastPeriodEnd ? end : lastPeriodEnd;

    const taken = new Set(
      (
        await ex
          .selectFrom("Inspection")
          .select("planPeriod")
          .where("fileId", "=", plan.fileId)
          .where(
            "planPeriod",
            "in",
            periods.map((period) => period.key),
          )
          .execute()
      ).map((row) => row.planPeriod),
    );
    const visits = await ex
      .selectFrom("Visit")
      .select(["id", "visitDate", "supervisorEmployeeId"])
      .where("fileId", "=", plan.fileId)
      .where("visitDate", ">=", localDate(from))
      .where("visitDate", "<=", localDate(last))
      .where("status", "!=", "CANCELLED")
      .orderBy("visitDate")
      .orderBy("plannedStartTime")
      .execute();
    const visitDates = new Set<IsoDate>(visits.map((visit) => visit.visitDate));

    for (const period of periods) {
      if (taken.has(period.key)) continue;
      const window = datesBetween(period.start > from ? period.start : from, period.end < last ? period.end : last);
      const plannedDate = plannedDateIn(window, plan.inspectionDayOfWeek, visitDates, workingWeekdays);
      if (!plannedDate) continue;
      const visit = visits.find((candidate) => candidate.visitDate === plannedDate) ?? null;
      const supervisorEmployeeId =
        plan.inspectionSupervisorEmployeeId ??
        (await zoneSupervisorOn(ex, plan.zoneId, plannedDate)) ??
        visit?.supervisorEmployeeId ??
        null;
      toCreate.push({
        fileId: plan.fileId,
        fileNumber: plan.fileNumber,
        planPeriod: period.key,
        plannedDate,
        visitId: visit?.id ?? null,
        supervisorEmployeeId,
      });
    }
  }

  // Numbered in date order, file by file within a day.
  toCreate.sort((a, b) => a.plannedDate.localeCompare(b.plannedDate) || a.fileNumber.localeCompare(b.fileNumber, "en"));
  const made: PlannedInspection[] = [];
  for (const planned of toCreate) {
    const plannedDate = localDate(planned.plannedDate);
    const number = await nextNumber(ex, ctx, "INSPECTION", { date: plannedDate });
    const id = newId();
    await ex
      .insertInto("Inspection")
      .values({
        id,
        numberSeq: number.seq,
        numberYear: number.year,
        number: number.display,
        fileId: planned.fileId,
        planPeriod: planned.planPeriod,
        visitId: planned.visitId,
        plannedDate,
        supervisorEmployeeId: planned.supervisorEmployeeId,
        status: "PLANNED",
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    made.push({ id, number: number.display, fileId: planned.fileId, plannedDate });
  }
  if (made.length > 0) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "CREATE",
      entity: "Inspection",
      context: { planned: made.length, upTo: input.upTo, numbers: made.map((inspection) => inspection.number) },
    });
  }
  return { created: made.length, inspections: made };
}

// ── Adding one by hand ──────────────────────────────────────────────────────

async function checkSupervisor(ex: Executor, employeeId: string): Promise<void> {
  const person = await ex
    .selectFrom("StaffMember")
    .select("kind")
    .where("id", "=", employeeId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!person) throw new ServiceError("This supervisor does not exist.");
  if (person.kind !== "EMPLOYEE") throw new ServiceError("Choose an employee as supervisor.");
}

async function visitOfFile(ex: Executor, fileId: string, visitId: string) {
  const visit = await ex
    .selectFrom("Visit")
    .select(["id", "fileId", "number", "visitDate", "supervisorEmployeeId"])
    .where("id", "=", visitId)
    .executeTakeFirst();
  if (!visit) throw new ServiceError("This visit does not exist.");
  if (visit.fileId !== fileId) throw new ServiceError("This visit is not one of this file's visits.");
  return visit;
}

/**
 * «تفتيش جديد»: an inspection the plan did not make (a complaint to check, a
 * site to look at between two planned ones). On a visit, it takes the visit's
 * day unless another is given; its supervisor is the one given, else the
 * plan's, else the zone's that day.
 */
export async function createInspection(
  ex: Executor,
  ctx: ServiceContext,
  input: { fileId: string; visitId?: string | null; plannedDate?: string | null; supervisorEmployeeId?: string | null },
): Promise<{ id: string; number: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const file = await ex
    .selectFrom("File")
    .innerJoin("Site", "Site.id", "File.siteId")
    .leftJoin("FileProgramme", "FileProgramme.fileId", "File.id")
    .select(["File.id", "File.number", "File.stage", "Site.zoneId", "FileProgramme.inspectionSupervisorEmployeeId"])
    .where("File.id", "=", input.fileId)
    .where("File.deletedAt", "is", null)
    .executeTakeFirst();
  if (!file) throw new ServiceError("This client file does not exist.");
  if (file.stage !== "CONTRACTED" && file.stage !== "CONTRACT_ENDED") {
    throw new ServiceError("Inspections are made for a contracted file only.");
  }
  const visit = input.visitId ? await visitOfFile(ex, file.id, input.visitId) : null;
  const date = blankToNull(input.plannedDate) ?? visit?.visitDate ?? ctx.today;
  if (!isIsoDate(date)) throw new ServiceError("Enter a valid date.");
  const plannedDate = localDate(date);

  let supervisorEmployeeId = blankToNull(input.supervisorEmployeeId);
  if (supervisorEmployeeId) await checkSupervisor(ex, supervisorEmployeeId);
  else {
    supervisorEmployeeId =
      file.inspectionSupervisorEmployeeId ??
      (await zoneSupervisorOn(ex, file.zoneId, plannedDate)) ??
      visit?.supervisorEmployeeId ??
      null;
  }

  const number = await nextNumber(ex, ctx, "INSPECTION", { date: plannedDate });
  const id = newId();
  await ex
    .insertInto("Inspection")
    .values({
      id,
      numberSeq: number.seq,
      numberYear: number.year,
      number: number.display,
      fileId: file.id,
      planPeriod: null,
      visitId: visit?.id ?? null,
      plannedDate,
      supervisorEmployeeId,
      status: "PLANNED",
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CREATE",
    entity: "Inspection",
    entityId: id,
    entityLabel: number.display,
    context: { fileId: file.id, visitId: visit?.id ?? null, plannedDate },
  });
  return { id, number: number.display };
}

// ── The sheet goes to the printer ───────────────────────────────────────────

/**
 * The sheet was sent to the printer: its points are frozen (the paper and the
 * typing then agree), the print is dated, and, as it names the team, logged.
 */
export async function recordInspectionPrinted(
  ex: Executor,
  ctx: ServiceContext,
  input: { inspectionId: string },
): Promise<{ printedAt: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const inspection = await inspectionOf(ex, input.inspectionId);
  if (inspection.status === "CANCELLED") throw new ServiceError("This inspection is cancelled.");
  await freezePoints(ex, ctx, inspection);
  await ex
    .updateTable("Inspection")
    .set({ sheetPrintedAt: ctx.now, updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", inspection.id)
    .execute();
  const workers = await workersOf(ex, inspection);
  if (workers.length > 0) {
    await logDisclose(ex, ctx, {
      owner: "OPERATIONS",
      action: "PRINT",
      entity: "Inspection",
      entityId: inspection.id,
      entityLabel: inspection.number,
      context: { sheet: "INSPECTION_SHEET", workers: workers.map((worker) => worker.workerId) },
    });
  }
  return { printedAt: ctx.now };
}

// ── The returned sheet, typed in ────────────────────────────────────────────

/**
 * How many inspections in a row, just before this one, on the same file and
 * with the same worker present, were under the threshold; and that worker.
 */
async function earlierLowInARow(
  ex: Executor,
  inspection: { id: string; fileId: string; createdAt: string },
  doneDate: IsoDate,
  presentWorkerIds: readonly string[],
): Promise<{ count: number; workerId: string | null }> {
  if (presentWorkerIds.length === 0) return { count: 0, workerId: null };
  const earlier = await ex
    .selectFrom("Inspection")
    .select(["id", "belowThreshold", "doneDate", "createdAt"])
    .where("fileId", "=", inspection.fileId)
    .where("status", "=", "DONE")
    .where("id", "!=", inspection.id)
    .where("doneDate", "<=", localDate(doneDate))
    .orderBy("doneDate", "desc")
    .orderBy("createdAt", "desc")
    .execute();
  const before = earlier.filter(
    (row) => row.doneDate !== null && (row.doneDate < doneDate || row.createdAt < inspection.createdAt),
  );
  if (before.length === 0) return { count: 0, workerId: null };
  const notes = await ex
    .selectFrom("InspectionWorkerNote")
    .select(["inspectionId", "workerId"])
    .where(
      "inspectionId",
      "in",
      before.map((row) => row.id),
    )
    .where("present", "=", 1)
    .execute();
  let best = { count: 0, workerId: null as string | null };
  for (const workerId of presentWorkerIds) {
    let count = 0;
    for (const row of before) {
      if (!notes.some((note) => note.inspectionId === row.id && note.workerId === workerId)) continue;
      if (row.belowThreshold !== 1) break;
      count += 1;
    }
    if (count > best.count) best = { count, workerId };
  }
  return best;
}

/** The task's words, in his language: the score, the weak points, the supervisor's notes. */
function taskDescription(
  total: number,
  points: readonly InspectionPoint[],
  marks: readonly CriterionMark[],
  supervisorNotes: string | null,
): string {
  const weak = weakCriteria(marks).map((code) => {
    const point = points.find((candidate) => candidate.code === code);
    const score = marks.find((mark) => mark.criterionCode === code)?.score;
    return `${point?.label ?? code} (${score} من 10)`;
  });
  return [
    `درجة الجودة ${total} من 100.`,
    weak.length > 0 ? `النقاط الضعيفة: ${weak.join("، ")}.` : null,
    supervisorNotes ? `ملاحظات المشرف: ${supervisorNotes}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export interface InspectionSaved {
  total: number;
  threshold: number;
  belowThreshold: boolean;
  /** The inspection's corrective task: made now, or the one it already had. */
  correctiveTask: { id: string; created: boolean } | null;
}

/**
 * The returned sheet, typed in one pass: the marks, the workers seen, the
 * level, the supervisor's tick and his proposed action, the notes. The
 * inspection is DONE with its score out of 100 (every point that applies must
 * have its mark). Under the threshold, or with «يحتاج إلى تصحيح: نعم», it
 * leaves one corrective task for its supervisor, due on the file's next visit
 * or `corrective.dueDays` from today, whichever comes first. Typed again, the
 * figures are corrected; the task already made stays as it is.
 */
export async function saveInspectionResult(
  ex: Executor,
  ctx: ServiceContext,
  input: { inspectionId: string; values: InspectionResultValues },
): Promise<InspectionSaved> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const parsed = inspectionResultSchema.safeParse(input.values);
  if (!parsed.success) throw new ServiceError("This inspection sheet cannot be saved as it is typed.");
  const values = parsed.data;
  const inspection = await inspectionOf(ex, input.inspectionId);
  if (inspection.status === "CANCELLED") throw new ServiceError("This inspection is cancelled.");
  const doneDate = localDate(values.doneDate);
  if (doneDate > ctx.today) throw new ServiceError("The inspection date cannot be after today.");

  const visit = values.visitId ? await visitOfFile(ex, inspection.fileId, values.visitId) : null;
  const supervisorId = blankToNull(values.supervisorEmployeeId);
  if (!supervisorId) throw new ServiceError("Name the supervisor who inspected.");
  await checkSupervisor(ex, supervisorId);

  // The points: the inspection's own lines, written now if the sheet was never printed.
  await freezePoints(ex, ctx, inspection);
  const points = await pointsOf(ex, inspection);
  const typed = new Map(values.marks.map((mark) => [mark.criterionCode, mark]));
  if (values.marks.some((mark) => !points.some((point) => point.code === mark.criterionCode))) {
    throw new ServiceError("This point is not on this inspection's sheet.");
  }
  const marks: CriterionMark[] = points.map((point) => {
    const mark = typed.get(point.code);
    return {
      criterionCode: point.code,
      weight: point.weight,
      score: mark && !mark.notApplicable ? markOf(mark.score) : null,
      notApplicable: mark?.notApplicable ?? false,
    };
  });
  const total = inspectionTotal(marks);
  if (total === null) throw new ServiceError("Give every point a mark from 0 to 10, or tick does not apply.");

  // The workers: the team of the visit inspected, and anyone noted before.
  const noted = await ex
    .selectFrom("InspectionWorkerNote")
    .selectAll()
    .where("inspectionId", "=", inspection.id)
    .execute();
  const team = visit ? ((await teamsOf(ex, [visit.id])).get(visit.id) ?? []) : [];
  const allowed = new Set([...team.map((member) => member.workerId), ...noted.map((note) => note.workerId)]);
  if (values.workers.some((worker) => !allowed.has(worker.workerId))) {
    throw new ServiceError("This worker is not on the visit.");
  }

  const threshold =
    inspection.status === "DONE" && inspection.thresholdUsed !== null
      ? inspection.thresholdUsed
      : await thresholdSetting(ex);
  const below = total < threshold;

  // The lines of the sheet.
  const lines = await ex.selectFrom("InspectionScore").selectAll().where("inspectionId", "=", inspection.id).execute();
  for (const line of lines) {
    const mark = typed.get(line.criterionCode);
    const notApplicable = mark?.notApplicable === true;
    const { set } = changedColumns(line, {
      score: mark && !notApplicable ? markOf(mark.score) : null,
      notApplicable: notApplicable ? 1 : 0,
      note: blankToNull(mark?.note),
    });
    if (Object.keys(set).length === 0) continue;
    await ex
      .updateTable("InspectionScore")
      .set({ ...set, updatedAt: ctx.now })
      .where("id", "=", line.id)
      .execute();
  }

  // The workers seen: one line each; a worker no longer listed is taken off.
  const listed = new Set(values.workers.map((worker) => worker.workerId));
  const gone = noted.filter((note) => !listed.has(note.workerId)).map((note) => note.id);
  if (gone.length > 0) await ex.deleteFrom("InspectionWorkerNote").where("id", "in", gone).execute();
  for (const worker of values.workers) {
    // The sheet's table is «العمال الحاضرين»: a line left without a tick is a worker present.
    const present = worker.present === false ? 0 : 1;
    const remark = blankToNull(worker.remark);
    const before = noted.find((note) => note.workerId === worker.workerId);
    if (before) {
      const { set } = changedColumns(before, { present, remark });
      if (Object.keys(set).length > 0) {
        await ex
          .updateTable("InspectionWorkerNote")
          .set({ ...set, updatedAt: ctx.now })
          .where("id", "=", before.id)
          .execute();
      }
    } else {
      await ex
        .insertInto("InspectionWorkerNote")
        .values({
          id: newId(),
          inspectionId: inspection.id,
          workerId: worker.workerId,
          present,
          remark,
          createdAt: ctx.now,
          updatedAt: ctx.now,
        })
        .execute();
    }
  }

  // The inspection itself.
  const supervisorNotes = blankToNull(values.supervisorNotes);
  const { set, changes } = changedColumns(inspection, {
    status: "DONE",
    visitId: visit?.id ?? null,
    supervisorEmployeeId: supervisorId,
    doneDate,
    doneAtTime: values.doneAtTime ? localTime(values.doneAtTime) : null,
    scoreTotal: total,
    thresholdUsed: threshold,
    belowThreshold: below ? 1 : 0,
    correctionNeeded: flag(values.correctionNeeded),
    overallLevel: values.overallLevel,
    recommendedAction: values.recommendedAction,
    supervisorNotes,
    clientRemark: blankToNull(values.clientRemark),
    enteredAt: inspection.enteredAt ?? ctx.now,
    enteredByUserId: inspection.enteredByUserId ?? ctx.userId,
  });
  if (changes) {
    await ex
      .updateTable("Inspection")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", inspection.id)
      .execute();
  }

  // One corrective task, the first time the inspection calls for one.
  let correctiveTask: InspectionSaved["correctiveTask"] = null;
  if (below || values.correctionNeeded === true) {
    const existing = await ex
      .selectFrom("CorrectiveTask")
      .select("id")
      .where("inspectionId", "=", inspection.id)
      .executeTakeFirst();
    if (existing) correctiveTask = { id: existing.id, created: false };
    else {
      const present = values.workers.filter((worker) => worker.present !== false).map((worker) => worker.workerId);
      const history = await earlierLowInARow(ex, inspection, doneDate, present);
      const next = await ex
        .selectFrom("Visit")
        .select("visitDate")
        .where("fileId", "=", inspection.fileId)
        .where("visitDate", ">", ctx.today)
        .where("status", "in", [...OPEN_STATUSES])
        .orderBy("visitDate")
        .executeTakeFirst();
      const dueDays = (await getSettings(ex, ["corrective.dueDays"]))["corrective.dueDays"];
      // The supervisor's tick asks for a correction whatever the score: the same rule then gives the date.
      const decision = correctiveTaskFor({
        total,
        marks,
        inspectionDate: ctx.today,
        nextVisitDate: next?.visitDate ?? null,
        earlierLowInARow: history.count,
        threshold: below ? threshold : total + 1,
        dueDays: Number.isSafeInteger(dueDays) && dueDays >= 0 ? dueDays : DEFAULT_CORRECTIVE_DUE_DAYS,
      });
      if (!decision) throw new Error("operations: an inspection calling for a correction gave no corrective task");
      const actionCode: CorrectiveAction = values.recommendedAction ?? decision.action;
      const aboutWorker = actionCode === "TRAIN_WORKER" || actionCode === "CHANGE_WORKER";
      const workerId = !aboutWorker
        ? null
        : history.count > 0
          ? history.workerId
          : present.length === 1
            ? present[0]
            : null;
      const task = await createCorrectiveTask(
        ex,
        ctx,
        {
          source: "INSPECTION",
          inspectionId: inspection.id,
          visitId: visit?.id ?? null,
          fileId: inspection.fileId,
          description: taskDescription(total, points, marks, supervisorNotes),
          action: actionCode,
          dueDate: decision.dueDate,
          assignedToEmployeeId: supervisorId,
          workerId,
        },
        { log: false },
      );
      correctiveTask = { id: task.id, created: true };
    }
  }

  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: inspection.status === "DONE" ? "UPDATE" : "STATUS_CHANGE",
    entity: "Inspection",
    entityId: inspection.id,
    entityLabel: inspection.number,
    changes: changes ?? undefined,
    context: {
      total,
      threshold,
      belowThreshold: below,
      workers: values.workers.map((worker) => worker.workerId),
      ...(correctiveTask?.created ? { correctiveTaskId: correctiveTask.id } : {}),
    },
  });
  return { total, threshold, belowThreshold: below, correctiveTask };
}

// ── Missed and cancelled ────────────────────────────────────────────────────

/** The supervisor did not go: the inspection stays on record as missed, with why. */
export async function markInspectionMissed(
  ex: Executor,
  ctx: ServiceContext,
  input: { inspectionId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const inspection = await inspectionOf(ex, input.inspectionId);
  if (inspection.status !== "PLANNED") throw new ServiceError("Only a planned inspection can be marked missed.");
  const reason = blankToNull(input.reason);
  if (!reason) throw new ServiceError("A reason is required.");
  await ex
    .updateTable("Inspection")
    .set({ status: "MISSED", updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", inspection.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    reason,
    entity: "Inspection",
    entityId: inspection.id,
    entityLabel: inspection.number,
    changes: { status: ["PLANNED", "MISSED"] },
  });
  return { id: inspection.id };
}

/** Called off, with the reason the user typed. A done inspection is a record and is not cancelled. */
export async function cancelInspection(
  ex: Executor,
  ctx: ServiceContext,
  input: { inspectionId: string; reason: string },
): Promise<{ id: string }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const inspection = await inspectionOf(ex, input.inspectionId);
  if (inspection.status === "DONE") throw new ServiceError("A done inspection cannot be cancelled.");
  if (inspection.status === "CANCELLED") throw new ServiceError("This inspection is cancelled.");
  const reason = blankToNull(input.reason);
  if (!reason) throw new ServiceError("A reason is required.");
  await ex
    .updateTable("Inspection")
    .set({ status: "CANCELLED", updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where("id", "=", inspection.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CANCEL",
    reason,
    entity: "Inspection",
    entityId: inspection.id,
    entityLabel: inspection.number,
    changes: { status: [inspection.status, "CANCELLED"] },
  });
  return { id: inspection.id };
}

/**
 * For the day-start job: an inspection still PLANNED `inspection.missedAfterDays`
 * days after its date is MISSED. Running it twice changes nothing.
 */
export async function markMissedInspections(
  ex: Executor,
  ctx: ServiceContext,
  input: { today: string },
): Promise<{ missed: number }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const days = (await getSettings(ex, ["inspection.missedAfterDays"]))["inspection.missedAfterDays"];
  const after = Number.isSafeInteger(days) && days >= 0 ? days : 7;
  const latest = localDate(dateOfDayNumber(dayNumber(input.today) - after));
  const late = await ex
    .selectFrom("Inspection")
    .select(["id", "number"])
    .where("status", "=", "PLANNED")
    .where("plannedDate", "<=", latest)
    .orderBy("plannedDate")
    .execute();
  if (late.length === 0) return { missed: 0 };
  await ex
    .updateTable("Inspection")
    .set({ status: "MISSED", updatedAt: ctx.now, updatedByUserId: ctx.userId })
    .where(
      "id",
      "in",
      late.map((row) => row.id),
    )
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "STATUS_CHANGE",
    entity: "Inspection",
    changes: { status: ["PLANNED", "MISSED"] },
    context: { missedAfterDays: after, inspections: late.map((row) => row.number) },
  });
  return { missed: late.length };
}

// ── Demo data ───────────────────────────────────────────────────────────────

const DEMO_GOOD_MARKS: Readonly<Record<string, number | "n/a">> = { LIFTS: "n/a", GLASS: 8, DUST: 8 };
const DEMO_LOW_MARKS: Readonly<Record<string, number | "n/a">> = {
  FLOORS: 7,
  STAIRS: 6,
  CORRIDORS: 7,
  LIFTS: "n/a",
  ENTRANCES: 8,
  WASTE: 9,
  INSTRUCTIONS: 7,
  APPEARANCE: 8,
  GLASS: 6,
  BATHROOMS: 7,
  ODOURS: 8,
  DUST: 6,
  EQUIPMENT: 8,
};

/**
 * Operations' demo inspections, through the services: the criteria, the plans
 * of the demo files four weeks ahead, one inspection left planned in the past
 * (missed), and two typed in on the last visits done: one above the
 * threshold, one under it with its corrective task. Run twice, it adds nothing.
 */
export async function demoInspections(ex: Executor, ctx: ServiceContext, _tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};
  await ensureInspectionCriteria(ex, ctx);
  const already = await ex.selectFrom("Inspection").select("id").where("planPeriod", "is", null).executeTakeFirst();
  if (already) return names;

  const planned = await planInspections(ex, ctx, { upTo: addDays(ctx.today, 28) });
  if (planned.inspections[0]) names.inspectionPlanned = planned.inspections[0].id;

  // The last visits before today with a team, done ones first.
  const recent = await ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .select(["Visit.id", "Visit.fileId", "Visit.visitDate", "Visit.status"])
    .where("Visit.visitDate", "<", ctx.today)
    .where("Visit.visitDate", ">=", localDate(addDays(ctx.today, -VISIT_CHOICE_DAYS)))
    .where("Visit.status", "!=", "CANCELLED")
    .where("File.stage", "=", "CONTRACTED")
    .where((eb) =>
      eb.exists(
        eb
          .selectFrom("VisitWorker")
          .select("VisitWorker.id")
          .whereRef("VisitWorker.visitId", "=", "Visit.id")
          .where("VisitWorker.seatStatus", "=", "ASSIGNED"),
      ),
    )
    .orderBy("Visit.visitDate", "desc")
    .orderBy("Visit.plannedStartTime", "desc")
    .execute();
  const ordered = [
    ...recent.filter((visit) => visit.status === "DONE"),
    ...recent.filter((visit) => visit.status !== "DONE"),
  ];
  const chosen = ordered.filter(
    (visit, index) => ordered.findIndex((other) => other.fileId === visit.fileId) === index,
  );
  const fallbackSupervisor = (await listEmployeeChoices(ex, ctx))[0]?.id ?? "";

  const typeIn = async (visit: (typeof chosen)[number], low: boolean) => {
    const made = await createInspection(ex, ctx, { fileId: visit.fileId, visitId: visit.id });
    const detail = await buildDetail(ex, made.id);
    await recordInspectionPrinted(ex, ctx, { inspectionId: made.id });
    const table = low ? DEMO_LOW_MARKS : DEMO_GOOD_MARKS;
    const saved = await saveInspectionResult(ex, ctx, {
      inspectionId: made.id,
      values: {
        visitId: visit.id,
        supervisorEmployeeId: detail.inspection.supervisorEmployeeId ?? fallbackSupervisor,
        doneDate: visit.visitDate,
        doneAtTime: low ? "10:30" : "11:15",
        marks: detail.points.map((point) => {
          const mark = table[point.code] ?? (low ? 8 : 9);
          return {
            criterionCode: point.code,
            score: mark === "n/a" ? "" : String(mark),
            notApplicable: mark === "n/a",
            note: low && (point.code === "STAIRS" || point.code === "GLASS") ? "غبار وبقع ظاهرة" : "",
          };
        }),
        workers: detail.workers.map((worker, index) => ({
          workerId: worker.workerId,
          present: true,
          remark: index === 0 ? (low ? "تحتاج إلى متابعة في تنظيف السلالم" : "ملتزمة بالتعليمات") : "",
        })),
        overallLevel: low ? "ACCEPTABLE" : "VERY_GOOD",
        correctionNeeded: low,
        recommendedAction: low ? "REDO_SERVICE" : null,
        supervisorNotes: low ? "يعاد تنظيف السلالم والزجاج في الزيارة القادمة." : "عمل منظم ونظيف.",
        clientRemark: low ? "" : "لا ملاحظات.",
      },
    });
    return { id: made.id, saved };
  };

  if (chosen[0]) names.inspectionDone = (await typeIn(chosen[0], false)).id;
  const lowVisit = chosen[1] ?? null;
  if (lowVisit) {
    const low = await typeIn(lowVisit, true);
    names.inspectionLow = low.id;
    if (low.saved.correctiveTask) names.correctiveTask = low.saved.correctiveTask.id;
  }

  // One left planned in the past: the day-start job marks it missed.
  const file = chosen[2] ?? chosen[0];
  if (file) {
    const missed = await createInspection(ex, ctx, {
      fileId: file.fileId,
      plannedDate: addDays(ctx.today, -9),
    });
    await markMissedInspections(ex, ctx, { today: ctx.today });
    names.inspectionMissed = missed.id;
  }
  return names;
}

export const planInspectionsAction = action(planInspections, { revalidate: [INSPECTIONS_PATH] });
export const createInspectionAction = action(createInspection, { revalidate: [INSPECTIONS_PATH] });
export const recordInspectionPrintedAction = action(recordInspectionPrinted, { revalidate: [INSPECTIONS_PATH] });
export const saveInspectionResultAction = action(saveInspectionResult, { revalidate: [INSPECTIONS_PATH] });
export const markInspectionMissedAction = action(markInspectionMissed, { revalidate: [INSPECTIONS_PATH] });
export const cancelInspectionAction = action(cancelInspection, { revalidate: [INSPECTIONS_PATH] });
export const getInspectionQuery = query(getInspection);
export const getInspectionSheetQuery = query(getInspectionSheet);
export const listInspectionsQuery = query(listInspections);
export const listInspectableFilesQuery = query(listInspectableFiles);
