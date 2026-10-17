import { afterEach, beforeEach, expect, it } from "vitest";

import { setSanction } from "@/features/people/services/sanctions";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { DEMO_FILES } from "../demo";

import {
  listClients,
  openClientCard,
  removeContact,
  saveClientIdentifiers,
  saveContact,
  type ContactInput,
} from "./clients";
import { getFileHub } from "./file-reads";
import { missingIdentifiersOf } from "../rules/client-identifiers";

import { registerFile, type RegisterFileInput } from "./files";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const register = (name: string) =>
  test.transact((ex, ctx) =>
    registerFile(ex, ctx, structuredClone(DEMO_FILES.find((file) => file.name === name)!.input) as RegisterFileInput),
  );

it("lists the clients with their files, their sanction and what an organisation's invoice still lacks", async () => {
  const house = await register("housingContract");
  const org = await register("orgContract");
  await test.transact((ex, ctx) =>
    setSanction(ex, ctx, {
      subjectKind: "CLIENT",
      subjectId: house.clientId,
      state: "PENALISED",
      reason: "تأخر في الدفع",
      startDate: "2026-10-12",
    }),
  );
  const rows = await test.transact((ex, ctx) => listClients(ex, ctx, {}));
  expect(rows.map((row) => [row.name, row.files, row.sanction, row.missingIdentifiers])).toEqual([
    ["شركة الأوراس للتوزيع", 1, null, ["rcNumber", "nif", "nis"]],
    ["بوزيد سليم", 1, "PENALISED", []],
  ]);
  expect(await test.transact(async (ex, ctx) => (await listClients(ex, ctx, { search: "0661" })).length)).toBe(1);
  expect(
    (await test.transact((ex, ctx) => listClients(ex, ctx, { division: "ORGANISATION" }))).map((row) => row.id),
  ).toEqual([org.clientId]);

  // The organisation's file says so on its hub, until the card has the number.
  const hub = () => test.transact((ex, ctx) => getFileHub(ex, ctx, { fileId: org.fileId }));
  expect((await hub()).missingIdentifiers).toEqual(["rcNumber", "nif", "nis"]);
  const saved = await test.transact((ex, ctx) =>
    saveClientIdentifiers(ex, ctx, {
      clientId: org.clientId,
      identifiers: {
        legalForm: "SARL",
        rcNumber: " 04/00-0123456 B 19 ",
        nis: "000104010203040",
        nif: "000104010203040",
        billingAddress: "المنطقة الصناعية، عين البيضاء",
        phone2: "032 55 10 22",
      },
    }),
  );
  expect(saved).toEqual({ clientId: org.clientId, changed: true });
  expect((await hub()).missingIdentifiers).toEqual([]);
  const stored = await test.db
    .selectFrom("Client")
    .select(["rcNumber", "legalForm", "phoneKeys"])
    .where("id", "=", org.clientId)
    .executeTakeFirstOrThrow();
  expect(stored).toEqual({ rcNumber: "04/00-0123456 B 19", legalForm: "SARL", phoneKeys: "|032551020|032551022|" });

  const card = await test.transact((ex, ctx) => openClientCard(ex, ctx, { clientId: org.clientId }));
  expect(card).toMatchObject({ number: "2", identifiers: { nif: "000104010203040" }, missingIdentifiers: [] });
  expect(card.files).toMatchObject([{ id: org.fileId, stage: "NEW" }]);
  // Opening the card is logged once a day per reader.
  await test.transact((ex, ctx) => openClientCard(ex, ctx, { clientId: org.clientId }));
  const consults = await test.db
    .selectFrom("AuditLog")
    .select("id")
    .where("operation", "=", "CONSULT")
    .where("entity", "=", "Client")
    .execute();
  expect(consults).toHaveLength(1);
});

it("refuses who only reads the requests, and a phone that is not one", async () => {
  const org = await register("orgContract");
  const accountant = await test.sessionFor("ACCOUNTANT");
  await expect(
    test.transact(
      (ex, ctx) => saveClientIdentifiers(ex, ctx, { clientId: org.clientId, identifiers: { rcNumber: "1" } }),
      accountant,
    ),
  ).rejects.toThrow("You do not have permission to do this.");
  await expect(
    test.transact((ex, ctx) =>
      saveClientIdentifiers(ex, ctx, { clientId: org.clientId, identifiers: { phone2: "12" } }),
    ),
  ).rejects.toThrow("The phone number has 9 or 10 digits.");
});

it("keeps the client's contact people with their five flags, one coordinator per site", async () => {
  const org = await register("orgContract");
  const contact = (more: Partial<ContactInput> = {}): ContactInput => ({
    name: "قاسمي نادية",
    role: "مديرة",
    phone: "0661 11 22 33",
    phone2: null,
    siteId: org.siteId,
    note: null,
    flags: { signsHandover: true, receivesInvoice: true, isCoordinator: true, holdsKey: false, followsService: true },
    ...more,
  });
  const { contactId } = await test.transact((ex, ctx) =>
    saveContact(ex, ctx, { clientId: org.clientId, contact: contact() }),
  );
  await expect(
    test.transact((ex, ctx) => saveContact(ex, ctx, { clientId: org.clientId, contact: contact({ name: "بن علي" }) })),
  ).rejects.toThrow("This site already has a coordinator.");
  const card = await test.transact((ex, ctx) => openClientCard(ex, ctx, { clientId: org.clientId }));
  expect(card.contacts).toMatchObject([{ id: contactId, flags: { isCoordinator: true, holdsKey: false } }]);
  await expect(test.transact((ex, ctx) => removeContact(ex, ctx, { contactId, reason: "" }))).rejects.toThrow(
    "A reason is required.",
  );
  await test.transact((ex, ctx) => removeContact(ex, ctx, { contactId, reason: "غادرت الشركة" }));
  expect((await test.transact((ex, ctx) => openClientCard(ex, ctx, { clientId: org.clientId }))).contacts).toEqual([]);
});

it("asks an organisation's card for its NIF and NIS always, its RC when it has a trade register, and an answer when none was given", () => {
  const org = { clientType: "ORGANISATION", hasTradeRegister: null, rcNumber: null, nif: null, nis: null };
  expect(missingIdentifiersOf(org)).toEqual(["tradeRegisterAnswer", "nif", "nis"]);
  expect(missingIdentifiersOf({ ...org, hasTradeRegister: 0, nif: "1", nis: "2" })).toEqual([]);
  expect(missingIdentifiersOf({ ...org, hasTradeRegister: 1, nif: "1", nis: "2" })).toEqual(["rcNumber"]);
  expect(missingIdentifiersOf({ ...org, clientType: "INDIVIDUAL" })).toEqual([]);
});

it("takes the answer to «السجل التجاري» on the card", async () => {
  const org = await register("orgContract");
  await test.transact((ex, ctx) =>
    saveClientIdentifiers(ex, ctx, {
      clientId: org.clientId,
      identifiers: { hasTradeRegister: false, nif: "1", nis: "2" },
    }),
  );
  const card = await test.transact((ex, ctx) => openClientCard(ex, ctx, { clientId: org.clientId }));
  expect(card).toMatchObject({ hasTradeRegister: false, missingIdentifiers: [] });
});

it("F-01a: the card gives each file its last and next visit, its payment state and its rating", async () => {
  const demo = await createTestDatabase({ demo: ["clients"] });
  try {
    const card = await demo.transact((ex, ctx) =>
      openClientCard(ex, ctx, { clientId: demo.demo.clients.housingContractClient }),
    );
    const file = card.files.find((one) => one.id === demo.demo.clients.housingContract)!;
    expect(file.nextVisit).not.toBeNull();
    expect(file.nextVisit! >= "2026-10-12").toBe(true);
    expect(file.payment).toMatchObject({ state: "UNPAID" });
    expect(file.rating).toBeNull();
  } finally {
    demo.close();
  }
});
