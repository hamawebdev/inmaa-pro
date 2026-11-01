import { afterEach, describe, expect, it } from "vitest";

import { FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import { listSignInAccounts, setFirstPassword, signIn } from "@/features/core/services/sign-in";
import { createAccount, giveAccountPassword, updateAccount } from "@/features/core/services/users";
import { PHONE_ROLE_REFUSED } from "@/lib/access/phone";
import { loadSession, sessionAfterSync } from "@/lib/access/session";
import { buildContext, SYSTEM_SESSION } from "@/lib/service/context";
import { pairDevice, setUpCentre, SYNC_ERRORS } from "@/lib/sync/centre";
import { thisDeviceKind } from "@/lib/sync/device";
import { createSyncTrio, type SyncTrio } from "@/testing/sync/trio";

import { deviceIdOf, registerAWorker } from "../sync/helpers";

import { expectConverged, LONG, syncDevicesOn } from "./helpers";

/**
 * docs/phone/DECISION.md sections 2, 3 and 4: the phone is the centre's third device (slot 2, kind PHONE), it joins
 * only on a code made for a phone on a laptop, the centre has at most two laptops and one phone, and only an account
 * holding the manager role signs in on it.
 */
let trio: SyncTrio | null = null;
afterEach(() => {
  trio?.close();
  trio = null;
});

/** Throw-away passwords: no work factor. */
const FAST = { iterations: 1_000 };

describe("pairing the director's phone", () => {
  it("joins on a phone's code as the third device: slot 2, kind PHONE, on all three copies", LONG, async () => {
    trio = await createSyncTrio();
    const t = trio;
    expect(t.phone.vault.data).toMatchObject({ kind: "PHONE", slot: 2 });
    expect(t.a.vault.data).toMatchObject({ slot: 0 });
    expect(t.b.vault.data).toMatchObject({ slot: 1 });
    expect(await thisDeviceKind(t.phone.test.db)).toBe("PHONE");
    expect(await thisDeviceKind(t.a.test.db)).toBe("LAPTOP");
    expect(await thisDeviceKind(t.b.test.db)).toBe("LAPTOP");

    await t.syncAll();
    for (const device of t.devices()) {
      expect(
        (await syncDevicesOn(device)).map((row) => [row.id, row.kind, row.slot, row.removedAt]),
        `the centre's devices as ${device.name} sees them`,
      ).toEqual([
        [deviceIdOf(t.a), "LAPTOP", 0, null],
        [deviceIdOf(t.b), "LAPTOP", 1, null],
        [deviceIdOf(t.phone), "PHONE", 2, null],
      ]);
    }
    // Its own log chain, as the laptops have theirs.
    await registerAWorker(t.phone);
    await t.syncAll();
    const chains = await t.a.test.db.selectFrom("AuditLog").select("chain").distinct().execute();
    expect(chains.map((row) => row.chain)).toContain(`AuditLog:${deviceIdOf(t.phone)}`);
    await expectConverged(t);
  });

  it("a code made for a laptop is refused to the phone, and a phone's code to a laptop", LONG, async () => {
    trio = await createSyncTrio({ joined: { b: false, phone: false } });
    const t = trio;
    const laptopCode = await t.code("LAPTOP");
    await expect(t.joinWith(t.phone, laptopCode.code, "PHONE")).rejects.toThrow(SYNC_ERRORS.codeForLaptop);
    const phoneCode = await t.code("PHONE");
    await expect(t.joinWith(t.b, phoneCode.code, "LAPTOP")).rejects.toThrow(SYNC_ERRORS.codeForPhone);
    // Neither refused attempt used the code up: each joins on its own one.
    await t.joinWith(t.b, laptopCode.code, "LAPTOP");
    await t.joinWith(t.phone, phoneCode.code, "PHONE");
    await t.syncAll();
    await expectConverged(t);
  });

  it("a fourth device is refused: a second phone, and a third laptop", LONG, async () => {
    trio = await createSyncTrio({ joined: { phone: false } });
    const t = trio;
    // Two codes for a phone made before either was used: the mailbox lets only one phone in.
    const first = await t.code("PHONE");
    const second = await t.code("PHONE");
    await t.joinWith(t.phone, first.code, "PHONE");
    const secondPhone = await t.fresh("second-phone");
    await expect(t.joinWith(secondPhone, second.code, "PHONE")).rejects.toThrow(SYNC_ERRORS.phoneTaken);
    // With the phone in, the laptop refuses to make another phone's code, and a third laptop's.
    await expect(t.code("PHONE")).rejects.toThrow(SYNC_ERRORS.phoneTaken);
    await expect(t.code("LAPTOP")).rejects.toThrow(SYNC_ERRORS.twoLaptops);
    await t.syncAll();
    for (const device of t.devices()) expect(await syncDevicesOn(device)).toHaveLength(3);
    await expectConverged(t);
  });

  it("a third laptop on a code made before the second laptop joined is refused by the mailbox", LONG, async () => {
    trio = await createSyncTrio({ joined: { b: false } });
    const t = trio;
    const first = await t.code("LAPTOP");
    const second = await pairDevice(t.a.centre(), buildContext(t.a.manager, t.a.clock), {
      kind: "LAPTOP",
      newAccount: {
        displayName: "assistant 2",
        username: "assistant2",
        roleId: "ACCOUNTANT",
        password: "assistant2-pass",
      },
    });
    await t.joinWith(t.b, first.code, "LAPTOP");
    const thirdLaptop = await t.fresh("third-laptop");
    await expect(t.joinWith(thirdLaptop, second.code, "LAPTOP")).rejects.toThrow(SYNC_ERRORS.twoLaptops);
    await t.syncAll();
    await expectConverged(t);
  });

  it("the phone neither sets up a centre nor makes a code for another device", LONG, async () => {
    trio = await createSyncTrio({ joined: { phone: false } });
    const t = trio;
    // A freshly installed phone offered «إعداد المزامنة» anyway (a screen bug) is refused by the mailbox.
    await expect(
      setUpCentre(t.phone.centre(), buildContext(t.phone.manager, t.phone.clock), {
        setupKey: t.relay.setupKey,
        deviceName: "phone",
        kind: "PHONE",
      }),
    ).rejects.toThrow(SYNC_ERRORS.phoneSetUp);
    await t.joinPhone();
    for (const kind of ["PHONE", "LAPTOP"] as const) {
      await expect(t.code(kind, t.phone)).rejects.toThrow(SYNC_ERRORS.phonePairs);
    }
  });
});

describe("who signs in on the phone", () => {
  it(
    "only an account of the manager's role: the assistant is refused there, and signs in on her laptop",
    LONG,
    async () => {
      trio = await createSyncTrio({ joined: { phone: false } });
      const t = trio;
      // The director chose his password on his laptop before the phone joined; the assistant has hers (pairing).
      await t.a.transact(
        (ex, ctx) => setFirstPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password: "director-pass", ...FAST }),
        SYSTEM_SESSION,
      );
      await t.syncAll();
      await t.joinPhone();

      const onPhone = <T>(work: Parameters<typeof t.phone.transact<T>>[0]) => t.phone.transact(work, SYSTEM_SESSION);
      // The window lists only manager accounts on a phone; the service is the guard whatever the window shows.
      const accounts = await listSignInAccounts(t.phone.test.db);
      expect(accounts.map((account) => account.id)).toEqual(expect.arrayContaining([FIRST_MANAGER_ID, t.assistantId]));

      await expect(
        onPhone((ex, ctx) => signIn(ex, ctx, { userId: t.assistantId!, password: "assistant-password-1" })),
      ).rejects.toThrow(PHONE_ROLE_REFUSED);
      // Refused before the password is looked at: a wrong one gets the same sentence, and nothing is counted.
      await expect(
        onPhone((ex, ctx) => signIn(ex, ctx, { userId: t.assistantId!, password: "wrong" })),
      ).rejects.toThrow(PHONE_ROLE_REFUSED);
      const counted = await t.phone.test.db
        .selectFrom("User")
        .select("failedSignInCount")
        .where("id", "=", t.assistantId!)
        .executeTakeFirstOrThrow();
      expect(counted.failedSignInCount).toBe(0);

      const director = await onPhone((ex, ctx) =>
        signIn(ex, ctx, { userId: FIRST_MANAGER_ID, password: "director-pass" }),
      );
      expect(director).toMatchObject({ ok: true });

      const assistantOnLaptop = await t.b.transact(
        (ex, ctx) =>
          signIn(ex, ctx, {
            userId: t.assistantId!,
            password: "assistant-password-1",
            newPassword: "assistant-password-2",
            ...FAST,
          }),
        SYSTEM_SESSION,
      );
      expect(assistantOnLaptop).toMatchObject({ ok: true });
      await t.syncAll();
      await expectConverged(t);
    },
  );

  it("an account given no password yet cannot choose one on the phone unless it is a manager's", LONG, async () => {
    trio = await createSyncTrio();
    const t = trio;
    const hr = await t.a.transact((ex, ctx) =>
      createAccount(ex, ctx, { displayName: "موارد بشرية", username: "hr", roleId: "HR_OFFICER" }),
    );
    await t.syncAll();
    await expect(
      t.phone.transact(
        (ex, ctx) => setFirstPassword(ex, ctx, { userId: hr.id, password: "hr-password-1", ...FAST }),
        SYSTEM_SESSION,
      ),
    ).rejects.toThrow(PHONE_ROLE_REFUSED);
    // The director, on his phone, chooses his own first password there.
    const chosen = await t.phone.transact(
      (ex, ctx) => setFirstPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password: "director-pass", ...FAST }),
      SYSTEM_SESSION,
    );
    expect(chosen.session.roleId).toBe("MANAGER");
    await t.syncAll();
    await expectConverged(t);
  });

  it(
    "a second manager's account demoted on a laptop while signed in on the phone is signed out there",
    LONG,
    async () => {
      trio = await createSyncTrio();
      const t = trio;
      // The director's deputy: an account given a password by the director, which she replaces on her laptop, then
      // raised to the manager's role by the director.
      const deputy = await t.a.transact((ex, ctx) =>
        createAccount(ex, ctx, { displayName: "نائب المدير", username: "deputy", roleId: "ACCOUNTANT" }),
      );
      await t.a.transact((ex, ctx) =>
        giveAccountPassword(ex, ctx, { userId: deputy.id, password: "deputy-pass-1", ...FAST }),
      );
      await t.a.transact(
        (ex, ctx) =>
          signIn(ex, ctx, { userId: deputy.id, password: "deputy-pass-1", newPassword: "deputy-pass-2", ...FAST }),
        SYSTEM_SESSION,
      );
      await t.a.transact((ex, ctx) => updateAccount(ex, ctx, { userId: deputy.id, roleId: "MANAGER" }));
      await t.syncAll();
      const signedIn = await t.phone.transact(
        (ex, ctx) => signIn(ex, ctx, { userId: deputy.id, password: "deputy-pass-2" }),
        SYSTEM_SESSION,
      );
      expect(signedIn).toMatchObject({ ok: true });
      const session = await loadSession(t.phone.test.db, deputy.id);

      // The director makes the deputy an accountant, on his laptop; the change reaches the phone.
      await t.a.transact((ex, ctx) => updateAccount(ex, ctx, { userId: deputy.id, roleId: "ACCOUNTANT" }));
      await t.a.sync();
      await t.b.sync();
      const round = await t.phone.sync();
      const after = await sessionAfterSync(t.phone.test.db, session, round.outcome.tables);
      expect(after.outcome, "a non-manager's session does not go on on the phone").toBe("signedOut");
      // And he cannot sign in there again.
      await expect(
        t.phone.transact(
          (ex, ctx) => signIn(ex, ctx, { userId: deputy.id, password: "deputy-pass-2" }),
          SYSTEM_SESSION,
        ),
      ).rejects.toThrow(PHONE_ROLE_REFUSED);
      await t.syncAll();
      await expectConverged(t);
    },
  );

  it("the director, on his phone, changes the assistant's access: her laptop's session follows", LONG, async () => {
    trio = await createSyncTrio();
    const t = trio;
    await t.syncAll();
    const before = await loadSession(t.b.test.db, t.assistantId!);
    expect(before.roleId).toBe("ACCOUNTANT");
    await t.phone.transact((ex, ctx) => updateAccount(ex, ctx, { userId: t.assistantId!, roleId: "RECEPTION_SALES" }));
    await t.phone.sync();
    const round = await t.b.sync();
    const after = await sessionAfterSync(t.b.test.db, before, round.outcome.tables);
    expect(after.outcome).toBe("reloaded");
    expect(after.session?.roleId).toBe("RECEPTION_SALES");
    // The log records the change as the director's, made on the phone (its own chain).
    const entry = await t.b.test.db
      .selectFrom("AuditLog")
      .select(["chain", "userId"])
      .where("entity", "=", "User")
      .where("entityId", "=", t.assistantId!)
      .where("operation", "=", "CHANGE")
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(entry).toEqual({ chain: `AuditLog:${deviceIdOf(t.phone)}`, userId: FIRST_MANAGER_ID });
    await t.syncAll();
    await expectConverged(t);
  });

  it("pairing a phone needs the manager's sync.manage, as pairing a laptop", LONG, async () => {
    trio = await createSyncTrio({ joined: { phone: false } });
    const t = trio;
    const assistant = await loadSession(t.a.test.db, t.assistantId!);
    await expect(pairDevice(t.a.centre(), buildContext(assistant, t.a.clock), { kind: "PHONE" })).rejects.toThrow();
  });
});
