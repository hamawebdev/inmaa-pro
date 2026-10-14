import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { runDayStart } from "@/lib/daily";
import { newId } from "@/lib/db/rows";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  loadFeatureSeeds,
  registeredSeeds,
  registerSeedStep,
  resetFeatureSeeds,
  runSeeds,
  type SeedStep,
} from "./index";

/**
 * The runner, with a dummy step: a zone the program starts with, written the
 * way an owner's step must be written (a fixed id, inserted when missing, never
 * overwritten).
 */
const ZONE_ID = "seed-test-zone";
const seedZone: SeedStep = async (ex, ctx) => {
  const there = await ex.selectFrom("Zone").select("id").where("id", "=", ZONE_ID).executeTakeFirst();
  if (there) return;
  await ex
    .insertInto("Zone")
    .values({ id: ZONE_ID, name: "منطقة البذر", branchId: ctx.branchId, createdAt: ctx.now, updatedAt: ctx.now })
    .execute();
};

const tests: TestDatabase[] = [];
beforeEach(() => {
  // Only this file's steps: the folders' own are tested by their owners.
  resetFeatureSeeds({ loadFolders: false });
});
afterEach(() => {
  for (const test of tests.splice(0)) test.close();
  // The folders' own steps again, for the files that run after this one.
  resetFeatureSeeds();
  loadFeatureSeeds();
});

async function database(options: Parameters<typeof createTestDatabase>[0] = {}) {
  const test = await createTestDatabase(options);
  tests.push(test);
  return test;
}

describe("owner seeds", () => {
  it("run in owner order, whatever order they were registered in", async () => {
    const order: string[] = [];
    registerSeedStep("money", "stock items", async () => void order.push("money"));
    registerSeedStep("people", "training modules", async () => void order.push("people"));
    registerSeedStep("operations", "inspection criteria", async () => void order.push("operations"));
    expect(registeredSeeds()).toEqual([
      { owner: "people", names: ["training modules"] },
      { owner: "operations", names: ["inspection criteria"] },
      { owner: "money", names: ["stock items"] },
    ]);
    const test = await database({ seeds: false });
    const ran = await test.transact((ex, ctx) => runSeeds(ex, ctx));
    expect(order).toEqual(["people", "operations", "money"]);
    expect(ran).toEqual(["people: training modules", "operations: inspection criteria", "money: stock items"]);
    expect(() => registerSeedStep("money", "stock items", async () => {})).toThrow(
      "seeds: money registers stock items twice",
    );
  });

  it("are written by first run, as the program, in its transaction", async () => {
    let runAs: string | null | undefined;
    registerSeedStep("operations", "a zone", async (ex, ctx) => {
      runAs = ctx.userId;
      await seedZone(ex, ctx);
    });
    const test = await database();
    expect(runAs).toBeNull();
    expect(await test.db.selectFrom("Zone").select("name").where("id", "=", ZONE_ID).executeTakeFirst()).toEqual({
      name: "منطقة البذر",
    });
  });

  it("let a database made before a seed existed catch up at the next day start, and never overwrite an edit", async () => {
    const test = await database();
    expect(await test.db.selectFrom("Zone").select("id").where("id", "=", ZONE_ID).executeTakeFirst()).toBeUndefined();

    // The seed arrives with a new version of the program.
    registerSeedStep("operations", "a zone", seedZone);
    await runDayStart(test.db, test.clock);
    expect(await test.db.selectFrom("Zone").select("id").where("id", "=", ZONE_ID).executeTakeFirst()).toBeDefined();

    // The office renames it; the next day's run leaves it alone.
    await test.db.updateTable("Zone").set({ name: "عين البيضاء الشمالية" }).where("id", "=", ZONE_ID).execute();
    test.clock.advance({ days: 1 });
    const report = await runDayStart(test.db, test.clock);
    expect(report.ran).toContain("operations");
    expect(await test.db.selectFrom("Zone").select("name").where("id", "=", ZONE_ID).executeTakeFirst()).toEqual({
      name: "عين البيضاء الشمالية",
    });
  });

  it("that fails undoes first run as a whole", async () => {
    registerSeedStep("stock", "broken", async (ex, ctx) => {
      await ex
        .insertInto("Zone")
        .values({ id: newId(), name: "x", branchId: ctx.branchId, createdAt: ctx.now, updatedAt: ctx.now })
        .execute();
      throw new Error("stock: the seed is broken");
    });
    await expect(database()).rejects.toThrow("stock: the seed is broken");
  });

  it("can be left out of a test that wants an empty database", async () => {
    registerSeedStep("operations", "a zone", seedZone);
    const test = await database({ seeds: false });
    expect(await test.db.selectFrom("Zone").select("id").where("id", "=", ZONE_ID).executeTakeFirst()).toBeUndefined();
  });
});
