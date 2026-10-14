import { afterEach, beforeEach, expect, it } from "vitest";

import { ensureCommune } from "@/features/core/services/places";
import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { emptyEmployeeValues } from "@/features/people/validators/employee";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { openEmployeeFile, registerEmployee } from "./employees";
import { openWorkerFile, workerFormForPrint } from "./worker-reads";
import { registerWorker, updateWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const NADIA = {
  ...emptyWorkerValues("2026-10-01"),
  sex: "FEMALE" as const,
  lastName: "بن صالح",
  firstName: "نادية",
  birthDate: "1991-06-02",
  phone: "0770 11 22 33",
};

it("records a worker who lives in another wilaya: his two blanks, wilaya and commune", async () => {
  // The picker adds a commune of another wilaya the first time it is needed.
  const khroub = await test.transact((ex, ctx) => ensureCommune(ex, ctx, { wilayaCode: "25", nameAr: "الخروب" }));
  const { id } = await test.transact((ex, ctx) =>
    registerWorker(ex, ctx, { ...NADIA, residenceWilayaCode: "25", residenceCommuneId: khroub.id }),
  );

  // Her file shows the wilaya and the commune chosen.
  const file = await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
  expect(file.values).toMatchObject({ residenceWilayaCode: "25", residenceCommuneId: khroub.id });

  // The printed form has both: «الخروب / قسنطينة».
  const printed = await test.transact((ex, ctx) => workerFormForPrint(ex, ctx, { id, reason: "ملف التوظيف" }));
  expect(printed.data).toMatchObject({ residenceCommune: "الخروب", residenceWilaya: "قسنطينة" });

  // Back in the centre's wilaya.
  await test.transact((ex, ctx) =>
    updateWorker(ex, ctx, {
      id,
      values: { ...file.values, residenceWilayaCode: "04", residenceCommuneId: "commune-0402" },
    }),
  );
  const moved = await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
  expect(moved.values).toMatchObject({ residenceWilayaCode: "04", residenceCommuneId: "commune-0402" });
});

it("does the same on an employee's file", async () => {
  const eulma = await test.transact((ex, ctx) => ensureCommune(ex, ctx, { wilayaCode: "19", nameAr: "العلمة" }));
  const { id } = await test.transact((ex, ctx) =>
    registerEmployee(ex, ctx, {
      ...emptyEmployeeValues("2026-10-01"),
      sex: "MALE",
      lastName: "زروقي",
      firstName: "أمين",
      birthDate: "1988-02-11",
      phone: "0661 99 88 77",
      jobPosition: "ACCOUNTANT",
      residenceWilayaCode: "19",
      residenceCommuneId: eulma.id,
    }),
  );
  const file = await test.transact((ex, ctx) => openEmployeeFile(ex, ctx, { id }));
  expect(file.values).toMatchObject({ residenceWilayaCode: "19", residenceCommuneId: eulma.id });
});

it("requires the commune once another wilaya is chosen, and allows an empty residence", async () => {
  await expect(
    test.transact((ex, ctx) =>
      registerWorker(ex, ctx, { ...NADIA, residenceWilayaCode: "25", residenceCommuneId: "" }),
    ),
  ).rejects.toThrow("Choose the commune of residence.");
  const { id } = await test.transact((ex, ctx) =>
    registerWorker(ex, ctx, { ...NADIA, residenceWilayaCode: "04", residenceCommuneId: "" }),
  );
  const stored = await test.db
    .selectFrom("StaffMember")
    .select("residenceCommuneId")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
  expect(stored.residenceCommuneId).toBeNull();
});
