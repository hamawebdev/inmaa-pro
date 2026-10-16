import { getSiteForOrder } from "@/features/clients/services/exports";
import { getSanctionStates } from "@/features/people/services/sanctions";
import { getHandOutsForVisit } from "@/features/stock/services/handouts";
import { UNIT_LABEL } from "@/features/stock/sheets/print-labels";
import { requireCapability, requireSection } from "@/lib/access/session";
import { phoneText } from "@/lib/text/phone";
import { logChange, logDisclose } from "@/lib/log";
import { action, query } from "@/lib/service/action";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { ServiceError } from "@/lib/service/errors";
import { getSetting } from "@/lib/settings";
import { staffName } from "@/lib/text/names";

import { endTimeOf } from "../rules/visit-dates";
import type { MissionOrderData, OrderHandout, OrderReturn, OrderTaskGroup, OrderWorker } from "../sheets/sheet-data";
import type {
  Bearer,
  Completion,
  Division,
  ForbiddenPlace,
  Ppe,
  ProblemKind,
  Sex,
  SignoffStatus,
  SiteInstruction,
  TaskFrequency,
  TeamAccess,
  WorkerRole,
} from "../validators/option-codes";
import { VISITS_PATH } from "./programme";
import { checklistOf, freezeChecklist, type ChecklistLine } from "./tasks";
import { readFileForScheduling, readSiteForOrder, staffSummaries } from "./upstream";

/**
 * The mission order of a visit (#11), from what is stored: the visit, its
 * team, the file's schedule fields, the site's office block and the visit's
 * tick lines. No amount, no client file: the order is for the worker.
 *
 * Printing it freezes the tick lines (the paper and the typing then agree) and
 * is logged, since the order names the team.
 */

async function visitOf(ex: Executor, visitId: string) {
  const visit = await ex.selectFrom("Visit").selectAll().where("id", "=", visitId).executeTakeFirst();
  if (!visit) throw new ServiceError("This visit does not exist.");
  return visit;
}

/** The workers named on the order: the seats still held, in the order they were given. */
async function orderTeam(ex: Executor, visitId: string) {
  const seats = await ex
    .selectFrom("VisitWorker")
    .innerJoin("StaffMember", "StaffMember.id", "VisitWorker.workerId")
    .select([
      "VisitWorker.id",
      "VisitWorker.workerId",
      "VisitWorker.role",
      "VisitWorker.seatStatus",
      "VisitWorker.arrivedTime",
      "VisitWorker.workStartTime",
      "VisitWorker.workEndTime",
      "VisitWorker.leftTime",
      "VisitWorker.lateReason",
      "VisitWorker.createdAt",
      "StaffMember.firstName",
      "StaffMember.lastName",
      "StaffMember.number",
      "StaffMember.sex",
    ])
    .where("VisitWorker.visitId", "=", visitId)
    .where("VisitWorker.seatStatus", "=", "ASSIGNED")
    .orderBy("VisitWorker.createdAt")
    .execute();
  return seats;
}

function groupsOf(lines: readonly ChecklistLine[]): OrderTaskGroup[] {
  const groups: { place: string | null; tasks: OrderTaskGroup["tasks"][number][] }[] = [];
  for (const line of lines) {
    if (line.kind !== "TASK" || line.frequency === "SPECIAL") continue;
    let group = groups.find((candidate) => candidate.place === line.groupLabel);
    if (!group) {
      group = { place: line.groupLabel, tasks: [] };
      groups.push(group);
    }
    group.tasks.push({
      label: line.label,
      frequency: (line.frequency ?? "DAILY") as TaskFrequency,
      carried: line.carriedFromItemId !== null,
      done: line.done,
    });
  }
  return groups;
}

async function returnedPart(
  ex: Executor,
  visitId: string,
  lines: readonly ChecklistLine[],
): Promise<OrderReturn | null> {
  const report = await ex.selectFrom("VisitReport").selectAll().where("visitId", "=", visitId).executeTakeFirst();
  if (!report) return null;
  const problems = await ex
    .selectFrom("ProblemReport")
    .select("kind")
    .where("visitId", "=", visitId)
    .where("reportedVia", "=", "ORDER")
    .execute();
  const yes = (value: number | null) => (value === null ? null : value === 1);
  return {
    departureChecks: lines.filter((line) => line.kind === "DEPARTURE").map((line) => line.done === true),
    problemOnSite: yes(report.problemOnSite),
    problemKinds: problems.map((problem) => problem.kind as ProblemKind),
    problemDetails: report.workerNotes,
    completion: (report.completion as Completion | null) ?? null,
    completionPercent: report.completionPercent,
    incompleteReason: report.incompleteReason,
    needsExtraVisit: yes(report.needsExtraVisit),
    needsSupervisor: yes(report.needsSupervisor),
    signoff: {
      status: (report.signoffStatus as SignoffStatus | null) ?? null,
      name: report.signoffName,
      role: report.signoffRole,
      date: report.signoffDate,
      notes: report.signoffNotes,
      wantsOtherService: yes(report.wantsOtherService),
      otherService: report.otherServiceText,
      ratings: {
        quality: report.ratingQuality,
        punctuality: report.ratingPunctuality,
        behaviour: report.ratingBehaviour,
        materials: report.ratingMaterials,
        overall: report.ratingOverall,
      },
      wouldRecommend: yes(report.wouldRecommend),
    },
  };
}

/** «المواد والمعدات المسلمة للعامل»: Money's hand-outs for the visit, items and quantities only. */
async function handoutsOf(ex: Executor, ctx: ServiceContext, visitId: string): Promise<OrderHandout[]> {
  const lines = await getHandOutsForVisit(ex, ctx, { visitId });
  return lines.map((line) => ({
    item: line.itemName,
    quantity: `${line.qty / 1000} ${UNIT_LABEL[line.unit]}`,
    condition: line.condition === "GOOD" || line.condition === "NEEDS_MAINTENANCE" ? line.condition : null,
  }));
}

/** «اليوم 2 من 3» for a job of several days. */
async function jobDayOf(ex: Executor, visit: { id: string; fileId: string; origin: string }) {
  if (visit.origin !== "ON_DEMAND") return null;
  const days = await ex
    .selectFrom("Visit")
    .select(["id"])
    .where("fileId", "=", visit.fileId)
    .where("origin", "=", "ON_DEMAND")
    .where("status", "!=", "CANCELLED")
    .orderBy("visitDate")
    .orderBy("plannedStartTime")
    .execute();
  const no = days.findIndex((day) => day.id === visit.id) + 1;
  return days.length > 1 && no > 0 ? { no, count: days.length } : null;
}

/**
 * The site's place as a `geo:` address for the QR on the order (#26), from
 * Clients' `getSiteForOrder`: never a web link. Null when the site has no
 * coordinates.
 */
async function siteQrOf(ex: Executor, ctx: ServiceContext, siteId: string, fileId: string): Promise<string | null> {
  const site = await getSiteForOrder(ex, ctx, { siteId, fileId });
  if (!site || site.latitude === null || site.longitude === null) return null;
  const degrees = (micro: number) => (micro / 1_000_000).toFixed(6);
  return `geo:${degrees(site.latitude)},${degrees(site.longitude)}`;
}

/**
 * A client «متوقف» or «معاقب» today (People's sanction on the client): his
 * visits stay, but each order prints only after the manager's release of that
 * visit (RULINGS item 12; `order.releaseSanctioned`). The file's own decision
 * would cover the sanction through People's `decisionCovers`, which People
 * does not export yet: until it does, every order of such a client needs the
 * release.
 */
export interface OrderHold {
  sanctionId: string;
  /** People's sanction state: SUSPENDED «متوقف» or PENALISED «معاقب». */
  state: string;
  reason: string;
  since: string;
  until: string | null;
  client: { id: string; name: string };
  /** The release of this order, when the manager gave it (`date` and `time` in the centre's time). */
  released: { at: string; date: string; time: string; byUserId: string | null } | null;
}

async function orderHoldOf(
  ex: Executor,
  ctx: ServiceContext,
  visit: { fileId: string; orderReleasedAt: string | null; orderReleasedByUserId: string | null },
): Promise<OrderHold | null> {
  const client = await ex
    .selectFrom("File")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select(["Client.id", "Client.name"])
    .where("File.id", "=", visit.fileId)
    .executeTakeFirst();
  if (!client) return null;
  const sanction = (await getSanctionStates(ex, ctx, { kind: "CLIENT", ids: [client.id] }))[client.id];
  if (!sanction) return null;
  return {
    sanctionId: sanction.sanctionId,
    state: sanction.state,
    reason: sanction.reason,
    since: sanction.since,
    until: sanction.until,
    client: { id: client.id, name: client.name },
    released: visit.orderReleasedAt
      ? { at: visit.orderReleasedAt, ...ctx.toLocal(visit.orderReleasedAt), byUserId: visit.orderReleasedByUserId }
      : null,
  };
}

/** Builds the order's picture. Shared by the print page and the print action. */
async function buildOrder(
  ex: Executor,
  ctx: ServiceContext,
  visit: Awaited<ReturnType<typeof visitOf>>,
  lines: readonly ChecklistLine[],
): Promise<MissionOrderData> {
  const file = await readFileForScheduling(ex, visit.fileId);
  if (!file) throw new Error(`operations: the file of visit ${visit.id} was not found`);
  const site = await readSiteForOrder(ex, { siteId: file.siteId, securityTicked: file.securityInstructions === true });
  const team = await orderTeam(ex, visit.id);
  const siteQr = (await getSetting(ex, "feature.siteQrOnOrder"))
    ? await siteQrOf(ex, ctx, file.siteId, visit.fileId)
    : null;
  const supervisor = (await staffSummaries(ex, ctx, [visit.supervisorEmployeeId])).get(
    visit.supervisorEmployeeId ?? "",
  );

  const workers: OrderWorker[] = team.map((seat) => ({
    name: staffName(seat),
    number: seat.number,
    role: (seat.role as WorkerRole | null) ?? null,
    sex: (seat.sex as Sex | null) ?? null,
    arrived: seat.arrivedTime,
    workStart: seat.workStartTime,
    workEnd: seat.workEndTime,
    left: seat.leftTime,
    lateReason: seat.lateReason,
  }));

  let dayRank: MissionOrderData["dayRank"] = null;
  if (visit.teamId && visit.dayOrder) {
    const sameDay = await ex
      .selectFrom("Visit")
      .select("id")
      .where("teamId", "=", visit.teamId)
      .where("visitDate", "=", visit.visitDate)
      .where("status", "!=", "CANCELLED")
      .execute();
    dayRank = { no: visit.dayOrder, count: sameDay.length };
  }

  return {
    division: file.division as Division,
    number: visit.number,
    issuedOn: ctx.today,
    visitDate: visit.visitDate,
    startTime: visit.plannedStartTime,
    endTime: endTimeOf({ startTime: visit.plannedStartTime, durationMin: visit.plannedDurationMin }),
    jobDay: await jobDayOf(ex, visit),
    dayRank,
    siteQr,
    site: {
      label: site?.commonName ?? null,
      address: site ? [site.address, site.floorAndDoor, site.district].filter(Boolean).join("، ") : null,
      commune: site?.communeName ?? null,
      landmark: site?.landmark ?? null,
      directions: site?.directions ?? null,
    },
    contact: {
      name: site?.personOnSite?.name ?? null,
      role: site?.personOnSite?.role ?? null,
      phone: site?.personOnSite?.phone ? phoneText(site.personOnSite.phone) : null,
      meetingPoint: site?.meetingPoint ?? null,
      receiver: site?.personOnSite?.name ?? null,
    },
    access: {
      ways: file.teamAccess as TeamAccess[],
      guardName: file.hasGuard ? file.guardName : null,
      guardPhone: file.hasGuard ? file.guardPhone : null,
    },
    team: workers,
    supervisor: {
      name: supervisor ? staffName(supervisor) : null,
      phone: supervisor?.phone ? phoneText(supervisor.phone) : null,
    },
    taskGroups: groupsOf(lines),
    specialTasks: lines
      .filter((line) => line.kind === "TASK" && line.frequency === "SPECIAL")
      .sort((a, b) => (a.priority ?? 9) - (b.priority ?? 9))
      .map((line) => line.label),
    areas: lines
      .filter((line) => line.kind === "AREA")
      .map((line) => ({ label: line.label, requiredToday: line.note, done: line.done })),
    forbidden: {
      places: (site?.forbiddenCodes ?? []) as ForbiddenPlace[],
      details: site?.forbiddenAreas ?? null,
    },
    instructions: {
      codes: (site?.instructionCodes ?? []) as SiteInstruction[],
      extra: site
        ? [site.specialInstructions, site.doNotTouch, site.valuables].filter(Boolean).join(" — ") || null
        : null,
      ppe: (site?.ppeCodes ?? []) as Ppe[],
      safetyNotes: site?.securityInstructionsText ?? null,
    },
    materialsBy: (file.materialsBearer as Bearer | null) ?? null,
    handouts: await handoutsOf(ex, ctx, visit.id),
    returned: await returnedPart(ex, visit.id, lines),
  };
}

/** The order of a visit as it would print now. Writes nothing. */
export async function getMissionOrder(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<MissionOrderData> {
  requireSection(ctx, "REQUESTS", "READ");
  const visit = await visitOf(ex, input.visitId);
  return buildOrder(ex, ctx, visit, await checklistOf(ex, visit));
}

/** Whether the order of a visit is held back because its client is sanctioned, and whether it was released. */
export async function getOrderHold(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<OrderHold | null> {
  requireSection(ctx, "REQUESTS", "READ");
  return orderHoldOf(ex, ctx, await visitOf(ex, input.visitId));
}

/**
 * The manager lets one order of a sanctioned client print (`order.releaseSanctioned`,
 * held by nobody but the manager by default), with the reason he typed; logged
 * as an OVERRIDE naming the client.
 */
export async function releaseSanctionedOrder(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string; reason: string },
): Promise<{ releasedAt: string }> {
  requireCapability(ctx, "order.releaseSanctioned");
  const visit = await visitOf(ex, input.visitId);
  if (visit.status === "CANCELLED") throw new ServiceError("This visit is cancelled.");
  const hold = await orderHoldOf(ex, ctx, visit);
  if (!hold) throw new ServiceError("This client is not suspended or penalised: the order prints without a release.");
  if (hold.released) return { releasedAt: hold.released.at };
  const reason = input.reason.trim();
  if (!reason) throw new ServiceError("Write why.");
  await ex
    .updateTable("Visit")
    .set({
      orderReleasedAt: ctx.now,
      orderReleasedByUserId: ctx.userId,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", visit.id)
    .execute();
  await logChange(ex, ctx, {
    owner: "OPERATIONS",
    action: "OVERRIDE",
    reason,
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    subject: { kind: "CLIENT", id: hold.client.id, label: hold.client.name },
    changes: { orderReleasedAt: [null, ctx.now] },
    context: { sanctionId: hold.sanctionId, sanctionState: hold.state },
  });
  return { releasedAt: ctx.now };
}

/**
 * The order went to the printer: its tick lines are frozen on the first print,
 * the print is counted and logged (it names the client and the team). The
 * order of a sanctioned client prints only once the manager released it.
 */
export async function recordOrderPrinted(
  ex: Executor,
  ctx: ServiceContext,
  input: { visitId: string },
): Promise<{ printCount: number }> {
  requireSection(ctx, "REQUESTS", "WRITE");
  const visit = await visitOf(ex, input.visitId);
  if (visit.status === "CANCELLED") throw new ServiceError("This visit is cancelled.");
  const hold = await orderHoldOf(ex, ctx, visit);
  if (hold && !hold.released) {
    throw new ServiceError(
      "This client is suspended or penalised: the order prints only after the manager releases it.",
    );
  }
  await freezeChecklist(ex, ctx, visit);
  const printCount = visit.orderPrintCount + 1;
  await ex
    .updateTable("Visit")
    .set({
      orderPrintedAt: ctx.now,
      orderPrintedByUserId: ctx.userId,
      orderPrintCount: printCount,
      updatedAt: ctx.now,
      updatedByUserId: ctx.userId,
    })
    .where("id", "=", visit.id)
    .execute();
  const team = await orderTeam(ex, visit.id);
  const client = await ex
    .selectFrom("File")
    .innerJoin("Client", "Client.id", "File.clientId")
    .select(["Client.id", "Client.name"])
    .where("File.id", "=", visit.fileId)
    .executeTakeFirst();
  // One disclosure per person the order names: the client (the person on site and his phone), then each worker.
  await logDisclose(ex, ctx, {
    owner: "OPERATIONS",
    action: "PRINT",
    disclosure: "PRINT",
    entity: "Visit",
    entityId: visit.id,
    entityLabel: visit.number,
    subject: client ? { kind: "CLIENT", id: client.id, label: client.name } : undefined,
    context: { sheet: "MISSION_ORDER", printCount, workers: team.map((seat) => seat.workerId) },
  });
  for (const seat of team) {
    await logDisclose(ex, ctx, {
      owner: "OPERATIONS",
      action: "PRINT",
      disclosure: "PRINT",
      entity: "Visit",
      entityId: visit.id,
      entityLabel: visit.number,
      subject: { kind: "WORKER", id: seat.workerId, label: seat.number },
      context: { sheet: "MISSION_ORDER", printCount },
    });
  }
  return { printCount };
}

export const getMissionOrderQuery = query(getMissionOrder);
export const getOrderHoldQuery = query(getOrderHold);
export const recordOrderPrintedAction = action(recordOrderPrinted, { revalidate: [VISITS_PATH] });
export const releaseSanctionedOrderAction = action(releaseSanctionedOrder, { revalidate: [VISITS_PATH] });
