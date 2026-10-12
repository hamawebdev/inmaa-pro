import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { getSetting, getSettings, setSetting } from "./index";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => test.close());

async function logCount(): Promise<number> {
  const row = await test.db
    .selectFrom("AuditLog")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

describe("settings", () => {
  it("answer a key's default until someone changes it", async () => {
    expect(await getSetting(test.db, "centre.nameAr")).toBe("مركز إنماء برو");
    expect(await getSetting(test.db, "numbering.width")).toMatchObject({ VISIT: 5, QUOTE: 4 });
    expect(await getSetting(test.db, "numbering.fileSuffix")).toMatchObject({ BUILDING_CONTRACT: "BLC" });
    // His contact, from the footer of his letterhead.
    expect(await getSetting(test.db, "centre.phone")).toBe("06 59 53 81 83");
    expect(await getSetting(test.db, "centre.email")).toBe("unmaapro.center@gmail.com");
  });

  it("write a change, read it back, and log it with its old and new value", async () => {
    await test.transact((ex, ctx) => setSetting(ex, ctx, "centre.phone", "032 42 15 00"));

    expect(await getSetting(test.db, "centre.phone")).toBe("032 42 15 00");
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({
      operation: "CHANGE",
      action: "SETTINGS_CHANGE",
      entity: "Setting",
      entityId: "centre.phone",
    });
    expect(JSON.parse(entry.changes ?? "null")).toEqual({ "centre.phone": ["06 59 53 81 83", "032 42 15 00"] });
  });

  it("write and log nothing when the value is the same", async () => {
    await test.transact((ex, ctx) => setSetting(ex, ctx, "stamp.minimum", 600));
    const before = await logCount();
    await test.transact((ex, ctx) => setSetting(ex, ctx, "stamp.minimum", 600));

    expect(await logCount()).toBe(before);
    const rows = await test.db.selectFrom("Setting").select("value").where("key", "=", "stamp.minimum").execute();
    expect(rows).toEqual([{ value: "600" }]);
  });

  it("keep the program's own keys out of the log", async () => {
    const before = await logCount();
    await test.transact((ex, ctx) => setSetting(ex, ctx, "shell.lockedSections", '["money"]'));

    expect(await logCount()).toBe(before);
    expect(await getSetting(test.db, "shell.lockedSections")).toBe('["money"]');
  });

  it("are refused to a role that may not write Settings", async () => {
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(test.transact((ex, ctx) => setSetting(ex, ctx, "centre.phone", "0"), accountant)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });

  it("read several keys in one query, each with its default", async () => {
    await test.transact((ex, ctx) => setSetting(ex, ctx, "centre.phone", "032 42 15 00"));

    expect(await getSettings(test.db, ["centre.nameAr", "centre.phone"])).toEqual({
      "centre.nameAr": "مركز إنماء برو",
      "centre.phone": "032 42 15 00",
    });
  });
});
