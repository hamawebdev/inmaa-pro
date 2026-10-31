import { afterEach, beforeEach, expect, it } from "vitest";

import { listRoleGrants, saveRoleGrants, setAccountActive } from "@/features/core/services/users";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { sessionAfterSync } from "./session";

/**
 * DECISION section 7, case 10: an account's access changed on the other
 * laptop takes effect here as soon as the change is applied. On one database
 * the change is made by the manager's own services; what the program then
 * does with the signed-in session is the same as after a sync.
 */
let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

it("keeps the session when nothing of it moved", async () => {
  const accountant = await test.sessionFor("ACCOUNTANT");
  const answer = await sessionAfterSync(test.db, accountant, new Set(["Client", "Visit"]));
  expect(answer).toEqual({ outcome: "same", session: accountant });
});

it("reloads the session at once when its role's rights changed", async () => {
  const accountant = await test.sessionFor("ACCOUNTANT");
  expect(accountant.sections.MONEY).toBe("WRITE");
  const grants = await test.transact((ex, ctx) => listRoleGrants(ex, ctx));
  const role = grants.find((row) => row.roleId === "ACCOUNTANT");
  if (!role) throw new Error("test: no ACCOUNTANT role");
  const { MONEY: _money, ...withoutMoney } = role.sections;
  await test.transact((ex, ctx) =>
    saveRoleGrants(ex, ctx, { roleId: "ACCOUNTANT", sections: withoutMoney, capabilities: role.capabilities }),
  );

  const answer = await sessionAfterSync(test.db, accountant, new Set(["RoleGrant"]));
  expect(answer.outcome).toBe("reloaded");
  expect(answer.session?.sections.MONEY).toBeUndefined();
  expect(answer.session?.userId).toBe(accountant.userId);
});

it("signs out an account switched off", async () => {
  const accountant = await test.sessionFor("ACCOUNTANT");
  await test.transact((ex, ctx) => setAccountActive(ex, ctx, { userId: accountant.userId!, active: false }));
  const answer = await sessionAfterSync(test.db, accountant, new Set(["User"]));
  expect(answer).toEqual({ outcome: "signedOut", session: null });
});
