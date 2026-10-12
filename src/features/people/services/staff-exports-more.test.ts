import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { canCollectCash, getHourlyLabourCost, setWorkerZone } from "./staff-exports";
import { registerWorker, updateWorker, type RegisterWorkerInput } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const HOURIA: RegisterWorkerInput = {
  ...emptyWorkerValues("2026-10-01"),
  sex: "FEMALE",
  lastName: "شريف",
  firstName: "حورية",
  birthDate: "1982-05-30",
  phone: "0661 47 58 69",
  residenceCommuneId: "commune-0402",
  hiringDecision: "ACCEPTED",
  issuedDate: "2026-10-01",
  payBasis: "MONTHLY",
  payRate: "41600",
  payPeriod: "MONTHLY",
};
const register = (input: RegisterWorkerInput) => test.transact((ex, ctx) => registerWorker(ex, ctx, input));

describe("setWorkerZone", () => {
  it("moves a worker to a zone from Operations' screen, and logs it", async () => {
    const { id } = await register(HOURIA);
    const zone = await test.rows.insert("Zone", { name: "المنطقة الشمالية" });
    const operations = await test.sessionFor("OPERATIONS");
    await test.transact((ex, ctx) => setWorkerZone(ex, ctx, { workerId: id, zoneId: zone.id }), operations);
    const row = await test.db.selectFrom("StaffMember").select("zoneId").where("id", "=", id).executeTakeFirstOrThrow();
    expect(row.zoneId).toBe(zone.id);
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("operation", "=", "CHANGE")
      .orderBy("chainSeq", "desc")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(entry.changes ?? "{}")).toEqual({ zoneId: [expect.any(String), zone.id] });

    const accountant = await test.sessionFor("ACCOUNTANT"); // reads the section only
    await expect(
      test.transact((ex, ctx) => setWorkerZone(ex, ctx, { workerId: id, zoneId: null }), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
    await expect(
      test.transact((ex, ctx) => setWorkerZone(ex, ctx, { workerId: id, zoneId: "nowhere" })),
    ).rejects.toThrow("This zone does not exist or is not active.");
    await expect(
      test.transact((ex, ctx) => setWorkerZone(ex, ctx, { workerId: "nobody", zoneId: null })),
    ).rejects.toThrow("This worker does not exist.");
  });
});

describe("canCollectCash", () => {
  it("says whether a worker may take a client's money on a day, since when and on what paper", async () => {
    const plain = await register(HOURIA);
    const allowed = await register({
      ...HOURIA,
      lastName: "مرابط",
      phone: "0772 14 25 36",
      canCollectCash: true,
      collectAuthFrom: "2026-10-15",
      collectAuthNote: "تفويض كتابي من المدير",
    });
    const ask = (staffId: string, date?: string) =>
      test.transact((ex, ctx) => canCollectCash(ex, ctx, { staffId, date }));
    expect(await ask(plain.id)).toEqual({ authorised: false, since: null, note: null });
    expect(await ask(allowed.id, "2026-10-12")).toEqual({
      authorised: false,
      since: "2026-10-15",
      note: "تفويض كتابي من المدير",
    });
    expect((await ask(allowed.id, "2026-10-15")).authorised).toBe(true);
    expect((await ask("nobody")).authorised).toBe(false);
  });
});

describe("getHourlyLabourCost", () => {
  it("prices an hour from the pay terms in force on the day", async () => {
    const { id } = await register(HOURIA);
    const cost = (date?: string) => test.transact((ex, ctx) => getHourlyLabourCost(ex, ctx, { staffId: id, date }));
    // 41,600 DA a month over 173.33 hours (setting pay.monthlyDivisorMin, 10,400 minutes): 240 DA an hour.
    expect(await cost()).toBe(24_000);
    expect(await cost("2026-09-30")).toBeNull();

    // From 1 November she is paid by the day: 1,800 DA over the 8-hour day.
    test.clock.set("2026-11-01T08:00:00.000Z");
    await test.transact((ex, ctx) =>
      updateWorker(ex, ctx, { id, values: { ...HOURIA, payBasis: "DAILY", payRate: "1800" } }),
    );
    expect(await cost("2026-10-31")).toBe(24_000);
    expect(await cost("2026-11-01")).toBe(22_500);

    test.clock.set("2026-11-02T08:00:00.000Z");
    await test.transact((ex, ctx) =>
      updateWorker(ex, ctx, { id, values: { ...HOURIA, payBasis: "HOURLY", payRate: "260" } }),
    );
    expect(await cost()).toBe(26_000);
    test.clock.set("2026-11-03T08:00:00.000Z");
    await test.transact((ex, ctx) =>
      updateWorker(ex, ctx, { id, values: { ...HOURIA, payBasis: "PER_TASK", payRate: "1500" } }),
    );
    expect(await cost()).toBeNull();
  });
});
