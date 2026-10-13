import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SYSTEM_SESSION } from "@/lib/service/context";
import { getSetting } from "@/lib/settings";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { countStaleBackup } from "../alerts";
import {
  assessRestore,
  describeDatabase,
  listBackupRuns,
  planAutomaticBackup,
  recordBackupRun,
  recordCleanRestore,
  saveBackupSettings,
  type FolderCheck,
} from "./backups";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const USB: FolderCheck = { exists: true, writable: true, syncedBy: null };
const asProgram = <T>(work: Parameters<TestDatabase["transact"]>[0]) =>
  test.transact(work, SYSTEM_SESSION) as Promise<T>;

describe("the backup folder", () => {
  it("is refused when a cloud client synchronises it, when it is missing, and when it cannot be written", async () => {
    const save = (check: FolderCheck) =>
      test.transact((ex, ctx) => saveBackupSettings(ex, ctx, { folder: { dir: "D:/x", check } }));
    await expect(save({ ...USB, syncedBy: "OneDrive" })).rejects.toThrow(
      "This folder is synchronised by OneDrive. Choose a folder that stays on this PC or on a USB drive.",
    );
    await expect(save({ ...USB, exists: false, writable: false })).rejects.toThrow("This folder does not exist.");
    await expect(save({ ...USB, writable: false })).rejects.toThrow("The program cannot write in this folder.");
    expect(await getSetting(test.db, "backup.targetDir")).toBe("");

    await save(USB);
    expect(await getSetting(test.db, "backup.targetDir")).toBe("D:/x");
  });
});

describe("the daily copy", () => {
  it("is due once a day, when it is on and has a folder", async () => {
    expect(await asProgram((ex, ctx) => planAutomaticBackup(ex, ctx))).toEqual({ due: false, why: "NO_FOLDER" });
    await test.transact((ex, ctx) =>
      saveBackupSettings(ex, ctx, { folder: { dir: "E:/sauvegardes", check: USB }, keepCount: 14 }),
    );
    expect(await asProgram((ex, ctx) => planAutomaticBackup(ex, ctx))).toEqual({
      due: true,
      targetDir: "E:/sauvegardes",
      keepCount: 14,
      fileName: "inmaa-auto-2026-10-12.db",
    });

    // The program makes it, under nobody's name; the log keeps it as a disclosure.
    const manifest = await asProgram<Awaited<ReturnType<typeof describeDatabase>>>((ex, ctx) =>
      describeDatabase(ex, ctx, { appVersion: "0.1.0" }),
    );
    await asProgram((ex, ctx) =>
      recordBackupRun(ex, ctx, {
        kind: "AUTO",
        targetPath: "E:/sauvegardes/inmaa-auto-2026-10-12.db",
        startedAt: ctx.now,
        manifest,
        result: { ok: true, sizeBytes: 524288 },
      }),
    );
    expect(await asProgram((ex, ctx) => planAutomaticBackup(ex, ctx))).toEqual({ due: false, why: "DONE_TODAY" });
    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "action", "disclosure", "recipient", "userId"])
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toEqual({
      operation: "DISCLOSE",
      action: "BACKUP",
      disclosure: "BACKUP",
      recipient: "E:/sauvegardes/inmaa-auto-2026-10-12.db",
      userId: null,
    });

    test.clock.advance({ days: 1 });
    expect(((await asProgram((ex, ctx) => planAutomaticBackup(ex, ctx))) as { due: boolean }).due).toBe(true);

    await test.transact((ex, ctx) => saveBackupSettings(ex, ctx, { autoEnabled: false }));
    expect(await asProgram((ex, ctx) => planAutomaticBackup(ex, ctx))).toEqual({ due: false, why: "DISABLED" });
  });

  it("that failed is kept as tried, is not a backup, and leaves the stale alert up", async () => {
    const manifest = await test.transact((ex, ctx) => describeDatabase(ex, ctx, { appVersion: "0.1.0" }));
    await asProgram((ex, ctx) =>
      recordBackupRun(ex, ctx, {
        kind: "AUTO",
        targetPath: "E:/x/inmaa-auto-2026-10-12.db",
        startedAt: ctx.now,
        manifest,
        result: { ok: false, error: "could not write the backup: no such device" },
      }),
    );
    const [run] = await test.transact((ex, ctx) => listBackupRuns(ex, ctx));
    expect(run).toMatchObject({ kind: "AUTO", ok: false, error: "could not write the backup: no such device" });
    expect(await test.transact((ex, ctx) => countStaleBackup(ex, ctx, { days: 3 }))).toBe(1);
  });

  it("made by hand needs backup.run", async () => {
    const manifest = await test.transact((ex, ctx) => describeDatabase(ex, ctx, { appVersion: "0.1.0" }));
    const run = {
      targetPath: "E:/a.db",
      startedAt: test.ctx().now,
      manifest,
      result: { ok: true, sizeBytes: 1 },
    } as const;
    const reception = await test.sessionFor("RECEPTION_SALES");
    await expect(
      test.transact((ex, ctx) => recordBackupRun(ex, ctx, { kind: "MANUAL", ...run }), reception),
    ).rejects.toThrow("You do not have permission to do this.");
    const administration = await test.sessionFor("ADMINISTRATION");
    await test.transact((ex, ctx) => recordBackupRun(ex, ctx, { kind: "MANUAL", ...run }), administration);
    expect(await test.transact((ex, ctx) => countStaleBackup(ex, ctx, { days: 3 }))).toBe(0);
  });
});

describe("before a restore", () => {
  it("says what the copy would cost: another centre's data, an older state, or nothing known", async () => {
    const mine = await test.transact((ex, ctx) => describeDatabase(ex, ctx, { appVersion: "0.1.0" }));
    const assess = (manifest: typeof mine | null) => test.transact((ex, ctx) => assessRestore(ex, ctx, { manifest }));

    expect((await assess(mine)).warnings).toEqual([]);
    expect((await assess(null)).warnings).toEqual(["NO_MANIFEST"]);
    expect((await assess({ ...mine, databaseId: "another-centre" })).warnings).toEqual(["OTHER_DATABASE"]);

    // This database has since issued an invoice the copy does not hold.
    await test.rows.insert("Invoice", {});
    expect((await assess(mine)).warnings).toEqual(["OLDER_THAN_LAST_INVOICE"]);

    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(test.transact((ex, ctx) => assessRestore(ex, ctx, { manifest: mine }), accountant)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });

  it("a restore that lost nothing is still kept, with the manager's reason", async () => {
    await expect(
      test.transact((ex, ctx) =>
        recordCleanRestore(ex, ctx, { restoredFromPath: "E:/a.db", preRestorePath: "E:/pre.db", reason: " " }),
      ),
    ).rejects.toThrow("A reason is required.");
    await test.transact((ex, ctx) =>
      recordCleanRestore(ex, ctx, { restoredFromPath: "E:/a.db", preRestorePath: "E:/pre.db", reason: "قرص جديد" }),
    );
    const [run] = await test.transact((ex, ctx) => listBackupRuns(ex, ctx));
    expect(run).toMatchObject({ kind: "RESTORE", ok: true, targetPath: "E:/a.db" });
    const entry = await test.db
      .selectFrom("AuditLog")
      .select(["operation", "action", "reason"])
      .orderBy("chainSeq", "desc")
      .limit(1)
      .executeTakeFirstOrThrow();
    expect(entry).toEqual({ operation: "SECURITY", action: "RESTORE", reason: "قرص جديد" });
  });
});
