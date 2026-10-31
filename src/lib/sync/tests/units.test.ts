// The hybrid clock, a transaction too large for one envelope, and the loop's pace.
import { randomBytes } from "node:crypto";

import { afterEach, describe, expect, it } from "vitest";

import { fixedClock } from "@/lib/clock";
import { formatHlc, hlcInstant, maxHlc, nextHlc, parseHlc } from "@/lib/sync/hlc";
import { ACTIVE_EVERY_MS, createSyncLoop, nextUtcMidnight, QUIET_EVERY_MS, type RoundOutcome } from "@/lib/sync/loop";
import { RelayLimit, RelayOffline } from "@/lib/sync/relay";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";
import { createTestDatabase } from "@/testing/database";

describe("the hybrid clock", () => {
  it("follows the corrected time, never goes back, and sorts as text", () => {
    const first = nextHlc(null, 1_000, "aa");
    expect(parseHlc(first)).toEqual({ ms: 1_000, counter: 0, deviceId: "aa" });
    // The PC's clock went back: the stamp still moves forward.
    const second = nextHlc(first, 500, "aa");
    expect(second > first).toBe(true);
    expect(parseHlc(second)).toMatchObject({ ms: 1_000, counter: 1 });
    // After a stamp received from the other laptop, the next one sorts after it.
    const received = formatHlc({ ms: 5_000, counter: 3, deviceId: "bb" });
    const third = nextHlc(maxHlc(second, received), 2_000, "aa");
    expect(third > received).toBe(true);
    expect(hlcInstant(third)).toBe(new Date(5_000).toISOString());
    // Ten thousand changes in one millisecond carry over into the next.
    expect(parseHlc(nextHlc(formatHlc({ ms: 7, counter: 9999, deviceId: "aa" }), 0, "aa"))).toMatchObject({
      ms: 8,
      counter: 0,
    });
  });
});

describe("a transaction larger than an envelope", () => {
  let pair: SyncPair;
  afterEach(() => pair?.close());

  it("is cut into parts that are applied together", async () => {
    pair = await createSyncPair();
    // About 2.4 MB that does not compress: more than one envelope of 1.5 MB.
    await pair.a.transact(async (ex) => {
      for (let i = 0; i < 120; i++) {
        await pair.a.test.rows.insert(
          "Client",
          {
            name: `كبير ${i}`,
            phone1: `06610${String(i).padStart(5, "0")}`,
            note: randomBytes(10_000).toString("base64"),
          },
          { ex },
        );
      }
    });
    const round = await pair.a.sync();
    expect(round.sent).toBe(1);
    const envelopes = pair.relay.requests.filter((r) => r.method === "PUT" && r.path.includes("/envelopes/"));
    expect(envelopes.length).toBeGreaterThan(1);
    await pair.syncAll();
    pair.expectSame();
  });
});

describe("the loop", () => {
  const quiet = (moved = 0): RoundOutcome => ({
    kind: "OK",
    result: {
      sent: moved,
      received: 0,
      outcome: { applied: 0, held: 0, conflicts: 0, tables: new Set(), uploads: [] },
      waiting: false,
      caughtUp: false,
      filesSent: 0,
      filesReceived: 0,
      filesMissing: 0,
      relayTime: null,
    },
  });

  it("syncs every 60 s when quiet, every 15 s after activity, backs off offline, waits out the daily limit", async () => {
    const test = await createTestDatabase();
    const clock = fixedClock("2026-10-12T22:00:00.000Z");
    const planned: number[] = [];
    let due: (() => void) | null = null;
    const queue: RoundOutcome[] = [
      quiet(),
      quiet(3),
      { kind: "OFFLINE", error: new RelayOffline("down") },
      { kind: "OFFLINE", error: new RelayOffline("down") },
      { kind: "LIMIT", error: new RelayLimit("limit", Date.parse("2026-10-13T00:00:00.000Z"), 429, null, null) },
      { kind: "REVOKED" },
    ];
    let done: () => void = () => undefined;
    const finished = new Promise<void>((resolve) => (done = resolve));
    const loop = createSyncLoop({
      db: test.db,
      clock: () => clock,
      env: async () => ({}) as never,
      run: async () => queue.shift() ?? quiet(),
      later: (work, ms) => {
        planned.push(ms);
        due = work;
        return () => (due = null);
      },
      onOutcome: (outcome) => {
        if (outcome.kind === "REVOKED") done();
        else queueMicrotask(() => due?.());
      },
    });
    loop.start();
    (due as (() => void) | null)?.();
    await finished;
    loop.stop();
    // first round at once; quiet → 60 s; activity → 15 s; offline → 15 s then 30 s; limit → until 00:00 UTC (+5 s)
    expect(planned.slice(0, 6)).toEqual([0, QUIET_EVERY_MS, ACTIVE_EVERY_MS, 15_000, 30_000, 2 * 3_600_000 + 5_000]);
    // A revoked laptop stops asking.
    expect(planned).toHaveLength(6);
    const exchange = await test.db
      .selectFrom("SyncState")
      .select("value")
      .where("key", "=", "exchange")
      .executeTakeFirst();
    expect(JSON.parse(exchange!.value)).toMatchObject({ lastOutcome: "REVOKED" });
    expect(new Date(nextUtcMidnight(Date.parse("2026-10-12T22:30:00.000Z"))).toISOString()).toBe(
      "2026-10-13T00:00:00.000Z",
    );
    test.close();
  });
});
