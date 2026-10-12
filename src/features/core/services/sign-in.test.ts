import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { CAPABILITIES, DEFAULT_SECTION_LEVELS, ROLE_CODES, ROLE_LABELS, type RoleCode } from "@/lib/access/catalogue";
import { can, requireSection, sectionLevel } from "@/lib/access/session";
import { verifyChains } from "@/lib/chain";
import { SYSTEM_SESSION, type Session } from "@/lib/service/context";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { FIRST_MANAGER_ID } from "./first-run";
import {
  changeOwnPassword,
  listSignInAccounts,
  renewRecoveryCode,
  resetManagerPassword,
  setFirstPassword,
  signIn,
  signOut,
} from "./sign-in";
import { createAccount, giveAccountPassword } from "./users";

/** Throw-away passwords: no work factor, so the suite stays quick. */
const FAST = { iterations: 1_000 };

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

/** What the sign-in window does: nobody is signed in, the program asks. */
function asProgram<T>(work: Parameters<TestDatabase["transact"]>[0]): Promise<T> {
  return test.transact(work, SYSTEM_SESSION) as Promise<T>;
}

async function lastLog(count: number) {
  const rows = await test.db
    .selectFrom("AuditLog")
    .select(["operation", "action", "userId", "userName", "entity", "entityId", "changes", "context"])
    .orderBy("chainSeq", "desc")
    .limit(count)
    .execute();
  return rows.reverse();
}

async function managerWithPassword(password = "manager-pass"): Promise<{ session: Session; recoveryCode: string }> {
  const chosen = await asProgram<{ session: Session; recoveryCode: string | null }>((ex, ctx) =>
    setFirstPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password, ...FAST }),
  );
  return { session: chosen.session, recoveryCode: chosen.recoveryCode! };
}

describe("a new installation", () => {
  it("lists the manager, who has no password yet", async () => {
    expect(await listSignInAccounts(test.db)).toEqual([
      {
        id: FIRST_MANAGER_ID,
        username: "manager",
        displayName: "المدير",
        roleId: "MANAGER",
        role: ROLE_LABELS.MANAGER,
        isManager: true,
        needsPassword: true,
      },
    ]);
    const answer = await asProgram((ex, ctx) => signIn(ex, ctx, { userId: FIRST_MANAGER_ID, password: "anything" }));
    expect(answer).toEqual({ ok: false, reason: "NO_PASSWORD_YET" });
  });

  it("lets him choose his password, gives him a recovery code once, and signs him in", async () => {
    const { session, recoveryCode } = await managerWithPassword();

    expect(session).toMatchObject({ userId: FIRST_MANAGER_ID, userName: "المدير", roleId: "MANAGER" });
    expect(recoveryCode).toMatch(/^\d{16}$/);

    const account = await test.db
      .selectFrom("User")
      .selectAll()
      .where("id", "=", FIRST_MANAGER_ID)
      .executeTakeFirstOrThrow();
    expect(account.passwordHash).toMatch(/^pbkdf2-sha256\$1\$1000\$/);
    expect(account.recoveryHash).toMatch(/^pbkdf2-sha256\$1\$1000\$/);
    expect(account).toMatchObject({ mustChangePassword: 0, failedSignInCount: 0, lastSignInAt: test.ctx().now });

    // Under his own name, and never with a value: the log is read by people who must not see a hash.
    const log = await lastLog(2);
    expect(log.map((entry) => [entry.operation, entry.action, entry.userId, entry.userName])).toEqual([
      ["SECURITY", "PASSWORD_CHANGE", FIRST_MANAGER_ID, "المدير"],
      ["SECURITY", "SIGN_IN", FIRST_MANAGER_ID, "المدير"],
    ]);
    expect(JSON.parse(log[0].changes!)).toEqual({ passwordHash: ["§", "§"], recoveryHash: ["§", "§"] });
    expect(JSON.stringify(log)).not.toContain("pbkdf2");
    expect(JSON.stringify(log)).not.toContain(recoveryCode);

    await expect(
      asProgram((ex, ctx) => setFirstPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password: "another-one", ...FAST })),
    ).rejects.toThrow("This account already has a password.");
  });

  it("refuses a password that is too short, and saves nothing", async () => {
    await expect(
      asProgram((ex, ctx) => setFirstPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password: " 12345 ", ...FAST })),
    ).rejects.toThrow("The password is too short.");
    expect((await listSignInAccounts(test.db))[0].needsPassword).toBe(true);
  });
});

describe("signing in", () => {
  it("counts and logs a wrong password, then lets the right one in", async () => {
    await managerWithPassword();
    test.clock.advance({ minutes: 5 });

    for (const attempt of ["wrong", "manager-pas"]) {
      const answer = await asProgram((ex, ctx) => signIn(ex, ctx, { userId: FIRST_MANAGER_ID, password: attempt }));
      expect(answer).toEqual({ ok: false, reason: "WRONG_PASSWORD" });
    }
    const failed = await test.db
      .selectFrom("User")
      .select(["failedSignInCount"])
      .where("id", "=", FIRST_MANAGER_ID)
      .executeTakeFirstOrThrow();
    expect(failed.failedSignInCount).toBe(2);
    // Nobody's name: who typed it is what is not known. The account tried is the entry's subject.
    expect((await lastLog(1))[0]).toMatchObject({
      action: "SIGN_IN_FAILED",
      userId: null,
      userName: "system",
      entityId: FIRST_MANAGER_ID,
    });

    // The spaces around a password are not part of it.
    const answer = await asProgram<{ ok: boolean; session?: Session }>((ex, ctx) =>
      signIn(ex, ctx, { userId: FIRST_MANAGER_ID, password: " manager-pass " }),
    );
    expect(answer.ok).toBe(true);
    expect(answer.session).toMatchObject({ userId: FIRST_MANAGER_ID, roleId: "MANAGER" });
    const after = await test.db
      .selectFrom("User")
      .select(["failedSignInCount", "lastSignInAt"])
      .where("id", "=", FIRST_MANAGER_ID)
      .executeTakeFirstOrThrow();
    expect(after).toEqual({ failedSignInCount: 0, lastSignInAt: test.ctx().now });
    expect((await verifyChains(test.db)).ok).toBe(true);
  });

  it("signs in every seeded role with the sections and capabilities of its role", async () => {
    const { session: manager } = await managerWithPassword();
    expect(manager.roleId).toBe("MANAGER");
    for (const section of ["HOME", "EMPLOYEES", "WORKERS", "REQUESTS", "MONEY", "STOCK", "SETTINGS"] as const) {
      expect(sectionLevel(manager, section)).toBe("WRITE");
    }
    expect(can(manager, "backup.restore")).toBe(true);

    const others = ROLE_CODES.filter((role): role is Exclude<RoleCode, "MANAGER"> => role !== "MANAGER");
    expect(others).toHaveLength(6);
    for (const role of others) {
      const username = role.toLowerCase();
      const { id } = await test.transact((ex, ctx) =>
        createAccount(ex, ctx, { username, displayName: ROLE_LABELS[role].ar, roleId: role }),
      );
      const password = `${username}-pass`;
      const first = await asProgram<{ session: Session; recoveryCode: string | null }>((ex, ctx) =>
        setFirstPassword(ex, ctx, { userId: id, password, ...FAST }),
      );
      // Only the manager has a recovery code.
      expect(first.recoveryCode).toBeNull();

      const answer = await asProgram<{ ok: boolean; session?: Session }>((ex, ctx) =>
        signIn(ex, ctx, { userId: id, password }),
      );
      expect(answer.ok, role).toBe(true);
      const session = answer.session!;
      expect(session).toMatchObject({ userId: id, roleId: role, userName: ROLE_LABELS[role].ar });
      expect(session.sections, role).toEqual(DEFAULT_SECTION_LEVELS[role]);
      const held = Object.entries(CAPABILITIES)
        .filter(([, holders]) => (holders as readonly string[]).includes(role))
        .map(([key]) => key)
        .sort();
      expect([...session.capabilities].sort(), role).toEqual(held);
      // Nobody but the manager opens Settings or answers a sanction question by default.
      expect(sectionLevel(session, "SETTINGS"), role).toBeNull();
      expect(can(session, "sanction.answer"), role).toBe(false);
      expect(() => requireSection(session, "HOME", "READ")).not.toThrow();
    }

    const listed = await listSignInAccounts(test.db);
    expect(listed.map((account) => account.roleId)).toEqual([...ROLE_CODES]);
    expect(listed.every((account) => !account.needsPassword)).toBe(true);
  });

  it("neither lists nor admits an account that was switched off", async () => {
    await managerWithPassword();
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "reception", displayName: "سلمى", roleId: "RECEPTION_SALES" }),
    );
    await asProgram((ex, ctx) => setFirstPassword(ex, ctx, { userId: id, password: "reception-pass", ...FAST }));
    await test.db
      .updateTable("User")
      .set({ isActive: 0, deactivatedAt: test.ctx().now })
      .where("id", "=", id)
      .execute();

    expect((await listSignInAccounts(test.db)).map((account) => account.id)).toEqual([FIRST_MANAGER_ID]);
    await expect(asProgram((ex, ctx) => signIn(ex, ctx, { userId: id, password: "reception-pass" }))).rejects.toThrow(
      "This account does not exist or is not active.",
    );
  });
});

describe("a password the manager gave", () => {
  it("must be replaced by its owner the first time it is used", async () => {
    await managerWithPassword();
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "accountant", displayName: "كريم", roleId: "ACCOUNTANT" }),
    );
    await test.transact((ex, ctx) => giveAccountPassword(ex, ctx, { userId: id, password: "given-pass", ...FAST }));
    expect((await lastLog(1))[0]).toMatchObject({ action: "PASSWORD_CHANGE", userId: FIRST_MANAGER_ID, entityId: id });
    expect((await listSignInAccounts(test.db)).find((account) => account.id === id)?.needsPassword).toBe(false);

    expect(await asProgram((ex, ctx) => signIn(ex, ctx, { userId: id, password: "given-pass" }))).toEqual({
      ok: false,
      reason: "NEW_PASSWORD_NEEDED",
    });
    await expect(
      asProgram((ex, ctx) =>
        signIn(ex, ctx, { userId: id, password: "given-pass", newPassword: "given-pass", ...FAST }),
      ),
    ).rejects.toThrow("Choose a password different from the one you were given.");

    const answer = await asProgram<{ ok: boolean }>((ex, ctx) =>
      signIn(ex, ctx, { userId: id, password: "given-pass", newPassword: "my-own-pass", ...FAST }),
    );
    expect(answer.ok).toBe(true);
    expect(await asProgram((ex, ctx) => signIn(ex, ctx, { userId: id, password: "given-pass" }))).toEqual({
      ok: false,
      reason: "WRONG_PASSWORD",
    });
    expect(
      (await asProgram<{ ok: boolean }>((ex, ctx) => signIn(ex, ctx, { userId: id, password: "my-own-pass" }))).ok,
    ).toBe(true);
  });

  it("is only given by someone who manages accounts, and never to another manager", async () => {
    await managerWithPassword();
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact(
        (ex, ctx) => giveAccountPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password: "taken-over", ...FAST }),
        accountant,
      ),
    ).rejects.toThrow("You do not have permission to do this.");

    const second = await test.sessionFor("MANAGER");
    await expect(
      test.transact(
        (ex, ctx) => giveAccountPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password: "taken-over", ...FAST }),
        second,
      ),
    ).rejects.toThrow("A manager's password is changed by himself, or with his recovery code.");
  });
});

describe("the manager's recovery code", () => {
  it("lets him back in with a new password, and is spent", async () => {
    const { recoveryCode } = await managerWithPassword("forgotten-pass");
    const typed = `${recoveryCode.slice(0, 4)}-${recoveryCode.slice(4, 8)} ${recoveryCode.slice(8, 12)}-${recoveryCode.slice(12)}`;

    const wrong = await asProgram((ex, ctx) =>
      resetManagerPassword(ex, ctx, {
        userId: FIRST_MANAGER_ID,
        recoveryCode: "0000-0000-0000-0000",
        newPassword: "new-manager-pass",
        ...FAST,
      }),
    );
    expect(wrong).toEqual({ ok: false, reason: "WRONG_CODE" });
    expect((await lastLog(1))[0]).toMatchObject({ action: "SIGN_IN_FAILED", userId: null });
    expect(JSON.parse((await lastLog(1))[0].context!)).toEqual({ how: "RECOVERY_CODE" });

    const back = await asProgram<{ ok: boolean; session?: Session; recoveryCode?: string | null }>((ex, ctx) =>
      resetManagerPassword(ex, ctx, {
        userId: FIRST_MANAGER_ID,
        recoveryCode: typed,
        newPassword: "new-manager-pass",
        ...FAST,
      }),
    );
    expect(back.ok).toBe(true);
    expect(back.session).toMatchObject({ userId: FIRST_MANAGER_ID, roleId: "MANAGER" });
    expect(back.recoveryCode).toMatch(/^\d{16}$/);
    expect(back.recoveryCode).not.toBe(recoveryCode);

    // The old password and the old code are both dead.
    expect(
      await asProgram((ex, ctx) => signIn(ex, ctx, { userId: FIRST_MANAGER_ID, password: "forgotten-pass" })),
    ).toEqual({ ok: false, reason: "WRONG_PASSWORD" });
    expect(
      await asProgram((ex, ctx) =>
        resetManagerPassword(ex, ctx, {
          userId: FIRST_MANAGER_ID,
          recoveryCode,
          newPassword: "third-pass",
          ...FAST,
        }),
      ),
    ).toEqual({ ok: false, reason: "WRONG_CODE" });
    expect(
      (
        await asProgram<{ ok: boolean }>((ex, ctx) =>
          signIn(ex, ctx, { userId: FIRST_MANAGER_ID, password: "new-manager-pass" }),
        )
      ).ok,
    ).toBe(true);
  });

  it("belongs to the manager alone", async () => {
    await managerWithPassword();
    const { id } = await test.transact((ex, ctx) =>
      createAccount(ex, ctx, { username: "hr", displayName: "نادية", roleId: "HR_OFFICER" }),
    );
    await asProgram((ex, ctx) => setFirstPassword(ex, ctx, { userId: id, password: "hr-password", ...FAST }));
    await expect(
      asProgram((ex, ctx) =>
        resetManagerPassword(ex, ctx, { userId: id, recoveryCode: "1234", newPassword: "another-pass", ...FAST }),
      ),
    ).rejects.toThrow("Only the manager has a recovery code.");
  });

  it("is renewed by the signed-in manager who types his password", async () => {
    const { session, recoveryCode } = await managerWithPassword();

    const refused = await test.transact(
      (ex, ctx) => renewRecoveryCode(ex, ctx, { password: "not-it", ...FAST }),
      session,
    );
    expect(refused).toEqual({ recoveryCode: null });

    const renewed = await test.transact(
      (ex, ctx) => renewRecoveryCode(ex, ctx, { password: "manager-pass", ...FAST }),
      session,
    );
    expect(renewed.recoveryCode).toMatch(/^\d{16}$/);
    expect(renewed.recoveryCode).not.toBe(recoveryCode);
    const old = await asProgram((ex, ctx) =>
      resetManagerPassword(ex, ctx, { userId: FIRST_MANAGER_ID, recoveryCode, newPassword: "next-pass", ...FAST }),
    );
    expect(old).toEqual({ ok: false, reason: "WRONG_CODE" });
  });
});

describe("the signed-in user", () => {
  it("changes his own password by typing the current one", async () => {
    const { session } = await managerWithPassword();

    const refused = await test.transact(
      (ex, ctx) => changeOwnPassword(ex, ctx, { currentPassword: "not-it", newPassword: "changed-pass", ...FAST }),
      session,
    );
    expect(refused).toEqual({ changed: false });

    const changed = await test.transact(
      (ex, ctx) =>
        changeOwnPassword(ex, ctx, { currentPassword: "manager-pass", newPassword: "changed-pass", ...FAST }),
      session,
    );
    expect(changed).toEqual({ changed: true });
    expect(
      (
        await asProgram<{ ok: boolean }>((ex, ctx) =>
          signIn(ex, ctx, { userId: FIRST_MANAGER_ID, password: "changed-pass" }),
        )
      ).ok,
    ).toBe(true);
  });

  it("leaves with «قفل الآن», and the log says so", async () => {
    const { session } = await managerWithPassword();
    await test.transact((ex, ctx) => signOut(ex, ctx), session);
    expect((await lastLog(1))[0]).toMatchObject({
      operation: "SECURITY",
      action: "LOCK",
      userId: FIRST_MANAGER_ID,
      userName: "المدير",
    });
  });
});
