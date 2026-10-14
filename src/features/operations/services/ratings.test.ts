import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { localDate } from "@/lib/units";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { averageOf, listRatings } from "./ratings";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

async function file(name: string) {
  const site = await test.rows.insert("Site", { division: "HOUSING", commonName: name });
  return test.rows.insert("File", {
    siteId: site.id,
    clientId: site.clientId,
    division: "HOUSING",
    serviceType: "CONTRACT",
    formKind: "HOUSING_CONTRACT",
    stage: "CONTRACTED",
  } as never);
}

const worker = (lastName: string) =>
  test.rows.insert("StaffMember", { kind: "WORKER", firstName: "سعاد", lastName } as never);

/** A visit done on a date, its team, and the order the client signed with his ratings. */
async function rated(
  fileId: string,
  date: string,
  team: string[],
  report: Record<string, unknown> | null,
  seatStatus = "ASSIGNED",
) {
  const visit = await test.rows.insert("Visit", {
    fileId,
    origin: "CONTRACT",
    visitDate: localDate(date),
    status: "DONE",
  });
  for (const workerId of team) {
    await test.rows.insert("VisitWorker", { visitId: visit.id, workerId, seatStatus } as never);
  }
  if (report) {
    await test.rows.insert("VisitReport", {
      visitId: visit.id,
      entryState: "COMPLETE",
      completion: "FULL",
      signoffStatus: "ACCEPTED",
      ...report,
    } as never);
  }
  return visit;
}

const scores = (quality: number, punctuality: number, behaviour: number, materials: number, overall: number) => ({
  ratingQuality: quality,
  ratingPunctuality: punctuality,
  ratingBehaviour: behaviour,
  ratingMaterials: materials,
  ratingOverall: overall,
});

describe("listRatings", () => {
  it("lists the visits signed off in the period, with averages per file and per worker", async () => {
    const villa = await file("فيلا بن صالح");
    const flat = await file("شقة حمدي");
    const samira = await worker("بوزيد");
    const amina = await worker("حمدي");
    const first = await rated(villa.id, "2026-10-03", [samira.id], { ...scores(5, 4, 5, 4, 5), wouldRecommend: 1 });
    const second = await rated(villa.id, "2026-10-10", [samira.id, amina.id], {
      ...scores(3, 2, 4, 4, 3),
      wouldRecommend: 0,
    });
    const third = await rated(flat.id, "2026-10-08", [amina.id], { ...scores(4, 5, 5, 3, 4), wouldRecommend: 1 });
    // Signed, no rating: counted as signed off, in no average.
    const blank = await rated(flat.id, "2026-10-09", [amina.id], { signoffStatus: "ACCEPTED_WITH_NOTES" });
    // Not signed (nobody there), outside the period, or not typed in: left out.
    await rated(flat.id, "2026-10-07", [amina.id], { signoffStatus: null, signoffAbsentReason: "لا أحد" });
    await rated(villa.id, "2026-09-30", [samira.id], { ...scores(1, 1, 1, 1, 1), wouldRecommend: 0 });
    await rated(villa.id, "2026-10-11", [samira.id], null);
    // A seat she no longer holds (taken off the visit) does not credit her.
    await rated(flat.id, "2026-10-06", [samira.id], { ...scores(2, 2, 2, 2, 2) }, "REMOVED");

    const report = await test.transact((ex, ctx) => listRatings(ex, ctx, { from: "2026-10-01", to: "2026-10-31" }));
    expect(report.visits.map((visit) => visit.visitId)).toEqual([
      second.id,
      blank.id,
      third.id,
      expect.any(String), // the visit she was taken off
      first.id,
    ]);
    expect(report.visits[0]).toMatchObject({
      file: { id: villa.id, division: "HOUSING" },
      siteName: "فيلا بن صالح",
      signoffStatus: "ACCEPTED",
      ratings: { quality: 3, punctuality: 2, behaviour: 4, materials: 4, overall: 3 },
      wouldRecommend: false,
      workers: [
        { id: samira.id, lastName: "بوزيد" },
        { id: amina.id, lastName: "حمدي" },
      ],
    });
    expect(report.visits[1]).toMatchObject({ ratings: { quality: null, overall: null }, wouldRecommend: null });

    // The villa: (5 + 3) / 2 overall, one «نعم» of two. Weakest overall first.
    expect(report.files.map((each) => each.file.id)).toEqual([flat.id, villa.id]);
    const villaLine = report.files.find((each) => each.file.id === villa.id);
    expect(villaLine).toMatchObject({
      visits: 2,
      rated: 2,
      averages: { quality: 4, punctuality: 3, behaviour: 4.5, materials: 4, overall: 4 },
      recommendYes: 1,
      recommendNo: 1,
      recommendShare: 0.5,
    });
    // The flat: the visit she was taken off (2), the third (4), and the blank one.
    expect(report.files.find((each) => each.file.id === flat.id)).toMatchObject({
      visits: 3,
      rated: 2,
      averages: { overall: 3 },
      recommendShare: 1,
    });

    // Samira: the first and the second; Amina: the second, the third and the blank one.
    const byWorker = Object.fromEntries(report.workers.map((each) => [each.worker.id, each]));
    expect(byWorker[samira.id]).toMatchObject({ visits: 2, averages: { overall: 4, quality: 4 }, recommendShare: 0.5 });
    expect(byWorker[amina.id]).toMatchObject({
      visits: 3,
      rated: 2,
      averages: { overall: 3.5, punctuality: 3.5 },
      recommendYes: 1,
      recommendNo: 1,
    });
    expect(report.overall).toMatchObject({ visits: 5, rated: 4, recommendYes: 2, recommendNo: 1 });
    expect(report.overall.averages.overall).toBeCloseTo((5 + 3 + 4 + 2) / 4);
  });

  it("keeps one file's visits, or the visits one worker held a seat on", async () => {
    const villa = await file("فيلا");
    const flat = await file("شقة");
    const samira = await worker("بوزيد");
    const amina = await worker("حمدي");
    const together = await rated(villa.id, "2026-10-03", [samira.id, amina.id], { ...scores(5, 5, 5, 5, 5) });
    const alone = await rated(flat.id, "2026-10-04", [amina.id], { ...scores(3, 3, 3, 3, 3) });

    const ofVilla = await test.transact((ex, ctx) =>
      listRatings(ex, ctx, { from: "2026-10-01", to: "2026-10-31", fileId: villa.id }),
    );
    expect(ofVilla.visits.map((visit) => visit.visitId)).toEqual([together.id]);

    const ofAmina = await test.transact((ex, ctx) =>
      listRatings(ex, ctx, { from: "2026-10-01", to: "2026-10-31", workerId: amina.id }),
    );
    expect(ofAmina.visits.map((visit) => visit.visitId)).toEqual([alone.id, together.id]);
    // Only her line: Samira's would count one visit of two.
    expect(ofAmina.workers.map((each) => each.worker.id)).toEqual([amina.id]);
    expect(ofAmina.workers[0]).toMatchObject({ visits: 2, averages: { overall: 4 } });
  });

  it("refuses dates that are not dates or run backwards; reading is the requests' section", async () => {
    const run = (from: string, to: string) => test.transact((ex, ctx) => listRatings(ex, ctx, { from, to }));
    await expect(run("2026-10", "2026-10-31")).rejects.toThrow("Enter a valid date.");
    await expect(run("2026-10-31", "2026-10-01")).rejects.toThrow("The end date must not be before the start date.");
    const hr = await test.sessionFor("HR_OFFICER");
    expect(
      await test.transact((ex, ctx) => listRatings(ex, ctx, { from: "2026-10-01", to: "2026-10-31" }), hr),
    ).toMatchObject({ visits: [], files: [], workers: [], overall: { visits: 0, recommendShare: null } });
  });
});

describe("averageOf", () => {
  it("averages each criterion over the visits that rated it", () => {
    const none = { quality: null, punctuality: null, behaviour: null, materials: null, overall: null };
    expect(
      averageOf([
        { ratings: { ...none, quality: 4, overall: 5 }, wouldRecommend: true },
        { ratings: { ...none, quality: 2 }, wouldRecommend: null },
        { ratings: none, wouldRecommend: false },
      ]),
    ).toEqual({
      visits: 3,
      rated: 2,
      averages: { quality: 3, punctuality: null, behaviour: null, materials: null, overall: 5 },
      recommendYes: 1,
      recommendNo: 1,
      recommendShare: 0.5,
    });
  });
});
