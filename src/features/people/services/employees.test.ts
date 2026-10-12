import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { emptyEmployeeValues, type EmployeeFormValues } from "@/features/people/validators/employee";
import { registerHandler } from "@/lib/events";
import type { Session } from "@/lib/service/context";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  listEmployees,
  openEmployeeFile,
  readmitEmployee,
  recordEmployeeLeaving,
  registerEmployee,
  updateEmployee,
  type RegisterEmployeeInput,
} from "./employees";
import { setSanction } from "./sanctions";
import { registerWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const SUPERVISOR: RegisterEmployeeInput = {
  ...emptyEmployeeValues("2026-10-12"),
  sex: "MALE",
  lastName: "حداد",
  firstName: "مراد",
  fullNameLatin: "HADDAD Mourad",
  birthDate: "1988-11-03",
  phone: "0550 10 20 30",
  phone2: "032 42 15 00",
  email: "mourad@example.dz",
  residenceCommuneId: "commune-0401",
  jobPosition: "SUPERVISOR",
  startDate: "2026-09-01",
  employmentContract: "CDI",
  workTimeKind: "FULL_TIME",
  cnasDeclared: true,
  cnasNumber: "880311001234",
  payBasis: "MONTHLY",
  payRate: "45000",
  payPeriod: "MONTHLY",
};

const HR: RegisterEmployeeInput = {
  ...emptyEmployeeValues("2026-10-12"),
  sex: "FEMALE",
  lastName: "بن عمر",
  firstName: "سعاد",
  phone: "0661 70 80 90",
  jobPosition: "HR_OFFICER",
};

const register = (input: RegisterEmployeeInput, session?: Session) =>
  test.transact((ex, ctx) => registerEmployee(ex, ctx, input), session);

const unavailable: unknown[] = [];
registerHandler("money", "staff.unavailable", async (_ex, _ctx, payload) => {
  unavailable.push(payload);
});
beforeEach(() => {
  unavailable.length = 0;
});

describe("registerEmployee", () => {
  it("registers a centre employee in the employees' own sequence, in post from the start date", async () => {
    const result = await register(SUPERVISOR);
    expect(result.number).toBe("1");
    const row = await test.db.selectFrom("StaffMember").selectAll().where("id", "=", result.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      kind: "EMPLOYEE",
      numberSeq: 1,
      numberSuffix: "",
      number: "1",
      lastName: "حداد",
      sex: "MALE",
      jobPosition: "SUPERVISOR",
      phone: "0550102030",
      phone2: "032421500",
      phoneKeys: "|0550102030|032421500|",
      email: "mourad@example.dz",
      engagementStatus: "ACCEPTED",
      startDate: "2026-09-01",
      employmentContract: "CDI",
      workTimeKind: "FULL_TIME",
      cnasDeclared: 1,
      cnasNumber: "880311001234",
      payRate: 4_500_000,
      zoneId: null,
      role: null,
    });
    const events = await test.db.selectFrom("StaffEvent").select(["kind", "date", "toStatus", "payRate"]).orderBy("kind").execute();
    expect(events).toEqual([
      { kind: "PAY_TERMS", date: "2026-09-01", toStatus: null, payRate: 4_500_000 },
      { kind: "STATUS", date: "2026-09-01", toStatus: "ACCEPTED", payRate: null },
    ]);
    const entry = await test.db.selectFrom("AuditLog").selectAll().where("entity", "=", "StaffMember").executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "COLLECT", subjectKind: "EMPLOYEE", entityLabel: "1 حداد مراد" });

    // Employees and workers are numbered apart.
    expect((await register(HR)).number).toBe("2");
    const worker = await test.transact((ex, ctx) =>
      registerWorker(ex, ctx, {
        ...emptyWorkerValues("2026-10-12"),
        sex: "FEMALE",
        lastName: "بوزيد",
        firstName: "سميرة",
        birthDate: "1994-03-17",
        phone: "0661203142",
      }),
    );
    expect(worker.number).toBe("1/F");
  });

  it("asks for a job position, a sex and a phone, in the form's words", async () => {
    const blank = emptyEmployeeValues("2026-10-12");
    await expect(register({ ...HR, jobPosition: blank.jobPosition })).rejects.toThrow("Choose the job position.");
    await expect(register({ ...HR, sex: blank.sex })).rejects.toThrow(
      "Choose whether the employee is a man or a woman.",
    );
    await expect(register({ ...HR, phone: "12" })).rejects.toThrow("The phone number has 9 or 10 digits.");
    await expect(register({ ...SUPERVISOR, contractEndDate: "2026-08-01" })).rejects.toThrow(
      "The end of the contract cannot be before its start.",
    );
    await expect(register({ ...HR, email: "nope" })).rejects.toThrow("Enter a valid email address.");
  });

  it("is the HR officer's and the manager's", async () => {
    const hr = await test.sessionFor("HR_OFFICER");
    expect((await register(HR, hr)).number).toBe("1");
    const administration = await test.sessionFor("ADMINISTRATION"); // reads the section
    const reception = await test.sessionFor("RECEPTION_SALES"); // no access to it
    for (const session of [administration, reception]) {
      await expect(register(SUPERVISOR, session)).rejects.toThrow("You do not have permission to do this.");
    }
  });

  it("keeps one record per identity number, and checks the suspended and penalised of every kind", async () => {
    const first = await register({ ...SUPERVISOR, nationalIdNumber: "198811030000111" });
    await expect(register({ ...HR, nationalIdNumber: "1988 1103 0000 111" })).rejects.toThrow(
      "An employee with this identity number is already registered. Open that employee's file.",
    );
    await test.transact((ex, ctx) =>
      setSanction(ex, ctx, { subjectKind: "EMPLOYEE", subjectId: first.id, state: "SUSPENDED", reason: "خطأ جسيم", startDate: "2026-10-12" }),
    );
    // His second phone on another employee, and on a worker.
    await expect(register({ ...HR, phone: "032 42 15 00" })).rejects.toThrow(
      "This person is suspended or penalised. The manager must allow the registration first.",
    );
    await expect(
      test.transact((ex, ctx) =>
        registerWorker(ex, ctx, {
          ...emptyWorkerValues("2026-10-12"),
          sex: "MALE",
          lastName: "سعدي",
          firstName: "كمال",
          birthDate: "1990-05-02",
          phone: "0550 10 20 30",
        }),
      ),
    ).rejects.toThrow("This person is suspended or penalised. The manager must allow the registration first.");
  });
});

describe("updateEmployee", () => {
  it("writes only what changed, logs it, and dates new pay terms", async () => {
    const { id } = await register(SUPERVISOR);
    test.clock.advance({ days: 20 });
    const values: EmployeeFormValues = { ...SUPERVISOR, jobPosition: "OPERATIONS", payRate: "50000" };
    await test.transact((ex, ctx) => updateEmployee(ex, ctx, { id, values }));
    const row = await test.db.selectFrom("StaffMember").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ jobPosition: "OPERATIONS", payRate: 5_000_000 });
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("operation", "=", "CHANGE")
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(entry.changes ?? "{}")).toEqual({
      jobPosition: ["SUPERVISOR", "OPERATIONS"],
      payRate: [4_500_000, 5_000_000],
    });
    const terms = await test.db.selectFrom("StaffEvent").select(["date", "payRate"]).where("kind", "=", "PAY_TERMS").orderBy("date").execute();
    expect(terms).toEqual([
      { date: "2026-09-01", payRate: 4_500_000 },
      { date: "2026-11-01", payRate: 5_000_000 },
    ]);
    await expect(test.transact((ex, ctx) => updateEmployee(ex, ctx, { id: "nobody", values }))).rejects.toThrow(
      "This employee does not exist.",
    );
  });
});

describe("reading employees", () => {
  it("lists them with their post, state and login account, and filters by post for the pickers", async () => {
    const supervisor = await register(SUPERVISOR);
    const hr = await register(HR);
    await test.sessionFor("SUPERVISOR", { staffMemberId: supervisor.id });
    await test.transact((ex, ctx) =>
      setSanction(ex, ctx, { subjectKind: "EMPLOYEE", subjectId: hr.id, state: "PENALISED", reason: "تأخر", startDate: "2026-10-12" }),
    );
    const all = await test.transact((ex, ctx) => listEmployees(ex, ctx));
    expect(all.map((row) => [row.number, row.jobPosition, row.sanction?.state ?? null, row.account !== null])).toEqual([
      ["2", "HR_OFFICER", "PENALISED", false],
      ["1", "SUPERVISOR", null, true],
    ]);
    const supervisors = await test.transact((ex, ctx) => listEmployees(ex, ctx, { position: "SUPERVISOR" }));
    expect(supervisors.map((row) => row.id)).toEqual([supervisor.id]);
  });

  it("opens an employee's file with what was typed and the account, and logs the consultation", async () => {
    const { id } = await register(SUPERVISOR);
    await test.sessionFor("SUPERVISOR", { staffMemberId: id });
    const file = await test.transact((ex, ctx) => openEmployeeFile(ex, ctx, { id }));
    expect(file.values).toEqual({ ...SUPERVISOR, phone: "0550102030", phone2: "032421500" });
    expect(file).toMatchObject({ number: "1", status: "ACCEPTED", sanction: null, account: { roleId: "SUPERVISOR", isActive: true } });
    const entry = await test.db.selectFrom("AuditLog").selectAll().where("action", "=", "VIEW").executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "CONSULT", entityId: id, subjectKind: "EMPLOYEE" });
  });
});

describe("an employee leaving and coming back", () => {
  it("records the day and the reason, tells Operations nothing, and puts him back in post", async () => {
    const { id } = await register(SUPERVISOR);
    await test.transact((ex, ctx) => recordEmployeeLeaving(ex, ctx, { id, leftDate: "2026-10-31", reason: "استقالة" }));
    const left = await test.db.selectFrom("StaffMember").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(left).toMatchObject({ engagementStatus: "LEFT", leftDate: "2026-10-31", leftReason: "استقالة" });
    expect(unavailable).toEqual([]);
    await test.transact((ex, ctx) => readmitEmployee(ex, ctx, { id }));
    const back = await test.db.selectFrom("StaffMember").selectAll().where("id", "=", id).executeTakeFirstOrThrow();
    expect(back).toMatchObject({ engagementStatus: "ACCEPTED", leftDate: null });
  });
});
