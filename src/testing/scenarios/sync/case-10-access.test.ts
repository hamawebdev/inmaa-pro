import { afterEach, describe, expect, it } from "vitest";

import { saveRoleGrants, setAccountActive, updateAccount } from "@/features/core/services/users";
import { issueReceiptBatch, recordReceiptPrinted } from "@/features/money/services/payments";
import { sessionAfterSync } from "@/lib/access/session";
import { createSyncPair, type SyncPair } from "@/testing/sync/pair";

import { assistantOn, expectChainsVerify, LONG } from "./helpers";

/**
 * DECISION section 7, case 10, and BUILD section 4: the director changes the assistant's access on her laptop, and
 * it takes effect on the assistant's laptop as soon as the change arrives: a signed-in session is reloaded at once;
 * a switched-off account is signed out. What she did before the change arrived is kept, and the log records the role
 * she held then.
 */
let pair: SyncPair | null = null;
afterEach(() => {
  pair?.close();
  pair = null;
});

describe("case 10: the director changes the assistant's access", () => {
  it("a new role reaches her laptop and her live session is reloaded with it", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    const before = await assistantOn(p);
    expect(before.roleId).toBe("ACCOUNTANT");
    expect(before.sections.MONEY).toBe("WRITE");

    // While the assistant works, the director makes her reception instead.
    await p.a.transact((ex, ctx) => updateAccount(ex, ctx, { userId: p.assistantId!, roleId: "RECEPTION_SALES" }));
    await p.a.sync();
    const round = await p.b.sync();
    expect([...round.outcome.tables]).toContain("User");

    const after = await sessionAfterSync(p.b.test.db, before, round.outcome.tables);
    expect(after.outcome).toBe("reloaded");
    expect(after.session?.roleId).toBe("RECEPTION_SALES");
    expect(after.session?.sections.MONEY ?? null, "a section closed to her leaves her screen").not.toBe("WRITE");
    await p.syncAll();
    p.expectSame();
    await expectChainsVerify(p);
  });

  it("new grants of her role reach her laptop and her live session follows them", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    const before = await assistantOn(p);
    expect(before.capabilities).toContain("payment.record");

    // The director takes «payment.record» away from the accountant's role, and the MONEY section down to READ.
    const grants = await p.a.test.db
      .selectFrom("RoleGrant")
      .select(["kind", "key", "access"])
      .where("roleId", "=", "ACCOUNTANT")
      .execute();
    const sections = Object.fromEntries(
      grants.filter((grant) => grant.kind === "SECTION").map((grant) => [grant.key, grant.access]),
    );
    const capabilities = grants
      .filter((grant) => grant.kind === "CAPABILITY" && grant.key !== "payment.record")
      .map((grant) => grant.key);
    await p.a.transact((ex, ctx) =>
      saveRoleGrants(ex, ctx, {
        roleId: "ACCOUNTANT",
        sections: { ...sections, MONEY: "READ" } as never,
        capabilities: capabilities as never,
      }),
    );
    await p.a.sync();
    const round = await p.b.sync();
    const after = await sessionAfterSync(p.b.test.db, before, round.outcome.tables);
    expect(after.outcome).toBe("reloaded");
    expect(after.session?.capabilities).not.toContain("payment.record");
    expect(after.session?.sections.MONEY).toBe("READ");
    await p.syncAll();
    p.expectSame();
    await expectChainsVerify(p);
  });

  it("an account switched off on the director's laptop is signed out on the assistant's", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    await p.syncAll();
    const before = await assistantOn(p);

    await p.a.transact((ex, ctx) => setAccountActive(ex, ctx, { userId: p.assistantId!, active: false }));
    await p.a.sync();
    const round = await p.b.sync();
    const after = await sessionAfterSync(p.b.test.db, before, round.outcome.tables);
    expect(after).toEqual({ outcome: "signedOut", session: null });
    await p.syncAll();
    p.expectSame();
    await expectChainsVerify(p);
  });

  it("what she did before the change arrived stands, and the log records the role she held then", LONG, async () => {
    pair = await createSyncPair();
    const p = pair;
    // The books on her laptop, so that she can hand out receipts as the accountant.
    const { moveBooksTo } = await import("./helpers");
    await moveBooksTo(p, p.b);
    const accountant = await assistantOn(p);

    p.relay.offline = true;
    await p.a.transact((ex, ctx) => updateAccount(ex, ctx, { userId: p.assistantId!, roleId: "RECEPTION_SALES" }));
    // Apart, she still holds the accountant's role on her laptop: the receipts she hands out are allowed when done.
    const issued = await p.b.transact(
      (ex, ctx) => issueReceiptBatch(ex, ctx, { count: 2, collectorKind: "OFFICE", collectorStaffId: null }),
      accountant,
    );
    await p.b.transact((ex, ctx) => recordReceiptPrinted(ex, ctx, { receiptId: issued.receiptIds[0] }), accountant);
    p.relay.offline = false;
    await p.syncAll();
    p.expectSame();

    for (const side of [p.a, p.b]) {
      const receipts = await side.test.db
        .selectFrom("Receipt")
        .select("id")
        .where("id", "in", issued.receiptIds)
        .execute();
      expect(receipts.length, `her receipts stand on laptop ${side.name}`).toBe(2);
    }
    const entry = await p.a.test.db
      .selectFrom("AuditLog")
      .select(["userRole", "userId"])
      .where("entity", "=", "Receipt")
      .where("userId", "=", p.assistantId!)
      .executeTakeFirst();
    expect(entry, "her receipts are in the log").toBeDefined();
    expect(entry!.userRole).toBe("ACCOUNTANT");
    const role = await p.b.test.db
      .selectFrom("User")
      .select("roleId")
      .where("id", "=", p.assistantId!)
      .executeTakeFirstOrThrow();
    expect(role.roleId).toBe("RECEPTION_SALES");
    await expectChainsVerify(p);
  });
});
