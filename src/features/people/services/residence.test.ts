import { afterEach, beforeEach, expect, it } from "vitest";

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

it("records a worker who lives in another wilaya: his two blanks, the commune as typed", async () => {
  const { id } = await test.transact((ex, ctx) =>
    registerWorker(ex, ctx, { ...NADIA, residenceWilayaCode: "25", residenceCommuneName: "الخروب" }),
  );
  const stored = await test.db
    .selectFrom("StaffMember as w")
    .innerJoin("Commune as c", "c.id", "w.residenceCommuneId")
    .select(["c.id", "c.nameAr", "c.wilayaCode"])
    .where("w.id", "=", id)
    .executeTakeFirstOrThrow();
  expect(stored).toMatchObject({ nameAr: "الخروب", wilayaCode: "25" });

  // Her file shows the wilaya chosen and the commune typed; saving it again changes nothing.
  const file = await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
  expect(file.values).toMatchObject({
    residenceWilayaCode: "25",
    residenceCommuneName: "الخروب",
    residenceCommuneId: "",
  });
  await test.transact((ex, ctx) => updateWorker(ex, ctx, { id, values: file.values }));
  const communes = await test.db.selectFrom("Commune").select("id").where("wilayaCode", "=", "25").execute();
  expect(communes).toHaveLength(1);

  // The printed form has both: «الخروب / قسنطينة».
  const printed = await test.transact((ex, ctx) => workerFormForPrint(ex, ctx, { id, reason: "ملف التوظيف" }));
  expect(printed.data).toMatchObject({ residenceCommune: "الخروب", residenceWilaya: "قسنطينة" });

  // Another spelling of the same commune is the same commune; back in the centre's wilaya, the list's.
  await test.transact((ex, ctx) =>
    updateWorker(ex, ctx, { id, values: { ...file.values, residenceCommuneName: "الخروب " } }),
  );
  await test.transact((ex, ctx) =>
    updateWorker(ex, ctx, {
      id,
      values: {
        ...file.values,
        residenceWilayaCode: "04",
        residenceCommuneId: "commune-0402",
        residenceCommuneName: "",
      },
    }),
  );
  const moved = await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
  expect(moved.values).toMatchObject({ residenceWilayaCode: "04", residenceCommuneId: "commune-0402" });
  expect(moved.commune).toMatchObject({ wilayaCode: "04" });
});

it("does the same on an employee's file", async () => {
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
      residenceCommuneName: "العلمة",
    }),
  );
  const file = await test.transact((ex, ctx) => openEmployeeFile(ex, ctx, { id }));
  expect(file.values).toMatchObject({
    residenceWilayaCode: "19",
    residenceCommuneName: "العلمة",
    residenceCommuneId: "",
  });
});
