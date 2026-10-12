import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues, SAMPLE_WORKER_VALUES } from "@/features/people/forms/worker-values";
import { emptyEmployeeValues } from "@/features/people/validators/employee";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { registerEmployee } from "./employees";
import { liftSanction, setSanction } from "./sanctions";
import { getStaffSummary, listSchedulableWorkers } from "./staff-exports";
import { recordWorkerLeaving, registerWorker, type RegisterWorkerInput } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const KAMEL: RegisterWorkerInput = {
  ...emptyWorkerValues("2026-10-01"),
  sex: "MALE",
  lastName: "سعدي",
  firstName: "كمال",
  birthDate: "1990-05-02",
  phone: "0770 11 22 33",
  residenceCommuneId: "commune-0402",
  role: "TEAM_LEADER",
  hiringDecision: "ACCEPTED",
  issuedDate: "2026-10-01",
  abilities: ["CARRY_EQUIPMENT", "CLIMB_STAIRS"],
  availableDays: ["SAT", "SUN", "MON"],
  weeklyCapacityHours: "36",
};

const register = (input: RegisterWorkerInput) => test.transact((ex, ctx) => registerWorker(ex, ctx, input));
const schedulable = (input: Parameters<typeof listSchedulableWorkers>[2] = {}) =>
  test.transact((ex, ctx) => listSchedulableWorkers(ex, ctx, input));

describe("listSchedulableWorkers", () => {
  it("gives scheduling what it needs of each active worker, and nothing restricted", async () => {
    const kamel = await register(KAMEL);
    const [worker] = await schedulable();
    expect(worker).toEqual({
      id: kamel.id,
      number: "1/H",
      firstName: "كمال",
      lastName: "سعدي",
      fullNameLatin: null,
      sex: "MALE",
      phone: "0770112233",
      zoneId: expect.any(String),
      zoneName: "عين البيضاء",
      residenceCommuneId: "commune-0402",
      residenceCommuneName: "عين البيضاء",
      role: "TEAM_LEADER",
      isReserve: false,
      weeklyCapacityMin: 2160,
      availableDays: ["SAT", "SUN", "MON"],
      abilities: ["CARRY_EQUIPMENT", "CLIMB_STAIRS"],
      skills: [],
      engagementStatus: "ACCEPTED",
      activeOnDate: true,
      trainingCompletedDate: null,
      trainingDates: [],
      sanction: null,
      canCollectCash: false,
      collectAuthFrom: null,
      collectAuthNote: null,
    });
    // Her health answers and her score are nowhere in it.
    const samira = await register(SAMPLE_WORKER_VALUES);
    const text = JSON.stringify(await schedulable({ ids: [samira.id] }));
    expect(text).not.toContain("حساسية");
    expect(text).not.toContain("OTHER");
  });

  it("answers for a day, from each worker's history", async () => {
    const kamel = await register(KAMEL);
    // A candidate is not given seats; a worker on trial is.
    const candidate = await register({ ...KAMEL, lastName: "حمدي", phone: "0559 64 75 86", hiringDecision: undefined });
    const onTrial = await register({
      ...KAMEL,
      lastName: "قاسمي",
      phone: "0555 31 42 53",
      hiringDecision: "ACCEPTED_ON_TRIAL",
    });
    await test.transact((ex, ctx) =>
      recordWorkerLeaving(ex, ctx, { id: kamel.id, leftDate: "2026-10-20", reason: "انتقل" }),
    );
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
    expect(ids(await schedulable({ date: "2026-10-15" }))).toEqual([kamel.id, onTrial.id].sort());
    expect(ids(await schedulable({ date: "2026-10-21" }))).toEqual([onTrial.id]);
    // Before anyone was registered, nobody.
    expect(await schedulable({ date: "2026-09-01" })).toEqual([]);
    // Asked by id, whatever the state, with the state said.
    const named = await schedulable({ ids: [kamel.id, candidate.id], date: "2026-10-21" });
    expect(named.map((worker) => [worker.id, worker.activeOnDate]).sort()).toEqual(
      [
        [kamel.id, false],
        [candidate.id, false],
      ].sort(),
    );
    expect(await schedulable({ ids: [] })).toEqual([]);
  });

  it("keeps a worker under sanction in the answer, with the sanction of that day", async () => {
    const kamel = await register(KAMEL);
    const { sanctionId } = await test.transact((ex, ctx) =>
      setSanction(ex, ctx, {
        subjectKind: "WORKER",
        subjectId: kamel.id,
        state: "SUSPENDED",
        reason: "تأخر",
        startDate: "2026-10-14",
        endDate: "2026-10-16",
      }),
    );
    expect((await schedulable({ date: "2026-10-12" }))[0].sanction).toBeNull();
    expect((await schedulable({ date: "2026-10-15" }))[0].sanction).toMatchObject({ sanctionId, state: "SUSPENDED" });
    expect((await schedulable({ date: "2026-10-17" }))[0].sanction).toBeNull();
    // Lifted today: no longer counts from today.
    await test.transact((ex, ctx) => liftSanction(ex, ctx, { sanctionId, reason: "قدّم مبررا" }));
    expect((await schedulable({ date: "2026-10-15" }))[0].sanction).toBeNull();
  });

  it("filters by zone, and refuses a day that is not one", async () => {
    await register(KAMEL);
    const oumElBouaghi = await register({
      ...KAMEL,
      lastName: "مرابط",
      phone: "0772 14 25 36",
      residenceCommuneId: "commune-0401",
    });
    const [inZone] = await schedulable({ ids: [oumElBouaghi.id] });
    expect((await schedulable({ zoneId: inZone.zoneId })).map((worker) => worker.id)).toEqual([oumElBouaghi.id]);
    await expect(schedulable({ date: "15/10/2026" })).rejects.toThrow("Enter a valid date.");
  });

  it("lists the days she is expected at a training session", async () => {
    const kamel = await register(KAMEL);
    const module = await test.rows.insert("TrainingModule", { code: "DAY_1", titleAr: "التعريف بالمؤسسة" });
    for (const date of ["2026-10-10", "2026-10-18", "2026-10-25"]) {
      const session = await test.rows.insert("TrainingSession", { date: date as never, moduleId: module.id });
      await test.rows.insert("TrainingAttendance", { sessionId: session.id, staffId: kamel.id, status: "ATTENDED" });
    }
    expect((await schedulable())[0].trainingDates).toEqual(["2026-10-18", "2026-10-25"]);
  });
});

describe("getStaffSummary", () => {
  it("names workers and employees for other owners' labels, and leaves out who does not exist", async () => {
    const kamel = await register(KAMEL);
    const supervisor = await test.transact((ex, ctx) =>
      registerEmployee(ex, ctx, {
        ...emptyEmployeeValues("2026-10-12"),
        sex: "MALE",
        lastName: "حداد",
        firstName: "مراد",
        phone: "0550 10 20 30",
        jobPosition: "SUPERVISOR",
      }),
    );
    await test.transact((ex, ctx) =>
      recordWorkerLeaving(ex, ctx, { id: kamel.id, leftDate: "2026-10-12", reason: "انتقل" }),
    );
    const summary = await test.transact((ex, ctx) =>
      getStaffSummary(ex, ctx, { ids: [kamel.id, supervisor.id, "nobody", null, kamel.id] }),
    );
    expect(summary).toEqual({
      [kamel.id]: {
        id: kamel.id,
        kind: "WORKER",
        number: "1/H",
        firstName: "كمال",
        lastName: "سعدي",
        name: "سعدي كمال",
        jobPosition: null,
        role: "TEAM_LEADER",
        sex: "MALE",
        phone: "0770112233",
        active: false,
      },
      [supervisor.id]: {
        id: supervisor.id,
        kind: "EMPLOYEE",
        number: "1",
        firstName: "مراد",
        lastName: "حداد",
        name: "حداد مراد",
        jobPosition: "SUPERVISOR",
        role: null,
        sex: "MALE",
        phone: "0550102030",
        active: true,
      },
    });
    expect(await test.transact((ex, ctx) => getStaffSummary(ex, ctx, { ids: [] }))).toEqual({});
  });
});
