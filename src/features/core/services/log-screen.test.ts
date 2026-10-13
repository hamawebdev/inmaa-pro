import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { exportLog, listLogEntries, listLogFilterChoices } from "./log-screen";
import { createAccount } from "./users";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

describe("the log screen", () => {
  it("lists the newest first, by pages, and filters by person, record, operation and date", async () => {
    await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "hr", displayName: "سعاد بن عمر", roleId: "HR_OFFICER" }),
    );
    test.clock.advance({ days: 1 });
    await test.transact((ex, ctx) => setSetting(ex, ctx, "centre.rc", "04/00-1"));

    const all = await test.transact((ex, ctx) => listLogEntries(ex, ctx, { filters: {}, page: 0, pageSize: 2 }));
    expect(all.total).toBe(4);
    expect(all.rows.map((row) => row.action)).toEqual(["SETTINGS_CHANGE", "CREATE"]);
    expect(all.rows[0]).toMatchObject({ localDate: "2026-10-13", userName: "المدير", operation: "CHANGE" });
    const second = await test.transact((ex, ctx) => listLogEntries(ex, ctx, { filters: {}, page: 1, pageSize: 2 }));
    expect(second.rows).toHaveLength(2);

    const list = (filters: Parameters<typeof listLogEntries>[2]["filters"]) =>
      test.transact((ex, ctx) => listLogEntries(ex, ctx, { filters, page: 0, pageSize: 50 }));
    expect((await list({ userId: "system" })).total).toBe(2);
    expect((await list({ userId: test.manager.userId! })).total).toBe(2);
    expect((await list({ entity: "User" })).total).toBe(2);
    expect((await list({ operation: "COLLECT" })).total).toBe(2);
    expect((await list({ from: "2026-10-13" })).total).toBe(1);
    expect((await list({ to: "2026-10-12" })).total).toBe(3);

    const choices = await test.transact((ex, ctx) => listLogFilterChoices(ex, ctx));
    expect(choices.users.map((user) => user.name).sort()).toEqual(["المدير", "سعاد بن عمر"].sort());
    expect(choices.entities).toEqual(["Database", "Setting", "User"]);
  });

  it("is closed to a role without log.read", async () => {
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => listLogEntries(ex, ctx, { filters: {}, page: 0, pageSize: 10 }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(test.transact((ex, ctx) => exportLog(ex, ctx, { filters: {} }), accountant)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });

  it("exports what the filters keep, and the export is itself in the log as a disclosure", async () => {
    await test.transact((ex, ctx) => setSetting(ex, ctx, "centre.address", 'حي "النصر"; أم البواقي'));
    const before = await test.transact((ex, ctx) => listLogEntries(ex, ctx, { filters: {}, page: 0, pageSize: 50 }));

    const exported = await test.transact((ex, ctx) => exportLog(ex, ctx, { filters: { operation: "CHANGE" } }));
    expect(exported.count).toBe(1);
    expect(exported.fileName).toBe("inmaa-log-2026-10-12.csv");
    expect(exported.text.startsWith("\uFEFFseq;date;time;user")).toBe(true);
    const [, line] = exported.text.trim().split("\r\n");
    expect(line.startsWith("3;2026-10-12;09:00;المدير;MANAGER;CHANGE;SETTINGS_CHANGE;")).toBe(true);
    // A value holding the separator and quotes stays one cell: quoted, its own quotes doubled.
    expect(line).toContain(String.raw`"{""centre.address"":["""",""حي \""النصر\""; أم البواقي""]}"`);

    const after = await test.transact((ex, ctx) => listLogEntries(ex, ctx, { filters: {}, page: 0, pageSize: 50 }));
    expect(after.total).toBe(before.total + 1);
    expect(after.rows[0]).toMatchObject({
      operation: "DISCLOSE",
      action: "EXPORT",
      disclosure: "EXPORT",
      entity: "AuditLog",
      userName: "المدير",
    });
    expect(JSON.parse(after.rows[0].context!)).toEqual({ filters: { operation: "CHANGE" }, entries: 1 });
  });
});
