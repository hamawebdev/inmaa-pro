import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { emptyEmployeeValues } from "@/features/people/validators/employee";
import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { recordEmployeeLeaving, registerEmployee } from "./employees";
import { employeeHiringSheet, recordHiringSheetPrint } from "./hiring-sheet";
import { registerWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

async function anEmployee() {
  return (
    await test.transact((ex, ctx) =>
      registerEmployee(ex, ctx, {
        ...emptyEmployeeValues("2026-08-01"),
        sex: "FEMALE",
        lastName: "بوزيد",
        firstName: "سارة",
        fullNameLatin: "BOUZID Sara",
        birthDate: "1990-04-18",
        phone: "0661 20 31 42",
        email: "sara@inmaa.example",
        residenceCommuneId: "commune-0401",
        maritalStatus: "MARRIED",
        jobPosition: "HR_OFFICER",
        employmentContract: "CDD",
        workTimeKind: "FULL_TIME",
        contractEndDate: "2027-07-31",
        cnasDeclared: true,
        cnasNumber: "900418002345",
        payBasis: "MONTHLY",
        payRate: "52000",
        payPeriod: "MONTHLY",
      }),
    )
  ).id;
}

describe("the registration and commitment form of a centre employee", () => {
  it("returns what the page prints, and nothing it does not", async () => {
    const id = await anEmployee();
    await test.db
      .updateTable("StaffMember")
      .set({ birthPlace: "عين البيضاء", birthWilayaCode: "04" })
      .where("id", "=", id)
      .execute();

    const sheet = await test.transact((ex, ctx) => employeeHiringSheet(ex, ctx, { id }));
    expect(sheet).toMatchObject({
      name: "بوزيد سارة",
      fullNameLatin: "BOUZID Sara",
      sex: "FEMALE",
      birthDate: "1990-04-18",
      birthPlace: "عين البيضاء",
      birthWilaya: "أم البواقي",
      maritalStatus: "MARRIED",
      cnasNumber: "900418002345",
      residenceCommune: "أم البواقي",
      residenceWilaya: "أم البواقي",
      email: "sara@inmaa.example",
      jobPosition: "HR_OFFICER",
      employmentContract: "CDD",
      contractEndDate: "2027-07-31",
      city: "أم البواقي",
    });
    expect(sheet.number).toMatch(/\d/);
    // Pay, the trial and the reason for a fixed term are on the form, not on this page.
    expect(Object.keys(sheet)).not.toEqual(
      expect.arrayContaining(["pay", "payRate", "trialEndDate", "fixedTermReason", "educationLevel"]),
    );
    // Reading writes nothing in the log.
    const disclosed = await test.db
      .selectFrom("AuditLog")
      .select("id")
      .where("operation", "=", "DISCLOSE")
      .where("entityId", "=", id)
      .execute();
    expect(disclosed).toHaveLength(0);
  });

  it("prints the social security number only once the person is declared", async () => {
    const id = await anEmployee();
    // «مصرّح به» unticked: the form keeps the number typed, the sheet leaves its blank.
    await test.db.updateTable("StaffMember").set({ cnasDeclared: 0 }).where("id", "=", id).execute();
    const kept = await test.db
      .selectFrom("StaffMember")
      .select("cnasNumber")
      .where("id", "=", id)
      .executeTakeFirstOrThrow();
    expect(kept.cnasNumber).toBe("900418002345");
    const undeclared = await test.transact((ex, ctx) => employeeHiringSheet(ex, ctx, { id }));
    expect(undeclared.cnasNumber).toBeNull();

    await test.db.updateTable("StaffMember").set({ cnasDeclared: 1 }).where("id", "=", id).execute();
    const declared = await test.transact((ex, ctx) => employeeHiringSheet(ex, ctx, { id }));
    expect(declared.cnasNumber).toBe("900418002345");
  });

  it("gives an empty city when the centre's city is not set, for the sheet to leave a blank", async () => {
    const id = await anEmployee();
    await test.transact((ex, ctx) => setSetting(ex, ctx, "centre.city", ""));
    const sheet = await test.transact((ex, ctx) => employeeHiringSheet(ex, ctx, { id }));
    expect(sheet.city).toBe("");
  });

  it("writes one DISCLOSE line per print", async () => {
    const id = await anEmployee();
    await test.transact((ex, ctx) => recordHiringSheetPrint(ex, ctx, { id }));
    const lines = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("operation", "=", "DISCLOSE")
      .where("entityId", "=", id)
      .execute();
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ entity: "StaffMember", localDate: "2026-10-12" });
    expect(JSON.stringify(lines[0].context)).toContain("HIRING_SHEET");
  });

  it("is refused for a worker, for an employee who left, and to a role that may not print a card", async () => {
    const { id: worker } = await test.transact((ex, ctx) =>
      registerWorker(ex, ctx, {
        ...emptyWorkerValues("2026-08-01"),
        sex: "FEMALE",
        lastName: "قاسمي",
        firstName: "نوال",
        birthDate: "1996-01-12",
        phone: "0555 31 42 53",
        role: "CLEANER",
        hiringDecision: "ACCEPTED_ON_TRIAL",
        issuedDate: "2026-08-01",
      }),
    );
    await expect(test.transact((ex, ctx) => employeeHiringSheet(ex, ctx, { id: worker }))).rejects.toThrow(
      "The registration and commitment form is printed for a centre employee only.",
    );
    await expect(test.transact((ex, ctx) => recordHiringSheetPrint(ex, ctx, { id: worker }))).rejects.toThrow(
      "The registration and commitment form is printed for a centre employee only.",
    );

    const id = await anEmployee();
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(test.transact((ex, ctx) => employeeHiringSheet(ex, ctx, { id }), reception)).rejects.toThrow();
    await expect(test.transact((ex, ctx) => recordHiringSheetPrint(ex, ctx, { id }), reception)).rejects.toThrow();

    await test.transact((ex, ctx) => recordEmployeeLeaving(ex, ctx, { id, leftDate: "2026-10-12", reason: "استقالة" }));
    await expect(test.transact((ex, ctx) => employeeHiringSheet(ex, ctx, { id }))).rejects.toThrow(
      "This employee has left: no registration and commitment form is printed.",
    );
    await expect(test.transact((ex, ctx) => employeeHiringSheet(ex, ctx, { id: "nobody" }))).rejects.toThrow(
      "This person does not exist.",
    );
  });
});

describe("the registration and commitment form on the demo data", () => {
  it("prints the two demo employees", async () => {
    test.close();
    test = await createTestDatabase({ demo: ["people"] });
    const names = test.demo.people;
    const supervisor = await test.transact((ex, ctx) =>
      employeeHiringSheet(ex, ctx, { id: String(names.employeeSupervisor) }),
    );
    expect(supervisor).toMatchObject({ name: "حداد مراد", employmentContract: "CDD", contractEndDate: "2027-01-31" });
    const hr = await test.transact((ex, ctx) => employeeHiringSheet(ex, ctx, { id: String(names.employeeHr) }));
    expect(hr).toMatchObject({ sex: "FEMALE", employmentContract: "CDI" });
  });
});
