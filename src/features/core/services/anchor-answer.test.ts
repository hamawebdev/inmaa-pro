import { afterEach, expect, it } from "vitest";

import { compareAnchor, reconcileAnchor, writeAnchor } from "@/lib/chain/anchor";
import { peekLegalNumber } from "@/lib/numbering";
import type { LocalDate } from "@/lib/units";
import { createTestDatabase, openTestDatabase, type TestDatabase } from "@/testing/database";

import { answerAnchor } from "./anchor-answer";
import { listBackupRuns } from "./backups";

const opened: TestDatabase[] = [];
afterEach(() => {
  for (const test of opened.splice(0)) test.close();
});

const issue = (on: TestDatabase, date: string) =>
  on.run.transact((ex, ctx) => on.rows.insert("Invoice", { issueDate: date as LocalDate }, { ex, ctx }));

it("the manager keeps a restored older copy: the act is recorded, the lost numbers are not given again, and the anchor agrees", async () => {
  const test = await createTestDatabase();
  opened.push(test);
  await issue(test, "2026-10-12");
  const backup = test.snapshot();
  await issue(test, "2026-10-12");

  // The restart after the restore: the copy is behind what this PC remembers.
  const restored = await openTestDatabase(backup, { anchor: test.anchor, clock: test.clock });
  opened.push(restored);
  const comparison = await reconcileAnchor(restored.db, restored.anchor, restored.ctx().now);
  expect(comparison.state).toBe("behind");

  // Nobody but the manager answers, and not without his reason.
  const accountant = await restored.sessionFor("ACCOUNTANT");
  await expect(
    restored.transact((ex, ctx) => answerAnchor(ex, ctx, { comparison, reason: "نسخة الأمس" }), accountant),
  ).rejects.toThrow("You do not have permission to do this.");
  await expect(restored.transact((ex, ctx) => answerAnchor(ex, ctx, { comparison, reason: "  " }))).rejects.toThrow(
    "A reason is required.",
  );

  await restored.transact((ex, ctx) =>
    answerAnchor(ex, ctx, {
      comparison,
      reason: "تلف القرص، نسخة الأمس",
      restoredFromPath: "E:/sauvegardes/inmaa-auto-2026-10-11.db",
      preRestorePath: "E:/sauvegardes/inmaa-pre-restore-2026-10-12-09-00-00.db",
    }),
  );
  await writeAnchor(restored.db, restored.anchor, restored.ctx().now);

  expect((await compareAnchor(restored.db, restored.anchor, restored.ctx().now)).state).toBe("normal");
  const next = await restored.transact((ex, ctx) => peekLegalNumber(ex, ctx, "INVOICE", { date: ctx.today }));
  expect(next.display).toBe("000003/2026");
  const runs = await restored.transact((ex, ctx) => listBackupRuns(ex, ctx));
  expect(runs.map((run) => [run.kind, run.isProtected]).sort()).toEqual([
    ["PRE_RESTORE", true],
    ["RESTORE", false],
  ]);
  const entry = await restored.db
    .selectFrom("AuditLog")
    .select(["operation", "action", "reason"])
    .where("action", "=", "RESTORE")
    .executeTakeFirstOrThrow();
  expect(entry).toEqual({ operation: "SECURITY", action: "RESTORE", reason: "تلف القرص، نسخة الأمس" });
});
