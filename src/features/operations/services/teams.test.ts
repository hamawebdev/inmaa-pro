import { afterEach, beforeEach, expect, it } from "vitest";

import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getMissionOrder } from "./mission-order";
import { getTeamDay, listTeams, listVehicles, saveTeam, saveVehicle, setTeamDay } from "./teams";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

it("registers vehicles and teams with their default vehicle, and orders a team's day (F-46)", async () => {
  const zone = await test.rows.insert("Zone", { name: "عين مليلة" });
  const { id: vehicleId } = await test.transact((ex, ctx) =>
    saveVehicle(ex, ctx, { label: "رونو كانغو", plateNumber: "01234-120-04", zoneId: zone.id, status: "ACTIVE" }),
  );
  await expect(
    test.transact((ex, ctx) => saveVehicle(ex, ctx, { label: "أخرى", plateNumber: "01234-120-04", status: "ACTIVE" })),
  ).rejects.toThrow("Another vehicle has this plate number.");
  expect(await test.transact((ex, ctx) => listVehicles(ex, ctx))).toEqual([
    expect.objectContaining({ id: vehicleId, zoneName: "عين مليلة", status: "ACTIVE" }),
  ]);

  const a = await test.rows.insert("StaffMember", { kind: "WORKER", firstName: "أمال", lastName: "بن علي" } as never);
  const b = await test.rows.insert("StaffMember", { kind: "WORKER", firstName: "نادية", lastName: "قاسمي" } as never);
  const { id: teamId } = await test.transact((ex, ctx) =>
    saveTeam(ex, ctx, {
      name: "فريق عين مليلة",
      zoneId: zone.id,
      defaultVehicleId: vehicleId,
      leaderWorkerId: a.id,
      memberIds: [a.id, b.id],
    }),
  );
  const [team] = await test.transact((ex, ctx) => listTeams(ex, ctx));
  expect(team).toMatchObject({ name: "فريق عين مليلة", leader: { id: a.id }, defaultVehicle: { id: vehicleId } });
  expect(team.members.map((member) => member.name)).toEqual(["بن علي أمال", "قاسمي نادية"]);

  const day = localDate("2026-10-14");
  const site = await test.rows.insert("Site", { zoneId: zone.id } as never);
  const file = await test.rows.insert("File", { siteId: site.id, clientId: site.clientId } as never);
  const late = await test.rows.insert("Visit", {
    fileId: file.id,
    visitDate: day,
    zoneId: zone.id,
    status: "CONFIRMED",
  } as never);
  const early = await test.rows.insert("Visit", {
    fileId: file.id,
    visitDate: day,
    zoneId: zone.id,
    status: "CONFIRMED",
  } as never);
  await test.transact((ex, ctx) => setTeamDay(ex, ctx, { date: "2026-10-14", teamId, visitIds: [early.id, late.id] }));
  const ordered = await test.transact((ex, ctx) => getTeamDay(ex, ctx, { date: "2026-10-14", zoneId: zone.id }));
  expect(ordered.map((visit) => [visit.id, visit.teamId, visit.dayOrder, visit.vehicleId])).toEqual([
    [early.id, teamId, 1, vehicleId],
    [late.id, teamId, 2, vehicleId],
  ]);
  // The order prints the team's day: «الزيارة 2 من 2».
  const order = await test.transact((ex, ctx) => getMissionOrder(ex, ctx, { visitId: late.id }));
  expect(order.dayRank).toEqual({ no: 2, count: 2 });

  // Taken off the team's day, a visit loses its team, rank and vehicle.
  await test.transact((ex, ctx) => setTeamDay(ex, ctx, { date: "2026-10-14", teamId, visitIds: [late.id] }));
  const after = await test.transact((ex, ctx) => getTeamDay(ex, ctx, { date: "2026-10-14" }));
  expect(after.find((visit) => visit.id === early.id)).toMatchObject({ teamId: null, dayOrder: null, vehicleId: null });

  await expect(
    test.transact(
      (ex, ctx) => setTeamDay(ex, ctx, { date: "2026-10-14", teamId, visitIds: [] }),
      await test.sessionFor("SUPERVISOR"),
    ),
  ).rejects.toThrow("You do not have permission to do this.");
});
