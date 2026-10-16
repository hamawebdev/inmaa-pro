import { createHash } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { Session } from "@/lib/service/context";
import { CV_UPLOAD_RULE, isRestrictedUploadUrl, PHOTO_UPLOAD_RULE } from "@/lib/uploads";
import { createTestDatabase, type TestDatabase } from "@/testing/database";

import {
  linkUpload,
  listUploads,
  readRestrictedUpload,
  recordUploadCopy,
  removeUpload,
  saveUpload,
  storagePathOf,
} from "./index";

let test: TestDatabase;

beforeEach(async () => {
  test = await createTestDatabase();
});

afterEach(() => test.close());

const png = { name: "صورة.png", type: "image/png", bytes: new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]) };
const pdf = { name: "استمارة.pdf", type: "application/pdf", bytes: new TextEncoder().encode("%PDF-1.4 signed pages") };

const last = () =>
  test.db.selectFrom("AuditLog").selectAll().orderBy("chainSeq", "desc").limit(1).executeTakeFirstOrThrow();

async function logCount(): Promise<number> {
  const row = await test.db
    .selectFrom("AuditLog")
    .select((eb) => eb.fn.countAll<number>().as("n"))
    .executeTakeFirstOrThrow();
  return Number(row.n);
}

const savePhoto = () =>
  saveUpload(test.db, test.ctx(), test.files, {
    entity: "StaffMember",
    field: "photoUrl",
    file: png,
    rule: PHOTO_UPLOAD_RULE,
  });
const saveSignedForm = () =>
  saveUpload(test.db, test.ctx(), test.files, {
    entity: "StaffConfidential",
    field: "signedFormScanUrl",
    file: pdf,
    rule: CV_UPLOAD_RULE,
  });

describe("stored files", () => {
  it("are stored under their table and column, each with its row in Upload", async () => {
    const saved = await savePhoto();

    expect(saved.url).toMatch(/^\/uploads\/StaffMember\/photoUrl\/[0-9a-f-]{36}\.png$/);
    expect(test.files.files.get(storagePathOf(saved.url))).toEqual(png.bytes);
    const row = await test.db.selectFrom("Upload").selectAll().where("id", "=", saved.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      url: saved.url,
      entity: "StaffMember",
      field: "photoUrl",
      ownerId: null,
      restrictedCapability: null,
      originalName: "صورة.png",
      mimeType: "image/png",
      sizeBytes: png.bytes.byteLength,
      sha256: createHash("sha256").update(png.bytes).digest("hex"),
      createdByUserId: test.manager.userId,
    });
  });

  it("are refused for a column that holds no file, of a type the field does not take, or too large", async () => {
    await expect(
      saveUpload(test.db, test.ctx(), test.files, {
        entity: "StaffMember",
        field: "lastName",
        file: png,
        rule: PHOTO_UPLOAD_RULE,
      }),
    ).rejects.toThrow("is not a place a file is stored for");
    await expect(
      saveUpload(test.db, test.ctx(), test.files, {
        entity: "StaffMember",
        field: "photoUrl",
        file: { ...png, type: "text/plain" },
        rule: PHOTO_UPLOAD_RULE,
      }),
    ).rejects.toThrow("This type of file is not accepted here.");
    await expect(
      saveUpload(test.db, test.ctx(), test.files, {
        entity: "StaffMember",
        field: "photoUrl",
        file: png,
        rule: { ...PHOTO_UPLOAD_RULE, maxSizeBytes: 4 },
      }),
    ).rejects.toThrow("This file is too large.");
    expect(test.files.files.size).toBe(0);
  });

  it("are tied to their row once, and taken off it with a line in the log while the bytes stay", async () => {
    const saved = await savePhoto();
    await test.transact((ex, ctx) => linkUpload(ex, ctx, saved.url, "staff-1"));
    await test.transact((ex, ctx) => linkUpload(ex, ctx, saved.url, "staff-1"));
    await expect(test.transact((ex, ctx) => linkUpload(ex, ctx, saved.url, "staff-2"))).rejects.toThrow(
      "This file already belongs to another record.",
    );
    expect(await listUploads(test.db, { entity: "StaffMember", ownerId: "staff-1" })).toHaveLength(1);

    await test.transact((ex, ctx) =>
      removeUpload(ex, ctx, { url: saved.url, owner: "PEOPLE", subject: { kind: "WORKER", id: "staff-1" } }),
    );

    expect(await listUploads(test.db, { entity: "StaffMember", ownerId: "staff-1" })).toEqual([]);
    expect(await last()).toMatchObject({
      operation: "ERASE",
      action: "UPLOAD_REMOVE",
      entity: "StaffMember",
      entityId: "staff-1",
      subjectKind: "WORKER",
    });
    expect(test.files.files.has(storagePathOf(saved.url))).toBe(true);
    await expect(test.transact((ex, ctx) => linkUpload(ex, ctx, saved.url, "staff-1"))).rejects.toThrow(
      "This file was not found.",
    );
  });

  it("keep a signed worker form restricted, where the window cannot load it", async () => {
    const saved = await saveSignedForm();

    expect(saved.url).toMatch(/^\/uploads\/restricted\/StaffConfidential\/signedFormScanUrl\/[0-9a-f-]{36}\.pdf$/);
    expect(isRestrictedUploadUrl(saved.url)).toBe(true);
    const row = await test.db
      .selectFrom("Upload")
      .select("restrictedCapability")
      .where("id", "=", saved.id)
      .executeTakeFirstOrThrow();
    expect(row.restrictedCapability).toBe("staff.health.read");
  });

  it("open a restricted file only for a capability that may, the signed form only with the health answers' (LOG-1), and log every opening", async () => {
    const saved = await saveSignedForm();
    const openAs = (session: Session) =>
      test.transact(
        (ex, ctx) =>
          readRestrictedUpload(ex, ctx, test.files, {
            url: saved.url,
            owner: "PEOPLE",
            subject: { kind: "WORKER", id: "staff-1" },
          }),
        session,
      );
    const open = async (role: "ACCOUNTANT" | "HR_OFFICER") => openAs(await test.sessionFor(role));

    const before = await logCount();
    await expect(open("ACCOUNTANT")).rejects.toThrow("You do not have permission to do this.");
    // The hiring score alone does not open the signed pages: the health answers are on them (audit LOG-1).
    const hr = await test.sessionFor("HR_OFFICER");
    const scoreOnly = {
      ...hr,
      capabilities: new Set([...hr.capabilities].filter((capability) => capability !== "staff.health.read")),
    };
    expect(scoreOnly.capabilities.has("staff.hiringScore.read")).toBe(true);
    await expect(openAs(scoreOnly)).rejects.toThrow("You do not have permission to do this.");
    expect(await logCount()).toBe(before);

    const opened = await open("HR_OFFICER");
    expect(opened).toMatchObject({ mimeType: "application/pdf", originalName: "استمارة.pdf" });
    expect(opened.bytes).toEqual(pdf.bytes);
    expect(await last()).toMatchObject({
      operation: "CONSULT",
      action: "VIEW_RESTRICTED",
      userRole: "HR_OFFICER",
      subjectKind: "WORKER",
    });
  });

  it("take a photo at a client's site only with the client's agreement, and say who took it", async () => {
    const site = await test.rows.insert("Site");
    const supervisor = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" });
    const photo = () =>
      saveUpload(test.db, test.ctx(), test.files, {
        entity: "Visit",
        field: "photos",
        file: png,
        rule: PHOTO_UPLOAD_RULE,
        photo: { siteId: site.id, takenByEmployeeId: supervisor.id, kind: "BEFORE", caption: "المدخل" },
      });

    await expect(photo()).rejects.toThrow("The client has not agreed to photos at this site.");
    test.raw.prepare(`UPDATE "Site" SET "photoConsent" = 1 WHERE "id" = ?`).run(site.id);
    const saved = await photo();

    const row = await test.db.selectFrom("Upload").selectAll().where("id", "=", saved.id).executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      entity: "Visit",
      field: "photos",
      kind: "BEFORE",
      caption: "المدخل",
      takenByEmployeeId: supervisor.id,
    });
  });

  it("never record a cleaning worker as having taken a photo at a client's site (his form, article 8)", async () => {
    const site = await test.rows.insert("Site");
    test.raw.prepare(`UPDATE "Site" SET "photoConsent" = 1 WHERE "id" = ?`).run(site.id);
    const worker = await test.rows.insert("StaffMember", { kind: "WORKER" });
    const gone = await test.rows.insert("StaffMember", { kind: "EMPLOYEE", engagementStatus: "LEFT" });
    const photoBy = (takenByEmployeeId: string) =>
      saveUpload(test.db, test.ctx(), test.files, {
        entity: "Visit",
        field: "photos",
        file: png,
        rule: PHOTO_UPLOAD_RULE,
        photo: { siteId: site.id, takenByEmployeeId },
      });
    for (const taker of [worker.id, gone.id, "nobody"]) {
      await expect(photoBy(taker)).rejects.toThrow(
        "A photo at a client's site is taken by one of the centre's employees.",
      );
    }
    const supervisor = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" });
    await expect(photoBy(supervisor.id)).resolves.toMatchObject({ url: expect.any(String) });
  });

  it("check the client's agreement again against the site of the visit the photo is linked to", async () => {
    const agreed = await test.rows.insert("Site");
    test.raw.prepare(`UPDATE "Site" SET "photoConsent" = 1 WHERE "id" = ?`).run(agreed.id);
    const supervisor = await test.rows.insert("StaffMember", { kind: "EMPLOYEE" });
    // The bytes are stored under the site that agreed…
    const saved = await saveUpload(test.db, test.ctx(), test.files, {
      entity: "Visit",
      field: "photos",
      file: png,
      rule: PHOTO_UPLOAD_RULE,
      photo: { siteId: agreed.id, takenByEmployeeId: supervisor.id },
    });
    // …and linked to a visit of another site, whose client did not.
    const visit = await test.rows.insert("Visit");
    await expect(test.transact((ex, ctx) => linkUpload(ex, ctx, saved.url, visit.id))).rejects.toThrow(
      "The client has not agreed to photos at this site.",
    );
    // Once that client agrees, the same photo links.
    const file = await test.db
      .selectFrom("Visit as v")
      .innerJoin("File as f", "f.id", "v.fileId")
      .select("f.siteId")
      .where("v.id", "=", visit.id)
      .executeTakeFirstOrThrow();
    test.raw.prepare(`UPDATE "Site" SET "photoConsent" = 1 WHERE "id" = ?`).run(file.siteId);
    await test.transact((ex, ctx) => linkUpload(ex, ctx, saved.url, visit.id));
    const row = await test.db
      .selectFrom("Upload")
      .select("ownerId")
      .where("id", "=", saved.id)
      .executeTakeFirstOrThrow();
    expect(row.ownerId).toBe(visit.id);
  });

  it("refuse an address that is not one of ours or that leaves the uploads folder", () => {
    expect(storagePathOf("/uploads/StaffMember/photoUrl/a.png")).toBe("uploads/StaffMember/photoUrl/a.png");
    expect(storagePathOf("/uploads/restricted/StaffConfidential/signedFormScanUrl/a.pdf")).toBe(
      "uploads/restricted/StaffConfidential/signedFormScanUrl/a.pdf",
    );
    for (const address of [
      "/uploads/../secret/a/b",
      "/uploads/a/../b",
      "/api/uploads/admin/StaffMember/photoUrl/a.png",
      "/uploads/restricted/StaffMember/a.png",
      "/uploads/a/b/c/d",
      "/uploads/a/b/c:d",
      "C:\\uploads\\a",
    ]) {
      expect(() => storagePathOf(address), address).toThrow("Invalid upload path.");
    }
  });
});

describe("a copy saved outside the program (audit LOG-5)", () => {
  it("is a disclosure to the place chosen, written before the copy, for an ordinary file too (LOG-5)", async () => {
    const saved = await savePhoto();
    await test.transact((ex, ctx) =>
      recordUploadCopy(ex, ctx, {
        url: saved.url,
        target: "F:/clé/صورة.png",
        owner: "PEOPLE",
        subject: { kind: "WORKER", id: "staff-1", label: "حمدي رضا" },
      }),
    );
    expect(await last()).toMatchObject({
      operation: "DISCLOSE",
      action: "EXPORT",
      disclosure: "EXPORT",
      recipient: "F:/clé/صورة.png",
      ownerCode: "PEOPLE",
      entity: "StaffMember",
      subjectKind: "WORKER",
      reason: "STANDARD:EXPORT",
    });
  });

  it("of the signed worker form needs the capability to print it and the reason typed, as its printing does (LOG-5)", async () => {
    const saved = await saveSignedForm();
    const copy = async (session: Session, reason?: string) =>
      test.transact(
        (ex, ctx) => recordUploadCopy(ex, ctx, { url: saved.url, target: "F:/استمارة.pdf", owner: "PEOPLE", reason }),
        session,
      );
    const hr = await test.sessionFor("HR_OFFICER");
    const healthWithoutPrint = {
      ...hr,
      capabilities: new Set([...hr.capabilities].filter((capability) => capability !== "staff.printFilledForm")),
    };
    const before = await logCount();
    await expect(copy(await test.sessionFor("ACCOUNTANT"), "طلب المحامي")).rejects.toThrow(
      "You do not have permission to do this.",
    );
    await expect(copy(healthWithoutPrint, "طلب المحامي")).rejects.toThrow("You do not have permission to do this.");
    await expect(copy(hr, "  ")).rejects.toThrow("A reason is required.");
    expect(await logCount()).toBe(before);

    await copy(hr, "طلب مفتشية العمل");
    expect(await last()).toMatchObject({
      operation: "DISCLOSE",
      action: "EXPORT",
      recipient: "F:/استمارة.pdf",
      reason: "طلب مفتشية العمل",
      entity: "StaffConfidential",
    });
  });
});
