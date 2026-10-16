import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emit } from "@/lib/events";
import { localDate, localTime } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getCallList, getSupervisorDaySheet, nextWorkingDay, recordDaySheetPrinted } from "./day-sheets";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** A zone with its supervisor, and a contracted file there whose visits are generated. */
async function arrange(over: Record<string, unknown> = {}) {
  const zone = await test.rows.insert("Zone", { name: "عين البيضاء" });
  const supervisor = await test.rows.insert("StaffMember", {
    kind: "EMPLOYEE",
    firstName: "سميرة",
    lastName: "حداد",
  } as never);
  await test.rows.insert("SupervisorAssignment", {
    supervisorEmployeeId: supervisor.id,
    zoneId: zone.id,
    fromDate: localDate("2026-01-01"),
  });
  const site = await test.rows.insert("Site", { division: "BUILDING", zoneId: zone.id, commonName: "عمارة النور" });
  const file = await test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "BUILDING",
    serviceType: "CONTRACT",
    formKind: "BUILDING_CONTRACT",
    stage: "CONTRACTED",
    executionDays: JSON.stringify(["SUN", "TUE"]),
    period: "MORNING",
    startDate: localDate("2026-10-13"),
    endDate: localDate("2026-11-30"),
    workersCount: 1,
    ...over,
  } as never);
  const worker = await test.rows.insert("StaffMember", {
    firstName: "كريم",
    lastName: "بوزيد",
    phone: "0661203142",
    role: "CLEANER",
    engagementStatus: "ACCEPTED",
  } as never);
  await test.rows.insert("FileAssignment", {
    fileId: file.id,
    workerId: worker.id,
    role: "LEADER",
    validFrom: localDate("2026-10-01"),
    sortOrder: 1,
  });
  await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: file.id }));
  return { supervisor, file, worker, zone };
}

describe("a supervisor's day sheet", () => {
  it("lists the day's visits of his zone with the team and their phones", async () => {
    const { supervisor } = await arrange();
    const sheet = await test.transact((ex, ctx) =>
      getSupervisorDaySheet(ex, ctx, { supervisorId: supervisor.id, date: localDate("2026-10-13") }),
    );
    expect(sheet).toMatchObject({
      supervisorName: "حداد سميرة",
      date: "2026-10-13",
      zones: ["عين البيضاء"],
      workerPhones: [{ name: "بوزيد كريم", phone: "0661 20 31 42" }],
    });
    expect(sheet.visits).toHaveLength(1);
    expect(sheet.visits[0]).toMatchObject({
      startTime: "08:00",
      endTime: "12:00",
      site: "عمارة النور",
      team: ["بوزيد كريم"],
    });
  });
});

describe("the client call list", () => {
  it("calls about the first visit of a contract and not about the next ones", async () => {
    await arrange();
    const first = await test.transact((ex, ctx) => getCallList(ex, ctx, { visitsDate: localDate("2026-10-13") }));
    expect(first.rows).toHaveLength(1);
    expect(first.rows[0]).toMatchObject({ startTime: "08:00", workersCount: 1, supervisorName: "حداد سميرة" });
    expect(first.callDate).toBe("2026-10-12");
    const next = await test.transact((ex, ctx) => getCallList(ex, ctx, { visitsDate: localDate("2026-10-18") }));
    expect(next.rows).toHaveLength(0);
  });

  it("calls about every visit of an on-demand job", async () => {
    await arrange({
      serviceType: "ON_DEMAND",
      formKind: "ORG_REQUEST",
      startDate: localDate("2026-10-13"),
      endDate: localDate("2026-10-14"),
      executionDays: JSON.stringify([]),
      arrivalTime: localTime("09:00"),
    });
    const second = await test.transact((ex, ctx) => getCallList(ex, ctx, { visitsDate: localDate("2026-10-14") }));
    expect(second.rows.map((row) => row.startTime)).toEqual(["09:00"]);
  });

  it("skips the rest day: after Thursday comes Saturday", async () => {
    const day = await test.transact((ex) => nextWorkingDay(ex, localDate("2026-10-15")));
    expect(day).toBe("2026-10-17");
  });
});

describe("printing a day's sheets", () => {
  const disclosures = () =>
    test.db
      .selectFrom("AuditLog")
      .select(["subjectKind", "subjectId", "entityId"])
      .where("operation", "=", "DISCLOSE")
      .orderBy("chainSeq")
      .execute();

  it("names the supervisor, each client and each worker of his day sheet (LOG-12)", async () => {
    const { supervisor, file, worker } = await arrange();
    await test.transact((ex, ctx) =>
      recordDaySheetPrinted(ex, ctx, {
        sheet: "SUPERVISOR_DAY",
        date: localDate("2026-10-13"),
        supervisorId: supervisor.id,
      }),
    );
    expect(await disclosures()).toEqual([
      expect.objectContaining({ subjectKind: "EMPLOYEE", subjectId: supervisor.id }),
      expect.objectContaining({ subjectKind: "CLIENT", subjectId: file.clientId }),
      expect.objectContaining({ subjectKind: "WORKER", subjectId: worker.id }),
    ]);
  });

  it("names each client the call list calls (LOG-12)", async () => {
    const { file } = await arrange();
    await test.transact((ex, ctx) =>
      recordDaySheetPrinted(ex, ctx, { sheet: "CALL_LIST", date: localDate("2026-10-13") }),
    );
    expect(await disclosures()).toEqual([expect.objectContaining({ subjectKind: "CLIENT", subjectId: file.clientId })]);
  });
});
