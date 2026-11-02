import { afterEach, expect, it } from "vitest";

import { FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import { verifyChains } from "@/lib/chain";
import { logSecurity } from "@/lib/log";
import { writeState } from "@/lib/sync/state";
import { LONG, registerAWorker } from "@/testing/scenarios/sync/helpers";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

/**
 * Review (review-sync): a restored laptop writes to its own log chain before it has taken back its own envelopes.
 * `appendChained` guards the seven legal chains with `requireBooks` → `requireCaughtUp`, but not the log: a sign-in
 * on the catch-up screen (the manager may sign in there, ProgramGate), or a failed attempt by anybody, takes
 * `AuditLog:<this laptop>` chainSeq k+1 while the mailbox already holds this laptop's own k+1. The catch-up then
 * holds its own old rows, and the other laptop holds the new one: the log chain forks for good.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

it("a log entry written while catching up does not fork this laptop's log chain", LONG, async () => {
  pair = await createSyncPair();
  const p = pair;
  await p.syncAll();
  const backup = p.a.test.snapshot();
  // After the backup a works on, and sends it: its log chain moves on the mailbox.
  await registerAWorker(p.a, { nationalIdNumber: "109870000000000123" });
  await p.syncAll();

  // a's disk fails; the backup comes back. Before the network returns, somebody tries a password on the
  // catch-up screen (a failed sign-in is logged, as sign-in.ts does).
  await p.restore(p.a, backup);
  await writeState(p.a.test.db, "catchUp", {
    reason: "RESTORED",
    since: p.a.clock.now().toISOString(),
    done: 0,
    total: null,
  });
  await p.a.transact((ex, ctx) =>
    logSecurity(ex, ctx, {
      owner: "FOUNDATION",
      action: "SIGN_IN_FAILED",
      entity: "User",
      entityId: FIRST_MANAGER_ID,
      entityLabel: "manager",
      subject: { kind: "USER", id: FIRST_MANAGER_ID, label: "manager" },
      context: { how: "PASSWORD" },
    }),
  );
  await p.syncAll();

  for (const laptop of [p.a, p.b]) {
    const held = await laptop.test.db
      .selectFrom("SyncHeld")
      .select(["tbl", "reason"])
      .where("resolvedAt", "is", null)
      .execute();
    expect(held, `held on ${laptop.name}`).toEqual([]);
    expect((await verifyChains(laptop.test.db)).ok, `chains on ${laptop.name}`).toBe(true);
  }
  p.expectSame();
});
