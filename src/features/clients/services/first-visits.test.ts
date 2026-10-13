import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";
import { emptyFirstVisit, type FirstVisitInput } from "../validators/first-visit";

import { getCostStudy } from "./cost-study";
import {
  addFirstVisitPhoto,
  getFirstVisits,
  getInspectionSheet,
  removeFirstVisit,
  saveFirstVisit,
} from "./first-visits";
import { registerFile, type RegisterFileInput } from "./files";

let test: TestDatabase;
let fileId: string;
beforeEach(async () => {
  test = await createTestDatabase();
  const input = structuredClone(DEMO_FILES.find((file) => file.name === "housingJob")!.input) as RegisterFileInput;
  delete input.values.firstVisitDate;
  ({ fileId } = await test.transact((ex, ctx) => registerFile(ex, ctx, input)));
});
afterEach(() => test.close());

const file = () =>
  test.db.selectFrom("File").select(["stage", "firstVisitDate"]).where("id", "=", fileId).executeTakeFirstOrThrow();

it("is planned, which moves a new file to «الزيارة», then typed in from the sheet, which dates the form's visit", async () => {
  const inspector = await test.rows.insert("StaffMember", {
    kind: "EMPLOYEE",
    lastName: "قاسمي",
    firstName: "يوسف",
    engagementStatus: "ACCEPTED",
  });
  const planned = { ...emptyFirstVisit("2026-10-13"), plannedTime: "10:00", inspectorEmployeeId: inspector.id };
  const { firstVisitId } = await test.transact((ex, ctx) => saveFirstVisit(ex, ctx, { fileId, visit: planned }));
  expect(await file()).toEqual({ stage: "VISIT", firstVisitDate: null });

  const sheet = await test.transact((ex, ctx) => getInspectionSheet(ex, ctx, { firstVisitId }));
  expect(sheet).toMatchObject({ clientName: "مرابط فاطمة", inspectorName: "قاسمي يوسف", visit: { doneDate: null } });

  const done: FirstVisitInput = {
    ...planned,
    doneDate: "2026-10-12",
    startTime: "10:00",
    endTime: "11:15",
    clientRepresentative: "مرابط فاطمة",
    firstResult: ["SUITABLE"],
    conditionFactors: ["PETS"],
    spaces: [
      { label: "غرفة النوم", countOrArea: "3", state: "AVERAGE", workRequired: "تنظيف عميق", frequency: null },
      { label: "المطبخ", countOrArea: "12 م²", state: "POOR", workRequired: "إزالة الدهون", frequency: null },
    ],
    estimatedWorkers: 2,
    perVisitMin: 360,
    recommendation: ["NORMAL"],
  };
  expect(await test.transact((ex, ctx) => saveFirstVisit(ex, ctx, { fileId, firstVisitId, visit: done }))).toEqual({
    firstVisitId,
    changed: true,
  });
  expect(await file()).toEqual({ stage: "VISIT", firstVisitDate: "2026-10-12" });

  const view = await test.transact((ex, ctx) => getFirstVisits(ex, ctx, { fileId }));
  expect(view.visits).toHaveLength(1);
  expect(view.visits[0].visit).toEqual(done);
  expect(view.inspectors.map((one) => one.id)).toContain(inspector.id);
  // The cost study starts from the visit's estimate.
  const study = await test.transact((ex, ctx) => getCostStudy(ex, ctx, { fileId }));
  expect(study.terms).toMatchObject({ workers: 2, perVisitMin: 360 });

  expect(await test.transact((ex, ctx) => saveFirstVisit(ex, ctx, { fileId, firstVisitId, visit: done }))).toEqual({
    firstVisitId,
    changed: false,
  });
});

it("refuses a visit without a day, ending before it starts, or after today; and is taken off only with a reason", async () => {
  const save = (visit: FirstVisitInput) => test.transact((ex, ctx) => saveFirstVisit(ex, ctx, { fileId, visit }));
  await expect(save(emptyFirstVisit(null))).rejects.toThrow(
    "Give the day the visit is planned for, or the day it took place.",
  );
  await expect(save({ ...emptyFirstVisit(null), doneDate: "2026-10-13" })).rejects.toThrow(
    "A visit cannot have taken place after today.",
  );
  await expect(save({ ...emptyFirstVisit("2026-10-13"), startTime: "10:00", endTime: "09:00" })).rejects.toThrow(
    "The visit must end after it starts.",
  );
  const { firstVisitId } = await save(emptyFirstVisit("2026-10-14"));
  await expect(test.transact((ex, ctx) => removeFirstVisit(ex, ctx, { firstVisitId, reason: " " }))).rejects.toThrow(
    "A reason is required.",
  );
  await test.transact((ex, ctx) => removeFirstVisit(ex, ctx, { firstVisitId, reason: "ألغت العميلة الموعد" }));
  expect((await test.transact((ex, ctx) => getFirstVisits(ex, ctx, { fileId }))).visits).toHaveLength(0);
});

it("takes a photo only where the client agreed to photos", async () => {
  const { firstVisitId } = await test.transact((ex, ctx) =>
    saveFirstVisit(ex, ctx, { fileId, visit: emptyFirstVisit("2026-10-13") }),
  );
  await expect(
    test.transact((ex, ctx) => addFirstVisitPhoto(ex, ctx, { firstVisitId, url: "managed://FirstVisit/photos/x.jpg" })),
  ).rejects.toThrow("The client has not agreed to photos at this site.");
});
