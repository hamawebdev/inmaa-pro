import { expect } from "vitest";

import { registerFile } from "@/features/clients/services/files";
import type { FormKind } from "@/features/clients/validators/option-lists";
import { getReceiptSheet, issueReceiptBatch, recordReceiptPrinted } from "@/features/money/services/payments";
import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { registerWorker, updateWorker } from "@/features/people/services/workers";
import { loadSession } from "@/lib/access/session";
import { verifyChains } from "@/lib/chain";
import { logConsult } from "@/lib/log";
import type { Session } from "@/lib/service/context";
import { requestBooks } from "@/lib/sync/books";
import type { TestDatabase } from "@/testing/database";
import type { SyncLaptop, SyncPair } from "@/testing/sync/pair";

import { contractInput } from "../acceptance/helpers";

/**
 * Money's receipt services, re-exported: importing Money's payments module before Clients' files module trips an
 * import cycle (operations/services/upstream.ts reads People's ACTIVE_STATUSES before it is defined).
 */
export { getReceiptSheet, recordReceiptPrinted };

/**
 * What the sync scenarios share (the verifier's; docs/sync/DECISION.md section 7 and BUILD.md section 4).
 *
 * Every step that arranges the thing under test goes through an owner's service, in a stamped transaction on one
 * laptop, as the office would. Reads are plain selects.
 */

/** A pair is two databases, a mailbox and two data folders: room for a machine several teammates are loading. */
export const LONG = { timeout: 300_000 };

// ─── The chains, after every scenario ────────────────────────────────────────

/**
 * The chains verify on both copies (DECISION section 5): every chain whole, every invoice's digest, no legal number
 * missing, the cached totals equal to their ledgers. Called at the end of every test.
 */
export async function expectChainsVerify(pair: SyncPair): Promise<void> {
  for (const laptop of [pair.a, pair.b]) {
    const report = await verifyChains(laptop.test.db);
    const broken = report.chains.filter((chain) => chain.firstBroken !== null);
    expect(
      { laptop: laptop.name, broken, ...pick(report, ["brokenDigests", "missingNumbers", "brokenTotals"]) },
      `the chains verify on laptop ${laptop.name}`,
    ).toEqual({ laptop: laptop.name, broken: [], brokenDigests: [], missingNumbers: [], brokenTotals: [] });
    expect(report.ok).toBe(true);
  }
}

function pick<T extends object, K extends keyof T>(value: T, keys: K[]): Pick<T, K> {
  return Object.fromEntries(keys.map((key) => [key, value[key]])) as Pick<T, K>;
}

/** Each laptop's own log chain is present on both copies, with the same rows. */
export async function logChainsOf(test: TestDatabase): Promise<Record<string, number>> {
  const rows = await test.db
    .selectFrom("AuditLog")
    .select(({ fn }) => ["chain", fn.countAll<number>().as("n")])
    .groupBy("chain")
    .execute();
  return Object.fromEntries(rows.map((row) => [row.chain ?? "AuditLog", Number(row.n)]));
}

// ─── Legal numbers ───────────────────────────────────────────────────────────

export interface LegalNumber {
  key: "INVOICE" | "RECEIPT";
  year: number;
  seq: number;
  id: string;
}

/** Every invoice and receipt number a database holds. */
export async function legalNumbersOf(test: TestDatabase): Promise<LegalNumber[]> {
  const invoices = await test.db.selectFrom("Invoice").select(["id", "numberYear", "numberSeq"]).execute();
  const receipts = await test.db.selectFrom("Receipt").select(["id", "numberYear", "numberSeq"]).execute();
  return [
    ...invoices.map((row) => ({ key: "INVOICE" as const, year: row.numberYear, seq: row.numberSeq, id: row.id })),
    ...receipts.map((row) => ({ key: "RECEIPT" as const, year: row.numberYear, seq: row.numberSeq, id: row.id })),
  ];
}

/**
 * No invoice or receipt number is issued twice: across both databases one number is one document (the same id on
 * both laptops), and every number from 1 to the highest is either on a document or inside a declared gap, on each.
 */
export async function expectLegalNumbersUnique(...tests: TestDatabase[]): Promise<void> {
  const owner = new Map<string, string>();
  for (const test of tests) {
    for (const number of await legalNumbersOf(test)) {
      const key = `${number.key} ${number.year}: ${number.seq}`;
      const seen = owner.get(key);
      expect(seen === undefined || seen === number.id, `${key} is one document, not two`).toBe(true);
      owner.set(key, number.id);
    }
  }
  for (const test of tests) {
    const numbers = await legalNumbersOf(test);
    const gaps = await test.db.selectFrom("SequenceGap").select(["key", "year", "fromValue", "toValue"]).execute();
    const groups = new Map<string, number[]>();
    for (const number of numbers) {
      const group = `${number.key} ${number.year}`;
      groups.set(group, [...(groups.get(group) ?? []), number.seq]);
    }
    for (const [group, seqs] of groups) {
      const [key, year] = group.split(" ");
      const top = Math.max(...seqs);
      for (let seq = 1; seq <= top; seq++) {
        const covered =
          seqs.includes(seq) ||
          gaps.some(
            (gap) => gap.key === key && gap.year === Number(year) && gap.fromValue <= seq && seq <= gap.toValue,
          );
        expect(covered, `${group}: ${seq} is on a document or in a declared gap`).toBe(true);
      }
    }
  }
}

// ─── The office's work, through the owners' services ─────────────────────────

let workerCount = 0;

/** A worker's form as the registration screen sends it. */
export function workerValues(
  today: string,
  values: { lastName?: string; firstName?: string; nationalIdNumber?: string; phone?: string; address?: string } = {},
) {
  workerCount += 1;
  return {
    ...emptyWorkerValues(today),
    sex: "FEMALE" as const,
    lastName: values.lastName ?? "بوزيد",
    firstName: values.firstName ?? `سميرة ${workerCount}`,
    birthDate: "1994-03-17",
    phone: values.phone ?? `06612031${String(workerCount % 100).padStart(2, "0")}`,
    nationalIdNumber: values.nationalIdNumber ?? "",
    ...(values.address !== undefined ? { address: values.address } : {}),
  };
}

export type WorkerValues = ReturnType<typeof workerValues>;

/** People: a worker registered on her form. `nationalIdNumber` makes her the one live worker with that number. */
export async function registerAWorker(
  laptop: SyncLaptop,
  values: Parameters<typeof workerValues>[1] = {},
  session?: Session,
): Promise<{ id: string; values: WorkerValues }> {
  const form = workerValues(laptop.test.ctx().today, values);
  const saved = await laptop.transact((ex, ctx) => registerWorker(ex, ctx, form), session);
  return { id: saved.id, values: form };
}

/** People: her form saved again with some fields changed (the service writes only what changed). */
export async function editAWorker(
  laptop: SyncLaptop,
  worker: { id: string; values: WorkerValues },
  patch: Partial<WorkerValues>,
  session?: Session,
): Promise<void> {
  await laptop.transact(
    (ex, ctx) => updateWorker(ex, ctx, { id: worker.id, values: { ...worker.values, ...patch } }),
    session,
  );
}

/** Clients: a contract file registered on his form (Clients' own demo answers). */
export async function registerAFile(laptop: SyncLaptop, kind: FormKind = "HOUSING_CONTRACT", session?: Session) {
  return laptop.transact((ex, ctx) => registerFile(ex, ctx, contractInput(kind)), session);
}

/** Money: a block of blank receipts handed to the office: `count` legal receipt numbers. */
export async function issueReceipts(laptop: SyncLaptop, count = 1, session?: Session) {
  return laptop.transact(
    (ex, ctx) => issueReceiptBatch(ex, ctx, { count, collectorKind: "OFFICE", collectorStaffId: null }),
    session,
  );
}

/** The holder of the books right now, as a laptop's database says. */
export async function booksHolder(laptop: SyncLaptop): Promise<string | null> {
  const row = await laptop.test.db
    .selectFrom("SyncBooks")
    .select("holderDeviceId")
    .where("id", "=", "books")
    .executeTakeFirst();
  return row?.holderDeviceId ?? null;
}

/** This laptop's device id. */
export function deviceIdOf(laptop: SyncLaptop): string {
  if (!laptop.vault.data) throw new Error(`verifier: laptop ${laptop.name} has no vault`);
  return laptop.vault.data.deviceId;
}

/** «طلب الدفاتر» on a laptop, then rounds until the books arrived. */
export async function moveBooksTo(pair: SyncPair, laptop: SyncLaptop): Promise<void> {
  await laptop.transact((ex, ctx) => requestBooks(ex, ctx));
  await pair.syncAll();
  expect(await booksHolder(laptop)).toBe(deviceIdOf(laptop));
}

/** The assistant's session on her own laptop. */
export async function assistantOn(pair: SyncPair): Promise<Session> {
  if (!pair.assistantId) throw new Error("verifier: the pair has no assistant account");
  return loadSession(pair.b.test.db, pair.assistantId);
}

/**
 * The office passes days the way it does at the centre: one logged operation on each laptop each day, so that each
 * laptop's clock check (which reads only its own log chain) never sees a jump.
 */
export async function workDays(pair: SyncPair, days: number, options: { sync?: boolean } = {}): Promise<void> {
  for (let day = 0; day < days; day++) {
    pair.advance({ days: 1 });
    for (const laptop of [pair.a, pair.b]) {
      await laptop.transact((ex, ctx) =>
        logConsult(ex, ctx, { owner: "FOUNDATION", action: "VIEW", context: { test: "a working day" } }),
      );
    }
    if (options.sync) await pair.syncAll();
  }
}

/** How many transactions wait in a laptop's outbox. */
export async function waitingOn(laptop: SyncLaptop): Promise<number> {
  const rows = await laptop.test.db.selectFrom("SyncOutbox").select("txId").distinct().execute();
  return rows.length;
}

/** Open (unresolved) conflicts and held changes on a laptop. */
export async function openConflicts(laptop: SyncLaptop) {
  return laptop.test.db.selectFrom("SyncConflict").selectAll().where("resolvedAt", "is", null).execute();
}

export async function openHeld(laptop: SyncLaptop) {
  return laptop.test.db.selectFrom("SyncHeld").selectAll().where("resolvedAt", "is", null).execute();
}
