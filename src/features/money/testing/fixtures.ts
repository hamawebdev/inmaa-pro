import { logSecurity } from "@/lib/log";
import { setSetting } from "@/lib/settings";
import type { TestDatabase } from "@/testing/database";

/**
 * Rows Money's tests start from: what Clients, Operations and People would
 * have written before an invoice can exist. Written by hand
 * (`test.rows.insert`), because those owners' own services are tested in their
 * folders; Money's rules are what these tests are about.
 *
 * Imported by tests only.
 */

export const da = (dinars: number) => Math.round(dinars * 100);

/** The centre as a first run leaves it once the office typed its tax file: IFU, its three numbers, its article and address. */
export async function centreReady(test: TestDatabase, taxMode: "IFU" | "VAT" = "IFU") {
  await test.transact(async (ex, ctx) => {
    await setSetting(ex, ctx, "tax.mode", taxMode);
    await setSetting(ex, ctx, "centre.rc", "04/00-0123456A21");
    await setSetting(ex, ctx, "centre.nis", "198104010012345");
    await setSetting(ex, ctx, "centre.nif", "198104010012345");
    await setSetting(ex, ctx, "centre.address", "حي 500 مسكن، أم البواقي");
    await setSetting(ex, ctx, "centre.articleNumber", "04011234567");
  });
}

/** A building's contract at «متعاقد»: 45 000,00 a month for three months from 1 November, paid in cash at each month's end. */
export async function contractedFile(test: TestDatabase, over: Record<string, unknown> = {}) {
  // The site is of the file's division: the database refuses a file on a site of another one.
  const division = typeof over.division === "string" ? over.division : "BUILDING";
  const site = await test.rows.insert("Site", { division, address: "حي النصر، عمارة B7" } as never);
  return test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "BUILDING",
    formKind: "BUILDING_CONTRACT",
    stage: "CONTRACTED",
    serviceType: "CONTRACT",
    startDate: "2026-11-01",
    endDate: "2027-01-31",
    paymentFrequency: "MONTHLY",
    totalAmount: da(45_000),
    amountBasis: "PER_PAYMENT_PERIOD",
    firstDueDate: "2026-11-30",
    paymentMethods: JSON.stringify(["CASH"]),
    payerName: "رشيد بوزيد",
    paymentPlace: "مقر المركز",
    ...over,
  } as never);
}

export type VisitOutcome = "SIGNED_OFF" | "DONE_NOT_TYPED" | "PLANNED" | "CANCELLED" | "CLIENT_AT_FAULT";

/**
 * A visit of the file's programme as Operations would leave it: planned;
 * done and signed off (the returned order typed in whole, two workers from
 * 08:00 to 11:00); done but its order not typed yet; cancelled by the centre;
 * or made impossible by the client.
 */
export async function visitOn(
  test: TestDatabase,
  fileId: string,
  visitDate: string,
  outcome: VisitOutcome = "SIGNED_OFF",
  over: Record<string, unknown> = {},
) {
  const done = outcome === "SIGNED_OFF" || outcome === "DONE_NOT_TYPED";
  const cancelled = outcome === "CANCELLED" || outcome === "CLIENT_AT_FAULT";
  const visit = await test.rows.insert("Visit", {
    fileId,
    visitDate,
    origin: "CONTRACT",
    plannedStartTime: "08:00",
    plannedDurationMin: 180,
    workersNeeded: 2,
    status: done ? "DONE" : cancelled ? "CANCELLED" : "CONFIRMED",
    statusReason: cancelled ? (outcome === "CLIENT_AT_FAULT" ? "CLIENT_ABSENT" : "OTHER") : null,
    billable: done ? 1 : 0,
    clientAtFault: outcome === "CLIENT_AT_FAULT" ? 1 : null,
    ...over,
  } as never);
  if (done) {
    for (let seat = 0; seat < 2; seat += 1) {
      // One worker per seat: a worker holds one seat on a visit.
      const worker = await test.rows.insert("StaffMember", {});
      await test.rows.insert("VisitWorker", {
        visitId: visit.id,
        workerId: worker.id,
        seatStatus: "ASSIGNED",
        arrivedTime: "08:00",
        leftTime: "11:00",
        workedMin: 180,
      } as never);
    }
  }
  if (outcome === "SIGNED_OFF") {
    await test.rows.insert("VisitReport", {
      visitId: visit.id,
      entryState: "COMPLETE",
      completion: "FULL",
      signoffStatus: "ACCEPTED",
      signoffName: "مرابط بلقاسم",
    } as never);
  }
  return visit;
}

/**
 * Moves the clock to a working day and signs in, as the office does every
 * morning: the log then holds an entry of that day. Without it, a test that
 * jumps weeks ahead looks like a PC whose date is wrong, and a legal document
 * is refused until the manager confirms the date (`assertClockSane`).
 */
export async function openDay(test: TestDatabase, instant: string) {
  test.clock.set(instant);
  await test.transact((ex, ctx) => logSecurity(ex, ctx, { owner: "FOUNDATION", action: "SIGN_IN" }));
}

/** The four Tuesdays of November 2026. */
export const NOVEMBER_TUESDAYS = ["2026-11-03", "2026-11-10", "2026-11-17", "2026-11-24"] as const;
