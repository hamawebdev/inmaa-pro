import { expect } from "vitest";

import { verifyChains } from "@/lib/chain";
import { logConsult } from "@/lib/log";
import { requestBooks } from "@/lib/sync/books";
import type { SyncLaptop } from "@/testing/sync/pair";
import type { SyncTrio } from "@/testing/sync/trio";

import { booksHolder, deviceIdOf, expectLegalNumbersUnique } from "../sync/helpers";

/**
 * What the phone scenarios share (the verifier's; docs/phone/DECISION.md and docs/phone/BUILD.md section 4): the
 * two-laptop helpers of `../sync/helpers.ts` taken to three devices. Every step that arranges the thing under test goes
 * through an owner's service, in a stamped transaction on one device, as the office (or the director on his phone)
 * would. Reads are plain selects.
 */

/** Three databases, a mailbox and three data folders: room for a machine several teammates are loading. */
export const LONG = { timeout: 600_000 };

/** The chains verify on every device: every chain whole, every digest, no legal number missing, the cached totals. */
export async function expectChainsVerifyOn(devices: SyncLaptop[]): Promise<void> {
  for (const device of devices) {
    const report = await verifyChains(device.test.db);
    const broken = report.chains.filter((chain) => chain.firstBroken !== null);
    expect(
      {
        device: device.name,
        broken,
        brokenDigests: report.brokenDigests,
        missingNumbers: report.missingNumbers,
        brokenTotals: report.brokenTotals,
      },
      `the chains verify on ${device.name}`,
    ).toEqual({ device: device.name, broken: [], brokenDigests: [], missingNumbers: [], brokenTotals: [] });
    expect(report.ok).toBe(true);
  }
}

/** The end of every scenario: the three devices hold the same shared rows, their chains verify, no legal number twice. */
export async function expectConverged(trio: SyncTrio, devices: SyncLaptop[] = trio.devices()): Promise<void> {
  trio.expectSame(devices);
  await expectLegalNumbersUnique(...devices.map((device) => device.test));
  await expectChainsVerifyOn(devices);
}

/** «طلب الدفاتر» on a device, then rounds on every device until the books arrived. */
export async function moveBooksTo(trio: SyncTrio, device: SyncLaptop): Promise<void> {
  await device.transact((ex, ctx) => requestBooks(ex, ctx));
  await trio.syncAll();
  expect(await booksHolder(device), `the books reached ${device.name}`).toBe(deviceIdOf(device));
}

/** One logged operation on a device: the office opened the program that day (its own clock check sees no jump). */
export async function openTheProgram(device: SyncLaptop): Promise<void> {
  await device.transact((ex, ctx) =>
    logConsult(ex, ctx, { owner: "FOUNDATION", action: "VIEW", context: { test: "a working day" } }),
  );
}

/** Workers' numbers on a device, by worker id. */
export async function workerNumbersOf(device: SyncLaptop): Promise<Map<string, string>> {
  const rows = await device.test.db
    .selectFrom("StaffMember")
    .select(["id", "number"])
    .where("kind", "=", "WORKER")
    .execute();
  return new Map(rows.map((row) => [row.id, row.number]));
}

/** No worker number belongs to two workers, across every device given. */
export async function expectNoWorkerNumberTwice(devices: SyncLaptop[]): Promise<void> {
  const owner = new Map<string, string>();
  for (const device of devices) {
    for (const [id, number] of await workerNumbersOf(device)) {
      const seen = owner.get(number);
      expect(seen === undefined || seen === id, `worker number ${number} is one worker, not two`).toBe(true);
      owner.set(number, id);
    }
  }
}

/** The device rows of the centre as a device's database holds them. */
export async function syncDevicesOn(device: SyncLaptop) {
  return device.test.db
    .selectFrom("SyncDevice")
    .select(["id", "kind", "slot", "removedAt"])
    .orderBy("slot")
    .orderBy("joinedAt")
    .execute();
}

/** How many transactions wait in a device's outbox. */
export async function waitingOn(device: SyncLaptop): Promise<number> {
  const rows = await device.test.db.selectFrom("SyncOutbox").select("txId").distinct().execute();
  return rows.length;
}
