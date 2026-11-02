import { afterEach, expect, it } from "vitest";

import { DAILY_OWNERS, runDayStart } from "@/lib/daily";
import { writeState } from "@/lib/sync/state";
import { LONG, moveBooksTo } from "@/testing/scenarios/sync/helpers";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

/**
 * Review (review-sync): a laptop restored from a backup taken while it held the books starts the day before it has
 * caught up. Start-up (`startTheDayIfClear`, src/features/core/services/startup.ts) waits for the anchor and the
 * clock only, and `runDayStart` reads the books from the restored database: the owners' day-start jobs run on a
 * laptop that no longer holds the books, so they run twice in the centre that day.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

it("a restored laptop catching up does not run the owners' day-start jobs", LONG, async () => {
  pair = await createSyncPair();
  const p = pair;
  await p.syncAll();
  const backup = p.a.test.snapshot(); // a holds the books here
  await moveBooksTo(p, p.b);
  await p.a.sync();

  // The next morning a's disk fails; its backup is restored. Start-up marks it as catching up, then starts the day.
  p.advance({ days: 1 });
  await p.restore(p.a, backup);
  await writeState(p.a.test.db, "catchUp", {
    reason: "RESTORED",
    since: p.a.clock.now().toISOString(),
    done: 0,
    total: null,
  });
  const onA = await runDayStart(p.a.test.db, p.a.clock);
  const onB = await runDayStart(p.b.test.db, p.b.clock);
  const owners = DAILY_OWNERS.filter((owner) => owner !== "core");
  const twice = owners.filter((owner) => onA.ran.includes(owner) && onB.ran.includes(owner));
  expect(twice, "owners whose day-start ran on both laptops").toEqual([]);
});
