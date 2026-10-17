import { afterEach, beforeEach, expect, it } from "vitest";

import { memoryByteStore, saveUpload } from "@/lib/attachments";
import { PHOTO_UPLOAD_RULE, RECEIPT_UPLOAD_RULE } from "@/lib/uploads";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { addVisitPhoto, getVisitFiles, setVisitScan } from "./visit-files";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const store = memoryByteStore();
const jpeg = { name: "photo.jpg", type: "image/jpeg", bytes: new Uint8Array([255, 216, 255, 224]) };
const pdf = { name: "order.pdf", type: "application/pdf", bytes: new Uint8Array([37, 80, 68, 70]) };

async function visitAt(photoConsent: 0 | 1) {
  const site = await test.rows.insert("Site", { photoConsent } as never);
  const file = await test.rows.insert("File", { siteId: site.id, clientId: site.clientId } as never);
  const supervisor = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" } as never);
  const visit = await test.rows.insert("Visit", {
    fileId: file.id,
    supervisorEmployeeId: supervisor.id,
    status: "DONE",
  } as never);
  return { site, visit, supervisor };
}

const photoBy = (siteId: string, takenByEmployeeId: string) =>
  test.transact(
    async (ex, ctx) =>
      (
        await saveUpload(ex, ctx, store, {
          entity: "Visit",
          field: "photos",
          file: jpeg,
          rule: PHOTO_UPLOAD_RULE,
          photo: { siteId, takenByEmployeeId },
        })
      ).url,
  );

it("ties the supervisor's photo to the visit, and refuses one without the client's agreement (F-13b)", async () => {
  const { site, visit, supervisor } = await visitAt(1);
  const url = await photoBy(site.id, supervisor.id);
  await test.transact((ex, ctx) => addVisitPhoto(ex, ctx, { visitId: visit.id, url }));
  const files = await test.transact((ex, ctx) => getVisitFiles(ex, ctx, { visitId: visit.id }));
  expect(files.photos.map((photo) => photo.url)).toEqual([url]);

  const other = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" } as never);
  const notHis = await photoBy(site.id, other.id);
  await expect(test.transact((ex, ctx) => addVisitPhoto(ex, ctx, { visitId: visit.id, url: notHis }))).rejects.toThrow(
    "A photo of a visit is taken by its supervisor.",
  );

  const refused = await visitAt(0);
  await expect(
    test.transact((ex, ctx) => addVisitPhoto(ex, ctx, { visitId: refused.visit.id, url: notHis })),
  ).rejects.toThrow("The client has not agreed to photos at this site.");
});

it("attaches the scans of the returned order and of the sign-off slip to the typed order (F-15)", async () => {
  const { visit } = await visitAt(0);
  const save = () =>
    test.transact(
      async (ex, ctx) =>
        (
          await saveUpload(ex, ctx, store, {
            entity: "VisitReport",
            field: "orderScanUrl",
            file: pdf,
            rule: RECEIPT_UPLOAD_RULE,
          })
        ).url,
    );
  const first = await save();
  await expect(
    test.transact((ex, ctx) => setVisitScan(ex, ctx, { visitId: visit.id, field: "orderScanUrl", url: first })),
  ).rejects.toThrow("Type the returned order in before attaching its scan.");

  await test.rows.insert("VisitReport", { visitId: visit.id, entryState: "COMPLETE" });
  await test.transact((ex, ctx) => setVisitScan(ex, ctx, { visitId: visit.id, field: "orderScanUrl", url: first }));
  const second = await save();
  await test.transact((ex, ctx) => setVisitScan(ex, ctx, { visitId: visit.id, field: "orderScanUrl", url: second }));
  const files = await test.transact((ex, ctx) => getVisitFiles(ex, ctx, { visitId: visit.id }));
  expect(files.orderScanUrl).toBe(second);
  const removed = await test.db
    .selectFrom("Upload")
    .select(["url", "removedAt"])
    .where("url", "=", first)
    .executeTakeFirstOrThrow();
  expect(removed.removedAt).not.toBeNull();

  await expect(
    test.transact(
      (ex, ctx) => setVisitScan(ex, ctx, { visitId: visit.id, field: "signoffScanUrl", url: null }),
      await test.sessionFor("ACCOUNTANT"),
    ),
  ).rejects.toThrow("You do not have permission to do this.");
});
