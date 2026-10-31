import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, expect, it } from "vitest";

import { verifyChains } from "@/lib/chain";
import { fixtureManifest } from "@/testing/fixtures/1.0.0";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

import {
  editAWorker,
  expectChainsVerify,
  expectLegalNumbersUnique,
  issueReceipts,
  LONG,
  registerAFile,
  registerAWorker,
} from "./helpers";

/**
 * DECISION section 8, BUILD section 4: a database made by the 1.0.0 migrations, with its data, upgrades in place
 * through every migration, sets up sync, a second copy joins from it, both are edited, they converge, the chains
 * verify, and its old invoices and its 1.0.0 log still verify.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

it("a 1.0.0 database upgrades, sets up sync, is joined, edited on both sides, and converges", LONG, async () => {
  const manifest = fixtureManifest();
  pair = await createSyncPair({ fixture: true });
  const p = pair;

  // Upgraded through every migration, the 1.0.0 log kept as it was: version 1, its own chain (column null).
  const migrations = p.a.test.raw.prepare("SELECT description FROM _sqlx_migrations ORDER BY version").all() as Array<{
    description: string;
  }>;
  expect(migrations.length).toBeGreaterThanOrEqual(5);
  const oldLog = p.a.test.raw
    .prepare(`SELECT COUNT(*) AS n, MIN("hashV") AS lo, MAX("hashV") AS hi FROM "AuditLog" WHERE "chain" IS NULL`)
    .get() as { n: number; lo: number; hi: number };
  expect(Number(oldLog.n)).toBeGreaterThan(0);
  expect([Number(oldLog.lo), Number(oldLog.hi)]).toEqual([1, 1]);
  const oldInvoices = await p.a.test.db.selectFrom("Invoice").select(["id", "hash"]).execute();
  expect(oldInvoices.length, "the fixture holds 1.0.0 invoices").toBeGreaterThan(0);
  const oldReceipts = await p.a.test.db.selectFrom("Receipt").select(["id"]).execute();

  // The joined copy holds the same 1.0.0 data.
  await p.syncAll();
  p.expectSame();
  expect((await p.b.test.db.selectFrom("Invoice").select("id").execute()).length).toBe(oldInvoices.length);

  // Edit both sides: a 1.0.0 worker's file opened (logged) on the director's laptop, new work on the assistant's, the next receipt.
  const samira = manifest.names.people.workerSamira;
  const before = await p.a.test.db
    .selectFrom("StaffMember")
    .selectAll()
    .where("id", "=", samira)
    .executeTakeFirstOrThrow();
  const { openWorkerFile } = await import("@/features/people/services/worker-reads");
  const opened = await p.a.transact((ex, ctx) => openWorkerFile(ex, ctx, { id: samira }));
  expect(opened.id ?? samira).toBe(samira);
  await registerAWorker(p.b, { lastName: "مرابط", firstName: "نسيمة" });
  await registerAFile(p.b);
  const fresh = await registerAWorker(p.a);
  await editAWorker(p.a, fresh, { phone: "0770123456" });
  const receipt = await issueReceipts(p.a, 1);
  expect(receipt.firstNumber).toBeTruthy();
  await p.syncAll();
  p.expectSame();

  // The old documents still verify, unchanged, on both copies; the new log chains verify beside the old one.
  for (const laptop of [p.a, p.b]) {
    const report = await verifyChains(laptop.test.db);
    const log10 = report.chains.find((chain) => chain.chain === "AuditLog");
    expect(log10, "the 1.0.0 log chain").toMatchObject({ firstBroken: null });
    expect(log10!.rows).toBeGreaterThanOrEqual(Number(oldLog.n));
    expect(report.chains.filter((chain) => chain.chain.startsWith("AuditLog:")).length).toBe(2);
    const invoices = await laptop.test.db.selectFrom("Invoice").select(["id", "hash"]).execute();
    for (const invoice of oldInvoices) expect(invoices).toContainEqual(invoice);
    expect((await laptop.test.db.selectFrom("Receipt").select("id").execute()).length).toBe(oldReceipts.length + 1);
  }
  // The 1.0.0 stored files reached the second laptop's disk.
  for (const file of manifest.files) {
    const target = join(p.b.root, file.path);
    expect(existsSync(target), `${file.url} on the assistant's disk`).toBe(true);
    expect(readFileSync(target)).toEqual(readFileSync(join(p.a.root, file.path)));
  }
  expect(before.number).toBeTruthy();
  await expectLegalNumbersUnique(p.a.test, p.b.test);
  await expectChainsVerify(p);
});
