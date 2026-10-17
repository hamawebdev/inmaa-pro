import type { Insertable } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import type { DB } from "@/lib/db/schema";
import { registerHandler, type EventPayloads } from "@/lib/events";
import { setSetting } from "@/lib/settings";
import { normaliseName } from "@/lib/text/normalise";
import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  checkSanction,
  consumeDecision,
  getSanctionStates,
  liftSanction,
  listSanctions,
  setSanction,
  type CheckSanctionInput,
  type SetSanctionInput,
} from "./sanctions";
import { registerWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

let seq = 500;
/** A sanction in force since 1 October on a worker of an earlier year. */
async function workerSanction(over: Partial<Insertable<DB["Sanction"]>> = {}) {
  seq += 1;
  const earlier = await test.rows.insert("StaffMember", { kind: "WORKER", numberSeq: seq, number: `${seq}/H` });
  return test.rows.insert("Sanction", {
    subjectKind: "WORKER",
    staffId: earlier.id,
    state: "PENALISED",
    reason: "سرقة معدات",
    startDate: localDate("2026-10-01"),
    displayName: "مرابط عادل",
    displayNumber: `${seq}/H`,
    nameKey: normaliseName("مرابط عادل"),
    birthDate: localDate("1985-02-20"),
    phoneKeys: "|0555000111|",
    ...over,
  });
}

const attempt = (
  identity: CheckSanctionInput["identity"],
  over: Partial<CheckSanctionInput> = {},
): CheckSanctionInput => ({
  context: "WORKER_REGISTRATION",
  subjectKind: "WORKER",
  identity,
  ...over,
});

const check = (input: CheckSanctionInput) => test.transact((ex, ctx) => checkSanction(ex, ctx, input));

describe("checkSanction", () => {
  it("is clear when nobody under sanction matches", async () => {
    await workerSanction();
    expect(await check(attempt({ lastName: "سعدي", firstName: "كمال", phones: ["0770112233"] }))).toEqual({
      outcome: "CLEAR",
      matches: [],
    });
  });

  it("blocks on a phone, an identity number, or a name with the same birth date, and says what it found", async () => {
    const sanction = await workerSanction({ nationalIdNumber: "198502200001" });
    const byPhone = await check(attempt({ lastName: "س", firstName: "ك", phones: ["+213 555 00 01 11"] }));
    expect(byPhone).toEqual({
      outcome: "BLOCKED",
      matches: [
        {
          sanctionId: sanction.id,
          subjectKind: "WORKER",
          subjectId: sanction.staffId,
          state: "PENALISED",
          reason: "سرقة معدات",
          displayName: "مرابط عادل",
          displayNumber: sanction.displayNumber,
          startDate: "2026-10-01",
          endDate: null,
          foundBy: "PHONE",
          strength: "STRONG",
        },
      ],
    });
    const byId = await check(attempt({ nationalId: "1985 0220 0001" }));
    expect(byId.matches.map((m) => m.foundBy)).toEqual(["NATIONAL_ID"]);
    // His spelling differs in its alef and its order: «عادل مرابط» is «مرابط عادل».
    const byName = await check(attempt({ lastName: "عادل", firstName: "مرابط", birthDate: "1985-02-20" }));
    expect(byName.outcome).toBe("BLOCKED");
    expect(byName.matches.map((m) => m.foundBy)).toEqual(["NAME_AND_BIRTHDATE"]);
  });

  it("asks about a name alone, and lets a namesake born on another day through", async () => {
    await workerSanction();
    const nameOnly = await check(attempt({ lastName: "مرابط", firstName: "عادل" }));
    expect(nameOnly.outcome).toBe("POSSIBLE");
    expect(nameOnly.matches.map((m) => [m.foundBy, m.strength])).toEqual([["NAME_ONLY", "WEAK"]]);
    expect((await check(attempt({ lastName: "مرابط", firstName: "عادل", birthDate: "1990-01-01" }))).outcome).toBe(
      "CLEAR",
    );
  });

  it("finds a sanctioned client among the workers, unless Settings says otherwise", async () => {
    const client = await test.rows.insert("Client", {});
    await test.rows.insert("Sanction", {
      subjectKind: "CLIENT",
      clientId: client.id,
      staffId: null,
      state: "SUSPENDED",
      reason: "رفض الدفع",
      startDate: localDate("2026-09-01"),
      displayName: "عميل",
      phoneKeys: "|0661000000|",
    });
    const asWorker = attempt({ phones: ["0661000000"] });
    expect((await check(asWorker)).matches.map((m) => m.subjectKind)).toEqual(["CLIENT"]);

    await test.transact((ex, ctx) => setSetting(ex, ctx, "sanction.matchAcrossKinds", false));
    expect((await check(asWorker)).outcome).toBe("CLEAR");
  });

  it("only counts the states Settings says block", async () => {
    await workerSanction({ state: "SUSPENDED" });
    const input = attempt({ phones: ["0555000111"] });
    expect((await check(input)).outcome).toBe("BLOCKED");
    await test.transact((ex, ctx) =>
      setSetting(ex, ctx, "sanction.blockingStates", { WORKER: ["PENALISED"], EMPLOYEE: [], CLIENT: [] }),
    );
    expect((await check(input)).outcome).toBe("CLEAR");
  });

  it("answers with the manager's decision on this attempt", async () => {
    const sanction = await workerSanction();
    // The identity the question named: a yes is about it only (PEO-06).
    const decision = (over: Partial<Insertable<DB["SanctionDecision"]>>) =>
      test.rows.insert("SanctionDecision", {
        context: "WORKER_REGISTRATION",
        attemptKind: "WORKER",
        attemptIdentity: JSON.stringify({ phones: ["0555000111"] }),
        sanctionId: sanction.id,
        matchBasis: "PHONE",
        ...over,
      });
    const input = (decisionId: string) => attempt({ phones: ["0555000111"] }, { decisionId });

    expect((await check(input((await decision({ status: "ALLOWED" })).id))).outcome).toBe("ALLOWED");
    expect((await check(input((await decision({ status: "REFUSED" })).id))).outcome).toBe("REFUSED");
    expect((await check(input((await decision({ status: "PENDING" })).id))).outcome).toBe("BLOCKED");
    // A yes given for a client's file does not register a worker; a used yes allows nothing more.
    expect(
      (await check(input((await decision({ status: "ALLOWED", context: "CLIENT_FILE", attemptKind: "CLIENT" })).id)))
        .outcome,
    ).toBe("BLOCKED");
    expect((await check(input((await decision({ status: "ALLOWED", consumedAt: test.ctx().now })).id))).outcome).toBe(
      "BLOCKED",
    );
    await expect(check(input("no-such-decision"))).rejects.toThrow("This decision of the manager does not exist.");
  });

  it("does not let a yes about one sanction cover another", async () => {
    const first = await workerSanction();
    await workerSanction({ nameKey: null, birthDate: null, nationalIdNumber: "198502200001" });
    const yes = await test.rows.insert("SanctionDecision", {
      context: "WORKER_REGISTRATION",
      attemptKind: "WORKER",
      attemptIdentity: "{}",
      sanctionId: first.id,
      matchBasis: "PHONE",
      status: "ALLOWED",
    });
    const both = attempt({ phones: ["0555000111"], nationalId: "198502200001" }, { decisionId: yes.id });
    expect((await check(both)).outcome).toBe("BLOCKED");
  });

  it("is run only by someone who registers people or clients", async () => {
    await expect(check(attempt({ phones: ["0555000111"] }))).resolves.toBeTruthy();
    const accountant = await test.sessionFor("ACCOUNTANT");
    await expect(
      test.transact((ex, ctx) => checkSanction(ex, ctx, attempt({ phones: ["0555000111"] })), accountant),
    ).rejects.toThrow("You do not have permission to do this.");
  });
});

describe("consumeDecision", () => {
  async function decision(status: string) {
    const sanction = await workerSanction();
    return test.rows.insert("SanctionDecision", {
      context: "WORKER_REGISTRATION",
      attemptKind: "WORKER",
      attemptIdentity: "{}",
      sanctionId: sanction.id,
      matchBasis: "PHONE",
      status,
    });
  }
  const consume = (decisionId: string, entityId = "staff-1") =>
    test.transact((ex, ctx) => consumeDecision(ex, ctx, { decisionId, entityKind: "STAFF_MEMBER", entityId }));

  it("spends a yes once", async () => {
    const yes = await decision("ALLOWED");
    await consume(yes.id);
    const used = await test.db
      .selectFrom("SanctionDecision")
      .selectAll()
      .where("id", "=", yes.id)
      .executeTakeFirstOrThrow();
    expect(used).toMatchObject({
      consumedAt: "2026-10-12T08:00:00.000Z",
      consumedEntityKind: "STAFF_MEMBER",
      consumedEntityId: "staff-1",
    });
    await expect(consume(yes.id, "staff-2")).rejects.toThrow("This decision of the manager has already been used.");
  });

  it("never spends a no or an unanswered question", async () => {
    await expect(consume((await decision("REFUSED")).id)).rejects.toThrow(
      "Only the manager's yes allows a registration.",
    );
    await expect(consume((await decision("PENDING")).id)).rejects.toThrow(
      "Only the manager's yes allows a registration.",
    );
    await expect(consume("no-such-decision")).rejects.toThrow("This decision of the manager does not exist.");
  });

  it("is backed by the database, which refuses a second use whoever asks", async () => {
    const yes = await decision("ALLOWED");
    await consume(yes.id);
    expect(() =>
      test.raw.prepare(`UPDATE "SanctionDecision" SET "consumedEntityId" = 'staff-9' WHERE "id" = ?`).run(yes.id),
    ).toThrow(/FROZEN:SanctionDecision:consumed/);
  });
});

describe("setSanction and liftSanction", () => {
  // What the other owners are told, in order.
  const told: Array<{ event: string; payload: unknown }> = [];
  registerHandler("money", "sanction.changed", async (_ex, _ctx, payload) => {
    told.push({ event: "sanction.changed", payload });
  });
  registerHandler("money", "staff.unavailable", async (_ex, _ctx, payload: EventPayloads["staff.unavailable"]) => {
    told.push({ event: "staff.unavailable", payload });
  });
  beforeEach(() => {
    told.length = 0;
  });

  const worker = async () =>
    (
      await test.transact((ex, ctx) =>
        registerWorker(ex, ctx, {
          ...emptyWorkerValues("2026-10-12"),
          sex: "FEMALE",
          lastName: "بوزيد",
          firstName: "سميرة",
          fullNameLatin: "BOUZID Samira",
          birthDate: "1994-03-17",
          phone: "0661 20 31 42",
          nationalIdNumber: "109940317000123",
        }),
      )
    ).id;
  const set = (input: SetSanctionInput, session = test.manager) =>
    test.transact((ex, ctx) => setSanction(ex, ctx, input), session);

  it("puts a worker under sanction with her identity as it is, logs the manager's reason and tells the others", async () => {
    const id = await worker();
    const { sanctionId } = await set({
      subjectKind: "WORKER",
      subjectId: id,
      state: "SUSPENDED",
      reason: "غياب ثلاثة أيام دون مبرر",
      startDate: "2026-10-12",
      endDate: "2026-10-26",
    });
    const row = await test.db.selectFrom("Sanction").selectAll().where("id", "=", sanctionId).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      subjectKind: "WORKER",
      staffId: id,
      clientId: null,
      state: "SUSPENDED",
      reason: "غياب ثلاثة أيام دون مبرر",
      startDate: "2026-10-12",
      endDate: "2026-10-26",
      setByUserId: test.manager.userId,
      displayName: "بوزيد سميرة",
      displayNumber: "1/F",
      nameKey: normaliseName("بوزيد سميرة"),
      nameLatinKey: "bouzid samira",
      birthDate: "1994-03-17",
      phoneKeys: "|0661203142|",
      nationalIdNumber: "109940317000123",
    });
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("action", "=", "SANCTION_SET")
      .executeTakeFirstOrThrow();
    expect(entry).toMatchObject({
      operation: "CHANGE",
      reason: "غياب ثلاثة أيام دون مبرر",
      entityId: sanctionId,
      subjectKind: "WORKER",
      subjectId: id,
    });
    expect(told).toEqual([
      { event: "sanction.changed", payload: { sanctionId } },
      {
        event: "staff.unavailable",
        payload: {
          workerId: id,
          fromDate: "2026-10-12",
          toDate: "2026-10-26",
          cause: "SANCTION_SET",
          reason: "غياب ثلاثة أيام دون مبرر",
        },
      },
    ]);
    expect(
      await test.transact((ex, ctx) => getSanctionStates(ex, ctx, { kind: "WORKER", ids: [id, "nobody"] })),
    ).toEqual({
      [id]: {
        sanctionId,
        state: "SUSPENDED",
        reason: "غياب ثلاثة أيام دون مبرر",
        since: "2026-10-12",
        until: "2026-10-26",
      },
      nobody: null,
    });
  });

  it("finds her again when she comes back under another phone, by her identity number", async () => {
    const id = await worker();
    await set({ subjectKind: "WORKER", subjectId: id, state: "PENALISED", reason: "سرقة", startDate: "2026-10-12" });
    const again = await check(
      attempt({ lastName: "س", firstName: "ك", phones: ["0770000000"], nationalId: "109940317000123" }),
    );
    expect(again.outcome).toBe("BLOCKED");
    expect(again.matches.map((m) => [m.foundBy, m.displayNumber])).toEqual([["NATIONAL_ID", "1/F"]]);
  });

  it("lifts a sanction once, with the reason, and puts her back in the pickers", async () => {
    const id = await worker();
    const { sanctionId } = await set({
      subjectKind: "WORKER",
      subjectId: id,
      state: "SUSPENDED",
      reason: "تأخر",
      startDate: "2026-10-12",
    });
    told.length = 0;
    await test.transact((ex, ctx) => liftSanction(ex, ctx, { sanctionId, reason: "قدمت مبررا" }));
    const row = await test.db.selectFrom("Sanction").selectAll().where("id", "=", sanctionId).executeTakeFirstOrThrow();
    expect(row).toMatchObject({ liftedByUserId: test.manager.userId, liftReason: "قدمت مبررا" });
    expect(row.liftedAt).not.toBeNull();
    expect(told.map((t) => t.event)).toEqual(["sanction.changed", "staff.unavailable"]);
    expect(told[1].payload).toMatchObject({ workerId: id, cause: "SANCTION_LIFTED", fromDate: "2026-10-12" });
    expect(
      (await test.transact((ex, ctx) => getSanctionStates(ex, ctx, { kind: "WORKER", ids: [id] })))[id],
    ).toBeNull();
    await expect(test.transact((ex, ctx) => liftSanction(ex, ctx, { sanctionId, reason: "مرة أخرى" }))).rejects.toThrow(
      "This sanction has already been lifted.",
    );
    const [history] = await test.transact((ex, ctx) => listSanctions(ex, ctx, { subjectId: id }));
    expect(history).toMatchObject({
      id: sanctionId,
      inForce: false,
      upcoming: false,
      liftReason: "قدمت مبررا",
      setBy: "المدير",
    });
  });

  it("keeps one sanction at a time, and checks its dates and reason", async () => {
    const id = await worker();
    await set({
      subjectKind: "WORKER",
      subjectId: id,
      state: "SUSPENDED",
      reason: "تأخر",
      startDate: "2026-10-12",
      endDate: "2026-10-20",
    });
    await expect(
      set({ subjectKind: "WORKER", subjectId: id, state: "PENALISED", reason: "سرقة", startDate: "2026-10-18" }),
    ).rejects.toThrow("This person already has a sanction for these days. Lift it first.");
    // After the first one ends, another may follow.
    await set({ subjectKind: "WORKER", subjectId: id, state: "PENALISED", reason: "سرقة", startDate: "2026-10-21" });
    await expect(
      set({ subjectKind: "WORKER", subjectId: id, state: "PENALISED", reason: " ", startDate: "2026-11-01" }),
    ).rejects.toThrow("Write the reason for the sanction.");
    await expect(
      set({
        subjectKind: "WORKER",
        subjectId: id,
        state: "PENALISED",
        reason: "x",
        startDate: "2026-12-01",
        endDate: "2026-11-01",
      }),
    ).rejects.toThrow("The end date must not be before the start date.");
    await expect(
      set({ subjectKind: "EMPLOYEE", subjectId: id, state: "PENALISED", reason: "x", startDate: "2026-12-01" }),
    ).rejects.toThrow("This person does not exist.");
  });

  it("is the manager's to set and to lift", async () => {
    const id = await worker();
    const hr = await test.sessionFor("HR_OFFICER");
    await expect(
      set({ subjectKind: "WORKER", subjectId: id, state: "SUSPENDED", reason: "تأخر", startDate: "2026-10-12" }, hr),
    ).rejects.toThrow("You do not have permission to do this.");
    const { sanctionId } = await set({
      subjectKind: "WORKER",
      subjectId: id,
      state: "SUSPENDED",
      reason: "تأخر",
      startDate: "2026-10-12",
    });
    await expect(test.transact((ex, ctx) => liftSanction(ex, ctx, { sanctionId, reason: "x" }), hr)).rejects.toThrow(
      "You do not have permission to do this.",
    );
  });

  it("puts a client under sanction for Clients, with the client's own keys, and tells nobody that a worker left", async () => {
    const client = await test.rows.insert("Client", {
      name: "شركة النور",
      nameKey: normaliseName("شركة النور"),
      phone1: "032 41 50 00",
      phoneKeys: "|032415000|",
      nif: "000425012345678",
    });
    const { sanctionId } = await set({
      subjectKind: "CLIENT",
      subjectId: client.id,
      state: "SUSPENDED",
      reason: "لم يدفع",
      startDate: "2026-10-12",
    });
    const row = await test.db.selectFrom("Sanction").selectAll().where("id", "=", sanctionId).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      clientId: client.id,
      staffId: null,
      displayName: "شركة النور",
      phoneKeys: "|032415000|",
    });
    expect(JSON.parse(row.extraKeys ?? "{}")).toEqual({ nif: "000425012345678" });
    expect(told.map((t) => t.event)).toEqual(["sanction.changed"]);
    const states = await test.transact((ex, ctx) => getSanctionStates(ex, ctx, { kind: "CLIENT", ids: [client.id] }));
    expect(states[client.id]).toMatchObject({ state: "SUSPENDED", since: "2026-10-12", until: null });
    // A body is found again by its tax number.
    const byNif = await check(
      attempt(
        { name: "مؤسسة أخرى", taxNumbers: ["000 425 012 345 678"] },
        { subjectKind: "CLIENT", context: "CLIENT_FILE" },
      ),
    );
    expect(byNif.matches.map((m) => m.foundBy)).toEqual(["TAX_NUMBER"]);
  });

  it("shows a sanction set for a later day as coming, not in force", async () => {
    const id = await worker();
    await set({ subjectKind: "WORKER", subjectId: id, state: "SUSPENDED", reason: "تأخر", startDate: "2026-10-20" });
    const [row] = await test.transact((ex, ctx) => listSanctions(ex, ctx, { subjectId: id }));
    expect(row).toMatchObject({ inForce: false, upcoming: true });
    expect(
      (await test.transact((ex, ctx) => getSanctionStates(ex, ctx, { kind: "WORKER", ids: [id] })))[id],
    ).toBeNull();
    const inForce = await test.transact((ex, ctx) => listSanctions(ex, ctx, { inForceOnly: true }));
    expect(inForce.map((s) => s.subjectId)).toEqual([id]);
  });
});
