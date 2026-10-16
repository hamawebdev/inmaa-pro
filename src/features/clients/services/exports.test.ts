import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { clearHandlers, loadFeatureEvents, registerHandler, resetFeatureEvents, type EventName } from "@/lib/events";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";

import {
  getAcceptedQuote,
  getClientForInvoice,
  getFileBillingTerms,
  getFileEstimate,
  getFileForScheduling,
  getSiteForOrder,
} from "./exports";
import { closeFile, moveFileStage, registerFile, type RegisterFileInput } from "./files";

let test: TestDatabase;
let seen: Array<{ event: EventName; payload: unknown }>;

beforeEach(async () => {
  // Only this folder's events are listened to: what Operations and Money do with them is theirs to test.
  clearHandlers();
  resetFeatureEvents();
  test = await createTestDatabase({ events: false });
  seen = [];
  for (const event of ["file.ended", "file.contracted"] as const) {
    registerHandler("stock", event, async (_ex, _ctx, payload) => {
      seen.push({ event, payload });
    });
  }
});
afterEach(() => {
  test.close();
  clearHandlers();
  resetFeatureEvents();
  loadFeatureEvents();
});

const demoInput = (name: string): RegisterFileInput =>
  structuredClone(DEMO_FILES.find((file) => file.name === name)!.input) as RegisterFileInput;
const register = (input: RegisterFileInput) => test.transact((ex, ctx) => registerFile(ex, ctx, input));
const move = (fileId: string, to: Parameters<typeof moveFileStage>[2]["to"]) =>
  test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to }));

/** An on-demand file signed: its quote accepted, then «متعاقد». */
async function signedRequest() {
  const { fileId, siteId } = await register(demoInput("housingRequest"));
  await move(fileId, "VISIT");
  await move(fileId, "QUOTE");
  await test.rows.insert("Quote", { fileId, status: "ISSUED", result: "ACCEPTED" });
  await move(fileId, "CONTRACTED");
  seen.length = 0;
  return { fileId, siteId };
}

describe("a file as the schedule needs it", () => {
  it("gives the schedule fields as typed, the bearers without amounts, the counts and the services", async () => {
    const { fileId, clientId, siteId } = await register(demoInput("orgContract"));
    const file = await test.transact((ex, ctx) => getFileForScheduling(ex, ctx, { fileId }));

    expect(file).toMatchObject({
      id: fileId,
      number: "1",
      formKind: "ORG_CONTRACT",
      division: "ORGANISATION",
      serviceType: "CONTRACT",
      stage: "NEW",
      clientId,
      siteId,
      clientName: "شركة الأوراس للتوزيع",
      clientManagerName: "قاسمي نادية",
      clientPhone: "032 55 10 20",
      contractKind: "SHORT",
      contractDuration: "M3",
      executionDays: ["SAT", "SUN", "MON", "TUE", "WED"],
      period: "MORNING",
      periodFrom: "07:00",
      periodTo: "09:00",
      startDate: "2026-10-10",
      endDate: "2027-01-09",
      arrivalTime: "07:00",
      departureTime: "09:00",
      workersCount: 2,
      visitsPerWeek: 5,
      teamAccess: ["VIA_GUARD"],
      hasGuard: true,
      guardName: "عمار بن ساسي",
      securityInstructions: true,
      materialsBearer: "CENTRE",
      transportBearer: "OWNER",
      equipmentStorage: true,
      storagePlace: "مخزن الطابق الأرضي",
      wasteDisposal: ["CONTAINERS", "OTHER"],
      wasteDisposalOther: "خلف المبنى",
      description: { family: "ORGANISATION", offices: 12, toilets: 4, buildArea: 640, floorArea: 600 },
      serviceLabel: "تنظيف دوري، تنظيف شهري للواجهات",
      closedAt: null,
    });
    // Never an amount.
    expect(Object.keys(file!).filter((key) => /amount/i.test(key))).toEqual([]);
    expect(file!.services.slice(0, 5)).toEqual([
      { list: "PROVIDED", code: "FLOORS", customLabel: null, labelAr: "تنظيف الأرضيات" },
      { list: "PROVIDED", code: "TOILETS", customLabel: null, labelAr: "تنظيف دورات المياه" },
      { list: "PROVIDED", code: "WINDOWS", customLabel: null, labelAr: "تنظيف النوافذ" },
      { list: "PROVIDED", code: "WASTE_SORTING", customLabel: null, labelAr: "جمع وفرز النفايات" },
      { list: "PROVIDED", code: null, customLabel: "تنظيف المصعد", labelAr: "تنظيف المصعد" },
    ]);
  });

  it("gives a request's kind and duration in its unit, and the complex's buildings", async () => {
    const request = await register(demoInput("housingRequest"));
    const complex = await register(demoInput("complexContract"));
    const [forRequest, forComplex] = await test.transact(async (ex, ctx) => [
      await getFileForScheduling(ex, ctx, { fileId: request.fileId }),
      await getFileForScheduling(ex, ctx, { fileId: complex.fileId }),
    ]);
    expect(forRequest).toMatchObject({
      requestKinds: ["COMPREHENSIVE", "DEEP"],
      executionDuration: 1.5,
      executionDurationUnit: "DAYS",
      contractKind: null,
      visitsPerWeek: null,
    });
    expect(forComplex).toMatchObject({
      clientCapacity: "مسير الإقامة",
      description: { family: "BUILDING", stairs: 4, apartments: 64, buildingsCount: 4 },
    });
    expect(await test.transact((ex, ctx) => getFileForScheduling(ex, ctx, { fileId: "nothing" }))).toBeNull();
  });
});

describe("a site as a mission order needs it", () => {
  it("prints the security text only when that file ticks «تعليمات أمنية: نعم»", async () => {
    const org = await register(demoInput("orgContract"));
    const site = await test.transact((ex, ctx) => getSiteForOrder(ex, ctx, { siteId: org.siteId, fileId: org.fileId }));
    expect(site).toMatchObject({
      address: "المنطقة الصناعية، الطريق الوطني رقم 10",
      communeName: "عين البيضاء",
      wilayaCode: "04",
      zoneName: "عين البيضاء",
      forbiddenCodes: ["TECH_ROOMS", "ELECTRIC_ROOMS"],
      ppeCodes: ["GLOVES", "WORKWEAR", "BADGE"],
      allowedDays: ["SAT", "SUN", "MON", "TUE", "WED"],
      allowedFrom: "06:30",
      allowedTo: "10:00",
      securityInstructionsText: "بطاقة الدخول عند الحارس، ولا يُدخل إلى غرفة الخوادم.",
      personOnSite: { name: "قاسمي نادية", role: "المديرة", phone: "032 55 10 20" },
    });

    const input = demoInput("orgContract");
    const quiet = await register({ ...input, values: { ...input.values, securityInstructions: false } });
    const quietSite = await test.transact((ex, ctx) =>
      getSiteForOrder(ex, ctx, { siteId: quiet.siteId, fileId: quiet.fileId }),
    );
    expect(quietSite?.securityInstructionsText).toBeNull();
  });

  it("names the person on site: the receiver, else the coordinator, else the client", async () => {
    const house = await register(demoInput("housingContract"));
    const read = () =>
      test.transact((ex, ctx) => getSiteForOrder(ex, ctx, { siteId: house.siteId, fileId: house.fileId }));
    expect((await read())?.personOnSite).toEqual({ name: "بوزيد سليم", role: null, phone: "0661 20 31 42" });

    await test.rows.insert("Contact", {
      clientId: house.clientId,
      siteId: house.siteId,
      name: "بوزيد أمينة",
      role: "الزوجة",
      phone: "0662 00 11 22",
      isCoordinator: 1,
    });
    expect((await read())?.personOnSite).toEqual({ name: "بوزيد أمينة", role: "الزوجة", phone: "0662 00 11 22" });
  });

  it("refuses a file of another site", async () => {
    const one = await register(demoInput("housingContract"));
    const other = await register(demoInput("housingRequest"));
    await expect(
      test.transact((ex, ctx) => getSiteForOrder(ex, ctx, { siteId: one.siteId, fileId: other.fileId })),
    ).rejects.toThrow("clients: getSiteForOrder was given a file of another site");
  });
});

describe("closing a file", () => {
  it("closes a refused quote where it stopped, and tells nobody", async () => {
    const { fileId } = await register(demoInput("housingRequest"));
    await move(fileId, "QUOTE");
    await test.transact((ex, ctx) => closeFile(ex, ctx, { fileId, reason: "QUOTE_REFUSED", note: "السعر مرتفع" }));

    const file = await test.db
      .selectFrom("File")
      .select(["stage", "closedAt", "closeReason", "closeNote", "endedDate"])
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file).toEqual({
      stage: "QUOTE",
      closedAt: "2026-10-12T08:00:00.000Z",
      closeReason: "QUOTE_REFUSED",
      closeNote: "السعر مرتفع",
      endedDate: null,
    });
    expect(seen).toEqual([]);
    await expect(
      test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to: "VISIT", reason: "x" })),
    ).rejects.toThrow("This file is closed and can no longer be changed.");
    await expect(test.transact((ex, ctx) => closeFile(ex, ctx, { fileId, reason: "NO_ANSWER" }))).rejects.toThrow(
      "This file is closed and can no longer be changed.",
    );
  });

  it("ends a finished on-demand job, tells Operations and Money once, and takes a second call calmly", async () => {
    const { fileId } = await signedRequest();
    test.clock.advance({ days: 6 });
    const done = await test.transact((ex, ctx) => closeFile(ex, ctx, { fileId, reason: "JOB_DONE" }));
    expect(done).toEqual({ fileId, closed: true });

    const file = await test.db
      .selectFrom("File")
      .select(["stage", "endedDate", "endKind", "closeReason"])
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file).toEqual({
      stage: "CONTRACT_ENDED",
      endedDate: "2026-10-18",
      endKind: "JOB_DONE",
      closeReason: "JOB_DONE",
    });
    expect(seen).toEqual([{ event: "file.ended", payload: { fileId, endKind: "JOB_DONE", endedDate: "2026-10-18" } }]);
    const last = await test.db
      .selectFrom("FileStageEvent")
      .select(["fromStage", "toStage"])
      .where("fileId", "=", fileId)
      .orderBy("changedAt", "desc")
      .executeTakeFirstOrThrow();
    expect(last).toEqual({ fromStage: "CONTRACTED", toStage: "CONTRACT_ENDED" });

    expect(await test.transact((ex, ctx) => closeFile(ex, ctx, { fileId, reason: "JOB_DONE" }))).toEqual({
      fileId,
      closed: false,
    });
    expect(seen).toHaveLength(1);
  });

  it("needs the requests for every reason, and ends only a job on demand as done (audit ACC-3)", async () => {
    const accountant = await test.sessionFor("ACCOUNTANT");
    const { fileId } = await signedRequest();
    for (const reason of ["CLIENT_CANCELLED", "JOB_DONE"] as const) {
      await expect(test.transact((ex, ctx) => closeFile(ex, ctx, { fileId, reason }), accountant)).rejects.toThrow(
        "You do not have permission to do this.",
      );
    }
    await expect(
      test.transact((ex, ctx) => closeFile(ex, ctx, { fileId, reason: "CLIENT_CANCELLED" })),
    ).rejects.toThrow("A signed file is ended from its stage, with the kind of ending.");
    const contract = await test.transact((ex, ctx) =>
      registerFile(ex, ctx, structuredClone(DEMO_FILES.find((file) => file.name === "orgContract")!.input) as never),
    );
    await expect(
      test.transact((ex, ctx) => closeFile(ex, ctx, { fileId: contract.fileId, reason: "JOB_DONE" })),
    ).rejects.toThrow("Only a job on demand ends when its last visit is done.");
  });
});

describe("for Money", () => {
  it("gives the accepted quote with its totals by kind, and the estimate of the work", async () => {
    const demo = await createTestDatabase({ demo: ["clients"] });
    try {
      const fileId = demo.demo.clients.orgJob;
      const quote = await demo.transact((ex, ctx) => getAcceptedQuote(ex, ctx, { fileId }));
      expect(quote).toMatchObject({
        number: "0002/2026",
        total: 3400000,
        discount: 150000,
        totals: { INITIAL_JOB: 3200000, PERIODIC: 0, EXTRA: 350000 },
      });
      expect(
        await demo.transact((ex, ctx) => getAcceptedQuote(ex, ctx, { fileId: demo.demo.clients.housingRequest })),
      ).toBeNull();
      expect(await demo.transact((ex, ctx) => getFileEstimate(ex, ctx, { fileId }))).toEqual({
        perVisitMin: 720,
        workers: 3,
        source: "COST_STUDY",
      });
      expect(
        await demo.transact((ex, ctx) => getFileEstimate(ex, ctx, { fileId: demo.demo.clients.buildingContract })),
      ).toEqual({ perVisitMin: null, workers: null, source: null });
    } finally {
      demo.close();
    }
  });
});

describe("the billing terms and the buyer, for Money", () => {
  it("gives a signed file's terms and an organisation's buyer block, saying what is missing", async () => {
    const demo = await createTestDatabase({ demo: ["clients"] });
    try {
      const fileId = demo.demo.clients.orgJob;
      const terms = await demo.transact((ex, ctx) => getFileBillingTerms(ex, ctx, { fileId }));
      expect(terms).toMatchObject({
        stage: "CONTRACTED",
        serviceType: "ON_DEMAND",
        totalAmount: 3400000,
        amountBasis: "WHOLE_CONTRACT",
        amountIncludesVat: true,
        paymentMethods: ["BANK_TRANSFER"],
        renewedBy: null,
        acceptedQuoteTotals: { INITIAL_JOB: 3200000, PERIODIC: 0, EXTRA: 350000 },
      });
      expect(await demo.transact((ex, ctx) => getFileBillingTerms(ex, ctx, { fileId: "nothing" }))).toBeNull();

      const buyer = await demo.transact((ex, ctx) =>
        getClientForInvoice(ex, ctx, { clientId: demo.demo.clients.orgJobClient, fileId }),
      );
      expect(buyer).toMatchObject({
        name: "عيادة الشفاء الطبية",
        hasTradeRegister: true,
        rc: null,
        address: "شارع أول نوفمبر، رقم 22، أم البواقي، أم البواقي",
        missing: ["rcNumber", "nif", "nis"],
      });
    } finally {
      demo.close();
    }
  });
});
