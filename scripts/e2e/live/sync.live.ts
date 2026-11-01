/**
 * The live test (docs/phone/VERIFY.md, "The live test"). Needs the rig running (`scripts/e2e/live/rig.sh start`):
 * the real Worker of relay/ under `wrangler dev`, reachable over real HTTPS through a Cloudflare quick tunnel.
 *
 *   LIVE_ORIGIN=https://….trycloudflare.com LIVE_SETUP_KEY=… \
 *     npx vitest run --config scripts/e2e/live/vitest.config.ts
 *
 * With LIVE_PHONE=1 the director's phone is the real APK on the emulator (scripts/e2e/live/phone.ts drives its
 * window over the Chrome DevTools Protocol); without it, the laptops' half runs alone.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, describe, expect, it } from "vitest";

import { FIRST_MANAGER_ID } from "@/features/core/services/first-run";
import { setFirstPassword, signIn } from "@/features/core/services/sign-in";
import { verifyChains } from "@/lib/chain";
import { buildContext, SYSTEM_SESSION } from "@/lib/service/context";
import { pairDevice, redeemAndDownload, setUpCentre } from "@/lib/sync/centre";
import { compareShared, installCopy, type SyncLaptop } from "@/testing/sync/pair";

import { registerAWorker } from "@/testing/scenarios/sync/helpers";

import { freshLaptop } from "./laptops";

const ORIGIN = process.env.LIVE_ORIGIN ?? "";
const SETUP_KEY = process.env.LIVE_SETUP_KEY ?? "";
const PHONE = process.env.LIVE_PHONE === "1";
const OUT = process.env.LIVE_OUT ?? "/mnt/data/inmaa-phone-verify/live";
const DIRECTOR_PASSWORD = "director-live-1";
const ASSISTANT_PASSWORD = "assistant-live-1";

mkdirSync(OUT, { recursive: true });
const logFile = join(OUT, "live.log");
const lines: string[] = [];
const log = (line: string) => {
  const stamped = `${new Date().toISOString()} ${line}`;
  lines.push(stamped);
  writeFileSync(logFile, `${lines.join("\n")}\n`);
};

let a: SyncLaptop;
let b: SyncLaptop;
afterAll(() => {
  a?.test.close();
  b?.test.close();
});

async function syncRound(device: SyncLaptop) {
  const result = await device.sync();
  log(`[${device.name}] round: sent ${result.sent}, received ${result.received}`);
  return result;
}

describe.skipIf(!ORIGIN || !SETUP_KEY)("the live test, over real HTTPS to the real Worker", () => {
  it("the director's laptop sets the centre up and the assistant's laptop joins", async () => {
    log(`mailbox: ${ORIGIN}`);
    a = await freshLaptop("director-laptop", join(OUT, "director-laptop"), ORIGIN, log);
    b = await freshLaptop("assistant-laptop", join(OUT, "assistant-laptop"), ORIGIN, log);

    // His first password, as on the sign-in window of a new installation.
    await a.transact(
      (ex, ctx) => setFirstPassword(ex, ctx, { userId: FIRST_MANAGER_ID, password: DIRECTOR_PASSWORD }),
      SYSTEM_SESSION,
    );
    const vault = await setUpCentre(a.centre(), buildContext(a.manager, a.clock), {
      setupKey: SETUP_KEY,
      deviceName: "حاسوب المدير",
    });
    log(`centre ${vault.centreId}: director's laptop ${vault.deviceId}, slot ${vault.slot}`);
    expect(vault.slot).toBe(0);

    const code = await pairDevice(a.centre(), buildContext(a.manager, a.clock), {
      kind: "LAPTOP",
      newAccount: {
        displayName: "المساعدة",
        username: "assistant",
        roleId: "ACCOUNTANT",
        password: ASSISTANT_PASSWORD,
      },
    });
    log(`laptop code ${code.code} (expires ${code.expiresAt})`);
    const { path, note } = await redeemAndDownload(b.centre(), {
      code: code.code,
      deviceName: "حاسوب المساعدة",
      kind: "LAPTOP",
    });
    await installCopy(b, path, note);
    log(`assistant's laptop joined: ${b.vault.data?.deviceId}, slot ${b.vault.data?.slot}`);
    expect(b.vault.data?.slot).toBe(1);
    const signedIn = await b.transact(
      (ex, ctx) =>
        signIn(ex, ctx, { userId: code.accountId, password: ASSISTANT_PASSWORD, newPassword: "assistant-live-2" }),
      SYSTEM_SESSION,
    );
    expect(signedIn.ok).toBe(true);
  });

  it("a change on either laptop reaches the other", async () => {
    const onA = await registerAWorker(a, { lastName: "حاسوب", firstName: "المدير" });
    await syncRound(a);
    await syncRound(b);
    expect(await b.test.db.selectFrom("StaffMember").select("id").where("id", "=", onA.id).execute()).toHaveLength(1);
    const onB = await registerAWorker(b, { lastName: "حاسوب", firstName: "المساعدة" });
    await syncRound(b);
    await syncRound(a);
    expect(await a.test.db.selectFrom("StaffMember").select("id").where("id", "=", onB.id).execute()).toHaveLength(1);
    await syncRound(b);
    expect(compareShared(a.test, b.test, ["director-laptop", "assistant-laptop"])).toBeNull();
  });

  describe.skipIf(!PHONE)("the director's phone (the real APK on the emulator)", () => {
    it("pairs: the laptop shows a phone's code, written where the phone driver reads it", async () => {
      const code = await pairDevice(a.centre(), buildContext(a.manager, a.clock), { kind: "PHONE" });
      expect(code.kind).toBe("PHONE");
      writeFileSync(join(OUT, "phone-code.txt"), `${code.code}\n`);
      log(`phone code ${code.code} (expires ${code.expiresAt})`);
      const { joinOnPhone } = await import("./phone");
      await joinOnPhone({ origin: ORIGIN, code: code.code, password: DIRECTOR_PASSWORD, out: OUT, log });
      // The laptops learn of the third device.
      await syncRound(a);
      await syncRound(b);
      const devices = await a.test.db.selectFrom("SyncDevice").select(["kind", "slot"]).orderBy("slot").execute();
      expect(devices).toEqual([
        { kind: "LAPTOP", slot: 0 },
        { kind: "LAPTOP", slot: 1 },
        { kind: "PHONE", slot: 2 },
      ]);
    });

    it("a change on the phone shows on the director's laptop and on the assistant's", async () => {
      const { changeOnPhone } = await import("./phone");
      const made = await changeOnPhone({ out: OUT, log });
      const nameOn = async (device: SyncLaptop) =>
        (
          await device.test.db
            .selectFrom("Setting")
            .select("value")
            .where("key", "=", "centre.nameAr")
            .executeTakeFirst()
        )?.value ?? null;
      for (let attempt = 0; attempt < 18; attempt++) {
        await syncRound(a);
        await syncRound(b);
        if (
          (await nameOn(a)) === JSON.stringify(made.centreName) &&
          (await nameOn(b)) === JSON.stringify(made.centreName)
        )
          break;
        await new Promise((resolve) => setTimeout(resolve, 10_000));
      }
      for (const device of [a, b]) {
        const value = await nameOn(device);
        log(`[${device.name}] centre.nameAr = ${value}`);
        expect(value, `the phone's change is on ${device.name}`).toBe(JSON.stringify(made.centreName));
      }
    });

    it("a change on a laptop shows on the phone", async () => {
      // Each live run starts from fresh databases: the name is new on the phone.
      const text = "من الحاسوب";
      await registerAWorker(a, { lastName: text, firstName: "إلى الهاتف" });
      await syncRound(a);
      const { seeOnPhone } = await import("./phone");
      await seeOnPhone({ text, out: OUT, log });
      await syncRound(b);
    });
  });

  it("the laptops' chains verify and their shared rows are equal", async () => {
    await syncRound(a);
    await syncRound(b);
    await syncRound(a);
    expect(compareShared(a.test, b.test, ["director-laptop", "assistant-laptop"])).toBeNull();
    for (const device of [a, b]) {
      const report = await verifyChains(device.test.db);
      log(`[${device.name}] chains ok: ${report.ok}`);
      expect(report.ok).toBe(true);
    }
    expect(existsSync(logFile)).toBe(true);
  });
});
