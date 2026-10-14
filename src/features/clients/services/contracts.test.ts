import { afterEach, beforeEach, expect, it } from "vitest";

import { clearHandlers, loadFeatureEvents, registerHandler, resetFeatureEvents } from "@/lib/events";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { countResidents, endContract, getContractPart, renewFile, saveFileClauses } from "./contracts";

let test: TestDatabase;
let renewed: unknown[];
beforeEach(async () => {
  clearHandlers();
  resetFeatureEvents();
  loadFeatureEvents();
  test = await createTestDatabase({ demo: ["clients"] });
  renewed = [];
  registerHandler("stock", "file.renewed", async (_ex, _ctx, payload) => {
    renewed.push(payload);
  });
});
afterEach(() => {
  test.close();
  clearHandlers();
  resetFeatureEvents();
  loadFeatureEvents();
});

it("renews a running contract as a new file of the same form, once, and says so to Operations", async () => {
  const fileId = test.demo.clients.housingContract;
  const part = await test.transact((ex, ctx) => getContractPart(ex, ctx, { fileId }));
  expect(part).toMatchObject({ canRenew: true, canEnd: true, renewedBy: null });

  const next = await test.transact((ex, ctx) => renewFile(ex, ctx, { fileId }));
  const rows = await test.db
    .selectFrom("File")
    .select([
      "id",
      "formKind",
      "stage",
      "clientId",
      "siteId",
      "renewalOfFileId",
      "copiedFromFileId",
      "startDate",
      "endDate",
      "renewalDecision",
    ])
    .where("id", "in", [fileId, next.fileId])
    .execute();
  const old = rows.find((row) => row.id === fileId)!;
  const successor = rows.find((row) => row.id === next.fileId)!;
  expect(successor).toMatchObject({
    formKind: "HOUSING_CONTRACT",
    stage: "NEW",
    clientId: old.clientId,
    siteId: old.siteId,
    renewalOfFileId: fileId,
    copiedFromFileId: fileId,
    endDate: null,
  });
  expect(old).toMatchObject({ stage: "CONTRACTED", renewalDecision: "WILL_RENEW" });
  expect(renewed).toEqual([{ fromFileId: fileId, toFileId: next.fileId }]);
  await expect(test.transact((ex, ctx) => renewFile(ex, ctx, { fileId }))).rejects.toThrow(
    "This contract is already being renewed.",
  );
  expect(await test.transact((ex, ctx) => getContractPart(ex, ctx, { fileId }))).toMatchObject({
    canRenew: false,
    renewedBy: { id: next.fileId },
  });
  // A request on demand is not renewed.
  await expect(
    test.transact((ex, ctx) => renewFile(ex, ctx, { fileId: test.demo.clients.housingRequest })),
  ).rejects.toThrow("Only a signed contract, running or ended on its date, is renewed.");
});

it("ends a contract early with its kind, day and reason", async () => {
  const fileId = test.demo.clients.orgContract;
  await expect(
    test.transact((ex, ctx) =>
      endContract(ex, ctx, { fileId, endKind: "NON_PAYMENT", endedDate: "2026-10-12", note: " " }),
    ),
  ).rejects.toThrow("A reason is required.");
  await expect(
    test.transact((ex, ctx) =>
      endContract(ex, ctx, { fileId, endKind: "NON_PAYMENT", endedDate: "2026-10-20", note: "لم يسدد" }),
    ),
  ).rejects.toThrow("A contract is ended on the day it ends, not before.");
  await test.transact((ex, ctx) =>
    endContract(ex, ctx, { fileId, endKind: "ENDED_BY_CLIENT", endedDate: "2026-10-12", note: "أغلقت الشركة مقرها" }),
  );
  const file = await test.db
    .selectFrom("File")
    .select(["stage", "endKind", "endedDate", "endNote"])
    .where("id", "=", fileId)
    .executeTakeFirstOrThrow();
  expect(file).toEqual({
    stage: "CONTRACT_ENDED",
    endKind: "ENDED_BY_CLIENT",
    endedDate: "2026-10-12",
    endNote: "أغلقت الشركة مقرها",
  });
  // Its future visits are cancelled by Operations.
  const future = await test.db
    .selectFrom("Visit")
    .select("status")
    .where("fileId", "=", fileId)
    .where("visitDate", ">", localDate("2026-10-12"))
    .execute();
  expect(future.length).toBeGreaterThan(0);
  expect(future.every((visit) => visit.status === "CANCELLED")).toBe(true);
});

it("keeps the clauses until the file is signed, and counts the residents for anybody", async () => {
  const request = test.demo.clients.housingRequest;
  expect(
    await test.transact((ex, ctx) =>
      saveFileClauses(ex, ctx, {
        fileId: request,
        clauses: [
          { title: "الدفع", body: "يدفع المبلغ عند نهاية الأشغال." },
          { title: "", body: "" },
        ],
      }),
    ),
  ).toEqual({ fileId: request, changed: true });
  expect((await test.transact((ex, ctx) => getContractPart(ex, ctx, { fileId: request }))).clauses).toEqual([
    { title: "الدفع", body: "يدفع المبلغ عند نهاية الأشغال." },
  ]);
  await expect(
    test.transact((ex, ctx) =>
      saveFileClauses(ex, ctx, { fileId: test.demo.clients.housingContract, clauses: [{ title: "", body: "نص" }] }),
    ),
  ).rejects.toThrow("A signed contract keeps the clauses it was signed with.");

  const reception = await test.sessionFor("RECEPTION_SALES");
  expect(
    await test.transact(
      (ex, ctx) => countResidents(ex, ctx, { fileId: test.demo.clients.buildingContract }),
      reception,
    ),
  ).toBe(6);
});
