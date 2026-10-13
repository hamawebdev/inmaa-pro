import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decideOnTheSpot } from "@/features/people/services/sanction-decisions";
import { setSanction } from "@/features/people/services/sanctions";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";

import { openFileSheet } from "./file-reads";
import { registerFile, type RegisterFileInput } from "./files";
import { findReturningClients, getReturningFill } from "./returning";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const demoInput = (name: string): RegisterFileInput =>
  structuredClone(DEMO_FILES.find((file) => file.name === name)!.input) as RegisterFileInput;
const register = (input: RegisterFileInput) => test.transact((ex, ctx) => registerFile(ex, ctx, input));

describe("«قديم»: a client the centre already knows", () => {
  it("is found by a name, a common name, a phone or his number, with his sites", async () => {
    const house = await register(demoInput("housingContract"));
    await register(demoInput("orgContract"));
    const find = (search: string) =>
      test.transact(async (ex, ctx) => (await findReturningClients(ex, ctx, { search })).map((client) => client.name));

    expect(await find("بوزيد")).toEqual(["بوزيد سليم"]);
    expect(await find("فيلا بوزيد")).toEqual(["بوزيد سليم"]);
    expect(await find("0661 20")).toEqual(["بوزيد سليم"]);
    expect(await find("2")).toEqual(["شركة الأوراس للتوزيع"]);
    expect(await find("قاسمي")).toEqual(["شركة الأوراس للتوزيع"]);
    expect(await find("")).toEqual([]);

    const [client] = await test.transact((ex, ctx) => findReturningClients(ex, ctx, { search: "بوزيد" }));
    expect(client).toMatchObject({
      number: "1",
      phone: "0661 20 31 42",
      sites: [{ id: house.siteId, division: "HOUSING", lastFileId: house.fileId, lastFileNumber: "1" }],
    });
  });

  it("fills who he is and, on his own site, where it is and what it is made of; never the job", async () => {
    const house = await register(demoInput("housingContract"));

    const same = await test.transact((ex, ctx) =>
      getReturningFill(ex, ctx, { kind: "HOUSING_REQUEST", clientId: house.clientId, siteId: house.siteId }),
    );
    expect(same).toMatchObject({ siteId: house.siteId, copiedFromFileId: house.fileId, clientNumber: "1" });
    expect(same.values).toMatchObject({
      dossierNumber: "1",
      clientName: "بوزيد سليم",
      phone: "0661 20 31 42",
      address: "حي النصر، طريق خنشلة",
      commune: "أم البواقي",
      wilaya: "04",
      propertyType: "VILLA",
      rooms: 5,
      buildArea: 180500,
    });
    for (const key of ["totalAmount", "startDate", "executionDays", "providedServices", "issuedDate"] as const) {
      expect(same.values[key], key).toBeUndefined();
    }
    expect(same.siteOffice).toMatchObject({ keysHeld: true, womenOnly: true, landmark: "قرب مسجد النور" });

    // A new site of his, or a file of another division: only who he is.
    const other = await test.transact((ex, ctx) =>
      getReturningFill(ex, ctx, { kind: "ORG_CONTRACT", clientId: house.clientId, siteId: house.siteId }),
    );
    expect(other).toMatchObject({ siteId: null, copiedFromFileId: null, siteOffice: null });
    expect(other.values).toEqual({ dossierNumber: "1", clientName: "بوزيد سليم", phone: "0661 20 31 42" });
  });

  it("registers the new file under his number and on his site, and ticks «قديم»", async () => {
    const first = await register(demoInput("housingContract"));
    const fill = await test.transact((ex, ctx) =>
      getReturningFill(ex, ctx, { kind: "HOUSING_REQUEST", clientId: first.clientId, siteId: first.siteId }),
    );
    const request = demoInput("housingRequest");
    const second = await register({
      ...request,
      values: { ...request.values, ...fill.values, phone: "0661 99 00 11" },
      siteOffice: fill.siteOffice ?? undefined,
      returning: { clientId: first.clientId, siteId: fill.siteId, copiedFromFileId: fill.copiedFromFileId },
    });

    expect(second).toMatchObject({ clientId: first.clientId, siteId: first.siteId, number: "1" });
    expect(await test.db.selectFrom("Client").select("id").execute()).toHaveLength(1);
    expect(await test.db.selectFrom("Site").select("id").execute()).toHaveLength(1);
    const file = await test.db
      .selectFrom("File")
      .select(["isReturning", "copiedFromFileId", "renewalOfFileId"])
      .where("id", "=", second.fileId)
      .executeTakeFirstOrThrow();
    expect(file).toEqual({ isReturning: 1, copiedFromFileId: first.fileId, renewalOfFileId: null });
    // What changed about him is saved on his record, and logged.
    expect(
      await test.db
        .selectFrom("Client")
        .select(["number", "phone1"])
        .where("id", "=", first.clientId)
        .executeTakeFirst(),
    ).toEqual({ number: "1", phone1: "0661 99 00 11" });
    const sheet = await test.transact((ex, ctx) => openFileSheet(ex, ctx, { fileId: second.fileId }));
    expect(sheet.values.statusTicks).toEqual(["OLD"]);
    expect(sheet.values.dossierNumber).toBe("1");
  });

  it("refuses a site that is not his, or of another division", async () => {
    const house = await register(demoInput("housingContract"));
    const org = await register(demoInput("orgContract"));
    const request = demoInput("housingRequest");
    await expect(register({ ...request, returning: { clientId: house.clientId, siteId: org.siteId } })).rejects.toThrow(
      "This site is not one of this client's sites in this division.",
    );
    await expect(register({ ...request, returning: { clientId: "nobody" } })).rejects.toThrow(
      "This client does not exist.",
    );
  });
});

describe("a client who is suspended or penalised", () => {
  async function sanctioned() {
    const first = await register(demoInput("housingContract"));
    const { sanctionId } = await test.transact((ex, ctx) =>
      setSanction(ex, ctx, {
        subjectKind: "CLIENT",
        subjectId: first.clientId,
        state: "SUSPENDED",
        reason: "لم يسدد مستحقات العقد السابق",
        startDate: "2026-10-01",
      }),
    );
    return { first, sanctionId };
  }

  it("stops his next file, as «قديم» or typed again, until the manager says yes; the yes is spent by that file", async () => {
    const { first, sanctionId } = await sanctioned();
    const request = demoInput("housingRequest");
    const again: RegisterFileInput = {
      ...request,
      values: { ...request.values, clientName: "بوزيد سليم", phone: "0661 20 31 42" },
    };
    const blocked = "This person is suspended or penalised. The manager must allow the registration first.";

    await expect(register({ ...again, returning: { clientId: first.clientId } })).rejects.toThrow(blocked);
    // Typed as a new client: his phone finds him all the same.
    await expect(register(again)).rejects.toThrow(blocked);

    const { decisionId } = await test.transact((ex, ctx) =>
      decideOnTheSpot(ex, ctx, {
        context: "CLIENT_FILE",
        subjectKind: "CLIENT",
        subjectId: first.clientId,
        identity: { name: "بوزيد سليم", phones: ["0661 20 31 42"] },
        sanctionId,
        allow: true,
        reason: "سدد ما عليه اليوم",
      }),
    );
    const allowed = await register({ ...again, returning: { clientId: first.clientId }, decisionId });
    expect(
      await test.db.selectFrom("File").select("sanctionDecisionId").where("id", "=", allowed.fileId).executeTakeFirst(),
    ).toEqual({ sanctionDecisionId: decisionId });
    // The same yes does not open a second file.
    await expect(register({ ...again, returning: { clientId: first.clientId }, decisionId })).rejects.toThrow();
  });

  it("asks about a name alone, and keeps the clerk's word that it is another person", async () => {
    await sanctioned();
    const request = demoInput("housingRequest");
    const namesake: RegisterFileInput = { ...request, values: { ...request.values, clientName: "بوزيد سليم" } };
    await expect(register(namesake)).rejects.toThrow(
      "Someone with this name is suspended or penalised. Confirm that this is another person before saving.",
    );
    const { fileId } = await register({ ...namesake, notTheSamePerson: true });
    const word = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "action", "context"])
      .where("action", "=", "SANCTION_CHECK")
      .where("ownerCode", "=", "CLIENTS")
      .executeTakeFirstOrThrow();
    expect(word.operation).toBe("CONSULT");
    expect(JSON.parse(word.context!)).toMatchObject({ answer: "NOT_THE_SAME_PERSON", fileId });
  });
});
