import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { peekLegalNumber } from "@/lib/numbering";
import { localDate } from "@/lib/units";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { fileAnchorStore } from "@/testing/anchor-file";
import { createTestDatabase, openTestDatabase, type TestDatabase } from "@/testing/database";

import {
  acceptDatabaseAsItIs,
  acceptRestoredDatabase,
  compareAnchor,
  memoryAnchorStore,
  reconcileAnchor,
  snapshotAnchor,
  writeAnchor,
} from "./anchor";
import { verifyChains } from "./index";

/**
 * The anchor kept outside the database: an older copy is detected, and after
 * the manager's answer no legal number is given twice. BUILD-NOTES section 6
 * B7 and B8, and the restore case of C1.
 */
let test: TestDatabase;
const opened: TestDatabase[] = [];

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => {
  for (const other of opened.splice(0)) other.close();
  test.close();
});

const d = localDate;

/** Issues an invoice the way a screen would: one transaction through the runner, which anchors after the commit. */
function issue(on: TestDatabase, date: string) {
  return on.run.transact((ex, ctx) => on.rows.insert("Invoice", { issueDate: d(date) }, { ex, ctx }));
}

async function restoreCopy(file: string): Promise<TestDatabase> {
  const restored = await openTestDatabase(file, { anchor: test.anchor, clock: test.clock });
  opened.push(restored);
  return restored;
}

describe("a restored older copy (B7)", () => {
  it("is found behind its anchor; after the manager's answer the lost numbers are never given again", async () => {
    await issue(test, "2026-10-12");
    const backup = test.snapshot();
    test.clock.advance({ days: 3 });
    await issue(test, "2026-10-15");
    await issue(test, "2026-10-15");
    expect((await test.anchor.read())?.lastInvoice).toEqual({ number: "000003/2026", issueDate: "2026-10-15" });

    const restored = await restoreCopy(backup);
    const now = restored.ctx().now;
    const comparison = await compareAnchor(restored.db, restored.anchor, now);
    expect(comparison.state).toBe("behind");
    expect(comparison.lostNumbers).toEqual([
      { key: "INVOICE", year: 2026, fromValue: 2, toValue: 3, lastDate: "2026-10-15" },
    ]);
    // Nothing is decided at start: the manager is asked.
    expect((await reconcileAnchor(restored.db, restored.anchor, now)).state).toBe("behind");

    const accountant = await restored.sessionFor("ACCOUNTANT");
    await expect(
      restored.transact(
        (ex, ctx) => acceptRestoredDatabase(ex, ctx, { comparison, reason: "عطل في القرص" }),
        accountant,
      ),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      restored.transact((ex, ctx) => acceptRestoredDatabase(ex, ctx, { comparison, reason: " " })),
    ).rejects.toThrow("A reason is required.");

    await restored.transact((ex, ctx) =>
      acceptRestoredDatabase(ex, ctx, {
        comparison,
        reason: "عطل في القرص",
        restoredFromPath: backup,
        preRestorePath: "/backups/inmaa-pre-restore.db",
      }),
    );
    await writeAnchor(restored.db, restored.anchor, now);

    const gap = await restored.db.selectFrom("SequenceGap").selectAll().executeTakeFirstOrThrow();
    expect(gap).toMatchObject({
      key: "INVOICE",
      year: 2026,
      kind: "RESTORE",
      fromValue: 2,
      toValue: 3,
      reason: "عطل في القرص",
    });
    const next = await restored.transact((ex, ctx) => peekLegalNumber(ex, ctx, "INVOICE", { date: d("2026-10-15") }));
    expect(next).toMatchObject({ seq: 4, display: "000004/2026", notBefore: "2026-10-15" });
    await expect(restored.rows.insert("Invoice", { issueDate: d("2026-10-14") })).rejects.toThrow(
      "LEGAL_SEQUENCE:Invoice:date",
    );

    const entry = await restored.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("action", "=", "RESTORE")
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({ operation: "SECURITY", reason: "عطل في القرص", userId: restored.manager.userId });
    expect(JSON.parse(entry.context ?? "{}").anchorLastInvoice).toEqual({
      number: "000003/2026",
      issueDate: "2026-10-15",
    });
    expect(gap.auditLogId).toBe(entry.id);
    const runs = await restored.db.selectFrom("BackupRun").selectAll().orderBy("kind").execute();
    expect(runs.map((run) => [run.kind, run.isProtected, run.preRestorePath])).toEqual([
      ["PRE_RESTORE", 1, null],
      ["RESTORE", 0, "/backups/inmaa-pre-restore.db"],
    ]);

    // The numbers 2 and 3 are declared, so the sequence is whole; the anchor follows the database again.
    expect(await verifyChains(restored.db)).toMatchObject({ ok: true, missingNumbers: [] });
    expect((await compareAnchor(restored.db, restored.anchor, now)).state).toBe("normal");
    const fourth = await restored.rows.insert("Invoice", { issueDate: d("2026-10-15") });
    expect(fourth.number).toBe("000004/2026");
  });

  it("still knows the old year's top after a restore across 1 January", async () => {
    test.clock.set("2026-12-31T09:00:00.000Z");
    await issue(test, "2026-12-31");
    const backup = test.snapshot();
    await issue(test, "2026-12-31");
    test.clock.set("2027-01-02T09:00:00.000Z");
    await issue(test, "2027-01-02");

    const restored = await restoreCopy(backup);
    const comparison = await compareAnchor(restored.db, restored.anchor, restored.ctx().now);
    expect(comparison.lostNumbers).toEqual([
      { key: "INVOICE", year: 2026, fromValue: 2, toValue: 2, lastDate: "2026-12-31" },
      { key: "INVOICE", year: 2027, fromValue: 1, toValue: 1, lastDate: "2027-01-02" },
    ]);
    await restored.transact((ex, ctx) => acceptRestoredDatabase(ex, ctx, { comparison, reason: "نسخة قديمة" }));

    const next = await restored.transact((ex, ctx) => peekLegalNumber(ex, ctx, "INVOICE", { date: d("2027-01-02") }));
    expect(next).toMatchObject({ display: "000002/2027", notBefore: "2027-01-02" });
    await expect(restored.rows.insert("Invoice", { issueDate: d("2027-01-01") })).rejects.toThrow(
      "LEGAL_SEQUENCE:Invoice:date",
    );
    expect((await verifyChains(restored.db)).missingNumbers).toEqual([]);
  });
});

describe("the anchor in a file", () => {
  it("outlives the program: a copy restored after a restart is still found behind", async () => {
    const folder = mkdtempSync(join(tmpdir(), "inmaa-anchor-"));
    try {
      const file = join(folder, "chain.dat");
      const first = await createTestDatabase({ anchor: fileAnchorStore(file) });
      opened.push(first);
      await issue(first, "2026-10-12");
      const backup = first.snapshot();
      await issue(first, "2026-10-12");

      // The program is closed; another run opens the older copy with a store read from the same file.
      const restored = await openTestDatabase(backup, { anchor: fileAnchorStore(file), clock: first.clock });
      opened.push(restored);
      const comparison = await compareAnchor(restored.db, restored.anchor, restored.ctx().now);
      expect(comparison.state).toBe("behind");
      expect(comparison.anchor?.lastInvoice).toEqual({ number: "000002/2026", issueDate: "2026-10-12" });
    } finally {
      for (const other of opened.splice(0)) other.close();
      rmSync(folder, { recursive: true, force: true });
    }
  });
});

describe("an anchor that cannot be followed (B8)", () => {
  it("another database's anchor is answered by the manager, and only then replaced", async () => {
    const now = test.ctx().now;
    await test.anchor.write({ ...(await snapshotAnchor(test.db, now)), databaseId: "another-database" });

    const comparison = await reconcileAnchor(test.db, test.anchor, now);
    expect(comparison.state).toBe("foreign");
    expect((await test.anchor.read())?.databaseId).toBe("another-database");

    await test.transact((ex, ctx) => acceptDatabaseAsItIs(ex, ctx, { comparison, reason: "تثبيت جديد للنظام" }));
    await writeAnchor(test.db, test.anchor, now);
    expect((await compareAnchor(test.db, test.anchor, now)).state).toBe("normal");
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("action", "=", "ANCHOR_REBASE")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(entry.context ?? "{}")).toMatchObject({
      state: "foreign",
      typedReason: "تثبيت جديد للنظام",
      anchorDatabaseId: "another-database",
    });
  });

  it("a database that holds rows and has no anchor is not anchored without the manager", async () => {
    const empty = memoryAnchorStore();
    const comparison = await reconcileAnchor(test.db, empty, test.ctx().now);

    expect(comparison.state).toBe("unanchored");
    expect(await empty.read()).toBeNull();
  });
});

describe("the anchor at start", () => {
  it("is brought up to date without a word when only its last write was missed", async () => {
    await issue(test, "2026-10-12");
    // Written outside the runner: the anchor does not know it, as after a power cut.
    await test.rows.insert("Invoice");
    const now = test.ctx().now;
    expect((await compareAnchor(test.db, test.anchor, now)).state).toBe("ahead");

    expect((await reconcileAnchor(test.db, test.anchor, now)).state).toBe("normal");
    expect((await test.anchor.read())?.heads.Invoice.seq).toBe(2);
  });

  it("reports a record altered when the anchored hash is not where the anchor says", async () => {
    await issue(test, "2026-10-12");
    const now = test.ctx().now;
    const anchor = (await test.anchor.read())!;
    await test.anchor.write({ ...anchor, heads: { ...anchor.heads, Invoice: { seq: 1, hash: "f".repeat(64) } } });
    expect((await reconcileAnchor(test.db, test.anchor, now)).state).toBe("altered");

    // The same when the database went on: the anchored hash must still be found at the anchored place.
    await test.rows.insert("Invoice");
    expect((await reconcileAnchor(test.db, test.anchor, now)).state).toBe("altered");
    expect((await test.anchor.read())?.heads.Invoice.hash).toBe("f".repeat(64));
  });
});
