import { afterEach, describe, expect, it } from "vitest";

import { DEMO_ACCOUNTS, DEMO_PASSWORD } from "@/features/core/demo";
import { listSignInAccounts, signIn } from "@/features/core/services/sign-in";
import { DEFAULT_SECTION_LEVELS } from "@/lib/access/catalogue";
import { verifyChains } from "@/lib/chain";
import { compareAnchor } from "@/lib/chain/anchor";
import { SYSTEM_SESSION } from "@/lib/service/context";
import { getSettings } from "@/lib/settings";

import { createTestDatabase, type TestDatabase } from "./database";
import { orderDemoModules, resolveDemoRoute, runDemo, type DemoModule } from "./demo";

const opened: TestDatabase[] = [];
afterEach(() => {
  for (const test of opened.splice(0)) test.close();
});

async function database(options: Parameters<typeof createTestDatabase>[0]) {
  const test = await createTestDatabase(options);
  opened.push(test);
  return test;
}

describe("the demo data", () => {
  it("starts with Foundation's: an account per role, the centre's identity, zones", async () => {
    const test = await database({ demo: ["core"] });

    const accounts = await test.db
      .selectFrom("User")
      .select(["id", "username", "roleId"])
      .where("id", "<>", "user-manager")
      .orderBy("id")
      .execute();
    expect(accounts.map((account) => account.roleId).sort()).toEqual(
      DEMO_ACCOUNTS.map((account) => account.roleId).sort(),
    );
    expect(test.demo.core.accountant).toBe(accounts.find((account) => account.roleId === "ACCOUNTANT")?.id);
    expect(await getSettings(test.db, ["centre.nameAr", "centre.rc", "centre.nis", "centre.nif", "tax.mode"])).toEqual({
      "centre.nameAr": "مركز إنماء برو",
      "centre.rc": "04/00-0123456A21",
      "centre.nis": "198104010012345",
      "centre.nif": "198104010012345",
      "tax.mode": "IFU",
    });
    const zones = await test.db.selectFrom("Zone").select(["id", "name"]).orderBy("name").execute();
    expect(zones.map((zone) => zone.name)).toEqual(["أم البواقي", "عين البيضاء", "عين مليلة"]);
    expect(test.demo.core.zoneAinBeida).toBe(zones.find((zone) => zone.name === "عين البيضاء")?.id);

    // Written through the services: the log holds each act, the chains and the anchor agree.
    expect((await verifyChains(test.db)).ok).toBe(true);
    expect((await compareAnchor(test.db, test.anchor, test.ctx().now)).state).toBe("normal");
  });

  it("lets every demo account sign in with the demo password, each with its role's sections", async () => {
    const test = await database({ demo: ["core"] });

    const listed = await listSignInAccounts(test.db);
    expect(listed.map((account) => account.username)).toEqual([
      "manager",
      ...DEMO_ACCOUNTS.map((account) => account.username),
    ]);
    expect(listed.every((account) => !account.needsPassword)).toBe(true);

    for (const account of listed) {
      const answer = await test.transact(
        (ex, ctx) => signIn(ex, ctx, { userId: account.id, password: DEMO_PASSWORD }),
        SYSTEM_SESSION,
      );
      if (!answer.ok) throw new Error(`${account.username} was refused: ${answer.reason}`);
      expect(answer.session.roleId).toBe(account.roleId);
      if (account.roleId !== "MANAGER") {
        expect(answer.session.sections, account.username).toEqual(
          DEFAULT_SECTION_LEVELS[account.roleId as keyof typeof DEFAULT_SECTION_LEVELS],
        );
      }
    }
    const wrong = await test.transact(
      (ex, ctx) => signIn(ex, ctx, { userId: listed[1].id, password: "not-the-demo-password" }),
      SYSTEM_SESSION,
    );
    expect(wrong).toEqual({ ok: false, reason: "WRONG_PASSWORD" });
  });

  it("gives the same ids on every build", async () => {
    const first = await database({ demo: ["core"] });
    const second = await database({ demo: ["core"] });

    expect(first.demo.core.accountant).toMatch(/^demo-core-\d{4}$/);
    expect(second.demo).toEqual(first.demo);
  });

  it("runs the folders in owner order, gives each what the ones before it named, and the accounts' sessions", async () => {
    const test = await database({});
    const order: string[] = [];
    const module = (folder: string, work?: DemoModule["seedDemo"]): DemoModule => ({
      folder,
      seedDemo: async (ex, ctx, tools) => {
        order.push(folder);
        return work ? work(ex, ctx, tools) : { [`${folder}Thing`]: `${folder}-1` };
      },
    });
    const { seedDemo: coreSeed } = await import("@/features/core/demo");
    let seen: unknown = null;

    const names = await runDemo(test.db, {
      clock: test.clock,
      modules: [
        module("money", async (_ex, _ctx, tools) => {
          const accountant = await tools.sessionOf("ACCOUNTANT");
          const earlier = tools.at("2026-09-01T08:00:00.000Z", accountant);
          seen = {
            names: Object.keys(tools.names),
            role: earlier.roleId,
            today: earlier.today,
            user: earlier.userName,
          };
        }),
        module("clients"),
        { folder: "core", seedDemo: coreSeed },
      ],
    });

    expect(order).toEqual(["clients", "money"]);
    expect(Object.keys(names)).toEqual(["core", "clients", "money"]);
    expect(seen).toEqual({ names: ["core", "clients"], role: "ACCOUNTANT", today: "2026-09-01", user: "لعريبي نادية" });
  });

  it("stops on a folder that fails, naming it, and keeps nothing it wrote", async () => {
    const test = await database({ demo: ["core"] });
    const failing: DemoModule = {
      folder: "clients",
      seedDemo: async (ex, ctx) => {
        await ex
          .insertInto("Zone")
          .values({ id: "zone-half", name: "x", createdAt: ctx.now, updatedAt: ctx.now })
          .execute();
        throw new Error("clients: the request could not be registered");
      },
    };

    await expect(runDemo(test.db, { clock: test.clock, modules: [failing] })).rejects.toThrow(
      "demo: the demo data of clients failed: clients: the request could not be registered",
    );
    expect(await test.db.selectFrom("Zone").select("id").where("id", "=", "zone-half").execute()).toEqual([]);
  });

  it("orders folders as the owners do, and resolves a route that names a record", () => {
    const noop = async () => {};
    const ordered = orderDemoModules(
      ["stock", "money", "operations", "clients", "people", "core"].map((folder) => ({ folder, seedDemo: noop })),
    );
    expect(ordered.map((module) => module.folder)).toEqual([
      "core",
      "people",
      "clients",
      "operations",
      "money",
      "stock",
    ]);
    expect(
      resolveDemoRoute("/dashboard/files/{clients.housingFile}/print", {
        clients: { housingFile: "demo-clients-0007" },
      }),
    ).toBe("/dashboard/files/demo-clients-0007/print");
    expect(() => resolveDemoRoute("/dashboard/files/{clients.nothing}", {})).toThrow("no record named clients.nothing");
  });
});
