import { requireSection } from "@/lib/access/session";
import { newId } from "@/lib/db/rows";
import { logChange } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import { changedColumns } from "@/lib/service/changes";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { staffName } from "@/lib/text/names";
import { localDate, type LocalDate } from "@/lib/units";

import { addDays, isIsoDate } from "../rules/calendar";
import { VEHICLE_STATUSES, type VehicleStatus } from "../validators/option-codes";
import { OPEN_STATUSES } from "./programme";
import { readWorkers } from "./upstream";

/**
 * The centre's vehicles and teams, and each team's day in order (#46), on «برنامج العمل» (a tab of عمال
 * النظافة: its writes take the workers section, as the moves on the programme do). A team's day writes the
 * visit's team, its rank in the team's day and the vehicle, which the mission order and the supervisor's day
 * sheet print. It seats nobody: the team card of each visit stays the office's.
 */

export const TEAMS_PATH = "/dashboard/work-program";

const blank = (text: string | null | undefined) => text?.trim() || null;

// ── Vehicles ────────────────────────────────────────────────────────────────

export interface VehicleLine {
  id: string;
  label: string;
  plateNumber: string;
  kind: string | null;
  seats: number | null;
  zoneId: string | null;
  zoneName: string | null;
  status: VehicleStatus;
  insuranceExpiry: string | null;
  inspectionExpiry: string | null;
  note: string | null;
}

export async function listVehicles(ex: Executor, ctx: ServiceContext): Promise<VehicleLine[]> {
  requireSection(ctx, "WORKERS", "READ");
  const rows = await ex
    .selectFrom("Vehicle")
    .leftJoin("Zone", "Zone.id", "Vehicle.zoneId")
    .selectAll("Vehicle")
    .select("Zone.name as zoneName")
    .where("Vehicle.deletedAt", "is", null)
    .orderBy("Vehicle.label")
    .execute();
  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    plateNumber: row.plateNumber,
    kind: row.kind,
    seats: row.seats,
    zoneId: row.zoneId,
    zoneName: row.zoneName,
    status: row.status as VehicleStatus,
    insuranceExpiry: row.insuranceExpiry,
    inspectionExpiry: row.inspectionExpiry,
    note: row.note,
  }));
}

export interface SaveVehicleInput {
  id?: string | null;
  label: string;
  plateNumber: string;
  kind?: string | null;
  seats?: number | null;
  zoneId?: string | null;
  status: VehicleStatus;
  insuranceExpiry?: string | null;
  inspectionExpiry?: string | null;
  note?: string | null;
}

export async function saveVehicle(ex: Executor, ctx: ServiceContext, input: SaveVehicleInput): Promise<{ id: string }> {
  requireSection(ctx, "WORKERS", "WRITE");
  const label = input.label.trim();
  const plateNumber = input.plateNumber.trim();
  if (!label || !plateNumber) throw new ServiceError("Give the vehicle a name and its plate number.");
  if (!(VEHICLE_STATUSES as readonly string[]).includes(input.status))
    throw new ServiceError("Choose one of the options.");
  for (const date of [input.insuranceExpiry, input.inspectionExpiry]) {
    if (date && !isIsoDate(date)) throw new ServiceError("Enter a valid date.");
  }
  if (input.seats != null && (!Number.isSafeInteger(input.seats) || input.seats < 1)) {
    throw new ServiceError("The number of seats must be one or more.");
  }
  const clash = await ex
    .selectFrom("Vehicle")
    .select("id")
    .where("plateNumber", "=", plateNumber)
    .where("id", "!=", input.id ?? "")
    .executeTakeFirst();
  if (clash) throw new ServiceError("Another vehicle has this plate number.");
  const values = {
    label,
    plateNumber,
    kind: blank(input.kind),
    seats: input.seats ?? null,
    zoneId: input.zoneId || null,
    status: input.status,
    insuranceExpiry: input.insuranceExpiry ? localDate(input.insuranceExpiry) : null,
    inspectionExpiry: input.inspectionExpiry ? localDate(input.inspectionExpiry) : null,
    note: blank(input.note),
  };
  if (input.id) {
    const before = await ex
      .selectFrom("Vehicle")
      .selectAll()
      .where("id", "=", input.id)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!before) throw new ServiceError("This vehicle does not exist.");
    const { set, changes } = changedColumns(before, values);
    if (!changes) return { id: before.id };
    await ex
      .updateTable("Vehicle")
      .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
      .where("id", "=", before.id)
      .execute();
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "UPDATE",
      entity: "Vehicle",
      entityId: before.id,
      entityLabel: plateNumber,
      changes,
    });
    return { id: before.id };
  }
  const id = newId();
  await ex
    .insertInto("Vehicle")
    .values({
      id,
      ...values,
      createdAt: ctx.now,
      updatedAt: ctx.now,
      createdByUserId: ctx.userId,
      updatedByUserId: ctx.userId,
    })
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "CREATE",
    entity: "Vehicle",
    entityId: id,
    entityLabel: plateNumber,
  });
  return { id };
}

// ── Teams ───────────────────────────────────────────────────────────────────

export interface TeamLine {
  id: string;
  name: string;
  zoneId: string | null;
  zoneName: string | null;
  leader: { id: string; name: string } | null;
  defaultVehicle: { id: string; label: string; plateNumber: string } | null;
  members: Array<{ id: string; number: string; name: string }>;
  note: string | null;
}

export async function listTeams(ex: Executor, ctx: ServiceContext, input: { date?: string } = {}): Promise<TeamLine[]> {
  requireSection(ctx, "WORKERS", "READ");
  const date = input.date && isIsoDate(input.date) ? input.date : ctx.today;
  const teams = await ex
    .selectFrom("Team")
    .leftJoin("Zone", "Zone.id", "Team.zoneId")
    .leftJoin("Vehicle", "Vehicle.id", "Team.defaultVehicleId")
    .select([
      "Team.id",
      "Team.name",
      "Team.zoneId",
      "Team.leaderWorkerId",
      "Team.note",
      "Zone.name as zoneName",
      "Vehicle.id as vehicleId",
      "Vehicle.label as vehicleLabel",
      "Vehicle.plateNumber as vehiclePlate",
    ])
    .where("Team.deletedAt", "is", null)
    .where("Team.isActive", "=", 1)
    .orderBy("Team.name")
    .execute();
  if (teams.length === 0) return [];
  const members = await ex
    .selectFrom("TeamMember")
    .innerJoin("StaffMember", "StaffMember.id", "TeamMember.workerId")
    .select([
      "TeamMember.teamId",
      "StaffMember.id",
      "StaffMember.number",
      "StaffMember.firstName",
      "StaffMember.lastName",
    ])
    .where(
      "TeamMember.teamId",
      "in",
      teams.map((team) => team.id),
    )
    .where("TeamMember.fromDate", "<=", localDate(date))
    .where((eb) => eb.or([eb("TeamMember.toDate", "is", null), eb("TeamMember.toDate", ">=", localDate(date))]))
    .orderBy("StaffMember.lastName")
    .execute();
  return teams.map((team) => {
    const own = members
      .filter((member) => member.teamId === team.id)
      .map((member) => ({ id: member.id, number: member.number, name: staffName(member) }));
    const leader = own.find((member) => member.id === team.leaderWorkerId);
    return {
      id: team.id,
      name: team.name,
      zoneId: team.zoneId,
      zoneName: team.zoneName,
      leader: leader ? { id: leader.id, name: leader.name } : null,
      defaultVehicle:
        team.vehicleId && team.vehicleLabel && team.vehiclePlate
          ? { id: team.vehicleId, label: team.vehicleLabel, plateNumber: team.vehiclePlate }
          : null,
      members: own,
      note: team.note,
    };
  });
}

export interface SaveTeamInput {
  id?: string | null;
  name: string;
  zoneId?: string | null;
  defaultVehicleId?: string | null;
  leaderWorkerId?: string | null;
  memberIds: string[];
  note?: string | null;
}

/** A team and its members from today on: a member added starts today, one taken off ends yesterday. */
export async function saveTeam(ex: Executor, ctx: ServiceContext, input: SaveTeamInput): Promise<{ id: string }> {
  requireSection(ctx, "WORKERS", "WRITE");
  const name = input.name.trim();
  if (!name) throw new ServiceError("Give the team a name.");
  const memberIds = [...new Set(input.memberIds)];
  if (memberIds.length === 0) throw new ServiceError("A team has at least one worker.");
  const leaderWorkerId = input.leaderWorkerId || null;
  if (leaderWorkerId && !memberIds.includes(leaderWorkerId))
    throw new ServiceError("The team leader is one of its workers.");
  const workers = await ex
    .selectFrom("StaffMember")
    .select("id")
    .where("id", "in", memberIds)
    .where("kind", "=", "WORKER")
    .where("deletedAt", "is", null)
    .execute();
  if (workers.length !== memberIds.length) throw new ServiceError("This worker does not exist.");
  const values = {
    name,
    zoneId: input.zoneId || null,
    defaultVehicleId: input.defaultVehicleId || null,
    leaderWorkerId,
    note: blank(input.note),
  };
  const changes: Record<string, readonly [unknown, unknown]> = {};
  let id = input.id ?? null;
  if (id) {
    const before = await ex
      .selectFrom("Team")
      .selectAll()
      .where("id", "=", id)
      .where("deletedAt", "is", null)
      .executeTakeFirst();
    if (!before) throw new ServiceError("This team does not exist.");
    const { set, changes: teamChanges } = changedColumns(before, values);
    if (teamChanges) {
      await ex
        .updateTable("Team")
        .set({ ...set, updatedAt: ctx.now, updatedByUserId: ctx.userId })
        .where("id", "=", before.id)
        .execute();
      Object.assign(changes, teamChanges);
    }
  } else {
    id = newId();
    await ex
      .insertInto("Team")
      .values({
        id,
        ...values,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
    changes.name = [null, name];
  }

  const current = await ex
    .selectFrom("TeamMember")
    .select(["id", "workerId", "fromDate"])
    .where("teamId", "=", id)
    .where((eb) => eb.or([eb("toDate", "is", null), eb("toDate", ">=", ctx.today)]))
    .execute();
  for (const row of current) {
    if (memberIds.includes(row.workerId)) continue;
    if (row.fromDate >= ctx.today) {
      await ex.deleteFrom("TeamMember").where("id", "=", row.id).execute();
    } else {
      await ex
        .updateTable("TeamMember")
        .set({ toDate: localDate(addDays(ctx.today, -1)), updatedAt: ctx.now })
        .where("id", "=", row.id)
        .execute();
    }
    changes[`member.${row.workerId}`] = [true, false];
  }
  for (const workerId of memberIds) {
    if (current.some((row) => row.workerId === workerId)) continue;
    await ex
      .insertInto("TeamMember")
      .values({ id: newId(), teamId: id, workerId, fromDate: ctx.today, createdAt: ctx.now, updatedAt: ctx.now })
      .execute();
    changes[`member.${workerId}`] = [false, true];
  }
  if (Object.keys(changes).length > 0) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: input.id ? "UPDATE" : "CREATE",
      entity: "Team",
      entityId: id,
      entityLabel: name,
      changes,
    });
  }
  return { id };
}

/** The workers a team may take: those People lists as in service today. */
export async function listTeamCandidates(
  ex: Executor,
  ctx: ServiceContext,
): Promise<Array<{ id: string; number: string; name: string; zoneId: string | null }>> {
  requireSection(ctx, "WORKERS", "READ");
  const workers = await readWorkers(ex, ctx, { date: ctx.today });
  return workers
    .map((worker) => ({ id: worker.id, number: worker.number, name: staffName(worker), zoneId: worker.zoneId }))
    .sort((a, b) => a.name.localeCompare(b.name, "ar"));
}

// ── A team's day ────────────────────────────────────────────────────────────

export interface TeamDayVisit {
  id: string;
  number: string;
  startTime: string;
  durationMin: number;
  site: string;
  zoneId: string | null;
  zoneName: string | null;
  status: string;
  teamId: string | null;
  dayOrder: number | null;
  vehicleId: string | null;
}

/** The visits still to happen on a day (in one zone when asked), each with its team, rank and vehicle. */
export async function getTeamDay(
  ex: Executor,
  ctx: ServiceContext,
  input: { date: string; zoneId?: string | null },
): Promise<TeamDayVisit[]> {
  requireSection(ctx, "WORKERS", "READ");
  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  let rows = ex
    .selectFrom("Visit")
    .innerJoin("File", "File.id", "Visit.fileId")
    .innerJoin("Site", "Site.id", "File.siteId")
    .leftJoin("Zone", "Zone.id", "Visit.zoneId")
    .select([
      "Visit.id",
      "Visit.number",
      "Visit.plannedStartTime",
      "Visit.plannedDurationMin",
      "Visit.status",
      "Visit.zoneId",
      "Visit.teamId",
      "Visit.dayOrder",
      "Visit.vehicleId",
      "Site.commonName",
      "Site.address",
      "Zone.name as zoneName",
    ])
    .where("Visit.visitDate", "=", localDate(input.date))
    .where("Visit.status", "in", [...OPEN_STATUSES, "IN_PROGRESS", "DONE"]);
  if (input.zoneId) rows = rows.where("Visit.zoneId", "=", input.zoneId);
  const found = await rows.orderBy("Visit.dayOrder").orderBy("Visit.plannedStartTime").execute();
  return found.map((row) => ({
    id: row.id,
    number: row.number,
    startTime: row.plannedStartTime,
    durationMin: row.plannedDurationMin,
    site: row.commonName ?? row.address ?? "",
    zoneId: row.zoneId,
    zoneName: row.zoneName,
    status: row.status,
    teamId: row.teamId,
    dayOrder: row.dayOrder,
    vehicleId: row.vehicleId,
  }));
}

/**
 * A team's day in order: the visits given, in that order, take the team, their rank (1, 2…) and the vehicle
 * (the team's own unless another is named); the team's other visits of that day leave it. An order already
 * printed is marked changed, so the call list announces it.
 */
export async function setTeamDay(
  ex: Executor,
  ctx: ServiceContext,
  input: { date: string; teamId: string; visitIds: string[]; vehicleId?: string | null },
): Promise<{ visits: number }> {
  requireSection(ctx, "WORKERS", "WRITE");
  if (!isIsoDate(input.date)) throw new ServiceError("Enter a valid date.");
  const team = await ex
    .selectFrom("Team")
    .select(["id", "name", "defaultVehicleId"])
    .where("id", "=", input.teamId)
    .where("deletedAt", "is", null)
    .executeTakeFirst();
  if (!team) throw new ServiceError("This team does not exist.");
  const vehicleId = input.vehicleId === undefined ? team.defaultVehicleId : input.vehicleId || null;
  const date: LocalDate = localDate(input.date);
  const ids = [...new Set(input.visitIds)];
  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "number", "visitDate", "status", "teamId", "dayOrder", "vehicleId", "orderPrintedAt"])
    .where((eb) =>
      eb.or([
        eb("id", "in", ids.length > 0 ? ids : [""]),
        eb.and([eb("teamId", "=", team.id), eb("visitDate", "=", date)]),
      ]),
    )
    .execute();
  for (const id of ids) {
    const visit = visits.find((row) => row.id === id);
    if (!visit || visit.visitDate !== date) throw new ServiceError("This visit is not on that day.");
    if (visit.status === "CANCELLED" || visit.status === "POSTPONED")
      throw new ServiceError("This visit is cancelled.");
  }
  const changes: Record<string, readonly [unknown, unknown]> = {};
  for (const visit of visits) {
    const rank = ids.indexOf(visit.id);
    const next =
      rank === -1
        ? { teamId: null, dayOrder: null, vehicleId: null }
        : { teamId: team.id, dayOrder: rank + 1, vehicleId };
    const { set, changes: visitChanges } = changedColumns(visit, next);
    if (!visitChanges) continue;
    await ex
      .updateTable("Visit")
      .set({
        ...set,
        ...(visit.orderPrintedAt ? { planChangedAt: ctx.now } : {}),
        updatedAt: ctx.now,
        updatedByUserId: ctx.userId,
      })
      .where("id", "=", visit.id)
      .execute();
    for (const [field, pair] of Object.entries(visitChanges)) changes[`${visit.number}.${field}`] = pair;
  }
  if (Object.keys(changes).length > 0) {
    await logChange(ex, ctx, {
      owner: "OPERATIONS",
      action: "UPDATE",
      entity: "Team",
      entityId: team.id,
      entityLabel: team.name,
      changes,
      context: { date: input.date },
    });
  }
  return { visits: ids.length };
}

export const listVehiclesQuery = query(listVehicles);
export const listTeamsQuery = query(listTeams);
export const getTeamDayQuery = query(getTeamDay);
export const listTeamCandidatesQuery = query(listTeamCandidates);
export const saveVehicleAction = action(saveVehicle, { revalidate: [TEAMS_PATH, "/dashboard/visits"] });
export const saveTeamAction = action(saveTeam, { revalidate: [TEAMS_PATH, "/dashboard/visits"] });
export const setTeamDayAction = action(setTeamDay, { revalidate: [TEAMS_PATH, "/dashboard/visits"] });
