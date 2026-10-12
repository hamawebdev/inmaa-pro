import { sql } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { memoryAnchorStore } from "@/lib/chain/anchor";
import { logSecurity } from "@/lib/log";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { ServiceError, UNEXPECTED_ERROR } from "./errors";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  test.close();
  vi.restoreAllMocks();
});

async function zoneCount(): Promise<number> {
  const row = await test.db
    .selectFrom("Zone")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

describe("the action wrapper", () => {
  it("answers in the service's own words, or in the sentence of the database's refusal", async () => {
    const refuse = test.run.action(async () => {
      throw new ServiceError("This number is already taken.");
    });
    const tamper = test.run.action(async (ex) => {
      await sql`UPDATE "AuditLog" SET "reason" = 'x'`.execute(ex);
    });
    const duplicate = test.run.action(async (ex, ctx) => {
      await ex
        .insertInto("Branch")
        .values({ id: "branch-2", code: "MAIN", name: "فرع", createdAt: ctx.now, updatedAt: ctx.now })
        .execute();
    });
    const fault = test.run.action(async () => {
      throw new Error("core: a fault in the code");
    });

    expect(await refuse(undefined)).toEqual({ success: false, error: "This number is already taken." });
    expect(await tamper(undefined)).toEqual({
      success: false,
      error: "This record can no longer be changed or deleted.",
    });
    expect(await duplicate(undefined)).toEqual({
      success: false,
      error: "A record with the same value already exists.",
    });
    expect(await fault(undefined)).toEqual({ success: false, error: UNEXPECTED_ERROR });
  });

  it("saves nothing of a service that fails half way, and refreshes no screen", async () => {
    const before = await zoneCount();
    const half = test.run.action(
      async (ex, ctx) => {
        await ex
          .insertInto("Zone")
          .values({ id: "zone-half", name: "x", createdAt: ctx.now, updatedAt: ctx.now })
          .execute();
        throw new ServiceError("This zone does not exist or is not active.");
      },
      { revalidate: ["/places"] },
    );

    expect((await half(undefined)).success).toBe(false);
    expect(await zoneCount()).toBe(before);
    expect(test.revalidated).toEqual([]);
  });

  it("refreshes the screens a save names, from what it returned", async () => {
    const save = test.run.action(
      async (ex, ctx, input: { name: string }) => {
        await ex
          .insertInto("Zone")
          .values({ id: "zone-new", name: input.name, createdAt: ctx.now, updatedAt: ctx.now })
          .execute();
        return { id: "zone-new" };
      },
      { revalidate: (output) => ["/places", `/dashboard/settings/zones/${output.id}`] },
    );

    expect(await save({ name: "الشمال" })).toEqual({ success: true, data: { id: "zone-new" } });
    expect(test.revalidated).toEqual(["/places", "/dashboard/settings/zones/zone-new"]);
  });

  it("writes the anchor after a commit that issued an invoice, and the log's at most once a minute", async () => {
    const store = test.anchor as ReturnType<typeof memoryAnchorStore>;
    const start = store.writes;
    const log = () => test.run.transact((ex, ctx) => logSecurity(ex, ctx, { owner: "FOUNDATION", action: "LOCK" }));

    await test.run.transact((ex, ctx) => test.rows.insert("Invoice", {}, { ex, ctx }));
    expect(store.writes).toBe(start + 1);
    await log();
    expect(store.writes).toBe(start + 1);
    test.clock.advance({ minutes: 2 });
    await log();
    expect(store.writes).toBe(start + 2);
    expect((await store.read())?.heads.AuditLog.seq).toBe(4);
  });

  it("reads through a query, outside any transaction", async () => {
    const roles = test.run.query(async (ex) => ex.selectFrom("Role").select("id").orderBy("sortOrder").execute());

    expect((await roles(undefined)).map((role) => role.id)).toEqual([
      "MANAGER",
      "HR_OFFICER",
      "ADMINISTRATION",
      "SUPERVISOR",
      "RECEPTION_SALES",
      "OPERATIONS",
      "ACCOUNTANT",
    ]);
  });
});
