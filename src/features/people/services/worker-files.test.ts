import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { emptyWorkerValues } from "@/features/people/forms/worker-values";
import { listUploads, saveUpload } from "@/lib/attachments";
import { PHOTO_UPLOAD_RULE, RECEIPT_UPLOAD_RULE } from "@/lib/uploads";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import { setWorkerPhoto, setWorkerSignedScan } from "./worker-files";
import { openWorkerFile } from "./worker-reads";
import { registerWorker } from "./workers";

let test: TestDatabase;
beforeEach(async () => {
  test = await createTestDatabase();
});
afterEach(() => test.close());

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

async function aWorker() {
  return test.transact((ex, ctx) =>
    registerWorker(ex, ctx, {
      ...emptyWorkerValues("2026-10-12"),
      sex: "FEMALE",
      lastName: "بوزيد",
      firstName: "سميرة",
      birthDate: "1994-03-17",
      phone: "0661203142",
    }),
  );
}

/** A file the screen stored before the save, as `saveManagedUpload` does. */
const stored = (entity: string, field: string, type = "image/png") =>
  saveUpload(test.db, test.ctx(), test.files, {
    entity,
    field,
    file: { name: "scan.png", type, bytes: PNG },
    rule: type === "application/pdf" ? RECEIPT_UPLOAD_RULE : PHOTO_UPLOAD_RULE,
  });

describe("the worker's photo", () => {
  it("is tied to her record, replaced, and taken off with its line in the log", async () => {
    const { id } = await aWorker();
    const first = await stored("StaffMember", "photoUrl");
    await test.transact((ex, ctx) => setWorkerPhoto(ex, ctx, { id, url: first.url }));
    expect((await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }))).photoUrl).toBe(first.url);
    expect(await listUploads(test.db, { entity: "StaffMember", ownerId: id })).toHaveLength(1);

    const second = await stored("StaffMember", "photoUrl");
    await test.transact((ex, ctx) => setWorkerPhoto(ex, ctx, { id, url: second.url }));
    const uploads = await listUploads(test.db, { entity: "StaffMember", ownerId: id });
    expect(uploads.map((upload) => upload.url)).toEqual([second.url]);
    const erased = await test.db.selectFrom("AuditLog").selectAll().where("operation", "=", "ERASE").execute();
    expect(erased).toHaveLength(1);

    await test.transact((ex, ctx) => setWorkerPhoto(ex, ctx, { id, url: null }));
    expect(await listUploads(test.db, { entity: "StaffMember", ownerId: id })).toEqual([]);
  });
});

describe("the scan of her signed pages", () => {
  it("is stored restricted, tied to her confidential row, and filed only by those who may read it", async () => {
    const { id } = await aWorker();
    const scan = await stored("StaffConfidential", "signedFormScanUrl", "application/pdf");
    expect(scan.url).toContain("/restricted/");

    const operations = await test.sessionFor("OPERATIONS");
    await expect(
      test.transact((ex, ctx) => setWorkerSignedScan(ex, ctx, { id, url: scan.url }), operations),
    ).rejects.toThrow("You do not have permission to do this.");

    const hr = await test.sessionFor("HR_OFFICER");
    await test.transact((ex, ctx) => setWorkerSignedScan(ex, ctx, { id, url: scan.url }), hr);
    const file = await test.transact((ex, ctx) => openWorkerFile(ex, ctx, { id }));
    expect(file.signedScan).toMatchObject({ url: scan.url, originalName: "scan.png" });
    const confidential = await test.db
      .selectFrom("StaffConfidential")
      .select("signedFormScanUrl")
      .where("staffId", "=", id)
      .executeTakeFirstOrThrow();
    expect(confidential.signedFormScanUrl).toBe(scan.url);
    // The log names the field, never its value.
    const entry = await test.db
      .selectFrom("AuditLog")
      .selectAll()
      .where("entity", "=", "StaffConfidential")
      .where("operation", "=", "CHANGE")
      .executeTakeFirstOrThrow();
    expect(JSON.parse(entry.changes ?? "{}")).toEqual({ signedFormScanUrl: ["§", "§"] });
  });
});
