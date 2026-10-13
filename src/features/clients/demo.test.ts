import { afterEach, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { compareAnchor } from "@/lib/chain/anchor";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

let test: TestDatabase;
afterEach(() => test.close());

it("registers one file per division through the services, each at its stage", async () => {
  test = await createTestDatabase({ demo: ["clients"] });
  const names = test.demo.clients;

  const files = await test.db
    .selectFrom("File as f")
    .innerJoin("Client as c", "c.id", "f.clientId")
    .select([
      "f.id",
      "f.formKind",
      "f.number",
      "f.stage",
      "f.registrationDate",
      "f.lockedAt",
      "f.totalAmount",
      "f.amountBasis",
      "c.number as client",
    ])
    .orderBy("f.createdAt")
    .execute();
  expect(files).toEqual([
    expect.objectContaining({
      id: names.buildingContract,
      formKind: "BUILDING_CONTRACT",
      number: "1/BLC",
      stage: "CONTRACTED",
      registrationDate: "2026-09-14",
      client: "1",
    }),
    expect.objectContaining({
      id: names.complexContract,
      formKind: "COMPLEX_CONTRACT",
      number: "1",
      stage: "CONTRACTED",
      registrationDate: "2026-09-21",
      client: "2",
    }),
    expect.objectContaining({
      id: names.orgContract,
      formKind: "ORG_CONTRACT",
      number: "1",
      stage: "CONTRACTED",
      registrationDate: "2026-09-28",
      client: "3",
    }),
    expect.objectContaining({
      id: names.housingContract,
      formKind: "HOUSING_CONTRACT",
      number: "1",
      stage: "CONTRACTED",
      registrationDate: "2026-10-03",
      client: "4",
    }),
    expect.objectContaining({
      id: names.housingRequest,
      formKind: "HOUSING_REQUEST",
      number: "1",
      stage: "QUOTE",
      registrationDate: "2026-10-10",
      lockedAt: null,
      client: "5",
    }),
    // The two jobs on demand whose quote was accepted.
    expect.objectContaining({
      id: names.housingJob,
      formKind: "HOUSING_REQUEST",
      number: "2",
      stage: "CONTRACTED",
      totalAmount: 950000,
      amountBasis: "WHOLE_CONTRACT",
      client: "6",
    }),
    expect.objectContaining({
      id: names.orgJob,
      formKind: "ORG_REQUEST",
      number: "1",
      stage: "CONTRACTED",
      totalAmount: 3400000,
      client: "7",
    }),
  ]);
  expect(files.filter((file) => file.lockedAt !== null)).toHaveLength(6);

  // Each on-demand file has its study and its quote, approved by the manager and issued.
  const quotes = await test.db
    .selectFrom("Quote")
    .select(["id", "number", "status", "result", "total"])
    .orderBy("numberSeq")
    .execute();
  expect(quotes).toEqual([
    { id: names.housingJobQuote, number: "0001/2026", status: "ISSUED", result: "ACCEPTED", total: 950000 },
    { id: names.orgJobQuote, number: "0002/2026", status: "ISSUED", result: "ACCEPTED", total: 3400000 },
    { id: names.housingRequestQuote, number: "0003/2026", status: "ISSUED", result: "PENDING", total: 1800000 },
  ]);
  expect(await test.db.selectFrom("CostStudy").select("id").execute()).toHaveLength(3);

  // Each step on its own day, by the account that would have taken it.
  const history = await test.db
    .selectFrom("FileStageEvent as e")
    .leftJoin("User as u", "u.id", "e.changedByUserId")
    .select(["e.toStage", "e.changedAt", "u.roleId"])
    .where("e.fileId", "=", names.housingContract)
    .orderBy("e.changedAt")
    .execute();
  expect(history).toEqual([
    { toStage: "NEW", changedAt: "2026-10-03T09:15:00.000Z", roleId: "RECEPTION_SALES" },
    { toStage: "QUOTE", changedAt: "2026-10-05T10:00:00.000Z", roleId: "MANAGER" },
    { toStage: "CONTRACTED", changedAt: "2026-10-08T15:00:00.000Z", roleId: "MANAGER" },
  ]);

  expect(await test.db.selectFrom("Resident").select("id").execute()).toHaveLength(10);
  expect((await verifyChains(test.db)).ok).toBe(true);
  expect((await compareAnchor(test.db, test.anchor, test.ctx().now)).state).toBe("normal");
});

it("gives the same ids on every build", async () => {
  test = await createTestDatabase({ demo: ["clients"] });
  const first = test.demo.clients;
  test.close();
  test = await createTestDatabase({ demo: ["clients"] });
  expect(test.demo.clients).toEqual(first);
  expect(first.buildingContract).toMatch(/^demo-clients-\d{4}$/);
});
