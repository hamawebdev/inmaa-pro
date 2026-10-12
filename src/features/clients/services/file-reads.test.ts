import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";

import {
  getFileForm,
  getFileHub,
  listFiles,
  openFileSheet,
  openResidentList,
  recordFileOpened,
  recordFilePrint,
} from "./file-reads";
import { moveFileStage, registerFile, type RegisterFileInput } from "./files";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const demoInput = (name: string): RegisterFileInput =>
  structuredClone(DEMO_FILES.find((file) => file.name === name)!.input) as RegisterFileInput;
const register = (name: string) => test.transact((ex, ctx) => registerFile(ex, ctx, demoInput(name)));

const consultations = (entityId: string) =>
  test.db
    .selectFrom("AuditLog")
    .select(["operation", "action", "entity", "context", "disclosure", "userId"])
    .where("entityId", "=", entityId)
    .where("operation", "in", ["CONSULT", "DISCLOSE"])
    .orderBy("chainSeq")
    .execute();

describe("the list of files", () => {
  it("filters by division, service type and stage, and finds a name, a number or a phone", async () => {
    const request = await register("housingRequest");
    const contract = await register("housingContract");
    const org = await register("orgContract");
    await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId: org.fileId, to: "VISIT" }));

    const list = (filter: Parameters<typeof listFiles>[2]) =>
      test.transact(async (ex, ctx) => (await listFiles(ex, ctx, filter)).map((row) => row.id));

    expect(await list({ division: "HOUSING" })).toEqual(expect.arrayContaining([request.fileId, contract.fileId]));
    expect(await list({ division: "HOUSING" })).toHaveLength(2);
    expect(await list({ division: "HOUSING", serviceType: "ON_DEMAND" })).toEqual([request.fileId]);
    expect(await list({ stage: "VISIT" })).toEqual([org.fileId]);
    expect(await list({ search: "الأوراس" })).toEqual([org.fileId]);
    expect(await list({ search: "ام البواقي" })).toEqual([]);
    expect(await list({ search: "بوزيد" })).toEqual([contract.fileId]);
    expect(await list({ search: "0661 45" })).toEqual([request.fileId]);
    expect(await list({ ids: [contract.fileId] })).toEqual([contract.fileId]);

    const [row] = await test.transact((ex, ctx) => listFiles(ex, ctx, { ids: [org.fileId] }));
    expect(row).toMatchObject({
      number: "1",
      kind: "ORG_CONTRACT",
      division: "ORGANISATION",
      serviceType: "CONTRACT",
      stage: "VISIT",
      closed: false,
      clientName: "شركة الأوراس للتوزيع",
      siteName: "مقر شركة الأوراس",
      communeName: "عين البيضاء",
      startDate: "2026-10-10",
      endDate: "2027-01-09",
      totalAmount: 6000000,
    });
  });

  it("is open to whoever reads the requests, and to nobody else", async () => {
    await register("housingRequest");
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(test.transact((ex, ctx) => listFiles(ex, ctx, {}), accountant)).resolves.toHaveLength(1);
    const hr = await test.sessionFor("HR_OFFICER");
    await expect(test.transact((ex, ctx) => listFiles(ex, ctx, {}), hr)).resolves.toHaveLength(1);
  });
});

describe("the hub of a file", () => {
  it("says who, where, the terms, what the stage can do next, and the history with who did it", async () => {
    const { fileId } = await register("buildingContract");
    const hub = await test.transact((ex, ctx) => getFileHub(ex, ctx, { fileId }));
    expect(hub).toMatchObject({
      number: "1/BLC",
      kind: "BUILDING_CONTRACT",
      stage: "NEW",
      locked: false,
      client: { number: "1", name: "مرابط بلقاسم", capacity: "رئيس جمعية السكان", phone: "0550 11 22 33" },
      site: {
        siteNumber: "B7",
        name: "عمارة الورود",
        communeName: "أم البواقي",
        wilayaCode: "04",
        zoneName: "أم البواقي",
      },
      terms: {
        visitsPerWeek: 2,
        executionDays: ["SUN", "WED"],
        totalAmount: 3000000,
        amountBasis: "PER_PAYMENT_PERIOD",
      },
      nextStages: [
        { to: "VISIT", allowed: true, refusal: null },
        { to: "QUOTE", allowed: true, refusal: null },
      ],
      backStages: [],
    });
    expect(hub.history).toEqual([
      {
        fromStage: null,
        toStage: "NEW",
        changedAt: "2026-10-12T08:00:00.000Z",
        localDate: "2026-10-12",
        localTime: "09:00",
        byName: expect.any(String),
        note: null,
      },
    ]);

    await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to: "QUOTE" }));
    const quoted = await test.transact((ex, ctx) => getFileHub(ex, ctx, { fileId }));
    expect(quoted.nextStages).toEqual([{ to: "CONTRACTED", allowed: true, refusal: null, missing: [] }]);
    expect(quoted.backStages).toEqual(["NEW", "VISIT"]);
  });

  it("names what is missing before «متعاقد»", async () => {
    const input = demoInput("orgContract");
    const { fileId } = await test.transact((ex, ctx) =>
      registerFile(ex, ctx, {
        ...input,
        values: { ...input.values, startDate: undefined, endDate: undefined },
        office: { amountBasis: null },
      }),
    );
    await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to: "QUOTE" }));
    const hub = await test.transact((ex, ctx) => getFileHub(ex, ctx, { fileId }));
    expect(hub.nextStages).toEqual([
      {
        to: "CONTRACTED",
        allowed: false,
        refusal: "MISSING_ANSWERS",
        missing: ["startDate", "endDate", "amountBasis"],
      },
    ]);
  });

  it("logs the opening of a file once per user and day", async () => {
    const { fileId } = await register("housingContract");
    expect(await test.transact((ex, ctx) => recordFileOpened(ex, ctx, { fileId }))).toEqual({ logged: true });
    expect(await test.transact((ex, ctx) => recordFileOpened(ex, ctx, { fileId }))).toEqual({ logged: false });
    const reception = await test.sessionFor("RECEPTION_SALES");
    expect(await test.transact((ex, ctx) => recordFileOpened(ex, ctx, { fileId }), reception)).toEqual({
      logged: true,
    });
    test.clock.advance({ days: 1 });
    expect(await test.transact((ex, ctx) => recordFileOpened(ex, ctx, { fileId }))).toEqual({ logged: true });
    expect(await consultations(fileId)).toHaveLength(3);
  });
});

describe("the form of a file", () => {
  it("gives his sheet's answers and the office blocks", async () => {
    const { fileId } = await register("orgContract");
    const form = await test.transact((ex, ctx) => getFileForm(ex, ctx, { fileId }));
    const input = demoInput("orgContract");
    expect(form).toMatchObject({
      kind: "ORG_CONTRACT",
      number: "1",
      stage: "NEW",
      locked: false,
      residents: "NONE",
      office: { source: "VISIT", priority: "NORMAL", amountBasis: "PER_PAYMENT_PERIOD", expensesIncluded: true },
      siteOffice: {
        receiverName: "قاسمي نادية",
        forbiddenCodes: ["TECH_ROOMS", "ELECTRIC_ROOMS"],
        allowedDays: ["SAT", "SUN", "MON", "TUE", "WED"],
        allowedFrom: "06:30",
        keysHeld: false,
        instructionCodes: [],
      },
    });
    expect(form.values.clientName).toBe(input.values.clientName);
    expect(form.values.totalAmount).toBe(input.values.totalAmount);
  });

  it("shows the residents to whoever may read them, and logs every reading", async () => {
    const { fileId, siteId } = await register("buildingContract");
    const reception = await test.sessionFor("RECEPTION_SALES");
    expect((await test.transact((ex, ctx) => getFileForm(ex, ctx, { fileId }), reception)).residents).toBe(
      "RESTRICTED",
    );
    expect((await test.transact((ex, ctx) => getFileForm(ex, ctx, { fileId }))).residents).toBe("ALLOWED");

    await expect(test.transact((ex, ctx) => openResidentList(ex, ctx, { fileId }), reception)).rejects.toThrow(
      "You do not have permission to do this.",
    );
    const lines = await test.transact((ex, ctx) => openResidentList(ex, ctx, { fileId }));
    expect(lines.map((line) => [line.number, line.name])).toEqual([
      [1, "مرابط بلقاسم"],
      [2, "حداد فاطمة"],
      [3, "زروقي عبد القادر"],
      [4, "بوعزيز سهام"],
      [5, "شريفي نور الدين"],
      [6, "عيساوي ليلى"],
    ]);
    expect(await consultations(siteId)).toMatchObject([{ operation: "CONSULT", action: "VIEW_RESTRICTED" }]);
  });
});

describe("the printed sheet of a file", () => {
  it("ticks «حالة الملف» from the stage and prints the residents still there", async () => {
    const { fileId, siteId } = await register("buildingContract");
    await test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to: "VISIT" }));
    await test.db
      .updateTable("Resident")
      .set({ leftDate: "2026-10-12" as never })
      .where("number", "=", 2)
      .execute();

    const sheet = await test.transact((ex, ctx) => openFileSheet(ex, ctx, { fileId }));
    expect(sheet.values.statusTicks).toEqual(["NEW", "VISIT"]);
    expect(sheet.values.registrationNumber).toBe("1/BLC");
    expect(sheet.residents?.map((line) => line.number)).toEqual([1, 3, 4, 5, 6]);
    expect(sheet.residentsRestricted).toBe(false);
    expect(await consultations(siteId)).toHaveLength(1);

    const reception = await test.sessionFor("RECEPTION_SALES");
    const restricted = await test.transact((ex, ctx) => openFileSheet(ex, ctx, { fileId }), reception);
    expect(restricted).toMatchObject({ residents: null, residentsRestricted: true });
  });

  it("logs every print as a disclosure", async () => {
    const { fileId } = await register("housingRequest");
    await test.transact((ex, ctx) => recordFilePrint(ex, ctx, { fileId, sheet: "FORM" }));
    expect(await consultations(fileId)).toMatchObject([
      { operation: "DISCLOSE", action: "PRINT", disclosure: "PRINT" },
    ]);
    await expect(test.transact((ex, ctx) => recordFilePrint(ex, ctx, { fileId, sheet: "RESIDENTS" }))).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });
});
