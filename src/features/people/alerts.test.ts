import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { evaluateAlerts } from "@/lib/alerts";
import { runDayStart } from "@/lib/daily";
import { registerHandler } from "@/lib/events";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { emptyWorkerValues, NO_DOCUMENTS } from "./forms/worker-values";
import { registerEmployee } from "./services/employees";
import { requestDecision } from "./services/sanction-decisions";
import { liftSanction, setSanction } from "./services/sanctions";
import { recordWorkerLeaving, registerWorker, workerIdentity, type RegisterWorkerInput } from "./services/workers";
import { emptyEmployeeValues } from "./validators/employee";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const NAWEL: RegisterWorkerInput = {
  ...emptyWorkerValues("2026-10-01"),
  sex: "FEMALE",
  lastName: "قاسمي",
  firstName: "نوال",
  birthDate: "1996-01-12",
  phone: "0555 31 42 53",
};
const register = (input: RegisterWorkerInput) => test.transact((ex, ctx) => registerWorker(ex, ctx, input));
const tiles = async (session = test.manager) =>
  Object.fromEntries(
    (await test.transact((ex, ctx) => evaluateAlerts(ex, ctx), session))
      .filter(
        (tile) =>
          (tile.count ?? 0) > 0 &&
          ["sanction.pending", "document.expiry", "trial.ending", "staffContract.ending"].includes(tile.key),
      )
      .map((tile) => [tile.key, tile.count]),
  );

describe("People's alerts", () => {
  it("count documents to renew, trials and contracts ending, and questions waiting for the manager", async () => {
    // A medical certificate that expires within the month, one far off, and one of a worker who left.
    await register({
      ...NAWEL,
      documents: NO_DOCUMENTS.map((line) =>
        line.type === "MEDICAL_CERT" ? { ...line, delivered: true, expiryDate: "2026-10-30" } : line,
      ),
    });
    await register({
      ...NAWEL,
      lastName: "مرابط",
      phone: "0772 14 25 36",
      documents: NO_DOCUMENTS.map((line) =>
        line.type === "MEDICAL_CERT" ? { ...line, delivered: true, expiryDate: "2027-06-30" } : line,
      ),
    });
    const gone = await register({
      ...NAWEL,
      lastName: "شريف",
      phone: "0661 47 58 69",
      documents: NO_DOCUMENTS.map((line) =>
        line.type === "MEDICAL_CERT" ? { ...line, delivered: true, expiryDate: "2026-09-01" } : line,
      ),
    });
    await test.transact((ex, ctx) =>
      recordWorkerLeaving(ex, ctx, { id: gone.id, leftDate: "2026-10-12", reason: "انتقلت" }),
    );
    // On trial since 1 October for 30 days (setting): the trial ends on 31 October, beyond the 7-day lead.
    await register({
      ...NAWEL,
      lastName: "حمدي",
      phone: "0559 64 75 86",
      hiringDecision: "ACCEPTED_ON_TRIAL",
      issuedDate: "2026-10-01",
    });
    // On trial since 15 September: ends on 15 October, within the lead.
    await register({
      ...NAWEL,
      lastName: "بن علي",
      phone: "0698 75 86 97",
      registrationDate: "2026-09-15",
      hiringDecision: "ACCEPTED_ON_TRIAL",
      issuedDate: "2026-09-15",
    });
    // An employee whose fixed-term contract ends next week.
    await test.transact((ex, ctx) =>
      registerEmployee(ex, ctx, {
        ...emptyEmployeeValues("2026-10-01"),
        sex: "MALE",
        lastName: "حداد",
        firstName: "مراد",
        phone: "0550 10 20 30",
        jobPosition: "SUPERVISOR",
        employmentContract: "CDD",
        startDate: "2026-04-01",
        contractEndDate: "2026-10-20",
      }),
    );

    expect(await tiles()).toEqual({ "document.expiry": 1, "trial.ending": 1, "staffContract.ending": 1 });

    // A question for the manager: only the manager sees its tile.
    const suspendedId = (await register({ ...NAWEL, lastName: "بوزيد", phone: "0661 20 31 42" })).id;
    const { sanctionId } = await test.transact((ex, ctx) =>
      setSanction(ex, ctx, {
        subjectKind: "WORKER",
        subjectId: suspendedId,
        state: "SUSPENDED",
        reason: "غياب",
        startDate: "2026-10-01",
      }),
    );
    const hr = await test.sessionFor("HR_OFFICER");
    await test.transact(
      (ex, ctx) =>
        requestDecision(ex, ctx, {
          context: "WORKER_REGISTRATION",
          subjectKind: "WORKER",
          identity: workerIdentity({ ...NAWEL, lastName: "س", phone: "0661 20 31 42" }),
          sanctionId,
        }),
      hr,
    );
    expect((await tiles())["sanction.pending"]).toBe(1);
    expect((await tiles(hr))["sanction.pending"]).toBeUndefined();
  });
});

describe("People's day-start job", () => {
  const told: Array<{ event: string; payload: unknown }> = [];
  registerHandler("money", "sanction.changed", async (_ex, _ctx, payload) => {
    told.push({ event: "sanction.changed", payload });
  });
  registerHandler("money", "staff.unavailable", async (_ex, _ctx, payload) => {
    told.push({ event: "staff.unavailable", payload });
  });
  beforeEach(() => {
    told.length = 0;
  });

  it("tells the others once when a dated sanction ends, catching up after days closed", async () => {
    const { id } = await register(NAWEL);
    const { sanctionId } = await test.transact((ex, ctx) =>
      setSanction(ex, ctx, {
        subjectKind: "WORKER",
        subjectId: id,
        state: "SUSPENDED",
        reason: "تأخر",
        startDate: "2026-10-12",
        endDate: "2026-10-14",
      }),
    );
    await runDayStart(test.db, test.clock);
    told.length = 0;

    // The program stays closed until the 17th: her last day was the 14th.
    test.clock.advance({ days: 5 });
    await runDayStart(test.db, test.clock);
    expect(told).toEqual([
      { event: "sanction.changed", payload: { sanctionId } },
      {
        event: "staff.unavailable",
        payload: { workerId: id, fromDate: "2026-10-15", toDate: null, cause: "SANCTION_LIFTED", reason: "تأخر" },
      },
    ]);
    // A second start the same day, and the next day: nothing new.
    told.length = 0;
    await runDayStart(test.db, test.clock);
    test.clock.advance({ days: 1 });
    await runDayStart(test.db, test.clock);
    expect(told).toEqual([]);
  });

  it("says nothing of a sanction the manager lifted before its end", async () => {
    const { id } = await register(NAWEL);
    const { sanctionId } = await test.transact((ex, ctx) =>
      setSanction(ex, ctx, {
        subjectKind: "WORKER",
        subjectId: id,
        state: "SUSPENDED",
        reason: "تأخر",
        startDate: "2026-10-12",
        endDate: "2026-10-14",
      }),
    );
    await runDayStart(test.db, test.clock);
    await test.transact((ex, ctx) => liftSanction(ex, ctx, { sanctionId, reason: "قدّمت مبررا" }));
    told.length = 0;
    test.clock.advance({ days: 3 });
    await runDayStart(test.db, test.clock);
    expect(told).toEqual([]);
  });
});
