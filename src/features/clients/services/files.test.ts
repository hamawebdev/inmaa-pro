import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { remapCommune } from "@/features/core/services/places";
import { verifyChains } from "@/lib/chain";
import { clearHandlers, loadFeatureEvents, registerHandler, resetFeatureEvents, type EventName } from "@/lib/events";
import { dinarsToMoney } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";
import type { FormValues } from "../forms/values";
import type { FormKind } from "../validators/option-lists";

import { loadFileRecord, sheetValuesOf } from "./file-records";
import { moveFileStage, registerFile, saveFileForm, type RegisterFileInput } from "./files";

let test: TestDatabase;
let seen: Array<{ event: EventName; payload: unknown }>;

/** Every event this folder emits, as Operations and Money would receive it. */
function listen() {
  seen = [];
  for (const event of ["file.contracted", "file.termsChanged", "file.ended", "site.changed"] as const) {
    registerHandler("stock", event, async (_ex, _ctx, payload) => {
      seen.push({ event, payload });
    });
  }
}

beforeEach(async () => {
  clearHandlers();
  resetFeatureEvents();
  loadFeatureEvents();
  test = await createTestDatabase();
  listen();
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
const move = (fileId: string, to: Parameters<typeof moveFileStage>[2]["to"], extra = {}) =>
  test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to, ...extra }));

async function sheetOf(fileId: string): Promise<FormValues> {
  const record = await loadFileRecord(test.db, fileId);
  return sheetValuesOf(record!);
}

const logOf = (entity: string, entityId: string) =>
  test.db
    .selectFrom("AuditLog")
    .select(["operation", "action", "reason", "changes", "subjectKind", "entityLabel", "localDate"])
    .where("entity", "=", entity)
    .where("entityId", "=", entityId)
    .orderBy("chainSeq")
    .execute();

describe("registering a file", () => {
  it("makes the client, the site and the file from his form, numbered by the form's own counter", async () => {
    const building = await register(demoInput("buildingContract"));
    const house = await register(demoInput("housingRequest"));

    expect(building.number).toBe("1/BLC");
    expect(house.number).toBe("1");
    const files = await test.db
      .selectFrom("File")
      .select(["id", "formKind", "division", "serviceType", "stage", "numberSuffix", "registrationDate", "isReturning"])
      .orderBy("createdAt")
      .execute();
    expect(files).toEqual([
      {
        id: building.fileId,
        formKind: "BUILDING_CONTRACT",
        division: "BUILDING",
        serviceType: "CONTRACT",
        stage: "NEW",
        numberSuffix: "BLC",
        registrationDate: "2026-10-12",
        isReturning: 0,
      },
      {
        id: house.fileId,
        formKind: "HOUSING_REQUEST",
        division: "HOUSING",
        serviceType: "ON_DEMAND",
        stage: "NEW",
        numberSuffix: "",
        registrationDate: "2026-10-12",
        isReturning: 0,
      },
    ]);

    const clients = await test.db
      .selectFrom("Client")
      .select(["number", "clientType", "name", "nameKey", "phone1", "phoneKeys", "capacity", "contractingParty"])
      .orderBy("numberSeq")
      .execute();
    expect(clients).toEqual([
      {
        number: "1",
        clientType: "BUILDING_PARTY",
        name: "مرابط بلقاسم",
        nameKey: "مرابط بلقاسم",
        phone1: "0550 11 22 33",
        phoneKeys: "|0550112233|",
        capacity: "رئيس جمعية السكان",
        contractingParty: "RESIDENTS_ASSOCIATION",
      },
      {
        number: "2",
        clientType: "INDIVIDUAL",
        name: "بن صالح كريمة",
        nameKey: "بن صالح كريمه",
        phone1: "0661 45 12 78",
        phoneKeys: "|0661451278|",
        capacity: null,
        contractingParty: null,
      },
    ]);

    // The site: his answers, the office block, the commune of the address and its zone (A9).
    const site = await test.db
      .selectFrom("Site as s")
      .innerJoin("Commune as c", "c.id", "s.communeId")
      .innerJoin("Zone as z", "z.id", "s.zoneId")
      .select(["s.division", "s.siteNumber", "s.commonName", "s.address", "c.nameAr", "z.name as zone"])
      .select(["s.forbiddenCodes", "s.instructionCodes", "s.meetingPoint", "s.keysHeld"])
      .where("s.id", "=", building.siteId)
      .executeTakeFirstOrThrow();
    expect(site).toEqual({
      division: "BUILDING",
      siteNumber: "B7",
      commonName: "عمارة الورود",
      address: "حي 200 مسكن",
      nameAr: "أم البواقي",
      zone: "أم البواقي",
      forbiddenCodes: '["RESIDENT_FLATS","ELECTRIC_ROOMS"]',
      instructionCodes: '["NO_MOVE_PROPERTY","KEEP_QUIET","WET_FLOOR_SIGNS"]',
      meetingPoint: "مدخل العمارة B7",
      keysHeld: 0,
    });

    // The first line of the stage history is written with the file.
    const history = await test.db.selectFrom("FileStageEvent").selectAll().where("fileId", "=", house.fileId).execute();
    expect(history).toMatchObject([{ fromStage: null, toStage: "NEW", changedByUserId: test.manager.userId }]);
  });

  it("keeps every answer of every form, and gives them back as his sheet says them", async () => {
    for (const file of DEMO_FILES) {
      const { fileId } = await register(demoInput(file.name));
      const sheet = await sheetOf(fileId);
      const { values } = file.input;
      expect({
        ...sheet,
        registrationNumber: undefined,
        registrationDate: undefined,
        dossierNumber: undefined,
      }).toEqual({
        ...values,
        registrationNumber: undefined,
        registrationDate: undefined,
        dossierNumber: undefined,
        // A list's blank lines come back as blanks, one per line of that form.
        ...("providedServicesCustom" in sheet ? { providedServicesCustom: sheet.providedServicesCustom } : {}),
        ...("programmedServicesCustom" in sheet ? { programmedServicesCustom: sheet.programmedServicesCustom } : {}),
      });
      if (values.providedServicesCustom) {
        expect(sheet.providedServicesCustom?.slice(0, values.providedServicesCustom.length)).toEqual(
          values.providedServicesCustom,
        );
      }
      if (values.programmedServicesCustom) {
        expect(sheet.programmedServicesCustom?.slice(0, values.programmedServicesCustom.length)).toEqual(
          values.programmedServicesCustom,
        );
      }
    }
  });

  it("stores each service as a row Operations and Money can read, in his order", async () => {
    const { fileId } = await register(demoInput("orgContract"));
    const services = await test.db
      .selectFrom("FileService")
      .select(["list", "code", "customLabel", "blankSlot", "sortOrder"])
      .where("fileId", "=", fileId)
      .orderBy("list")
      .orderBy("sortOrder")
      .execute();
    expect(services.filter((row) => row.list === "PROGRAMMED")).toEqual([
      { list: "PROGRAMMED", code: "PERIODIC", customLabel: null, blankSlot: null, sortOrder: 0 },
      { list: "PROGRAMMED", code: null, customLabel: "تنظيف شهري للواجهات", blankSlot: 1, sortOrder: 3 },
    ]);
    expect(services.filter((row) => row.list === "PROVIDED").map((row) => row.code ?? row.customLabel)).toEqual([
      "FLOORS",
      "TOILETS",
      "WINDOWS",
      "WASTE_SORTING",
      "تنظيف المصعد",
      "GLASS",
      "OFFICES",
      "RECEPTION_HALL",
    ]);
  });

  it("logs every record holding personal data it creates", async () => {
    const { fileId, clientId, siteId } = await register(demoInput("buildingContract"));
    expect(await logOf("Client", clientId)).toMatchObject([{ operation: "COLLECT", subjectKind: "CLIENT" }]);
    expect(await logOf("Site", siteId)).toMatchObject([{ operation: "COLLECT", subjectKind: "CLIENT" }]);
    expect(await logOf("File", fileId)).toMatchObject([{ operation: "COLLECT", entityLabel: "1/BLC" }]);
    const residents = await test.db.selectFrom("Resident").select(["id", "number", "name"]).orderBy("number").execute();
    expect(residents.map((resident) => resident.name)).toEqual([
      "مرابط بلقاسم",
      "حداد فاطمة",
      "زروقي عبد القادر",
      "بوعزيز سهام",
      "شريفي نور الدين",
      "عيساوي ليلى",
    ]);
    expect(await logOf("Resident", residents[0].id)).toMatchObject([{ operation: "COLLECT", subjectKind: "RESIDENT" }]);
    expect((await verifyChains(test.db)).ok).toBe(true);
  });

  it("refuses a file without a name, a phone, an address or a commune", async () => {
    const without = (key: keyof FormValues) => {
      const input = demoInput("housingRequest");
      delete input.values[key];
      return register(input);
    };
    await expect(without("clientName")).rejects.toThrow("The client's name is required.");
    await expect(without("phone")).rejects.toThrow("The phone number is required.");
    await expect(without("address")).rejects.toThrow("The address is required.");
    await expect(without("commune")).rejects.toThrow("The commune is required.");
    expect(await test.db.selectFrom("File").select("id").execute()).toEqual([]);
  });

  it("refuses an option his form does not print, and a badly written answer", async () => {
    const office = demoInput("housingRequest");
    office.values.providedServices = ["OFFICES"];
    await expect(register(office)).rejects.toThrow();

    const phone = demoInput("housingRequest");
    phone.values.phone = "06612";
    await expect(register(phone)).rejects.toThrow("The phone number has 9 or 10 digits.");

    const date = demoInput("housingRequest");
    date.values.startDate = "2026-02-30";
    await expect(register(date)).rejects.toThrow("Enter a valid date.");

    const later = demoInput("housingRequest");
    later.values.registrationDate = "2026-10-13";
    await expect(register(later)).rejects.toThrow("A registration date cannot be after today.");

    const residents = demoInput("housingRequest");
    residents.residents = [{ number: 1, name: "حداد فاطمة" }];
    await expect(register(residents)).rejects.toThrow(
      "Only buildings and residential complexes have a list of residents.",
    );
  });

  it("is refused to a role that only reads the requests", async () => {
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => registerFile(ex, ctx, demoInput("housingRequest")), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
  });

  it("takes the residents list with a new file from whoever registers it; after that it needs the capability", async () => {
    // The coordinator's ruling: the clerk copies the paper in front of her.
    const reception = await test.sessionFor("RECEPTION_SALES");
    const input = demoInput("buildingContract");
    const { fileId, siteId } = await test.transact((ex, ctx) => registerFile(ex, ctx, input), reception);
    const residents = await test.db.selectFrom("Resident").select("id").where("siteId", "=", siteId).execute();
    expect(residents).toHaveLength(input.residents!.length);
    const collected = await test.db
      .selectFrom("AuditLog")
      .select("id")
      .where("operation", "=", "COLLECT")
      .where("entity", "=", "Resident")
      .execute();
    expect(collected).toHaveLength(residents.length);

    // The same list sent again with the form is a change of the list: refused without `residents.read`.
    await expect(
      test.transact(
        (ex, ctx) => saveFileForm(ex, ctx, { fileId, values: input.values, residents: input.residents }),
        reception,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});

describe("saving the form again", () => {
  it("sends only what changed and logs it", async () => {
    const input = demoInput("housingContract");
    const { fileId, clientId } = await register(input);
    const before = await test.db.selectFrom("File").selectAll().where("id", "=", fileId).executeTakeFirstOrThrow();

    test.clock.advance({ hours: 1 });
    const values: FormValues = {
      ...input.values,
      phone: "0661 99 88 77",
      totalAmount: dinarsToMoney(17500),
      providedServices: ["FLOORS", "KITCHEN", "CURTAINS"],
    };
    const result = await test.transact((ex, ctx) => saveFileForm(ex, ctx, { fileId, values }));
    expect(result).toEqual({ fileId, changed: true });

    const after = await test.db.selectFrom("File").selectAll().where("id", "=", fileId).executeTakeFirstOrThrow();
    const changedColumns = Object.keys(after).filter(
      (column) => after[column as keyof typeof after] !== before[column as keyof typeof before],
    );
    expect(changedColumns.sort()).toEqual(["totalAmount", "updatedAt"]);

    const fileLog = (await logOf("File", fileId)).at(-1)!;
    expect(fileLog.operation).toBe("CHANGE");
    expect(JSON.parse(fileLog.changes!)).toEqual({
      totalAmount: [1600000, 1750000],
      "services.PROVIDED": [
        "FLOORS, KITCHEN, WINDOWS, BATHROOMS, تنظيف السلم, GLASS, CARPETS",
        "FLOORS, KITCHEN, CURTAINS, تنظيف السلم",
      ],
    });
    const clientLog = (await logOf("Client", clientId)).at(-1)!;
    expect(JSON.parse(clientLog.changes!)).toEqual({ phone1: ["0661 20 31 42", "0661 99 88 77"] });
    expect(
      await test.db.selectFrom("Client").select("phoneKeys").where("id", "=", clientId).executeTakeFirstOrThrow(),
    ).toEqual({ phoneKeys: "|0661998877|" });

    expect((await sheetOf(fileId)).providedServices).toEqual(["FLOORS", "KITCHEN", "CURTAINS"]);
  });

  it("writes nothing and logs nothing when nothing changed", async () => {
    const input = demoInput("orgContract");
    const { fileId } = await register(input);
    const entries = await test.db.selectFrom("AuditLog").select("id").execute();
    const result = await test.transact((ex, ctx) =>
      saveFileForm(ex, ctx, { fileId, values: input.values, office: input.office, siteOffice: input.siteOffice }),
    );
    expect(result.changed).toBe(false);
    expect(await test.db.selectFrom("AuditLog").select("id").execute()).toHaveLength(entries.length);
  });

  it("moves the site to the zone of its new commune and tells Operations", async () => {
    const input = demoInput("housingRequest");
    const { fileId, siteId } = await register(input);
    seen.length = 0;
    await test.transact((ex, ctx) =>
      saveFileForm(ex, ctx, { fileId, values: { ...input.values, commune: "عين البيضاء" } }),
    );
    const site = await test.db
      .selectFrom("Site as s")
      .innerJoin("Zone as z", "z.id", "s.zoneId")
      .select("z.name")
      .where("s.id", "=", siteId)
      .executeTakeFirstOrThrow();
    expect(site.name).toBe("عين البيضاء");
    expect(seen).toEqual([{ event: "site.changed", payload: { siteId, zoneChanged: true, profileChanged: true } }]);
  });

  it("keeps the residents in line with the list typed, and needs a reason to remove one", async () => {
    const input = demoInput("buildingContract");
    const { fileId } = await register(input);
    const kept = await test.db.selectFrom("Resident").select(["id", "number", "name"]).orderBy("number").execute();
    const lines = kept.map((resident) => ({ id: resident.id, number: resident.number, name: resident.name }));

    const withoutFirst = lines.slice(1);
    await expect(
      test.transact((ex, ctx) => saveFileForm(ex, ctx, { fileId, values: input.values, residents: withoutFirst })),
    ).rejects.toThrow("A reason is required.");

    await test.transact((ex, ctx) =>
      saveFileForm(ex, ctx, {
        fileId,
        values: input.values,
        residents: [...withoutFirst, { number: 7, name: "رحماني يوسف", phone: "0770 00 11 22" }],
        reason: "غادر العمارة",
      }),
    );
    const now = await test.db
      .selectFrom("Resident")
      .select(["number", "name", "deletedAt"])
      .orderBy("number")
      .execute();
    expect(now.filter((resident) => resident.deletedAt === null).map((resident) => resident.number)).toEqual([
      2, 3, 4, 5, 6, 7,
    ]);
    const erased = await logOf("Resident", kept[0].id);
    expect(erased.at(-1)).toMatchObject({ operation: "ERASE", action: "SOFT_DELETE", reason: "غادر العمارة" });
  });
});

describe("the stages of a file", () => {
  it("goes forward with its checks and keeps the history", async () => {
    const input = demoInput("buildingContract");
    const { fileId } = await register({ ...input, values: { ...input.values, firstVisitDate: undefined } });

    await expect(move(fileId, "VISIT")).rejects.toThrow("Plan the first visit, or write its date on the form, first.");
    await expect(move(fileId, "CONTRACTED")).rejects.toThrow("The file cannot jump to this stage.");
    await move(fileId, "QUOTE");
    test.clock.advance({ days: 1 });
    await move(fileId, "CONTRACTED", { note: "وقع العقد في المكتب" });

    const history = await test.db
      .selectFrom("FileStageEvent")
      .select(["fromStage", "toStage", "note"])
      .where("fileId", "=", fileId)
      .orderBy("changedAt")
      .execute();
    expect(history).toEqual([
      { fromStage: null, toStage: "NEW", note: null },
      { fromStage: "NEW", toStage: "QUOTE", note: null },
      { fromStage: "QUOTE", toStage: "CONTRACTED", note: "وقع العقد في المكتب" },
    ]);
    const log = (await logOf("File", fileId)).filter((entry) => entry.action === "STATUS_CHANGE");
    expect(log.map((entry) => JSON.parse(entry.changes!))).toEqual([
      { stage: ["NEW", "QUOTE"] },
      { stage: ["QUOTE", "CONTRACTED"] },
    ]);
  });

  it("does not take a contract to «متعاقد» while his sheet or the basis of its total is missing", async () => {
    const input = demoInput("orgContract");
    const { fileId } = await register({
      ...input,
      values: { ...input.values, startDate: undefined },
      office: { ...input.office, amountBasis: null },
    });
    await move(fileId, "VISIT");
    await move(fileId, "QUOTE");
    await expect(move(fileId, "CONTRACTED")).rejects.toThrow("The form is not complete enough for a contract.");
  });

  it("at «متعاقد», freezes who signed and tells Operations and Money once", async () => {
    const input = demoInput("housingContract");
    const { fileId, clientId } = await register(input);
    await move(fileId, "QUOTE");
    seen.length = 0;
    test.clock.advance({ days: 2 });
    await move(fileId, "CONTRACTED");

    const file = await test.db
      .selectFrom("File")
      .select(["stage", "lockedAt", "contractedAt", "amountIncludesVat", "partySnapshot"])
      .where("id", "=", fileId)
      .executeTakeFirstOrThrow();
    expect(file).toMatchObject({
      stage: "CONTRACTED",
      lockedAt: "2026-10-14T08:00:00.000Z",
      contractedAt: "2026-10-14T08:00:00.000Z",
      amountIncludesVat: 1,
    });
    expect(JSON.parse(file.partySnapshot!)).toEqual({
      dossierNumber: "1",
      clientName: "بوزيد سليم",
      phone: "0661 20 31 42",
      siteNumber: "27",
      commonName: "فيلا بوزيد قرب مسجد النور",
      address: "حي النصر، طريق خنشلة",
      commune: "أم البواقي",
      wilaya: "04",
      propertyType: "VILLA",
      ownership: "RENTED",
    });
    expect(seen).toEqual([{ event: "file.contracted", payload: { fileId } }]);

    // A later change of the client's name does not change what was signed.
    await test.db.updateTable("Client").set({ name: "بوزيد سليم الدين" }).where("id", "=", clientId).execute();
    expect((await sheetOf(fileId)).clientName).toBe("بوزيد سليم");
  });

  it("keeps a signed sheet: changing it needs the capability and a reason, and tells who follows", async () => {
    const input = demoInput("housingContract");
    const { fileId, clientId } = await register(input);
    await move(fileId, "QUOTE");
    await move(fileId, "CONTRACTED");
    seen.length = 0;
    const values = { ...input.values, clientName: "بوزيد سليم بن علي", workersCount: 3 };

    const admin = await test.sessionFor("ADMINISTRATION");
    await expect(
      test.transact((ex, ctx) => saveFileForm(ex, ctx, { fileId, values, reason: "خطأ في الكتابة" }), admin),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(test.transact((ex, ctx) => saveFileForm(ex, ctx, { fileId, values }))).rejects.toThrow(
      "A reason is required.",
    );
    // The office-only answers stay free.
    await test.transact(
      (ex, ctx) =>
        saveFileForm(ex, ctx, {
          fileId,
          values: input.values,
          office: { ...input.office, officeNotes: "يفضل الصباح" },
        }),
      admin,
    );

    await test.transact((ex, ctx) => saveFileForm(ex, ctx, { fileId, values, reason: "خطأ في الكتابة" }));
    expect((await sheetOf(fileId)).clientName).toBe("بوزيد سليم بن علي");
    // The client's own record is not the signed sheet: it keeps its name.
    expect(
      await test.db.selectFrom("Client").select("name").where("id", "=", clientId).executeTakeFirstOrThrow(),
    ).toEqual({ name: "بوزيد سليم" });
    const entry = (await logOf("File", fileId)).at(-1)!;
    expect(entry).toMatchObject({ operation: "CHANGE", reason: "خطأ في الكتابة" });
    expect(JSON.parse(entry.changes!)).toEqual({
      workersCount: [2, 3],
      clientName: ["بوزيد سليم", "بوزيد سليم بن علي"],
    });
    expect(seen).toEqual([{ event: "file.termsChanged", payload: { fileId } }]);
  });

  it("goes back only for the manager, with a reason, and never once signed", async () => {
    const input = demoInput("orgContract");
    const { fileId } = await register(input);
    await move(fileId, "VISIT");
    await move(fileId, "QUOTE");

    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact((ex, ctx) => moveFileStage(ex, ctx, { fileId, to: "VISIT", reason: "خطأ" }), reception),
    ).rejects.toThrow("Only the manager can move a file back to an earlier stage.");
    await expect(move(fileId, "VISIT")).rejects.toThrow("A reason is required.");
    await move(fileId, "VISIT", { reason: "العرض أرسل قبل الزيارة" });
    expect((await logOf("File", fileId)).filter((entry) => entry.action === "STATUS_CHANGE").at(-1)).toMatchObject({
      reason: "العرض أرسل قبل الزيارة",
    });

    await move(fileId, "QUOTE");
    await move(fileId, "CONTRACTED");
    await expect(move(fileId, "QUOTE", { reason: "تراجع العميل" })).rejects.toThrow(
      "A signed file does not go back to an earlier stage.",
    );
  });

  it("does not take an on-demand file to «متعاقد» before its quote is accepted", async () => {
    const { fileId } = await register(demoInput("housingRequest"));
    await move(fileId, "VISIT");
    await move(fileId, "QUOTE");
    await expect(move(fileId, "CONTRACTED")).rejects.toThrow(
      "An on-demand file becomes contracted once its quote is accepted.",
    );
  });
});

describe("a zone given to another commune", () => {
  it("moves the sites of that commune that were in the old zone", async () => {
    const input = demoInput("housingRequest");
    const { siteId } = await register(input);
    const site = await test.db
      .selectFrom("Site")
      .select(["communeId", "zoneId"])
      .where("id", "=", siteId)
      .executeTakeFirstOrThrow();
    const other = await test.transact(async (ex, ctx) => {
      const zone = await ex
        .insertInto("Zone")
        .values({ id: "zone-east", name: "الشرق", branchId: ctx.branchId, createdAt: ctx.now, updatedAt: ctx.now })
        .returning("id")
        .executeTakeFirstOrThrow();
      return zone.id;
    });
    seen.length = 0;
    await test.transact((ex, ctx) => remapCommune(ex, ctx, { communeId: site.communeId, toZoneId: other }));

    expect(
      await test.db.selectFrom("Site").select("zoneId").where("id", "=", siteId).executeTakeFirstOrThrow(),
    ).toEqual({ zoneId: other });
    expect(seen).toEqual([{ event: "site.changed", payload: { siteId, zoneChanged: true, profileChanged: false } }]);
    const entry = (await logOf("Site", siteId)).at(-1)!;
    expect(JSON.parse(entry.changes!)).toEqual({ zoneId: [site.zoneId, other] });
  });
});

it("knows every form kind's division and service type", () => {
  const kinds: FormKind[] = DEMO_FILES.map((file) => file.input.kind);
  expect(new Set(kinds).size).toBe(5);
});
