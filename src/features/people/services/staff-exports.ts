import { isDate } from "@/features/people/rules/dates";
import {
  ABILITIES,
  WEEKDAYS,
  type Ability,
  type EngagementStatus,
  type JobPosition,
  type Sex,
  type StaffKind,
  type Weekday,
  type WorkerRole,
} from "@/features/people/validators/staff-codes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { localDate, type LocalDate } from "@/lib/units";

import { getSanctionStates, type SanctionStateOf } from "./sanctions";

/**
 * What People gives other owners to read about its people (CONTRACTS section
 * 3), so that nobody else reads `StaffMember` for these:
 *
 *  - `listSchedulableWorkers`: the cleaning workers as scheduling sees them,
 *    on a day: who is active, where they live and work, what they can do and
 *    when, whether they are under sanction or in a training session;
 *  - `getStaffSummary`: a name, a number and a post or role, for the labels
 *    of other owners' lists.
 *
 * Neither ever returns anything of `StaffConfidential`.
 */

/** The states in which a worker may be given seats. */
export const ACTIVE_STATUSES: ReadonlySet<string> = new Set<EngagementStatus>(["ON_TRIAL", "ACCEPTED"]);

export interface SchedulableWorker {
  id: string;
  number: string;
  firstName: string;
  lastName: string;
  fullNameLatin: string | null;
  sex: Sex;
  phone: string;
  zoneId: string | null;
  zoneName: string | null;
  residenceCommuneId: string | null;
  residenceCommuneName: string | null;
  role: WorkerRole | null;
  isReserve: boolean;
  weeklyCapacityMin: number;
  availableDays: Weekday[];
  abilities: Ability[];
  /** Codes of the `Skill` list: the services and machines she masters. */
  skills: string[];
  engagementStatus: EngagementStatus;
  /** The status in force on the day asked about, from her history. */
  activeOnDate: boolean;
  trainingCompletedDate: string | null;
  /** The days, from the day asked about, she is expected at a training session. */
  trainingDates: string[];
  /** «موقف / معاقب» on the day asked about. */
  sanction: SanctionStateOf | null;
  /** His article 12: authorised to take a client's money, since when, and on what paper. */
  canCollectCash: boolean;
  collectAuthFrom: string | null;
  collectAuthNote: string | null;
}

const parseCodes = <T extends string>(text: string | null, allowed: readonly T[]): T[] => {
  try {
    const parsed: unknown = text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? allowed.filter((code) => parsed.includes(code)) : [];
  } catch {
    return [];
  }
};

const parseList = (text: string | null): string[] => {
  try {
    const parsed: unknown = text ? JSON.parse(text) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
};

function dayOf(ctx: ServiceContext, date: string | undefined): LocalDate {
  if (date === undefined) return ctx.today;
  if (!isDate(date)) throw new ServiceError("Enter a valid date.");
  return localDate(date);
}

/**
 * The status in force on a day for each person: the latest STATUS row on or
 * before it (by date, then by when it was written). A person with no history
 * yet is taken at her current status.
 */
async function statusesOn(ex: Executor, day: LocalDate, ids: readonly string[]): Promise<Map<string, string | null>> {
  const statuses = new Map<string, string | null>();
  if (ids.length === 0) return statuses;
  const events = await ex
    .selectFrom("StaffEvent")
    .select(["staffId", "date", "toStatus", "createdAt"])
    .where("kind", "=", "STATUS")
    .where("staffId", "in", [...ids])
    .where("date", "<=", day)
    .orderBy("staffId")
    .orderBy("date")
    .orderBy("createdAt")
    .execute();
  for (const event of events) statuses.set(event.staffId, event.toStatus);
  return statuses;
}

/**
 * The cleaning workers as scheduling sees them, on `date` (today by default).
 *
 * Without `ids`: the workers active on that day (on trial or accepted, by
 * their history), in a zone when one is given, whatever their sanction: the
 * state is in the answer, and the scheduler decides. With `ids`: those
 * workers whatever their state (an order names a worker who has left since).
 */
export async function listSchedulableWorkers(
  ex: Executor,
  ctx: ServiceContext,
  input: { date?: string; zoneId?: string | null; ids?: readonly string[] } = {},
): Promise<SchedulableWorker[]> {
  const day = dayOf(ctx, input.date);
  if (input.ids && input.ids.length === 0) return [];
  let rows = ex
    .selectFrom("StaffMember as w")
    .leftJoin("Zone as z", "z.id", "w.zoneId")
    .leftJoin("Commune as c", "c.id", "w.residenceCommuneId")
    .select([
      "w.id",
      "w.number",
      "w.firstName",
      "w.lastName",
      "w.fullNameLatin",
      "w.sex",
      "w.phone",
      "w.zoneId",
      "z.name as zoneName",
      "w.residenceCommuneId",
      "c.nameAr as residenceCommuneName",
      "w.role",
      "w.isReserve",
      "w.weeklyCapacityMin",
      "w.availableDays",
      "w.abilities",
      "w.skillCodes",
      "w.engagementStatus",
      "w.trainingCompletedDate",
      "w.canCollectCash",
      "w.collectAuthFrom",
      "w.collectAuthNote",
      "w.registrationDate",
      "w.deletedAt",
    ])
    .where("w.kind", "=", "WORKER");
  if (input.ids) rows = rows.where("w.id", "in", [...new Set(input.ids)]);
  else rows = rows.where("w.deletedAt", "is", null).where("w.registrationDate", "<=", day);
  if (input.zoneId) rows = rows.where("w.zoneId", "=", input.zoneId);
  const found = await rows.orderBy("w.lastName").orderBy("w.firstName").execute();

  const ids = found.map((row) => row.id);
  const [statuses, sanctions, sessions] = await Promise.all([
    statusesOn(ex, day, ids),
    getSanctionStates(ex, ctx, { kind: "WORKER", ids, date: day }),
    ids.length
      ? ex
          .selectFrom("TrainingAttendance as a")
          .innerJoin("TrainingSession as s", "s.id", "a.sessionId")
          .select(["a.staffId", "s.date"])
          .where("a.staffId", "in", ids)
          .where("s.deletedAt", "is", null)
          .where("s.date", ">=", day)
          .orderBy("s.date")
          .execute()
      : Promise.resolve([]),
  ]);

  const workers = found.map((row) => {
    // Not registered yet on that day: nothing in force. Registered, with no history written: her status now.
    const inForce =
      row.registrationDate > day ? null : statuses.has(row.id) ? statuses.get(row.id) : row.engagementStatus;
    return {
      id: row.id,
      number: row.number,
      firstName: row.firstName,
      lastName: row.lastName,
      fullNameLatin: row.fullNameLatin,
      sex: row.sex as Sex,
      phone: row.phone,
      zoneId: row.zoneId,
      zoneName: row.zoneName,
      residenceCommuneId: row.residenceCommuneId,
      residenceCommuneName: row.residenceCommuneName,
      role: row.role as WorkerRole | null,
      isReserve: row.isReserve === 1,
      weeklyCapacityMin: row.weeklyCapacityMin,
      availableDays: parseCodes(row.availableDays, WEEKDAYS),
      abilities: parseCodes(row.abilities, ABILITIES),
      skills: parseList(row.skillCodes),
      engagementStatus: row.engagementStatus as EngagementStatus,
      activeOnDate: row.deletedAt === null && inForce !== null && inForce !== undefined && ACTIVE_STATUSES.has(inForce),
      trainingCompletedDate: row.trainingCompletedDate,
      trainingDates: [
        ...new Set(sessions.filter((session) => session.staffId === row.id).map((session) => session.date)),
      ],
      sanction: sanctions[row.id] ?? null,
      canCollectCash: row.canCollectCash === 1,
      collectAuthFrom: row.collectAuthFrom,
      collectAuthNote: row.collectAuthNote,
    };
  });
  return input.ids ? workers : workers.filter((worker) => worker.activeOnDate);
}

export interface StaffSummary {
  id: string;
  kind: StaffKind;
  number: string;
  firstName: string;
  lastName: string;
  /** «اللقب والاسم», as his forms write it: the surname first. */
  name: string;
  /** An employee's post. */
  jobPosition: JobPosition | null;
  /** A worker's «الصفة». */
  role: WorkerRole | null;
  sex: Sex;
  phone: string;
  /** In post, on trial or accepted, today. */
  active: boolean;
}

/**
 * A name, a number and a post or role for each of these people, for the
 * labels of other owners' lists (CONTRACTS section 3). People who do not exist
 * are left out; a person who left is in, and not active.
 */
export async function getStaffSummary(
  ex: Executor,
  _ctx: ServiceContext,
  input: { ids: readonly (string | null | undefined)[] },
): Promise<Record<string, StaffSummary>> {
  const wanted = [...new Set(input.ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return {};
  const rows = await ex
    .selectFrom("StaffMember")
    .select([
      "id",
      "kind",
      "number",
      "firstName",
      "lastName",
      "jobPosition",
      "role",
      "sex",
      "phone",
      "engagementStatus",
      "deletedAt",
    ])
    .where("id", "in", wanted)
    .execute();
  return Object.fromEntries(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        kind: row.kind as StaffKind,
        number: row.number,
        firstName: row.firstName,
        lastName: row.lastName,
        name: `${row.lastName} ${row.firstName}`,
        jobPosition: row.jobPosition as JobPosition | null,
        role: row.role as WorkerRole | null,
        sex: row.sex as Sex,
        phone: row.phone,
        active: row.deletedAt === null && ACTIVE_STATUSES.has(row.engagementStatus),
      },
    ]),
  );
}
