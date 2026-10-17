import { DEMO_FILES } from "@/features/clients/demo";
import { moveFileStage, registerFile } from "@/features/clients/services/files";
import { linkAccountToStaff } from "@/features/core/services/users";
import { setSanction } from "@/features/people/services/sanctions";
import { newId } from "@/lib/db/rows";
import type { Executor, ServiceContext } from "@/lib/service/context";
import { localDate } from "@/lib/units";
import type { DemoNames, DemoTools } from "@/testing/demo";

import { entryValuesOf } from "./components/visit-entry/visit-entry-data";
import { addDays, clockOf, minutesOf } from "./rules/calendar";
import { assignVisitWorker, listSeatCandidates } from "./services/assignment";
import { demoInspections } from "./services/inspections";
import { recordVisitCall } from "./services/calls";
import { callListVisits } from "./services/day-sheets";
import { recordOrderPrinted, releaseSanctionedOrder } from "./services/mission-order";
import { getTeamDay, saveTeam, saveVehicle, setTeamDay } from "./services/teams";
import { demoComplaints } from "./services/problem-reports";
import { assignZoneSupervisor } from "./services/supervisors";
import { generateFileVisits, OPEN_STATUSES } from "./services/programme";
import { getVisitEntry, reportArrival, saveReturnedOrder } from "./services/visit-entry";
import { postponeVisit } from "./services/visit-status";
import type { ReturnedOrderValues } from "./validators/returned-order";

/**
 * Operations' demo data, on top of Clients' files.
 *
 * Clients' demo takes its files to «متعاقد», and `file.contracted` has already
 * made their visits (events.ts). This adds what a week of work leaves behind:
 * teams where People's demo has workers to give, two orders returned and
 * signed off (one with the client's notes), today's first order printed and its
 * team's arrival phoned in. Everything goes through the services.
 */
export async function seedDemo(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};

  // A contracted file whose visits were not made (it reached «متعاقد» by another road) gets them now.
  const files = await ex
    .selectFrom("File")
    .select(["id"])
    .where("stage", "=", "CONTRACTED")
    .where("closedAt", "is", null)
    .where("deletedAt", "is", null)
    .orderBy("createdAt")
    .execute();
  for (const file of files) await generateFileVisits(ex, ctx, file.id);

  // The zones' supervisor (People's demo employee), so the orders and the supervisor's day sheet name one.
  const supervisorId = tools.names.people?.employeeSupervisor;
  if (supervisorId) {
    for (const zoneId of [
      tools.names.core?.zoneOumElBouaghi,
      tools.names.core?.zoneAinBeida,
      tools.names.core?.zoneAinMlila,
    ]) {
      if (!zoneId) continue;
      await assignZoneSupervisor(ex, ctx, {
        zoneId,
        supervisorEmployeeId: supervisorId,
        fromDate: addDays(ctx.today, -14) as typeof ctx.today,
      });
    }
    names.supervisor = supervisorId;
    // The demo «supervisor» account is his: the home's day board opens on his zones (F-36b).
    const account = tools.names.core?.supervisor;
    if (account) {
      const linked = await ex.selectFrom("User").select("staffMemberId").where("id", "=", account).executeTakeFirst();
      if (linked && !linked.staffMemberId) {
        await linkAccountToStaff(ex, ctx, { userId: account, staffMemberId: supervisorId });
      }
    }
  }

  const visits = await ex
    .selectFrom("Visit")
    .select(["id", "fileId", "visitDate", "plannedStartTime", "plannedDurationMin", "workersNeeded"])
    .where("status", "in", [...OPEN_STATUSES])
    .where("visitDate", ">=", addDays(ctx.today, -7) as typeof ctx.today)
    .where("visitDate", "<=", addDays(ctx.today, 7) as typeof ctx.today)
    .orderBy("visitDate")
    .orderBy("plannedStartTime")
    .orderBy("number")
    .execute();
  if (visits.length === 0) return names;
  names.fileWithVisits = visits[0].fileId;

  // Teams: the first workers the rules let through, visit by visit. Without People's workers, seats stay open.
  // Today's second visit is left a seat short, so the seat picker has a seat to fill.
  const shortVisitId = visits.filter((visit) => visit.visitDate === ctx.today)[1]?.id ?? null;
  for (const visit of visits) {
    const candidates = await listSeatCandidates(ex, ctx, { visitId: visit.id });
    const free = candidates
      .filter(
        (candidate) =>
          !candidate.sanctioned && candidate.worstLevel !== "REFUSED" && candidate.worstLevel !== "NEEDS_MANAGER",
      )
      .slice(0, visit.id === shortVisitId ? Math.max(0, visit.workersNeeded - 1) : visit.workersNeeded);
    for (const candidate of free) await assignVisitWorker(ex, ctx, { visitId: visit.id, workerId: candidate.id });
  }

  const past = visits.filter((visit) => visit.visitDate < ctx.today);
  const today = visits.filter((visit) => visit.visitDate === ctx.today);
  const coming = visits.filter((visit) => visit.visitDate > ctx.today);

  // Two orders returned and signed off: the last two visits before today.
  const returned = past.slice(-2);
  for (const [index, visit] of returned.entries()) {
    // Printed the morning of the visit, typed in after the team came back.
    const morning = tools.at(`${visit.visitDate}T06:30:00.000Z`);
    await recordOrderPrinted(ex, morning, { visitId: visit.id });
    const afternoon = tools.at(`${visit.visitDate}T15:00:00.000Z`);
    const entry = await getVisitEntry(ex, afternoon, { visitId: visit.id });
    const withNotes = index === returned.length - 1 && returned.length > 1;
    await saveReturnedOrder(ex, afternoon, {
      visitId: visit.id,
      values: returnedSheet(entryValuesOf(entry, visit.visitDate), visit, withNotes),
    });
    names[withNotes ? "visitReturnedWithNotes" : "visitReturned"] = visit.id;
  }

  // Today: the first order is printed and its team's arrival was phoned in; the next one waits.
  if (today[0]) {
    await recordOrderPrinted(ex, ctx, { visitId: today[0].id });
    await reportArrival(ex, ctx, { visitId: today[0].id, via: "PHONE_SUPERVISOR" });
    names.visitInProgress = today[0].id;
  }
  if (today[1]) names.visitToday = today[1].id;
  Object.assign(names, await demoInspections(ex, ctx, tools));
  Object.assign(names, await demoComplaints(ex, ctx, tools));
  if (coming[0]) names.visitTomorrow = coming[0].id;
  // A coming visit postponed at the client's request, with its make-up visit two days later.
  const toPostpone = coming.find((visit) => visit.visitDate > addDays(ctx.today, 1));
  if (toPostpone) {
    const { makeupVisitId } = await postponeVisit(ex, ctx, {
      visitId: toPostpone.id,
      reason: "CLIENT_REQUEST",
      note: "العميل مسافر هذا الأسبوع",
      newDate: addDays(toPostpone.visitDate, 2) as typeof ctx.today,
    });
    names.visitPostponed = toPostpone.id;
    if (makeupVisitId) names.visitMakeup = makeupVisitId;
  }
  Object.assign(names, await demoSixVisitContract(ex, ctx, tools));
  Object.assign(names, await demoTeamsAndCalls(ex, ctx, tools));
  return names;
}

/**
 * Two vehicles, one team of عين البيضاء with its van, and today's visits of that zone in the team's order (#46);
 * tomorrow's first call made and the client informed (#16). Run twice, it adds nothing.
 */
async function demoTeamsAndCalls(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};
  const zoneId = tools.names.core?.zoneAinBeida;
  const members = [tools.names.people?.workerSamira, tools.names.people?.workerSenior].filter((id): id is string =>
    Boolean(id),
  );
  if (!zoneId || members.length < 2) return names;
  if (await ex.selectFrom("Vehicle").select("id").executeTakeFirst()) return names;
  const van = await saveVehicle(ex, ctx, {
    label: "رونو ماستر",
    plateNumber: "04512-118-04",
    kind: "شاحنة صغيرة",
    seats: 3,
    zoneId,
    status: "ACTIVE",
    insuranceExpiry: "2027-03-31",
    inspectionExpiry: "2027-01-15",
  });
  await saveVehicle(ex, ctx, {
    label: "سيتروان بيرلينغو",
    plateNumber: "07730-121-04",
    seats: 2,
    status: "MAINTENANCE",
  });
  const team = await saveTeam(ex, ctx, {
    name: "فريق عين البيضاء",
    zoneId,
    defaultVehicleId: van.id,
    leaderWorkerId: members[0],
    memberIds: members,
  });
  names.team = team.id;
  names.vehicle = van.id;
  const today = await getTeamDay(ex, ctx, { date: ctx.today, zoneId });
  const open = today.filter((visit) => visit.status !== "DONE").map((visit) => visit.id);
  if (open.length > 0) await setTeamDay(ex, ctx, { date: ctx.today, teamId: team.id, visitIds: open });

  const tomorrow = await callListVisits(ex, localDate(addDays(ctx.today, 1)));
  if (tomorrow[0]) {
    await recordVisitCall(ex, ctx, {
      visitId: tomorrow[0].id,
      purpose: tomorrow[0].changed ? "REPLACEMENT_NOTICE" : "REMINDER",
      result: "INFORMED",
      note: "سيكون الحارس في الانتظار",
    });
    names.visitCalled = tomorrow[0].id;
  }
  return names;
}

/**
 * One contract of six visits a week (Saturday to Thursday, 15:00 to 17:00, two workers), so that the rotating
 * rest day can be seen (audit LAB-4): each member has one RESTING seat a week, to be replaced. Its client is then
 * suspended (People's sanction), so that its orders are held for the manager's release (audit ACC-1): one is
 * released, the next is not. Registered through Clients' services, the standing team written in this folder's
 * own table. Run twice, it adds nothing.
 */
async function demoSixVisitContract(ex: Executor, ctx: ServiceContext, tools: DemoTools): Promise<DemoNames> {
  const names: DemoNames = {};
  const org = DEMO_FILES.find((file) => file.name === "orgContract");
  const members = [tools.names.people?.workerLeader, tools.names.people?.workerDaily].filter((id): id is string =>
    Boolean(id),
  );
  if (!org || members.length < 2) return names;
  const already = await ex
    .selectFrom("Site")
    .select("id")
    .where("commonName", "=", "مقر شركة النخيل")
    .executeTakeFirst();
  if (already) return names;

  const registered = await registerFile(ex, tools.at("2026-10-05T09:00:00.000Z"), {
    ...org.input,
    values: {
      ...org.input.values,
      clientName: "شركة النخيل للخدمات",
      commonName: "مقر شركة النخيل",
      phone: "0661 40 50 60",
      visitsPerWeek: 6,
      executionDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
      period: "EVENING",
      periodFrom: "15:00",
      periodTo: "17:00",
      arrivalTime: "15:00",
      departureTime: "17:00",
      startDate: "2026-10-10",
      endDate: "2026-12-31",
      workersCount: 2,
    },
    siteOffice: {
      receiverName: "بوشامة سليم",
      receiverRole: "مسؤول الوسائل العامة",
      receiverPhone: "0661 40 50 61",
      allowedDays: ["SAT", "SUN", "MON", "TUE", "WED", "THU"],
      allowedFrom: "14:30",
      allowedTo: "18:00",
    },
  });
  for (const [sortOrder, workerId] of members.entries()) {
    await ex
      .insertInto("FileAssignment")
      .values({
        id: newId(),
        fileId: registered.fileId,
        workerId,
        role: sortOrder === 0 ? "LEADER" : "MEMBER",
        validFrom: localDate("2026-10-10"),
        sortOrder,
        createdAt: ctx.now,
        updatedAt: ctx.now,
        createdByUserId: ctx.userId,
        updatedByUserId: ctx.userId,
      })
      .execute();
  }
  await moveFileStage(ex, tools.at("2026-10-07T10:00:00.000Z"), { fileId: registered.fileId, to: "QUOTE" });
  await moveFileStage(ex, tools.at("2026-10-08T10:00:00.000Z"), { fileId: registered.fileId, to: "CONTRACTED" });
  names.sixVisitFile = registered.fileId;
  names.sixVisitClient = registered.clientId;

  // Suspended from today: its orders wait for the manager. Tomorrow's is released, the day after's is not.
  await setSanction(ex, ctx, {
    subjectKind: "CLIENT",
    subjectId: registered.clientId,
    state: "SUSPENDED",
    reason: "مستحقات شهرين غير مسددة",
    startDate: ctx.today,
  });
  const coming = await ex
    .selectFrom("Visit")
    .select("id")
    .where("fileId", "=", registered.fileId)
    .where("visitDate", ">", ctx.today)
    .where("status", "in", [...OPEN_STATUSES])
    .orderBy("visitDate")
    .limit(2)
    .execute();
  if (coming[0]) {
    await releaseSanctionedOrder(ex, ctx, {
      visitId: coming[0].id,
      reason: "اتفاق مع العميل على التسديد هذا الأسبوع",
    });
    names.orderReleased = coming[0].id;
  }
  if (coming[1]) names.orderHeld = coming[1].id;
  return names;
}

/** A sheet as it comes back: everyone on time, everything ticked, the client satisfied (or satisfied with notes). */
function returnedSheet(
  blank: ReturnedOrderValues,
  visit: { plannedStartTime: string; plannedDurationMin: number; visitDate: string },
  withNotes: boolean,
): ReturnedOrderValues {
  const start = minutesOf(visit.plannedStartTime);
  const end = start + visit.plannedDurationMin;
  return {
    ...blank,
    returnedDate: visit.visitDate,
    workers: blank.workers.map((worker, index) => ({
      ...worker,
      attended: true,
      arrivedTime: clockOf(start + (index === 0 && withNotes ? 10 : -5)),
      workStartTime: clockOf(start + (index === 0 && withNotes ? 15 : 0)),
      workEndTime: clockOf(end),
      leftTime: clockOf(end + 10),
      arrivalInitialled: true,
      departureInitialled: true,
      lateReason: index === 0 && withNotes ? "زحمة في الطريق" : "",
    })),
    checklist: blank.checklist.map((line, index) => ({ ...line, done: !(withNotes && index === 1) })),
    problemOnSite: withNotes,
    problemKinds: withNotes ? ["AREA_UNAVAILABLE"] : [],
    problemDetails: withNotes ? "مكان واحد كان مغلقاً ولم يتوفر المفتاح." : "",
    completion: withNotes ? "PARTIAL" : "FULL",
    completionPercent: withNotes ? 90 : 100,
    incompleteReason: withNotes ? "مكان مغلق ولم يتوفر المفتاح" : "",
    // The order with notes asks for an extra visit: a proposal waits on File › الزيارات.
    needsExtraVisit: withNotes,
    needsSupervisor: false,
    signoffStatus: withNotes ? "ACCEPTED_WITH_NOTES" : "ACCEPTED",
    signoffName: "المسؤول في الموقع",
    signoffRole: "",
    signoffDate: visit.visitDate,
    signoffNotes: withNotes ? "العمل جيد. يبقى المكان المغلق للمرة القادمة." : "",
    wantsOtherService: false,
    ratings: withNotes
      ? { quality: 4, punctuality: 3, behaviour: 5, materials: 4, overall: 4 }
      : { quality: 5, punctuality: 5, behaviour: 5, materials: 4, overall: 5 },
    wouldRecommend: true,
    signedOnPaper: true,
    workerSigned: true,
  };
}
