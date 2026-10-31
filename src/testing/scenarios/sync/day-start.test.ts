import { afterEach, expect, it } from "vitest";

import { DAILY_OWNERS, runDayStart } from "@/lib/daily";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

import { expectChainsVerify, LONG, moveBooksTo } from "./helpers";

/**
 * DECISION section 4, "the day-start jobs": the owners' day-start jobs run only on the laptop that holds the books,
 * so they never run twice; the other laptop receives their results. Foundation's own steps (core) run on both.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

it("the owners' day-start jobs run only on the books' laptop, and follow the books", LONG, async () => {
  pair = await createSyncPair();
  const p = pair;
  await p.syncAll();
  const owners = DAILY_OWNERS.filter((owner) => owner !== "core");

  p.advance({ days: 1 });
  const onA = await runDayStart(p.a.test.db, p.a.clock);
  const onB = await runDayStart(p.b.test.db, p.b.clock);
  expect(onA.failed).toEqual([]);
  expect(onB.failed).toEqual([]);
  for (const owner of owners) {
    expect(onA.elsewhere, `${owner} runs on the holder`).not.toContain(owner);
    expect(onB.elsewhere, `${owner} is left to the holder`).toContain(owner);
    expect(onB.ran).not.toContain(owner);
  }
  // Nothing an owner's job writes leaves the laptop without the books: only Foundation's own rows wait in its outbox.
  const written = await p.b.test.db.selectFrom("SyncOutbox").select("tbl").distinct().execute();
  const tables = written.map((row) => row.tbl);
  for (const table of ["Visit", "File", "StaffMember", "Sanction", "Inspection", "PaymentDue", "Contract"]) {
    expect(tables, `${table} written by a day-start job on the laptop without the books`).not.toContain(table);
  }
  await p.syncAll();
  p.expectSame();

  // The books move to the assistant's laptop: the next day the jobs run there, and not on the director's.
  await moveBooksTo(p, p.b);
  p.advance({ days: 1 });
  const nextA = await runDayStart(p.a.test.db, p.a.clock);
  const nextB = await runDayStart(p.b.test.db, p.b.clock);
  for (const owner of owners) {
    expect(nextA.elsewhere).toContain(owner);
    expect(nextB.elsewhere).not.toContain(owner);
  }
  // Running it twice changes nothing.
  const again = await runDayStart(p.b.test.db, p.b.clock);
  expect(again.ran).toEqual([]);
  await p.syncAll();
  p.expectSame();
  await expectChainsVerify(p);
});
