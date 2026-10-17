import { afterEach, beforeEach, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { saveUpload } from "@/lib/attachments";
import { PHOTO_UPLOAD_RULE } from "@/lib/uploads";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { decideHiring } from "./hiring";
import { addHoursAdjustment } from "./hours";
import { setWorkerSignedScan } from "./worker-files";
import { openWorkerFile } from "./worker-reads";
import { registerWorker } from "./workers";

/** The verified audit findings People fixed in round 4: ACC-13, ACC-9, LOG-8, LOG-16. */

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function aCandidate() {
  return (
    await test.transact((ex, ctx) =>
      registerWorker(ex, ctx, {
        ...emptyWorkerValues("2026-08-01"),
        sex: "FEMALE",
        lastName: "قاسمي",
        firstName: "نوال",
        birthDate: "1996-01-12",
        phone: "0555 31 42 53",
      }),
    )
  ).id;
}

it("lets the administration record its decision on hiring.decide alone (ACC-13)", async () => {
  const id = await aCandidate();
  const admin = await test.sessionFor("ADMINISTRATION");
  await test.transact((ex, ctx) => decideHiring(ex, ctx, { staffId: id, decision: "ACCEPTED_ON_TRIAL" }), admin);
  const worker = await test.db
    .selectFrom("StaffMember")
    .select("engagementStatus")
    .where("id", "=", id)
    .executeTakeFirstOrThrow();
  expect(worker.engagementStatus).toBe("ON_TRIAL");
});

it("puts hours corrections under pay.write (ACC-9)", async () => {
  const id = await aCandidate();
  const accountant = await test.sessionFor("ACCOUNTANT");
  await test.transact(
    (ex, ctx) =>
      addHoursAdjustment(ex, ctx, { staffId: id, date: "2026-10-05", adjustMin: 60, kind: "OTHER", reason: "x" }),
    accountant,
  );
  const operations = await test.sessionFor("OPERATIONS");
  await expect(
    test.transact(
      (ex, ctx) =>
        addHoursAdjustment(ex, ctx, { staffId: id, date: "2026-10-05", adjustMin: 60, kind: "OTHER", reason: "x" }),
      operations,
    ),
  ).rejects.toThrow("You do not have permission to do this.");
});

it("logs one consultation of a file per user and day (LOG-8)", async () => {
  const id = await aCandidate();
  await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
  await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
  const lines = await test.db
    .selectFrom("AuditLog")
    .select("id")
    .where("operation", "=", "CONSULT")
    .where("entityId", "=", id)
    .execute();
  expect(lines).toHaveLength(1);
});

it("refuses to link an ordinary file as the signed form (LOG-16)", async () => {
  const id = await aCandidate();
  const photo = await saveUpload(test.db, test.ctx(), test.files, {
    entity: "StaffMember",
    field: "photoUrl",
    file: { name: "photo.png", type: "image/png", bytes: PNG },
    rule: PHOTO_UPLOAD_RULE,
  });
  await expect(test.transact((ex, ctx) => setWorkerSignedScan(ex, ctx, { id, url: photo.url }))).rejects.toThrow(
    "people: this file was not saved restricted for this place",
  );
});

it("lets only a reader of the health answers file the signed form's scan (LOG-1)", async () => {
  const id = await aCandidate();
  const hr = await test.sessionFor("HR_OFFICER");
  const scoreOnly = {
    ...hr,
    capabilities: new Set([...hr.capabilities].filter((key) => key !== "staff.health.read")),
  };
  await expect(test.transact((ex, ctx) => setWorkerSignedScan(ex, ctx, { id, url: null }), scoreOnly)).rejects.toThrow(
    "You do not have permission to do this.",
  );
});
