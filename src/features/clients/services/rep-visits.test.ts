import { afterEach, beforeEach, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";
import type { RepVisitInput } from "../validators/rep-visit";

import { registerFile, type RegisterFileInput } from "./files";
import { getRepVisit, getRepVisitFill, listRepVisits, markRepCallBackDone, saveRepVisit } from "./rep-visits";

let test: TestDatabase;
let rep: string;
beforeEach(async () => {
  test = await createTestDatabase();
  rep = (
    await test.rows.insert("StaffMember", {
      kind: "EMPLOYEE",
      lastName: "زروال",
      firstName: "أمين",
      engagementStatus: "ACCEPTED",
    })
  ).id;
});
afterEach(() => test.close());

const visit = (more: Partial<RepVisitInput> = {}): RepVisitInput => ({
  date: "2026-10-12",
  repEmployeeId: rep,
  prospectName: "مصنع الهضاب للحليب",
  prospectKind: "ORGANISATION",
  activity: "صناعة غذائية",
  contactName: "بلعيد كمال",
  contactRole: "مدير الموارد البشرية",
  phone: "032 41 22 33",
  address: "المنطقة الصناعية",
  communeId: "commune-0401",
  leftProfile: true,
  interest: "HIGH",
  outcome: "يريد عرضا لعقد سنوي",
  callBackDate: "2026-10-14",
  note: null,
  ...more,
});

it("keeps the rep's visits, lists the call-backs that are due, and refuses a visit after today", async () => {
  const { repVisitId } = await test.transact((ex, ctx) => saveRepVisit(ex, ctx, { visit: visit() }));
  expect((await test.transact((ex, ctx) => listRepVisits(ex, ctx, { due: true }))).length).toBe(0);
  test.clock.advance({ days: 2 });
  const due = await test.transact((ex, ctx) => listRepVisits(ex, ctx, { due: true }));
  expect(due).toMatchObject([{ id: repVisitId, repName: "زروال أمين", callBackDue: true, communeName: "أم البواقي" }]);
  await test.transact((ex, ctx) => markRepCallBackDone(ex, ctx, { repVisitId }));
  expect((await test.transact((ex, ctx) => listRepVisits(ex, ctx, { due: true }))).length).toBe(0);
  // A new call-back day is a new call to make.
  await test.transact((ex, ctx) => saveRepVisit(ex, ctx, { repVisitId, visit: visit({ callBackDate: "2026-10-14" }) }));
  expect(await test.transact((ex, ctx) => saveRepVisit(ex, ctx, { repVisitId, visit: visit() }))).toEqual({
    repVisitId,
    changed: false,
  });
  await expect(
    test.transact((ex, ctx) => saveRepVisit(ex, ctx, { visit: visit({ date: "2026-10-20" }) })),
  ).rejects.toThrow("A visit cannot be dated after today.");
  const reception = await test.sessionFor("RECEPTION_SALES");
  await expect(test.transact((ex, ctx) => saveRepVisit(ex, ctx, { visit: visit() }), reception)).rejects.toThrow(
    "You do not have permission to do this.",
  );
});

it("becomes a file with its details carried over, and then names its client", async () => {
  const { repVisitId } = await test.transact((ex, ctx) => saveRepVisit(ex, ctx, { visit: visit() }));
  const fill = await test.transact((ex, ctx) => getRepVisitFill(ex, ctx, { repVisitId }));
  expect(fill).toEqual({
    repVisitId,
    division: "ORGANISATION",
    values: {
      clientName: "مصنع الهضاب للحليب",
      phone: "032 41 22 33",
      address: "المنطقة الصناعية",
      commune: "أم البواقي",
      wilaya: "04",
      managerName: "بلعيد كمال",
    },
  });
  const org = structuredClone(DEMO_FILES.find((file) => file.name === "orgContract")!.input) as RegisterFileInput;
  const { fileId, clientId } = await test.transact((ex, ctx) =>
    registerFile(ex, ctx, {
      ...org,
      values: { ...org.values, ...fill.values },
      office: { ...org.office, source: "REP" },
      sourceRepVisitId: repVisitId,
    }),
  );
  const view = await test.transact((ex, ctx) => getRepVisit(ex, ctx, { repVisitId }));
  expect(view).toMatchObject({ clientId, files: [{ id: fileId }] });
  expect(
    await test.db.selectFrom("File").select(["sourceRepVisitId", "source"]).where("id", "=", fileId).executeTakeFirst(),
  ).toEqual({ sourceRepVisitId: repVisitId, source: "REP" });
});

it("takes a number already on paper only with the capability and a reason", async () => {
  const input = structuredClone(DEMO_FILES.find((file) => file.name === "housingRequest")!.input) as RegisterFileInput;
  const reception = await test.sessionFor("RECEPTION_SALES");
  await expect(
    test.transact(
      (ex, ctx) => registerFile(ex, ctx, { ...input, paperNumbers: { client: 40, file: 12, reason: "استمارة ورقية" } }),
      reception,
    ),
  ).rejects.toThrow("You do not have permission to do this.");
  await expect(
    test.transact((ex, ctx) =>
      registerFile(ex, ctx, { ...input, paperNumbers: { client: 40, file: 12, reason: " " } }),
    ),
  ).rejects.toThrow("A reason is required.");
  const paper = await test.transact((ex, ctx) =>
    registerFile(ex, ctx, { ...input, paperNumbers: { client: 40, file: 12, reason: "استمارة ورقية قبل البرنامج" } }),
  );
  expect(paper.number).toBe("12");
  expect(
    await test.db.selectFrom("Client").select("number").where("id", "=", paper.clientId).executeTakeFirst(),
  ).toEqual({ number: "40" });
  // The counters go on after the numbers taken from paper.
  const next = await test.transact((ex, ctx) => registerFile(ex, ctx, input));
  expect(next.number).toBe("13");
  await expect(
    test.transact((ex, ctx) => registerFile(ex, ctx, { ...input, paperNumbers: { file: 12, reason: "مكرر" } })),
  ).rejects.toThrow("This number is already taken.");
});
