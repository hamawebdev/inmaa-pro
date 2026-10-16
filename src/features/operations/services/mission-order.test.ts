import { afterEach, beforeEach, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getMissionOrder, getOrderHold, recordOrderPrinted, releaseSanctionedOrder } from "./mission-order";

/**
 * The mission order of a sanctioned client (RULINGS item 12, audit ACC-1), the
 * site's QR (#26), and whom the print discloses (audit LOG-12).
 */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

async function visitWithTeam() {
  const site = await test.rows.insert("Site", {
    division: "ORGANISATION",
    commonName: "مكتب المحامي بن صالح",
    address: "حي 500 مسكن",
    latitude: 35_875_000,
    longitude: 7_113_000,
  });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "ORGANISATION",
    serviceType: "CONTRACT",
    formKind: "ORG_CONTRACT",
    stage: "CONTRACTED",
  } as never);
  const visit = await test.rows.insert("Visit", {
    fileId: file.id,
    siteId: site.id,
    visitDate: localDate("2026-10-14"),
    plannedStartTime: localTime("08:00"),
    status: "CONFIRMED",
  } as never);
  const workers = [];
  for (const firstName of ["أمال", "نادية"]) {
    const worker = await test.rows.insert("StaffMember", {
      kind: "WORKER",
      firstName,
      engagementStatus: "ACCEPTED",
    } as never);
    await test.rows.insert("VisitWorker", { visitId: visit.id, workerId: worker.id, seatStatus: "ASSIGNED" });
    workers.push(worker);
  }
  return { visit, clientId: site.clientId, workers };
}

it("holds the order of a suspended client until the manager releases it, with his reason", async () => {
  const { visit, clientId } = await visitWithTeam();
  await test.rows.insert("Sanction", {
    subjectKind: "CLIENT",
    clientId,
    state: "SUSPENDED",
    reason: "ديون غير مسددة",
    startDate: localDate("2026-10-01"),
  } as never);

  expect(await test.transact((ex, ctx) => getOrderHold(ex, ctx, { visitId: visit.id }))).toMatchObject({
    state: "SUSPENDED",
    client: { id: clientId },
    released: null,
  });
  await expect(test.transact((ex, ctx) => recordOrderPrinted(ex, ctx, { visitId: visit.id }))).rejects.toThrow(
    "This client is suspended or penalised: the order prints only after the manager releases it.",
  );
  // Operations writes the requests section but does not hold order.releaseSanctioned.
  await expect(
    test.transact(
      (ex, ctx) => releaseSanctionedOrder(ex, ctx, { visitId: visit.id, reason: "تنظيف عاجل متفق عليه" }),
      await test.sessionFor("OPERATIONS"),
    ),
  ).rejects.toThrow("You do not have permission to do this.");
  await expect(
    test.transact((ex, ctx) => releaseSanctionedOrder(ex, ctx, { visitId: visit.id, reason: " " })),
  ).rejects.toThrow("Write why.");

  await test.transact((ex, ctx) =>
    releaseSanctionedOrder(ex, ctx, { visitId: visit.id, reason: "تنظيف عاجل متفق عليه" }),
  );
  const released = await test.db
    .selectFrom("Visit")
    .select(["orderReleasedAt", "orderReleasedByUserId"])
    .where("id", "=", visit.id)
    .executeTakeFirstOrThrow();
  expect(released.orderReleasedAt).not.toBeNull();
  expect(released.orderReleasedByUserId).toBe(test.manager.userId);
  const override = await test.db
    .selectFrom("AuditLog")
    .selectAll()
    .where("action", "=", "OVERRIDE")
    .where("entityId", "=", visit.id)
    .executeTakeFirstOrThrow();
  expect(override).toMatchObject({ subjectKind: "CLIENT", subjectId: clientId, reason: "تنظيف عاجل متفق عليه" });

  const { printCount } = await test.transact((ex, ctx) => recordOrderPrinted(ex, ctx, { visitId: visit.id }));
  expect(printCount).toBe(1);
});

it("prints a client with no sanction at once, and names the client and each worker in the disclosure", async () => {
  const { visit, clientId, workers } = await visitWithTeam();
  expect(await test.transact((ex, ctx) => getOrderHold(ex, ctx, { visitId: visit.id }))).toBeNull();
  await test.transact((ex, ctx) => recordOrderPrinted(ex, ctx, { visitId: visit.id }));
  const entries = await test.db
    .selectFrom("AuditLog")
    .select(["subjectKind", "subjectId"])
    .where("operation", "=", "DISCLOSE")
    .where("entityId", "=", visit.id)
    .execute();
  expect(entries).toEqual(
    expect.arrayContaining([
      { subjectKind: "CLIENT", subjectId: clientId },
      ...workers.map((worker) => ({ subjectKind: "WORKER", subjectId: worker.id })),
    ]),
  );
  expect(entries).toHaveLength(3);
});

it("carries the site's place as a geo: address for the QR only when the setting is on", async () => {
  const { visit } = await visitWithTeam();
  const off = await test.transact((ex, ctx) => getMissionOrder(ex, ctx, { visitId: visit.id }));
  expect(off.siteQr).toBeNull();
  await test.transact((ex, ctx) => setSetting(ex, ctx, "feature.siteQrOnOrder", true));
  const on = await test.transact((ex, ctx) => getMissionOrder(ex, ctx, { visitId: visit.id }));
  expect(on.siteQr).toBe("geo:35.875000,7.113000");
});
