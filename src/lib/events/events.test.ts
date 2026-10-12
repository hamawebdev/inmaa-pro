import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { emit, listenersOf, loadFeatureEvents, registerHandler, resetFeatureEvents } from "./index";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase({ events: false });
  resetFeatureEvents();
});

afterEach(() => {
  test.close();
  resetFeatureEvents();
});

async function zoneCount(): Promise<number> {
  const row = await test.db
    .selectFrom("Zone")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

describe("events between owners", () => {
  it("run their handlers in the contract's order, whoever registered first", async () => {
    const order: string[] = [];
    for (const owner of ["stock", "money", "people", "operations"] as const) {
      registerHandler(owner, "file.contracted", async () => {
        order.push(owner);
      });
    }

    await test.transact((ex, ctx) => emit(ex, ctx, "file.contracted", { fileId: "file-1" }));

    // Operations makes the visits before Money computes the dues from them; the others follow in folder order.
    expect(order).toEqual(["operations", "money", "people", "stock"]);
    expect(listenersOf("file.contracted")).toEqual(["operations", "money", "people", "stock"]);
  });

  it("run in the emitter's transaction: one failing handler undoes the whole action", async () => {
    const before = await zoneCount();
    registerHandler("operations", "file.ended", async (ex, ctx) => {
      await ex
        .insertInto("Zone")
        .values({ id: "zone-by-handler", name: "x", createdAt: ctx.now, updatedAt: ctx.now })
        .execute();
    });
    registerHandler("money", "file.ended", async () => {
      throw new Error("money: the dues could not be cancelled");
    });

    await expect(
      test.transact(async (ex, ctx) => {
        await ex
          .insertInto("Zone")
          .values({ id: "zone-by-emitter", name: "y", createdAt: ctx.now, updatedAt: ctx.now })
          .execute();
        await emit(ex, ctx, "file.ended", { fileId: "file-1", endKind: "JOB_DONE", endedDate: ctx.today });
      }),
    ).rejects.toThrow("the dues could not be cancelled");

    expect(await zoneCount()).toBe(before);
  });

  it("reach nobody when nobody listens", async () => {
    await expect(
      test.transact((ex, ctx) => emit(ex, ctx, "complaint.settled", { complaintId: "complaint-1" })),
    ).resolves.toBeUndefined();
  });

  it("load each feature folder's handlers once", () => {
    const snapshot = () =>
      (["file.contracted", "zone.remapped", "invoice.issued", "visit.signedOff"] as const).map(listenersOf);
    loadFeatureEvents();
    const first = snapshot();
    loadFeatureEvents();
    expect(snapshot()).toEqual(first);
  });
});
